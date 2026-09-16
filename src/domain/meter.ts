import { sql, type Tx } from '../lib/db.js';
import { aturanBisnis, tidakBerhak, tidakDitemukan } from '../lib/errors.js';
import { jalankanPerintah, type HasilPerintah } from './runCommand.js';

/**
 * METER — HM dan KM, SATU modul.
 *
 * Port dari `_Meter.js` (448 baris). `_KoreksiHm.js` dan `_KoreksiKm.js` di
 * sumber hanya pembungkus tipis; seluruh aturannya tinggal di satu tempat, dan
 * itu disengaja (`_Meter.js:12-22`):
 *
 *   "Menyalinnya untuk KM berarti dua tempat yang harus diingat bersamaan
 *    setiap kali aturannya berubah — dan yang terlupa selalu yang lebih jarang
 *    dipakai."
 *
 * ── KENAPA LAYAR INI ADA ────────────────────────────────────────────────────
 * Jam mesin tidak pernah berkurang. Ada dua bentuk kesalahan, dan yang kedua
 * jauh lebih berbahaya:
 *
 *   TERLALU KECIL — ketahuan langsung, ditolak pagar, mekanik mengetik ulang.
 *   TERLALU BESAR — LOLOS pagar, justru karena ia lebih besar.
 *
 * Yang kedua racun. Satu kali kepencet `999999` membuat angka itu jadi acuan
 * tertinggi, dan sejak saat itu SETIAP bacaan sah berikutnya lebih kecil — lalu
 * ikut ditolak pagar. Satu salah pencet meracuni riwayat HM unit itu selamanya.
 *
 * Karena itu koreksi tidak cukup berupa "tambah bacaan baru". Ia harus bisa
 * MEMPERBAIKI BACAAN TERTENTU, dan itulah bentuk alat ini.
 */

export type JenisMeter = 'HM' | 'KM';

interface Setelan {
  jenis: JenisMeter;
  label: string;
  panjang: string;
  satuan: string;
  menu: string;
}

export const METER: Record<JenisMeter, Setelan> = {
  HM: { jenis: 'HM', label: 'HM', panjang: 'jam mesin', satuan: 'jam', menu: 'Koreksi HM' },
  KM: { jenis: 'KM', label: 'KM', panjang: 'kilometer', satuan: 'km', menu: 'Koreksi KM' },
};

/**
 * Ambang "melompat" — dari `settings`, bukan tetapan di kode.
 *
 * HM 2.000 jam ≈ tiga bulan kerja penuh; lompatan sebesar itu dalam sekali
 * catat bukan pemakaian melainkan salah ketik. KM 20.000 masih angka sementara
 * dan penulis sumbernya sendiri menandainya begitu — ia hanya MENANDAI yang
 * janggal di layar, TIDAK menolak apa pun, jadi salah tebak di sini tak
 * menghalangi siapa pun bekerja (`_Meter.js:45-66`).
 */
async function ambangLompat(tenantId: number, jenis: JenisMeter): Promise<number> {
  const kunci = jenis === 'HM' ? 'meter_lompat_hm' : 'meter_lompat_km';
  const r = (
    await sql<{ setting_value: string | null }[]>`
      SELECT setting_value FROM settings
       WHERE tenant_id = ${tenantId} AND setting_key = ${kunci}
    `
  )[0];
  const n = Number(r?.setting_value);
  return Number.isFinite(n) && n > 0 ? n : (jenis === 'HM' ? 2000 : 20000);
}

export interface Acuan {
  nilai: number;
  at: string;
  oleh: string;
  woNumber: string;
  /** true = acuannya angka panel baru, bukan bacaan WO. */
  dariPanel: boolean;
}

/**
 * Angka acuan sebuah unit — yang harus dilampaui bacaan berikutnya.
 *
 * Hanya bacaan SESUDAH penggantian panel terakhir yang dihitung. Kalau tidak,
 * panel baru yang mulai dari nol akan selamanya ditolak karena kalah oleh angka
 * panel lama (`_Meter.js:150-155`).
 *
 * Nilai panel itu sendiri ikut jadi calon acuan: panel yang diganti ke 12.500
 * berarti bacaan berikutnya harus ≥ 12.500, bukan boleh 100 hanya karena ia
 * tercatat sesudahnya.
 */
export async function acuanUnit(
  unitId: number, jenis: JenisMeter, tx?: Tx,
): Promise<Acuan | null> {
  const q = tx ?? sql;

  const panel = (
    await q<{ changed_at: Date; value_after: string; oleh: string | null }[]>`
      SELECT p.changed_at, p.value_after, m.name AS oleh
        FROM meter_panel_changes p
        LEFT JOIN mechanics m ON m.id = p.recorded_by
       WHERE p.unit_id = ${unitId} AND p.kind = ${jenis}::odometer_type
       ORDER BY p.changed_at DESC LIMIT 1
    `
  )[0];

  /* `ORDER BY nilai DESC`, BUKAN `created_at DESC`. Ini satu-satunya baris di
     kueri ini yang mudah "dirapikan" jadi salah — dan sudah pernah salah:
     `catatMeter` di workOrder.ts memakai yang terbaru sampai 16 Sep 2026,
     sehingga WO yang dibuat menyusul untuk pekerjaan kemarin menarik acuannya
     mundur. */
  const terbaik = (
    await q<{
      wo_number: string; nilai: string; created_at: Date; oleh: string | null;
    }[]>`
      SELECT w.wo_number,
             ${jenis === 'HM' ? q`w.hour_meter` : q`w.kilometers`} AS nilai,
             w.created_at, m.name AS oleh
        FROM work_orders w
        JOIN mechanics m ON m.id = w.created_by
       WHERE w.unit_id = ${unitId}
         AND coalesce(${jenis === 'HM' ? q`w.hour_meter` : q`w.kilometers`}, 0) > 0
         AND w.created_at >= coalesce(${panel?.changed_at ?? null}, '-infinity'::timestamptz)
       ORDER BY nilai DESC
       LIMIT 1
    `
  )[0];

  const nilaiPanel = panel ? Number(panel.value_after) : null;
  const nilaiWo = terbaik ? Number(terbaik.nilai) : null;

  if (nilaiWo !== null && (nilaiPanel === null || nilaiWo > nilaiPanel)) {
    return {
      nilai: nilaiWo,
      at: terbaik!.created_at.toISOString(),
      oleh: terbaik!.oleh ?? '',
      woNumber: terbaik!.wo_number,
      dariPanel: false,
    };
  }
  if (nilaiPanel !== null) {
    return {
      nilai: nilaiPanel,
      at: panel!.changed_at.toISOString(),
      oleh: panel!.oleh ?? '',
      woNumber: '',
      dariPanel: true,
    };
  }
  return null;
}

/**
 * Periksa angka yang hendak masuk.
 *
 * TIDAK menolak yang KOSONG (`_Meter.js:210-211`): isian meter tetap opsional
 * sampai Gabriel menyalakannya wajib. Yang ditolak hanya angka yang MUSTAHIL.
 * Ini sejalan dengan Create WO, tempat medan HM sengaja tidak bertanda wajib —
 * bintang di sana menjanjikan pagar yang tak ada.
 */
export async function periksaMasuk(
  unitId: number, nilai: number | null | undefined, jenis: JenisMeter, tx?: Tx,
): Promise<{ ok: boolean; pesan?: string; acuan: Acuan | null }> {
  const c = METER[jenis];
  if (nilai === null || nilai === undefined || !Number.isFinite(nilai)) {
    return { ok: true, acuan: null };
  }
  if (nilai <= 0) return { ok: false, pesan: `${c.label} harus lebih dari 0.`, acuan: null };

  const acuan = await acuanUnit(unitId, jenis, tx);
  if (!acuan) return { ok: true, acuan: null };
  if (nilai >= acuan.nilai) return { ok: true, acuan };

  return {
    ok: false,
    acuan,
    pesan: `${c.label} tidak boleh mundur. Unit ini sudah tercatat ${acuan.nilai}`
      + `${acuan.oleh ? ` oleh ${acuan.oleh}` : ''}.`
      + ` Kalau panelnya memang diganti, minta L1/L2 mencatatnya lewat menu ${c.menu}.`,
  };
}

export interface BacaanMeter {
  woId: number;
  woNumber: string;
  at: string;
  section: string | null;
  oleh: string | null;
  nilai: number;
  /** '' | 'mundur' | 'melompat' */
  janggal: string;
}

export interface RiwayatMeter {
  acuan: Acuan | null;
  panel: { nilai: number; at: string; alasan: string; oleh: string | null }[];
  bacaan: BacaanMeter[];
  ambangLompat: number;
}

export async function riwayatUnit(
  tenantId: number, unitId: number, jenis: JenisMeter,
): Promise<RiwayatMeter> {
  const [acuan, lompat, panel, mentah] = await Promise.all([
    acuanUnit(unitId, jenis),
    ambangLompat(tenantId, jenis),
    sql<{ value_after: string; changed_at: Date; reason: string; oleh: string | null }[]>`
      SELECT p.value_after, p.changed_at, p.reason, m.name AS oleh
        FROM meter_panel_changes p
        LEFT JOIN mechanics m ON m.id = p.recorded_by
       WHERE p.unit_id = ${unitId} AND p.kind = ${jenis}::odometer_type
       ORDER BY p.changed_at ASC
    `,
    sql<{
      id: number; wo_number: string; created_at: Date;
      section: string | null; oleh: string | null; nilai: string;
    }[]>`
      SELECT w.id, w.wo_number, w.created_at, s.code::text AS section,
             m.name AS oleh,
             ${jenis === 'HM' ? sql`w.hour_meter` : sql`w.kilometers`} AS nilai
        FROM work_orders w
        JOIN sections  s ON s.id = w.section_id
        JOIN mechanics m ON m.id = w.created_by
       WHERE w.unit_id = ${unitId} AND w.tenant_id = ${tenantId}
         AND ${jenis === 'HM' ? sql`w.hour_meter` : sql`w.kilometers`} IS NOT NULL
       ORDER BY w.created_at ASC
    `,
  ]);

  /* Penandaan janggal, atas `tertinggi` yang BERJALAN dan tak pernah turun.
     Dua bentuk, dan yang kedua yang merusak diam-diam (`_Meter.js:287-300`). */
  let tertinggi = -1;
  const bacaan: BacaanMeter[] = mentah.map((b) => {
    const n = Number(b.nilai);
    let janggal = '';
    if (tertinggi >= 0 && n < tertinggi) janggal = 'mundur';
    else if (tertinggi >= 0 && n - tertinggi > lompat) janggal = 'melompat';
    if (n > tertinggi) tertinggi = n;
    return {
      woId: Number(b.id), woNumber: b.wo_number, at: b.created_at.toISOString(),
      section: b.section, oleh: b.oleh, nilai: n, janggal,
    };
  });
  bacaan.reverse();   // terbaru di atas

  return {
    acuan,
    panel: panel.map((p) => ({
      nilai: Number(p.value_after), at: p.changed_at.toISOString(),
      alasan: p.reason, oleh: p.oleh,
    })),
    bacaan,
    ambangLompat: lompat,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// PERINTAH
// ────────────────────────────────────────────────────────────────────────────

async function pastikanApprover(tx: Tx, mechanicId: number, menu: string) {
  const r = (
    await tx<{ peran: string }[]>`
      SELECT role::text AS peran FROM mechanics WHERE id = ${mechanicId} AND is_active
    `
  )[0];
  if (!r) throw tidakDitemukan('Mekanik', mechanicId);
  if (r.peran !== 'supervisor' && r.peran !== 'superintendent') {
    throw tidakBerhak(`${menu} hanya untuk L1 dan L2.`);
  }
}

export interface MasukanKoreksiMeter {
  opId: string;
  tenantId: number;
  actorId: number;
  woId: number;
  jenis: JenisMeter;
  /** `null` = dikosongkan. "Lebih baik hilang daripada salah." */
  nilaiBaru: number | null;
  alasan: string;
}

export async function koreksiMeterWo(
  m: MasukanKoreksiMeter,
): Promise<HasilPerintah<{
  woId: number; jenis: JenisMeter; lama: number | null; baru: number | null;
}>> {
  const c = METER[m.jenis];
  return jalankanPerintah({
    opId: m.opId,
    tenantId: m.tenantId,
    actorId: m.actorId,
    action: 'koreksi_meter',
    jalankan: async ({ tx }) => {
      await pastikanApprover(tx, m.actorId, c.menu);

      const alasan = m.alasan.trim();
      if (alasan.length < 5) {
        throw aturanBisnis(
          `Alasan wajib diisi. Angka ${c.label} yang berubah tanpa sebab tertulis `
          + 'mustahil dijelaskan nanti.',
        );
      }
      if (m.nilaiBaru !== null && m.nilaiBaru <= 0) {
        throw aturanBisnis(`${c.label} baru harus lebih dari 0, atau dikosongkan.`);
      }

      const wo = (
        await tx<{ id: number; unit_id: number | null; lama: string | null }[]>`
          SELECT id, unit_id,
                 ${m.jenis === 'HM' ? tx`hour_meter` : tx`kilometers`} AS lama
            FROM work_orders WHERE id = ${m.woId} AND tenant_id = ${m.tenantId}
        `
      )[0];
      if (!wo) throw tidakDitemukan('Work order', m.woId);
      const lama = wo.lama === null ? null : Number(wo.lama);

      /* Yang disunting adalah BARIS WO-NYA SENDIRI, supaya sumber kebenarannya
         tetap satu. Tabel jejak hanya jejaknya — siapa mengubah apa, dari
         berapa ke berapa, kenapa. Tanpa jejak itu, angka yang berubah
         diam-diam mustahil dijelaskan kepada orang yang mempertanyakannya
         (`_KoreksiHm.js:33-36`). */
      if (m.jenis === 'HM') {
        await tx`UPDATE work_orders SET hour_meter = ${m.nilaiBaru} WHERE id = ${m.woId}`;
      } else {
        await tx`UPDATE work_orders SET kilometers = ${m.nilaiBaru} WHERE id = ${m.woId}`;
      }

      /* `meter_readings` adalah TURUNAN dari baris WO, bukan sumber kedua.
         Kalau ia tidak ikut dikoreksi, ada dua tempat yang mengaku tahu angka
         yang sama — dan pagar naik-saja di Create WO membaca yang satunya lagi,
         sehingga koreksi tidak berpengaruh sama sekali terhadap acuan. */
      if (wo.unit_id) {
        await tx`
          DELETE FROM meter_readings
           WHERE work_order_id = ${m.woId} AND kind = ${m.jenis}::odometer_type
        `;
        if (m.nilaiBaru !== null) {
          await tx`
            INSERT INTO meter_readings (unit_id, kind, value, work_order_id, recorded_by)
            VALUES (${wo.unit_id}, ${m.jenis}::odometer_type, ${m.nilaiBaru},
                    ${m.woId}, ${m.actorId})
          `;
        }
      }

      await tx`
        INSERT INTO meter_corrections
          (work_order_id, kind, value_before, value_after, reason, corrected_by)
        VALUES (${m.woId}, ${m.jenis}::odometer_type, ${lama}, ${m.nilaiBaru},
                ${alasan}, ${m.actorId})
      `;

      // Aksi audit menyebut METERNYA. Di KMB V2 koreksi KM ikut tercatat
      // sebagai KOREKSI_HM (`_Meter.js:361,404`), sehingga menyaring audit
      // menurut aksi menyebut koreksi KM sebagai koreksi HM.
      await tx`
        INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, actor_id, details)
        VALUES (${m.tenantId}, ${`koreksi_${m.jenis.toLowerCase()}`}, 'work_order',
                ${String(m.woId)}, ${m.actorId},
                ${tx.json({ meter: c.label, unit_id: wo.unit_id, lama, baru: m.nilaiBaru,
                            alasan } as never)})
      `;

      return { woId: m.woId, jenis: m.jenis, lama, baru: m.nilaiBaru };
    },
  });
}

export interface MasukanGantiPanel {
  opId: string;
  tenantId: number;
  actorId: number;
  unitId: number;
  jenis: JenisMeter;
  /** `0` DIPERBOLEHKAN — panel baru memang mulai dari nol. */
  nilaiBaru: number;
  berlakuAt: string;
  alasan: string;
}

export async function gantiPanelMeter(
  m: MasukanGantiPanel,
): Promise<HasilPerintah<{ unitId: number; jenis: JenisMeter; baru: number; berlakuAt: string }>> {
  const c = METER[m.jenis];
  return jalankanPerintah({
    opId: m.opId,
    tenantId: m.tenantId,
    actorId: m.actorId,
    action: 'ganti_panel_meter',
    jalankan: async ({ tx }) => {
      await pastikanApprover(tx, m.actorId, c.menu);

      if (!Number.isFinite(m.nilaiBaru) || m.nilaiBaru < 0) {
        throw aturanBisnis(`${c.label} panel baru tidak sah.`);
      }
      const d = new Date(m.berlakuAt);
      if (Number.isNaN(d.getTime())) {
        throw aturanBisnis('Tanggal & jam berlaku wajib diisi.');
      }
      // Toleransi satu jam — beda jam ponsel dengan server bukan alasan menolak.
      if (d.getTime() > Date.now() + 3_600_000) {
        throw aturanBisnis('Tanggal berlaku tidak boleh di masa depan.');
      }
      const alasan = m.alasan.trim();
      if (alasan.length < 5) throw aturanBisnis('Alasan wajib diisi.');

      const unit = (
        await tx<{ id: number; semu: boolean }[]>`
          SELECT id, is_virtual AS semu FROM units
           WHERE id = ${m.unitId} AND tenant_id = ${m.tenantId}
        `
      )[0];
      if (!unit) throw tidakDitemukan('Unit', m.unitId);
      if (unit.semu) throw aturanBisnis('Unit semu tidak punya meter.');

      await tx`
        INSERT INTO meter_panel_changes (unit_id, kind, changed_at, value_after, reason, recorded_by)
        VALUES (${m.unitId}, ${m.jenis}::odometer_type, ${d}, ${m.nilaiBaru},
                ${alasan}, ${m.actorId})
      `;

      await tx`
        INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, actor_id, details)
        VALUES (${m.tenantId}, ${`ganti_panel_${m.jenis.toLowerCase()}`}, 'unit',
                ${String(m.unitId)}, ${m.actorId},
                ${tx.json({ meter: c.label, baru: m.nilaiBaru,
                            berlaku_at: d.toISOString(), alasan } as never)})
      `;

      return {
        unitId: m.unitId, jenis: m.jenis, baru: m.nilaiBaru,
        berlakuAt: d.toISOString(),
      };
    },
  });
}

/**
 * Unit untuk pemilih di layar koreksi.
 *
 * Unit SEMU dilewati — di KMB V2 yang dilewati bernama `OTHERS` dan `WORKSHOP`
 * (`Hm.html:105-106`); keduanya bukan unit sungguhan dan tak punya meter.
 */
export async function unitBermeter(
  tenantId: number,
): Promise<{ id: number; kode: string; nama: string }[]> {
  const r = await sql<{ id: number; kode: string; nama: string }[]>`
    SELECT id, unit_code::text AS kode, unit_name AS nama
      FROM units
     WHERE tenant_id = ${tenantId} AND is_active AND is_virtual = false
     ORDER BY unit_name
  `;
  return r.map((u) => ({ id: Number(u.id), kode: u.kode, nama: u.nama }));
}

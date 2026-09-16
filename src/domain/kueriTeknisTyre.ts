import { sql } from '../lib/db.js';
import type { Identitas } from '../lib/auth.js';

/**
 * DASHBOARD TEKNIS — DUNIA TYRE.
 *
 * Port dari `dataDashboardTeknis()` (`_DashboardTeknis.js:35-459`).
 *
 * ── SATU KALIMAT YANG MENGIKAT SELURUH LAYAR INI ────────────────────────────
 * "Keadaan alat, bukan kinerja orang. Tidak ada poin maupun rupiah di layar
 * ini." Alasannya ditulis di sumbernya (`_DashboardTeknis.js:9-12`): begitu
 * poin masuk, pencatatan berubah jadi usaha terlihat bagus — dan angka ban yang
 * dikarang membuat seluruh dashboard ini tak berguna. Jangan menambahkan
 * peringkat, nama mekanik sebagai penilaian, atau rupiah ke sini.
 *
 * ── TIDAK ADA PENYARING PERIODE ─────────────────────────────────────────────
 * Tidak approved-only, tidak per section, tidak periode gaji. Ban tidak tahu
 * soal periode gaji, dan memotong riwayatnya di tanggal 16 akan memutus
 * pasangan pasang–lepas yang justru jadi dasar umur pakai.
 */

const KODE_INSPEKSI = 'tyre_inspeksi';
const KODE_REMOVE = 'tyre_remove_instal';
const KODE_REPAIR = 'tyre_repair';

export interface RingkasTyre {
  unitTercatat: number;
  posisiTercatat: number;
  barisInspeksi: number;
  barisRemove: number;
  barisRepair: number;
}

export interface KondisiTyre {
  unitId: number;
  unitNama: string;
  pos: number;
  rtd: number | null;
  jejakRtd: number[];
  pressure: number | null;
  dicatatAt: string;
  snTerpasang: string | null;
  /** KM sejak ban ini dipasang. null = KM belum bisa dihitung. */
  lifeKm: number | null;
  umurHari: number | null;
  sisaKm: number | null;
  perkiraanGanti: string | null;
  kritis: boolean;
}

export interface BarisProblem { label: string; jumlah: number }

export interface RiwayatRemove {
  at: string;
  unitId: number;
  unitNama: string;
  pos: number;
  removeSn: string | null;
  problem: string | null;
  remarks: string | null;
  instalSn: string | null;
  lokasi: string | null;
}

export interface RepairPerSn {
  sn: string;
  merk: string | null;
  pattern: string | null;
  size: string | null;
  jumlah: number;
  terakhir: string;
}

export interface LifeSelesai {
  sn: string;
  /** Posisi saat pelepasan FINAL. Dasar grafik rata-rata menurut posisi. */
  pos: number;
  merk: string | null;
  pattern: string | null;
  size: string | null;
  lifeKm: number;
  hari: number;
  problem: string | null;
  dilepasAt: string;
}

export interface DataTeknisTyre {
  ringkas: RingkasTyre;
  kondisi: KondisiTyre[];
  problemJenis: BarisProblem[];
  problemPosisi: BarisProblem[];
  riwayat: RiwayatRemove[];
  repair: RepairPerSn[];
  life: {
    selesai: LifeSelesai[];
    rataRata: number | null;
    jumlah: number;
    target: number | null;
    rataMerk: { label: string; nilai: number; sampel: number }[];
    rataPosisi: { label: string; nilai: number; sampel: number }[];
  };
  mingguan: { label: string; inspeksi: number; removeInstal: number; problem: number }[];
  rtdKritis: number | null;
  targetLifeKm: number | null;
}

/** Angka EAV disimpan sebagai teks. NULL dan nol harus tetap berbeda. */
function angkaAtauNull(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function setelan(tenantId: number, kunci: string): Promise<number | null> {
  const r = (
    await sql<{ setting_value: string | null }[]>`
      SELECT setting_value FROM settings
       WHERE tenant_id = ${tenantId} AND setting_key = ${kunci}
    `
  )[0];
  const n = Number(r?.setting_value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Satu baris per (WO, posisi), medannya sudah dipivot jadi kolom. */
interface BarisPivot {
  wo_id: number; unit_id: number; unit_nama: string; pos: number;
  dicatat_at: Date; km: string | null;
  [k: string]: unknown;
}

async function pivot(
  tenantId: number, kodeForm: string, medan: string[],
): Promise<BarisPivot[]> {
  /* Pivot lewat FILTER, bukan `max(text)` per medan tanpa pengelompokan yang
     jelas. Satu (WO, posisi) ditulis dalam satu kiriman dengan `recorded_at`
     yang sama, jadi mengambil `max` per medan di dalam kelompok itu aman —
     yang TIDAK aman adalah mencampur beberapa kiriman jadi satu baris. */
  const kolom = medan.map((m) => sql`
    max(d.value_after) FILTER (WHERE d.field_key = ${m}) AS ${sql(m)}
  `);
  return sql<BarisPivot[]>`
    SELECT w.id AS wo_id, w.unit_id, u.unit_name AS unit_nama,
           d.position AS pos, max(d.recorded_at) AS dicatat_at,
           w.kilometers AS km,
           ${kolom.reduce((a, b) => sql`${a}, ${b}`)}
      FROM work_order_detail_values d
      JOIN work_orders      w ON w.id = d.work_order_id
      JOIN job_detail_forms f ON f.id = d.form_id
      JOIN units            u ON u.id = w.unit_id
     WHERE w.tenant_id = ${tenantId} AND f.tenant_id = ${tenantId}
       AND f.code = ${kodeForm}
       AND w.status NOT IN ('rejected','cancelled')
     GROUP BY w.id, w.unit_id, u.unit_name, d.position, w.kilometers
     ORDER BY max(d.recorded_at) ASC, w.id ASC
  `;
}

export async function dataTeknisTyre(aku: Identitas): Promise<DataTeknisTyre> {
  const t = aku.tenantId;

  const [rtdKritis, targetLifeKm, insp, rem, rep, kmUnit] = await Promise.all([
    setelan(t, 'tyre_rtd_kritis'),
    setelan(t, 'tyre_target_life_km'),
    pivot(t, KODE_INSPEKSI, ['pressure', 'rtd', 'suhu']),
    pivot(t, KODE_REMOVE, [
      'remove_sn', 'remove_merk', 'remove_pattern', 'remove_size',
      'remove_problem', 'remove_remarks',
      'instal_sn', 'instal_merk', 'instal_pattern', 'instal_size',
      'lokasi_breakdown',
    ]),
    pivot(t, KODE_REPAIR, ['sn', 'merk', 'pattern', 'size']),
    /* KM terkini per unit diambil dari SELURUH WO, bukan dari catatan ban saja:
       unit yang lama hanya menerima WO field akan punya data tyre yang basi,
       dan ramalan sisa KM-nya ikut basi (`_DashboardTeknis.js:72-100`).
       Yang diambil yang TERBESAR — kiriman HP yang terlambat tidak boleh
       memundurkan acuan. */
    sql<{ unit_id: number; km: string }[]>`
      SELECT unit_id, max(kilometers) AS km
        FROM work_orders
       WHERE tenant_id = ${t} AND unit_id IS NOT NULL AND kilometers > 0
       GROUP BY unit_id
    `,
  ]);

  const kmSekarang = new Map(kmUnit.map((r) => [Number(r.unit_id), Number(r.km)]));

  // ── Ringkasan ─────────────────────────────────────────────────────────────
  const unitSet = new Set(insp.map((r) => Number(r.unit_id)));
  const posSet = new Set(insp.map((r) => `${r.unit_id}:${r.pos}`));

  // ── Pemasangan terakhir per (unit, posisi) ────────────────────────────────
  const pasang = new Map<string, { at: Date; sn: string; km: number | null }>();
  for (const r of rem) {
    const sn = String(r['instal_sn'] ?? '').trim();
    if (!sn) continue;
    pasang.set(`${r.unit_id}:${r.pos}`, {
      at: r.dicatat_at, sn, km: angkaAtauNull(r.km),
    });
  }

  // ── Kondisi kini: catatan inspeksi TERBARU per (unit, posisi) ─────────────
  const terbaru = new Map<string, BarisPivot>();
  const jejak = new Map<string, number[]>();
  for (const r of insp) {
    const k = `${r.unit_id}:${r.pos}`;
    terbaru.set(k, r);                       // insp sudah urut menaik
    const rtd = angkaAtauNull(r['rtd'] as string | null);
    if (rtd !== null) (jejak.get(k) ?? jejak.set(k, []).get(k)!).push(rtd);
  }

  const sekarang = Date.now();
  const kondisi: KondisiTyre[] = [...terbaru.entries()].map(([k, r]) => {
    const rtd = angkaAtauNull(r['rtd'] as string | null);
    const p = pasang.get(k);
    const kmKini = kmSekarang.get(Number(r.unit_id)) ?? null;

    /* `life_km` hanya kalau KEDUANYA ada dan tidak mundur. Ban yang dipasang
       tanpa KM tercatat tidak boleh dikira berumur nol — nol adalah angka, dan
       angka yang salah lebih buruk daripada kekosongan yang jujur. */
    const lifeKm = p?.km != null && kmKini != null && kmKini >= p.km
      ? Math.round(kmKini - p.km) : null;
    const umurHari = p ? Math.floor((sekarang - p.at.getTime()) / 86_400_000) : null;
    const sisaKm = targetLifeKm !== null && lifeKm !== null
      ? Math.round(targetLifeKm - lifeKm) : null;

    /* Ramalan tanggal ganti memakai laju ban INI sendiri, bukan rata-rata
       armada — dan hanya kalau ada bukti: umur > 0 hari dan sudah menempuh
       jarak. Tanpa itu tidak ada tanggal, bukan tanggal yang dikarang.
       "Ramalan, bukan janji." */
    let perkiraanGanti: string | null = null;
    if (umurHari !== null && umurHari > 0 && lifeKm !== null && lifeKm > 0
        && sisaKm !== null && sisaKm > 0) {
      const sisaHari = Math.floor(sisaKm / (lifeKm / umurHari));
      perkiraanGanti = new Date(sekarang + sisaHari * 86_400_000).toISOString();
    }

    return {
      unitId: Number(r.unit_id), unitNama: r.unit_nama, pos: Number(r.pos),
      rtd,
      jejakRtd: (jejak.get(k) ?? []).slice(-8),
      pressure: angkaAtauNull(r['pressure'] as string | null),
      dicatatAt: r.dicatat_at.toISOString(),
      snTerpasang: p?.sn ?? null,
      lifeKm, umurHari, sisaKm, perkiraanGanti,
      // Tanpa ambang, TIDAK ADA yang ditandai kritis. Tiadanya warna merah
      // karena itu bukan berarti aman — layar harus mengatakannya.
      kritis: rtdKritis !== null && rtd !== null && rtd <= rtdKritis,
    };
  });

  // RTD terendah dulu; yang belum terukur di paling belakang.
  kondisi.sort((a, b) => {
    if (a.rtd === null && b.rtd === null) return 0;
    if (a.rtd === null) return 1;
    if (b.rtd === null) return -1;
    return a.rtd - b.rtd;
  });

  // ── Problem ───────────────────────────────────────────────────────────────
  const perJenis = new Map<string, number>();
  const perPosisi = new Map<number, number>();
  for (const r of rem) {
    const p = String(r['remove_problem'] ?? '').trim();
    if (!p) continue;                        // kosong diabaikan, bukan dihitung
    perJenis.set(p, (perJenis.get(p) ?? 0) + 1);
    perPosisi.set(Number(r.pos), (perPosisi.get(Number(r.pos)) ?? 0) + 1);
  }
  const urutJumlah = (m: Map<string | number, number>, awalan = '') =>
    [...m.entries()].map(([k, v]) => ({ label: `${awalan}${k}`, jumlah: v }))
      .sort((a, b) => b.jumlah - a.jumlah);

  // ── Riwayat remove/instal, terbaru dulu ───────────────────────────────────
  const riwayat: RiwayatRemove[] = [...rem].reverse().map((r) => ({
    at: r.dicatat_at.toISOString(),
    unitId: Number(r.unit_id), unitNama: r.unit_nama, pos: Number(r.pos),
    removeSn: (r['remove_sn'] as string) ?? null,
    problem: (r['remove_problem'] as string) ?? null,
    remarks: (r['remove_remarks'] as string) ?? null,
    instalSn: (r['instal_sn'] as string) ?? null,
    lokasi: (r['lokasi_breakdown'] as string) ?? null,
  }));

  // ── Repair per SN ─────────────────────────────────────────────────────────
  /* Dikelompokkan menurut SN setelah trim TEPI saja. Besar-kecil huruf tetap
     dibedakan dan spasi di tengah tidak disentuh: SN diketik bebas, dan
     menyeragamkannya diam-diam akan menggabungkan dua ban berbeda jadi satu
     riwayat (`_DashboardTeknis.js:251-258`). */
  const repMap = new Map<string, RepairPerSn>();
  for (const r of rep) {
    const sn = String(r['sn'] ?? '').trim();
    if (!sn) continue;
    const ada = repMap.get(sn);
    const at = r.dicatat_at.toISOString();
    if (ada) {
      ada.jumlah++;
      if (at > ada.terakhir) ada.terakhir = at;
      ada.merk ??= (r['merk'] as string) ?? null;
      ada.pattern ??= (r['pattern'] as string) ?? null;
      ada.size ??= (r['size'] as string) ?? null;
    } else {
      repMap.set(sn, {
        sn, merk: (r['merk'] as string) ?? null,
        pattern: (r['pattern'] as string) ?? null,
        size: (r['size'] as string) ?? null,
        jumlah: 1, terakhir: at,
      });
    }
  }

  const life = hitungLife(rem, targetLifeKm);

  return {
    ringkas: {
      unitTercatat: unitSet.size,
      posisiTercatat: posSet.size,
      barisInspeksi: insp.length,
      barisRemove: rem.length,
      barisRepair: rep.length,
    },
    kondisi,
    problemJenis: urutJumlah(perJenis as Map<string | number, number>),
    problemPosisi: urutJumlah(perPosisi as Map<string | number, number>, 'Posisi '),
    riwayat,
    repair: [...repMap.values()].sort((a, b) => b.jumlah - a.jumlah),
    life,
    mingguan: emberMingguan(insp, rem),
    rtdKritis,
    targetLifeKm,
  };
}

/**
 * UMUR PAKAI YANG SUDAH SELESAI.
 *
 * Port dari `_hitungLifeSelesai` (`_DashboardTeknis.js:282-407`), berikut
 * keputusan yang paling mudah salah:
 *
 *   "Rancangan pertama menghitung per unit+posisi, jadi tiap rotasi membuat
 *    umurnya kembali dari nol." (`:300-302`)
 *
 * Maka akumulasinya PER NOMOR SERI, melintasi rotasi dan repair. Pelepasan
 * yang ber-remarks `rotasi` atau `repair` MENYIMPAN akumulasi dan belum
 * menerbitkan umur final; yang lain menutup umurnya. Satu selisih terakhir saja
 * akan merusak analisis pembelian ban.
 */
function hitungLife(
  rem: BarisPivot[], target: number | null,
): DataTeknisTyre['life'] {
  const terpasang = new Map<string, { sn: string; km: number; at: Date }>();
  const akum = new Map<string, { km: number; hari: number }>();
  const selesai: LifeSelesai[] = [];

  for (const r of rem) {
    const kunci = `${r.unit_id}:${r.pos}`;
    const km = angkaAtauNull(r.km);
    const snLepas = String(r['remove_sn'] ?? '').trim();
    const remarks = String(r['remove_remarks'] ?? '').toLowerCase();

    if (snLepas) {
      const p = terpasang.get(kunci);
      // Harus cocok SN, punya kedua KM, dan KM lepas tidak mundur. Yang tidak
      // berpasangan DIABAIKAN, bukan ditaksir.
      if (p && p.sn === snLepas && km !== null && km >= p.km) {
        const potonganKm = Math.round(km - p.km);
        const potonganHari = Math.floor((r.dicatat_at.getTime() - p.at.getTime()) / 86_400_000);
        const a = akum.get(snLepas) ?? { km: 0, hari: 0 };
        a.km += potonganKm;
        a.hari += potonganHari;

        if (remarks.includes('rotasi') || remarks.includes('repair')) {
          akum.set(snLepas, a);            // masih hidup, umurnya belum selesai
        } else {
          selesai.push({
            sn: snLepas,
            pos: Number(r.pos),
            merk: (r['remove_merk'] as string) ?? null,
            pattern: (r['remove_pattern'] as string) ?? null,
            size: (r['remove_size'] as string) ?? null,
            lifeKm: a.km, hari: a.hari,
            problem: (r['remove_problem'] as string) ?? null,
            dilepasAt: r.dicatat_at.toISOString(),
          });
          akum.delete(snLepas);
        }
      }
      terpasang.delete(kunci);
    }

    const snPasang = String(r['instal_sn'] ?? '').trim();
    if (snPasang && km !== null) {
      terpasang.set(kunci, { sn: snPasang, km, at: r.dicatat_at });
    }
  }

  selesai.sort((a, b) => b.lifeKm - a.lifeKm);

  const rata = (daftar: number[]) =>
    daftar.length === 0 ? null : Math.round(daftar.reduce((a, b) => a + b, 0) / daftar.length);

  const kelompok = (ambil: (s: LifeSelesai) => string) => {
    const m = new Map<string, number[]>();
    for (const s of selesai) {
      const k = ambil(s) || '(tanpa keterangan)';
      (m.get(k) ?? m.set(k, []).get(k)!).push(s.lifeKm);
    }
    return [...m.entries()]
      .map(([label, v]) => ({ label, nilai: rata(v)!, sampel: v.length }))
      .sort((a, b) => b.nilai - a.nilai);
  };

  return {
    selesai,
    rataRata: rata(selesai.map((s) => s.lifeKm)),
    jumlah: selesai.length,
    target,
    rataMerk: kelompok((s) => [s.merk, s.pattern].filter(Boolean).join(' / ')),
    rataPosisi: kelompok((s) => `Posisi ${s.pos}`),
  };
}

/**
 * Ember mingguan: empat blok TUJUH HARI MUNDUR dari sekarang, bukan
 * Senin–Minggu (`_DashboardTeknis.js:410-459`). Batasnya `(mulai, akhir]`.
 */
function emberMingguan(
  insp: BarisPivot[], rem: BarisPivot[],
): DataTeknisTyre['mingguan'] {
  const JUM = 4;
  const kini = Date.now();
  const hasil: DataTeknisTyre['mingguan'] = [];
  for (let i = JUM - 1; i >= 0; i--) {
    const akhir = kini - i * 7 * 86_400_000;
    const mulai = akhir - 7 * 86_400_000;
    const dalam = (d: Date) => d.getTime() > mulai && d.getTime() <= akhir;
    hasil.push({
      label: `Mg ${JUM - i}`,
      inspeksi: insp.filter((r) => dalam(r.dicatat_at)).length,
      removeInstal: rem.filter((r) => dalam(r.dicatat_at)).length,
      problem: rem.filter((r) => dalam(r.dicatat_at)
        && String(r['remove_problem'] ?? '').trim() !== '').length,
    });
  }
  return hasil;
}

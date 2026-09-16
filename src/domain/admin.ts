import type { Tx } from '../lib/db.js';
import { sql } from '../lib/db.js';
import { aturanBisnis, tidakBerhak, tidakDitemukan } from '../lib/errors.js';
import { buatToken } from '../lib/auth.js';
import { jalankanPerintah, type HasilPerintah } from './runCommand.js';
import { pastikanKomponen, pastikanModel, pastikanSub } from './katalogInduk.js';
import { setelanBerdampak, type SetelanBerdampak } from './dampakSetelan.js';

/**
 * MENU ADMIN.
 *
 * Tidak ada layar sumber untuk ditiru: di KMB V2, SPREADSHEET-NYA SENDIRI yang
 * jadi menu admin. Gabriel menambah orang, menerbitkan token, mengubah base
 * point, dan menambah faktor dengan menyunting sheet langsung. Begitu
 * spreadsheet hilang, lubang itu tidak tertutup sendiri — dan sampai berkas ini
 * ada, sistem ini tidak bisa dijalankan tanpa saya.
 *
 * ── TIGA HAL YANG MEMBUAT LAYAR INI AMAN ────────────────────────────────────
 *
 * 1. **Mengubah base point atau tarif TIDAK mengubah WO lama.** `scoring_snapshots`
 *    membekukan angka saat approve, dan `mechanic_points.idr_value` adalah kolom
 *    GENERATED dari tarif yang ikut dibekukan. Sudah dibuktikan uji payroll:
 *    menggandakan seluruh tarif tidak menggeser laporan satu rupiah pun. Jadi
 *    menu ini tidak bisa merusak sejarah, hanya masa depan.
 *
 * 2. **Orang TIDAK PERNAH dihapus, hanya dinonaktifkan.** Mereka punya poin,
 *    WO, dan riwayat approval; menghapusnya akan memutus semuanya. Basis data
 *    sendiri akan menolak lewat foreign key — dan itu memang benar, tapi pesan
 *    galat FK bukan jawaban yang layak dibaca orang.
 *
 * 3. **Semuanya masuk `audit_logs`.** Angka yang berubah tanpa jejak mustahil
 *    dijelaskan kepada orang yang mempertanyakannya nanti.
 */

export async function pastikanAdmin(tx: Tx, mechanicId: number): Promise<void> {
  const r = (
    await tx<{ boleh: boolean }[]>`
      SELECT may_admin AS boleh FROM mechanics WHERE id = ${mechanicId} AND is_active
    `
  )[0];
  if (!r) throw tidakDitemukan('Mekanik', mechanicId);
  if (!r.boleh) throw tidakBerhak('Menu Admin hanya untuk yang diberi hak admin.');
}

async function catat(
  tx: Tx, tenantId: number, actorId: number,
  action: string, entitas: string, id: string, rinci: Record<string, unknown>,
): Promise<void> {
  await tx`
    INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, actor_id, details)
    VALUES (${tenantId}, ${action}, ${entitas}, ${id}, ${actorId}, ${tx.json(rinci as never)})
  `;
}

// ────────────────────────────────────────────────────────────────────────────
// ORANG
// ────────────────────────────────────────────────────────────────────────────

export interface MasukanOrang {
  opId: string;
  tenantId: number;
  actorId: number;
  /** Ada = sunting, tidak ada = orang baru. */
  id?: number;
  kode: string;
  nama: string;
  email?: string | null;
  peran: 'mechanic' | 'supervisor' | 'superintendent';
  payRateId: number;
  grade?: string | null;
  section?: string[];
  aktif: boolean;
  akunUji: boolean;
  bolehPerforma: boolean;
  bolehTeknis: boolean;
  bolehReport: boolean;
  bolehAdmin: boolean;
}

export async function simpanOrang(
  m: MasukanOrang,
): Promise<HasilPerintah<{ id: number; baru: boolean }>> {
  return jalankanPerintah({
    opId: m.opId, tenantId: m.tenantId, actorId: m.actorId, action: 'admin_orang',
    jalankan: async ({ tx }) => {
      await pastikanAdmin(tx, m.actorId);

      const kode = m.kode.trim();
      const nama = m.nama.trim();
      if (kode.length < 2) throw aturanBisnis('Kode mekanik minimal 2 huruf');
      if (nama.length < 2) throw aturanBisnis('Nama minimal 2 huruf');
      const email = m.email?.trim() || null;

      const tarif = (
        await tx`SELECT 1 FROM pay_rates WHERE id = ${m.payRateId} AND tenant_id = ${m.tenantId}`
      )[0];
      if (!tarif) throw tidakDitemukan('Tarif', m.payRateId);

      /* Mencabut hak admin DIRI SENDIRI ditolak. Bukan kesopanan: kalau satu-
         satunya admin mematikan penandanya sendiri, tak ada lagi yang bisa
         menyalakannya kembali dari dalam sistem — pintunya terkunci dari luar
         dan kuncinya di dalam. */
      if (m.id === m.actorId && !m.bolehAdmin) {
        throw aturanBisnis(
          'Anda tidak bisa mencabut hak admin Anda sendiri. Minta admin lain '
          + 'melakukannya, supaya tidak ada keadaan tanpa admin sama sekali.',
        );
      }
      if (m.id === m.actorId && !m.aktif) {
        throw aturanBisnis('Anda tidak bisa menonaktifkan akun Anda sendiri.');
      }

      let id = m.id ?? 0;
      let baru = false;

      if (m.id) {
        const lama = (
          await tx<Record<string, unknown>[]>`
            SELECT * FROM mechanics WHERE id = ${m.id} AND tenant_id = ${m.tenantId}
          `
        )[0];
        if (!lama) throw tidakDitemukan('Mekanik', m.id);

        await tx`
          UPDATE mechanics SET
            mechanic_code = ${kode}, name = ${nama}, email = ${email},
            role = ${m.peran}::user_role, pay_rate_id = ${m.payRateId},
            grade = ${m.grade?.trim() || null},
            is_active = ${m.aktif}, is_test_account = ${m.akunUji},
            may_view_performance = ${m.bolehPerforma},
            may_view_technical = ${m.bolehTeknis},
            may_view_report = ${m.bolehReport},
            may_admin = ${m.bolehAdmin},
            updated_at = now()
          WHERE id = ${m.id}
        `;
        await catat(tx, m.tenantId, m.actorId, 'admin_orang_ubah', 'mechanic',
          String(m.id), { kode, nama, peran: m.peran, aktif: m.aktif, lama });
      } else {
        const r = (
          await tx<{ id: number }[]>`
            INSERT INTO mechanics
              (tenant_id, mechanic_code, name, email, role, pay_rate_id, grade,
               is_active, is_test_account, may_view_performance, may_view_technical,
               may_view_report, may_admin)
            VALUES (${m.tenantId}, ${kode}, ${nama}, ${email}, ${m.peran}::user_role,
                    ${m.payRateId}, ${m.grade?.trim() || null}, ${m.aktif}, ${m.akunUji},
                    ${m.bolehPerforma}, ${m.bolehTeknis}, ${m.bolehReport}, ${m.bolehAdmin})
            RETURNING id
          `
        )[0]!;
        id = Number(r.id);
        baru = true;
        await catat(tx, m.tenantId, m.actorId, 'admin_orang_baru', 'mechanic',
          String(id), { kode, nama, peran: m.peran });
      }

      // Section: daftar diganti utuh, bukan ditambal. Tak punya baris sama
      // sekali berarti "lihat semua section" (`db/schema.sql:103`).
      await tx`DELETE FROM mechanic_sections WHERE mechanic_id = ${id}`;
      for (const s of m.section ?? []) {
        if (!s.trim()) continue;
        await tx`
          INSERT INTO mechanic_sections (mechanic_id, section) VALUES (${id}, ${s.trim()})
        `;
      }

      return { id, baru };
    },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// TOKEN
// ────────────────────────────────────────────────────────────────────────────

export interface MasukanToken {
  opId: string;
  tenantId: number;
  actorId: number;
  mechanicId: number;
  /** true = cabut token lama lalu terbitkan yang baru. */
  ganti?: boolean;
}

export async function terbitkanToken(
  m: MasukanToken,
): Promise<HasilPerintah<{ mechanicId: number; token: string; menggantiLama: boolean }>> {
  return jalankanPerintah({
    opId: m.opId, tenantId: m.tenantId, actorId: m.actorId, action: 'admin_token',
    jalankan: async ({ tx }) => {
      await pastikanAdmin(tx, m.actorId);

      const orang = (
        await tx<{ id: number; nama: string; aktif: boolean }[]>`
          SELECT id, name AS nama, is_active AS aktif FROM mechanics
           WHERE id = ${m.mechanicId} AND tenant_id = ${m.tenantId}
        `
      )[0];
      if (!orang) throw tidakDitemukan('Mekanik', m.mechanicId);
      if (!orang.aktif) {
        throw aturanBisnis(`${orang.nama} sudah nonaktif — aktifkan dulu sebelum diberi token.`);
      }

      const punya = await tx<{ token: string }[]>`
        SELECT token FROM api_tokens WHERE mechanic_id = ${m.mechanicId}
      `;

      /* Sudah punya token dan tidak diminta ganti → kembalikan yang ADA.
         Menerbitkan token kedua diam-diam berarti mekanik yang sudah menghafal
         tokennya tiba-tiba ditolak, dan ia tidak akan tahu kenapa. */
      if (punya.length > 0 && !m.ganti) {
        return { mechanicId: m.mechanicId, token: punya[0]!.token, menggantiLama: false };
      }

      if (punya.length > 0) {
        await tx`DELETE FROM api_tokens WHERE mechanic_id = ${m.mechanicId}`;
      }
      const token = buatToken();
      await tx`
        INSERT INTO api_tokens (tenant_id, mechanic_id, token)
        VALUES (${m.tenantId}, ${m.mechanicId}, ${token})
      `;

      /* Tokennya SENGAJA tidak ikut ke audit log. Ia kunci masuk: menyalinnya
         ke tabel yang dibaca lebih banyak orang memperluas siapa yang bisa
         masuk atas nama orang itu, tanpa menambah satu pun kegunaan. */
      await catat(tx, m.tenantId, m.actorId,
        m.ganti ? 'admin_token_ganti' : 'admin_token_terbit', 'mechanic',
        String(m.mechanicId), { nama: orang.nama, mengganti_lama: punya.length > 0 });

      return { mechanicId: m.mechanicId, token, menggantiLama: punya.length > 0 };
    },
  });
}

export async function cabutToken(
  m: { opId: string; tenantId: number; actorId: number; mechanicId: number },
): Promise<HasilPerintah<{ mechanicId: number; dicabut: number }>> {
  return jalankanPerintah({
    opId: m.opId, tenantId: m.tenantId, actorId: m.actorId, action: 'admin_token_cabut',
    jalankan: async ({ tx }) => {
      await pastikanAdmin(tx, m.actorId);
      if (m.mechanicId === m.actorId) {
        throw aturanBisnis('Anda tidak bisa mencabut token Anda sendiri — Anda akan terkunci di luar.');
      }
      const r = await tx`
        DELETE FROM api_tokens WHERE mechanic_id = ${m.mechanicId}
           AND tenant_id = ${m.tenantId} RETURNING id
      `;
      await catat(tx, m.tenantId, m.actorId, 'admin_token_cabut', 'mechanic',
        String(m.mechanicId), { dicabut: r.length });
      return { mechanicId: m.mechanicId, dicabut: r.length };
    },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// KATALOG: base point & jam rencana
// ────────────────────────────────────────────────────────────────────────────

export interface MasukanJob {
  opId: string;
  tenantId: number;
  actorId: number;
  /** Ada = sunting job yang sudah ada, tidak ada = job baru. */
  jobId?: number;
  /** Wajib saat membuat job baru. Tidak dipakai saat menyunting. */
  sectionCode?: string;
  kode?: string;
  /** Nama pekerjaan. Boleh diubah kapan saja — lihat catatan di bawah. */
  nama?: string;
  /** Penempatan cascade. Wajib untuk section ber-picker `cascade` saat baru. */
  unitModel?: string | null;
  komponen?: string | null;
  subKomponen?: string | null;
  basePoints: number;
  planHours: number;
  aktif: boolean;
}

/**
 * Menyimpan SATU job — baru maupun suntingan.
 *
 * ── KENAPA MENGGANTI NAMA PEKERJAAN AMAN ────────────────────────────────────
 * WO menyimpan `job_id`, bukan tulisan namanya (`db/schema.sql:281`). Tidak ada
 * satu kolom pun di `work_orders` yang menyalin `job_description`, dan
 * `scoring_snapshots` hanya menyimpan ANGKA. Jadi mengganti nama sebuah job akan
 * terbaca di seluruh WO lama — termasuk yang sudah disetujui — tanpa menggeser
 * poin atau rupiah siapa pun, dan tanpa satu pun WO kehilangan jobnya.
 *
 * ── PENEMPATAN CASCADE TIDAK IKUT DIUBAH SAAT MENYUNTING ────────────────────
 * Layar buat-WO menyaring joblist dengan model → komponen → sub-komponen
 * (`BlokJoblist.tsx:61-75`). Memindahkan job yang sudah dipakai ke cabang lain
 * membuatnya menghilang dari tempat orang biasa mencarinya. Pindah cabang
 * dilakukan lewat impor Excel, tempat perpindahannya terlihat satu per satu di
 * pratinjau sebelum diterapkan.
 */
export async function simpanJob(
  m: MasukanJob,
): Promise<HasilPerintah<{
  jobId: number; baru: boolean; kode: string;
  lama: { basePoints: number; planHours: number; nama: string } | null;
}>> {
  return jalankanPerintah({
    opId: m.opId, tenantId: m.tenantId, actorId: m.actorId, action: 'admin_job',
    jalankan: async ({ tx }) => {
      await pastikanAdmin(tx, m.actorId);
      if (m.basePoints <= 0) throw aturanBisnis('Base point harus lebih dari 0');
      if (m.planHours <= 0) throw aturanBisnis('Jam rencana harus lebih dari 0');

      // ── SUNTING ────────────────────────────────────────────────────────────
      if (m.jobId) {
        const lama = (
          await tx<{
            base_points: string; plan_hours: string; kode: string; nama: string;
          }[]>`
            SELECT base_points, plan_hours, job_code::text AS kode,
                   job_description AS nama
              FROM jobs WHERE id = ${m.jobId} AND tenant_id = ${m.tenantId}
          `
        )[0];
        if (!lama) throw tidakDitemukan('Job', m.jobId);

        const nama = (m.nama ?? lama.nama).trim();
        if (nama.length < 3) throw aturanBisnis('Nama pekerjaan minimal 3 huruf');

        await tx`
          UPDATE jobs SET base_points = ${m.basePoints}, plan_hours = ${m.planHours},
                          job_description = ${nama}, is_active = ${m.aktif},
                          updated_at = now()
           WHERE id = ${m.jobId}
        `;

        /* WO yang SUDAH disetujui tidak ikut berubah — angkanya dibekukan
           `scoring_snapshots` saat approve. Yang berubah hanya WO yang dibuat
           SESUDAH ini. Untuk membawanya mundur ada perintah TERPISAH:
           domain/terapkanSurut.ts. */
        await catat(tx, m.tenantId, m.actorId, 'admin_job_ubah', 'job', String(m.jobId), {
          kode: lama.kode,
          nama: { lama: lama.nama, baru: nama },
          base_points: { lama: Number(lama.base_points), baru: m.basePoints },
          plan_hours: { lama: Number(lama.plan_hours), baru: m.planHours },
          aktif: m.aktif,
        });

        return {
          jobId: m.jobId, baru: false, kode: lama.kode,
          lama: {
            basePoints: Number(lama.base_points),
            planHours: Number(lama.plan_hours),
            nama: lama.nama,
          },
        };
      }

      // ── BARU ───────────────────────────────────────────────────────────────
      const kode = (m.kode ?? '').trim();
      const nama = (m.nama ?? '').trim();
      if (kode.length < 2) throw aturanBisnis('Kode job minimal 2 huruf');
      if (nama.length < 3) throw aturanBisnis('Nama pekerjaan minimal 3 huruf');
      if (!m.sectionCode) throw aturanBisnis('Section wajib dipilih');

      const sec = (
        await tx<{ id: number; picker: string }[]>`
          SELECT id, picker_style::text AS picker FROM sections
           WHERE tenant_id = ${m.tenantId} AND code = ${m.sectionCode}
        `
      )[0];
      if (!sec) throw tidakDitemukan('Section', m.sectionCode);

      let modelId: number | null = null;
      let subId: number | null = null;
      let indukBaru = 0;

      if (sec.picker === 'cascade') {
        const model = (m.unitModel ?? '').trim();
        const komp = (m.komponen ?? '').trim();
        const sub = (m.subKomponen ?? '').trim();
        /* Ditolak, bukan dibiarkan kosong. Section cascade menyaring joblist
           dengan model → komponen → sub-komponen; job tanpa ketiganya tersimpan
           dengan rapi lalu TIDAK PERNAH MUNCUL di layar buat WO — data mati yang
           tak memberi satu pun tanda bahwa ia mati. */
        if (!model || !komp || !sub) {
          throw aturanBisnis(
            `Section ${m.sectionCode} memilih job lewat Model → Komponen → `
            + 'Sub-komponen. Ketiganya wajib diisi, kalau tidak job ini tidak akan '
            + 'pernah muncul di layar buat WO.',
          );
        }
        modelId = await pastikanModel(tx, m.tenantId, sec.id, model, () => { indukBaru++; });
        const kompId = await pastikanKomponen(tx, sec.id, komp, () => { indukBaru++; });
        subId = await pastikanSub(tx, kompId, sub, () => { indukBaru++; });
      }

      /* Kode job unik PER SECTION, bukan per tenant: 162 kode dipakai di field
         DAN workshop untuk pekerjaan yang berbeda (db/migrasi/007). */
      const bentrok = (
        await tx<{ id: number }[]>`
          SELECT id FROM jobs
           WHERE tenant_id = ${m.tenantId} AND section_id = ${sec.id} AND job_code = ${kode}
        `
      )[0];
      if (bentrok) {
        throw aturanBisnis(
          `Kode ${kode} sudah dipakai di section ${m.sectionCode}. `
          + 'Pakai kode lain, atau sunting job yang sudah ada.',
        );
      }

      const r = (
        await tx<{ id: number }[]>`
          INSERT INTO jobs (tenant_id, job_code, section_id, unit_model_id,
                            sub_component_id, job_description, plan_hours,
                            base_points, is_active)
          VALUES (${m.tenantId}, ${kode}, ${sec.id}, ${modelId}, ${subId},
                  ${nama}, ${m.planHours}, ${m.basePoints}, ${m.aktif})
          RETURNING id
        `
      )[0]!;

      await catat(tx, m.tenantId, m.actorId, 'admin_job_baru', 'job', String(r.id), {
        kode, nama, section: m.sectionCode,
        base_points: m.basePoints, plan_hours: m.planHours,
        unit_model: m.unitModel ?? null, komponen: m.komponen ?? null,
        sub_komponen: m.subKomponen ?? null, induk_baru: indukBaru,
      });

      return { jobId: Number(r.id), baru: true, kode, lama: null };
    },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// KATALOG: UNIT
// ────────────────────────────────────────────────────────────────────────────

export interface MasukanUnit {
  opId: string;
  tenantId: number;
  actorId: number;
  /** Ada = sunting, tidak ada = unit baru. */
  unitId?: number;
  kode?: string;
  nama: string;
  /** Model alat. Menentukan JOB mana yang ditawarkan untuknya — bukan sectionnya. */
  unitModel?: string | null;
  /** Section yang boleh MEMILIH unit ini. Kosong = semua section. */
  section: string[];
  /** Unit sewa: boleh dipilih, tapi disembunyikan sampai diminta. */
  global: boolean;
  unitFactor: number;
  odometer?: 'HM' | 'KM' | null;
  brand?: string | null;
  modelType?: string | null;
  mtbfEligible: boolean;
  aktif: boolean;
}

/**
 * Menyimpan SATU unit — baru maupun suntingan.
 *
 * ── DUA HUBUNGAN YANG BERBEDA, DAN PERNAH TERTUKAR ──────────────────────────
 * Sebuah unit terikat pada section lewat DUA jalan yang sama sekali tidak sama:
 *
 *   `section[]`  → siapa yang boleh MEMILIHNYA saat membuat WO (`unit_sections`).
 *   `unitModel`  → job mana yang ditawarkan UNTUKNYA di section cascade.
 *
 * Model sebuah Hauler milik field. Tapi 35 Hauler adalah pegangan TYREMAN, yang
 * mengurus bannya — dan joblist tyreman datar, tidak menyentuh model sama
 * sekali. Karena itu menyaring dropdown unit dengan section model (yang kita
 * lakukan sampai 16 Sep 2026) menghapus 44 dari 50 unit tyreman dari layar.
 *
 * ── TIGA KEADAAN LINGKUP, BUKAN DUA ─────────────────────────────────────────
 *   punya section  → dedicated: menonjol di sectionnya, tetap bisa dipilih yang lain
 *   tanpa section  → milik semua section
 *   global         → unit sewa: disembunyikan sampai diminta
 * `global` menang atas daftar sectionnya, persis seperti V2.
 */
export async function simpanUnit(
  m: MasukanUnit,
): Promise<HasilPerintah<{ unitId: number; baru: boolean; kode: string }>> {
  return jalankanPerintah({
    opId: m.opId, tenantId: m.tenantId, actorId: m.actorId, action: 'admin_unit',
    jalankan: async ({ tx }) => {
      await pastikanAdmin(tx, m.actorId);

      const nama = m.nama.trim();
      if (nama.length < 2) throw aturanBisnis('Nama unit minimal 2 huruf');
      if (!(m.unitFactor > 0)) throw aturanBisnis('Faktor unit harus lebih dari 0');
      /* Faktor unit adalah PENGALI POIN. Batas atas bukan kerewelan: satu
         ketikan 15 yang dimaksud 1,5 melipatgandakan bayaran setiap WO unit itu,
         dan tidak ada yang akan menyadarinya sampai payroll terbit. */
      if (m.unitFactor > 5) {
        throw aturanBisnis(
          `Faktor ${m.unitFactor} di luar batas wajar (maksimal 5). Faktor unit `
          + 'adalah pengali poin — periksa lagi titik desimalnya.',
        );
      }

      const idSection: number[] = [];
      for (const s of m.section) {
        if (!s.trim()) continue;
        const r = (
          await tx<{ id: number }[]>`
            SELECT id FROM sections WHERE tenant_id = ${m.tenantId} AND code = ${s.trim()}
          `
        )[0];
        if (!r) throw tidakDitemukan('Section', s);
        idSection.push(Number(r.id));
      }

      let modelId: number | null = null;
      if (m.unitModel?.trim()) {
        /* Model dicari LINTAS SECTION dan yang pertama dipakai. Model unit di
           V2 memang tidak bercabang per section — "Hauler" satu-satunya, dan
           dialah yang menyambungkan unit ke 123 job field. */
        const r = (
          await tx<{ id: number }[]>`
            SELECT id FROM unit_models
             WHERE tenant_id = ${m.tenantId} AND code = ${m.unitModel.trim()}
             ORDER BY id LIMIT 1
          `
        )[0];
        if (!r) {
          throw aturanBisnis(
            `Model unit "${m.unitModel.trim()}" belum ada. Model dibuat lewat impor `
            + 'katalog job, karena dialah yang menentukan joblist unit ini — '
            + 'membuatnya kosong di sini menghasilkan unit tanpa satu pun pekerjaan.',
          );
        }
        modelId = Number(r.id);
      }

      let id = m.unitId ?? 0;
      let baru = false;
      let kode = (m.kode ?? '').trim();

      if (m.unitId) {
        const lama = (
          await tx<Record<string, unknown>[]>`
            SELECT * FROM units WHERE id = ${m.unitId} AND tenant_id = ${m.tenantId}
          `
        )[0];
        if (!lama) throw tidakDitemukan('Unit', m.unitId);
        kode = String(lama['unit_code']);

        await tx`
          UPDATE units SET
            unit_name = ${nama}, unit_model_id = ${modelId},
            unit_factor = ${m.unitFactor},
            odometer = ${m.odometer ?? null}::odometer_type,
            brand = ${m.brand?.trim() || null}, model_type = ${m.modelType?.trim() || null},
            mtbf_eligible = ${m.mtbfEligible}, is_global = ${m.global},
            is_active = ${m.aktif}
          WHERE id = ${m.unitId}
        `;
        await catat(tx, m.tenantId, m.actorId, 'admin_unit_ubah', 'unit',
          String(m.unitId), { kode, nama, section: m.section, global: m.global, lama });
      } else {
        if (kode.length < 2) throw aturanBisnis('Kode unit minimal 2 huruf');
        const bentrok = (
          await tx<{ id: number }[]>`
            SELECT id FROM units WHERE tenant_id = ${m.tenantId} AND unit_code = ${kode}
          `
        )[0];
        if (bentrok) {
          throw aturanBisnis(
            `Kode ${kode} sudah dipakai. Kode unit unik untuk seluruh plant — `
            + 'sunting unit yang sudah ada, atau pakai kode lain.',
          );
        }
        const r = (
          await tx<{ id: number }[]>`
            INSERT INTO units (tenant_id, unit_code, unit_name, unit_model_id,
                               unit_factor, odometer, brand, model_type,
                               mtbf_eligible, is_global, is_active)
            VALUES (${m.tenantId}, ${kode}, ${nama}, ${modelId}, ${m.unitFactor},
                    ${m.odometer ?? null}::odometer_type, ${m.brand?.trim() || null},
                    ${m.modelType?.trim() || null}, ${m.mtbfEligible}, ${m.global},
                    ${m.aktif})
            RETURNING id
          `
        )[0]!;
        id = Number(r.id);
        baru = true;
        await catat(tx, m.tenantId, m.actorId, 'admin_unit_baru', 'unit', String(id),
          { kode, nama, section: m.section, global: m.global, faktor: m.unitFactor });
      }

      // Daftar section diganti UTUH, bukan ditambal — sama seperti section orang.
      await tx`DELETE FROM unit_sections WHERE unit_id = ${id}`;
      for (const sid of idSection) {
        await tx`
          INSERT INTO unit_sections (unit_id, section_id) VALUES (${id}, ${sid})
          ON CONFLICT DO NOTHING
        `;
      }

      return { unitId: id, baru, kode };
    },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// HAPUS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Menghapus baris katalog yang BELUM PERNAH DIPAKAI.
 *
 * Yang sudah dipakai TIDAK dihapus, dan itu bukan kehati-hatian berlebih:
 * `work_orders.job_id` dan `work_orders.unit_id` adalah foreign key tanpa
 * cascade, jadi basis data sendiri yang akan menolak. Tapi pesan galat foreign
 * key bukan jawaban yang layak dibaca orang — dan yang benar memang bukan
 * "paksa hapus" melainkan NONAKTIFKAN: WO lama menampilkan nama job dan unitnya
 * lewat FK, sehingga menghapusnya akan membuat riwayat yang sudah dibayar tidak
 * bisa dijelaskan lagi.
 *
 * Jadi tombol Hapus hanya untuk membereskan salah ketik yang baru dibuat.
 */
export async function hapusJob(
  m: { opId: string; tenantId: number; actorId: number; jobId: number },
): Promise<HasilPerintah<{ jobId: number; kode: string }>> {
  return jalankanPerintah({
    opId: m.opId, tenantId: m.tenantId, actorId: m.actorId, action: 'admin_hapus_job',
    jalankan: async ({ tx }) => {
      await pastikanAdmin(tx, m.actorId);
      const job = (
        await tx<{ kode: string; nama: string; wo: number }[]>`
          SELECT j.job_code::text AS kode, j.job_description AS nama,
                 (SELECT count(*)::int FROM work_orders w WHERE w.job_id = j.id) AS wo
            FROM jobs j WHERE j.id = ${m.jobId} AND j.tenant_id = ${m.tenantId}
        `
      )[0];
      if (!job) throw tidakDitemukan('Job', m.jobId);

      if (job.wo > 0) {
        throw aturanBisnis(
          `${job.kode} sudah dipakai ${job.wo} WO dan tidak bisa dihapus — WO lama `
          + 'membaca nama pekerjaannya dari baris ini. Hilangkan dari joblist dengan '
          + 'menghapus centang Aktif; riwayatnya tetap bisa dijelaskan.',
        );
      }

      await tx`DELETE FROM jobs WHERE id = ${m.jobId}`;
      await catat(tx, m.tenantId, m.actorId, 'admin_job_hapus', 'job', String(m.jobId),
        { kode: job.kode, nama: job.nama });
      return { jobId: m.jobId, kode: job.kode };
    },
  });
}

export async function hapusUnit(
  m: { opId: string; tenantId: number; actorId: number; unitId: number },
): Promise<HasilPerintah<{ unitId: number; kode: string }>> {
  return jalankanPerintah({
    opId: m.opId, tenantId: m.tenantId, actorId: m.actorId, action: 'admin_hapus_unit',
    jalankan: async ({ tx }) => {
      await pastikanAdmin(tx, m.actorId);
      const unit = (
        await tx<{ kode: string; nama: string; wo: number; meter: number }[]>`
          SELECT u.unit_code::text AS kode, u.unit_name AS nama,
                 (SELECT count(*)::int FROM work_orders w WHERE w.unit_id = u.id) AS wo,
                 (SELECT count(*)::int FROM meter_readings r WHERE r.unit_id = u.id)
                 + (SELECT count(*)::int FROM meter_panel_changes c WHERE c.unit_id = u.id)
                   AS meter
            FROM units u WHERE u.id = ${m.unitId} AND u.tenant_id = ${m.tenantId}
        `
      )[0];
      if (!unit) throw tidakDitemukan('Unit', m.unitId);

      if (unit.wo > 0) {
        throw aturanBisnis(
          `${unit.nama} sudah dipakai ${unit.wo} WO dan tidak bisa dihapus. `
          + 'Hilangkan dari daftar dengan menghapus centang Aktif — riwayat WO-nya '
          + 'tetap utuh.',
        );
      }
      /* Angka meter hidup lebih lama dari WO-nya: ia dipakai menghitung umur ban
         dan MTBF, dan sengaja tidak ikut terhapus saat WO dibatalkan. Unit yang
         punya riwayat meter karena itu bukan unit yang "belum pernah dipakai". */
      if (unit.meter > 0) {
        throw aturanBisnis(
          `${unit.nama} punya ${unit.meter} catatan meter dan tidak bisa dihapus — `
          + 'angka itu dipakai menghitung umur ban dan MTBF. Nonaktifkan saja.',
        );
      }

      await tx`DELETE FROM units WHERE id = ${m.unitId}`;
      await catat(tx, m.tenantId, m.actorId, 'admin_unit_hapus', 'unit', String(m.unitId),
        { kode: unit.kode, nama: unit.nama });
      return { unitId: m.unitId, kode: unit.kode };
    },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// FAKTOR, TARIF, SETELAN
// ────────────────────────────────────────────────────────────────────────────

export async function simpanFaktor(
  m: {
    opId: string; tenantId: number; actorId: number;
    id: number; nilai: number; deskripsi?: string | null;
  },
): Promise<HasilPerintah<{ id: number; lama: number }>> {
  return jalankanPerintah({
    opId: m.opId, tenantId: m.tenantId, actorId: m.actorId, action: 'admin_faktor',
    jalankan: async ({ tx }) => {
      await pastikanAdmin(tx, m.actorId);
      if (!Number.isFinite(m.nilai) || m.nilai < 0) {
        throw aturanBisnis('Nilai faktor tidak boleh negatif');
      }
      const lama = (
        await tx<{ factor_value: string; factor_type: string; factor_key: string }[]>`
          SELECT factor_value, factor_type::text, factor_key::text
            FROM factors WHERE id = ${m.id} AND tenant_id = ${m.tenantId}
        `
      )[0];
      if (!lama) throw tidakDitemukan('Faktor', m.id);

      await tx`
        UPDATE factors SET factor_value = ${m.nilai},
               description = coalesce(${m.deskripsi ?? null}, description)
         WHERE id = ${m.id}
      `;
      await catat(tx, m.tenantId, m.actorId, 'admin_faktor_ubah', 'factor', String(m.id), {
        jenis: lama.factor_type, kunci: lama.factor_key,
        lama: Number(lama.factor_value), baru: m.nilai,
      });
      return { id: m.id, lama: Number(lama.factor_value) };
    },
  });
}

export async function simpanTarif(
  m: {
    opId: string; tenantId: number; actorId: number;
    id: number; idrPerPoint: number; label?: string; aktif: boolean;
  },
): Promise<HasilPerintah<{ id: number; lama: number }>> {
  return jalankanPerintah({
    opId: m.opId, tenantId: m.tenantId, actorId: m.actorId, action: 'admin_tarif',
    jalankan: async ({ tx }) => {
      await pastikanAdmin(tx, m.actorId);
      if (!Number.isFinite(m.idrPerPoint) || m.idrPerPoint <= 0) {
        throw aturanBisnis('Rupiah per poin harus lebih dari 0');
      }
      const lama = (
        await tx<{ idr_per_point: string; position: string }[]>`
          SELECT idr_per_point, position::text FROM pay_rates
           WHERE id = ${m.id} AND tenant_id = ${m.tenantId}
        `
      )[0];
      if (!lama) throw tidakDitemukan('Tarif', m.id);

      await tx`
        UPDATE pay_rates SET idr_per_point = ${m.idrPerPoint},
               label = coalesce(${m.label ?? null}, label),
               is_active = ${m.aktif}, updated_at = now()
         WHERE id = ${m.id}
      `;
      /* Poin yang SUDAH terbit tidak ikut berubah: `mechanic_points.idr_value`
         adalah kolom GENERATED dari `idr_per_point` yang disalin saat poin
         diterbitkan, bukan dari baris tarif ini. Di KMB V2 tarif dibaca ulang
         saat laporan disusun, dan itulah sebabnya perubahan tarif pernah
         menggeser gaji yang sudah dibayar (-Rp 17,6 juta, 9 Sep 2026). */
      await catat(tx, m.tenantId, m.actorId, 'admin_tarif_ubah', 'pay_rate', String(m.id), {
        posisi: lama.position, lama: Number(lama.idr_per_point), baru: m.idrPerPoint,
      });
      return { id: m.id, lama: Number(lama.idr_per_point) };
    },
  });
}

export async function simpanSetelan(
  m: {
    opId: string; tenantId: number; actorId: number;
    kunci: string; nilai: string;
  },
): Promise<HasilPerintah<{ kunci: string; lama: string | null }>> {
  return jalankanPerintah({
    opId: m.opId, tenantId: m.tenantId, actorId: m.actorId, action: 'admin_setelan',
    jalankan: async ({ tx }) => {
      await pastikanAdmin(tx, m.actorId);
      const kunci = m.kunci.trim();
      const lama = (
        await tx<{ setting_value: string | null }[]>`
          SELECT setting_value FROM settings
           WHERE tenant_id = ${m.tenantId} AND setting_key = ${kunci}
        `
      )[0];
      if (!lama) throw tidakDitemukan('Setelan', kunci);

      await tx`
        UPDATE settings SET setting_value = ${m.nilai.trim()}
         WHERE tenant_id = ${m.tenantId} AND setting_key = ${kunci}
      `;
      await catat(tx, m.tenantId, m.actorId, 'admin_setelan_ubah', 'setting', kunci, {
        lama: lama.setting_value, baru: m.nilai.trim(),
      });
      return { kunci, lama: lama.setting_value };
    },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// BACAAN
// ────────────────────────────────────────────────────────────────────────────

export interface BekalAdmin {
  orang: {
    id: number; kode: string; nama: string; email: string | null; peran: string;
    payRateId: number; grade: string | null; aktif: boolean; akunUji: boolean;
    bolehPerforma: boolean; bolehTeknis: boolean; bolehReport: boolean; bolehAdmin: boolean;
    section: string[]; token: string | null;
    /** Jumlah WO yang pernah ia kerjakan — kenapa ia tak boleh dihapus. */
    jejak: number;
  }[];
  tarif: { id: number; posisi: string; label: string; idrPerPoint: number; aktif: boolean }[];
  faktor: { id: number; jenis: string; kunci: string; nilai: number; deskripsi: string | null }[];
  setelan: { kunci: string; nilai: string | null; keterangan: string | null }[];
  /**
   * Setelan BESERTA dampaknya. Tab Setelan tidak punya tombol "terapkan ke
   * semua" karena setelan tidak pernah dibekukan — ia berlaku surut seketika.
   * Yang dibutuhkan keterangan per kunci, dan sebagian kunci ternyata tidak
   * dibaca kode mana pun. Lihat domain/dampakSetelan.ts.
   */
  setelanDampak: SetelanBerdampak[];
  section: string[];
  /** Bentuk picker tiap section — `cascade` menuntut model/komponen/sub. */
  bentukSection: { code: string; picker: string }[];
  job: {
    id: number; kode: string; nama: string; section: string;
    basePoints: number; planHours: number; aktif: boolean;
    unitModel: string | null; komponen: string | null; subKomponen: string | null;
    /** WO berstatus approved yang memakai job ini — dasar tombol "terapkan surut". */
    woApproved: number;
    /** WO apa pun statusnya. Nol = boleh dihapus. */
    woTotal: number;
  }[];
  /** Pilihan cascade yang SUDAH ADA, supaya job baru menempel di cabang yang benar. */
  cabang: { section: string; model: string; komponen: string; subKomponen: string }[];
  unit: {
    id: number; kode: string; nama: string;
    /** Model alat — menentukan joblist yang ditawarkan untuknya. */
    unitModel: string | null;
    /** Section yang boleh memilihnya. Kosong = semua section. */
    section: string[];
    global: boolean; virtual: boolean;
    unitFactor: number; odometer: string | null;
    brand: string | null; modelType: string | null;
    mtbfEligible: boolean; aktif: boolean;
    woTotal: number; meterTotal: number;
  }[];
  /** Model unit yang ada, per section — pilihan untuk formulir unit. */
  model: { code: string; section: string; job: number }[];
}

export async function bekalAdmin(tenantId: number): Promise<BekalAdmin> {
  const [orang, tarif, faktor, setelan, section, job, cabang, unit, model, dampak] =
    await Promise.all([
    sql<Record<string, never>[]>`
      SELECT m.id, m.mechanic_code::text AS kode, m.name AS nama, m.email::text AS email,
             m.role::text AS peran, m.pay_rate_id, m.grade, m.is_active AS aktif,
             m.is_test_account AS akun_uji, m.may_view_performance AS boleh_performa,
             m.may_view_technical AS boleh_teknis, m.may_view_report AS boleh_report,
             m.may_admin AS boleh_admin,
             coalesce(sec.daftar, ARRAY[]::text[]) AS section,
             tok.token,
             coalesce(jj.n, 0) AS jejak
        FROM mechanics m
        LEFT JOIN LATERAL (
          SELECT array_agg(s.section::text ORDER BY s.section) AS daftar
            FROM mechanic_sections s WHERE s.mechanic_id = m.id
        ) sec ON true
        LEFT JOIN LATERAL (
          SELECT t.token FROM api_tokens t WHERE t.mechanic_id = m.id LIMIT 1
        ) tok ON true
        LEFT JOIN LATERAL (
          SELECT count(*) AS n FROM work_order_team wt WHERE wt.mechanic_id = m.id
        ) jj ON true
       WHERE m.tenant_id = ${tenantId}
       ORDER BY m.is_active DESC, m.role, m.name
    `,
    sql<Record<string, never>[]>`
      SELECT id, position::text AS posisi, label, idr_per_point, is_active AS aktif
        FROM pay_rates WHERE tenant_id = ${tenantId} ORDER BY idr_per_point
    `,
    sql<Record<string, never>[]>`
      SELECT id, factor_type::text AS jenis, factor_key::text AS kunci,
             factor_value AS nilai, description AS deskripsi
        FROM factors WHERE tenant_id = ${tenantId}
       ORDER BY factor_type, factor_value
    `,
    sql<Record<string, never>[]>`
      SELECT setting_key::text AS kunci, setting_value AS nilai, description AS keterangan
        FROM settings WHERE tenant_id = ${tenantId} ORDER BY setting_key
    `,
    sql<{ code: string; picker: string }[]>`
      SELECT code::text, picker_style::text AS picker
        FROM sections WHERE tenant_id = ${tenantId} ORDER BY sort_order, code
    `,
    sql<Record<string, never>[]>`
      SELECT j.id, j.job_code::text AS kode, j.job_description AS nama,
             s.code::text AS section, j.base_points, j.plan_hours, j.is_active AS aktif,
             um.code::text  AS unit_model,
             c.name::text   AS komponen,
             sc.name::text  AS sub_komponen,
             coalesce(wo.disetujui, 0) AS wo_approved,
             coalesce(wo.semua, 0) AS wo_total
        FROM jobs j
        JOIN sections s ON s.id = j.section_id
        LEFT JOIN unit_models        um ON um.id = j.unit_model_id
        LEFT JOIN job_sub_components sc ON sc.id = j.sub_component_id
        LEFT JOIN job_components     c  ON c.id  = sc.component_id
        LEFT JOIN LATERAL (
          SELECT count(*) FILTER (WHERE w.status = 'approved')::int AS disetujui,
                 count(*)::int AS semua
            FROM work_orders w WHERE w.job_id = j.id
        ) wo ON true
       WHERE j.tenant_id = ${tenantId}
       ORDER BY s.code, j.job_code
    `,
    /* Cabang cascade yang SUDAH terpakai. Dikirim utuh, seperti katalog layar
       buat-WO, karena formulir "+ Tambah job" harus menawarkan nama yang persis
       sama — sub-komponen yang salah eja melahirkan cabang kembar. */
    sql<Record<string, never>[]>`
      SELECT DISTINCT s.code::text AS section, um.code::text AS model,
             c.name::text AS komponen, sc.name::text AS sub_komponen
        FROM jobs j
        JOIN sections s ON s.id = j.section_id
        JOIN unit_models        um ON um.id = j.unit_model_id
        JOIN job_sub_components sc ON sc.id = j.sub_component_id
        JOIN job_components     c  ON c.id  = sc.component_id
       WHERE j.tenant_id = ${tenantId}
       ORDER BY 1, 2, 3, 4
    `,
    /* Unit: daftar section datang dari `unit_sections`, BUKAN dari section
       model. Keduanya menjawab pertanyaan yang berbeda — lihat simpanUnit(). */
    sql<Record<string, never>[]>`
      SELECT u.id, u.unit_code::text AS kode, u.unit_name AS nama,
             um.code::text AS unit_model,
             coalesce(sc.daftar, ARRAY[]::text[]) AS section,
             u.is_global, u.is_virtual, u.unit_factor, u.odometer::text,
             u.brand, u.model_type, u.mtbf_eligible, u.is_active AS aktif,
             coalesce(p.wo, 0) AS wo_total, coalesce(p.meter, 0) AS meter_total
        FROM units u
        LEFT JOIN unit_models um ON um.id = u.unit_model_id
        LEFT JOIN LATERAL (
          SELECT array_agg(s.code::text ORDER BY s.code) AS daftar
            FROM unit_sections us JOIN sections s ON s.id = us.section_id
           WHERE us.unit_id = u.id
        ) sc ON true
        LEFT JOIN LATERAL (
          SELECT (SELECT count(*)::int FROM work_orders w WHERE w.unit_id = u.id) AS wo,
                 (SELECT count(*)::int FROM meter_readings r WHERE r.unit_id = u.id)
                 + (SELECT count(*)::int FROM meter_panel_changes c WHERE c.unit_id = u.id)
                   AS meter
        ) p ON true
       WHERE u.tenant_id = ${tenantId}
       ORDER BY u.unit_name
    `,
    sql<Record<string, never>[]>`
      SELECT um.code::text, s.code::text AS section,
             (SELECT count(*)::int FROM jobs j WHERE j.unit_model_id = um.id) AS job
        FROM unit_models um JOIN sections s ON s.id = um.section_id
       WHERE um.tenant_id = ${tenantId} AND um.is_active
       ORDER BY s.code, um.code
    `,
    setelanBerdampak(tenantId),
  ]);

  const n = (v: unknown) => Number(v);
  return {
    orang: (orang as unknown as Record<string, unknown>[]).map((o) => ({
      id: n(o['id']), kode: String(o['kode']), nama: String(o['nama']),
      email: (o['email'] as string) ?? null, peran: String(o['peran']),
      payRateId: n(o['pay_rate_id']), grade: (o['grade'] as string) ?? null,
      aktif: Boolean(o['aktif']), akunUji: Boolean(o['akun_uji']),
      bolehPerforma: Boolean(o['boleh_performa']), bolehTeknis: Boolean(o['boleh_teknis']),
      bolehReport: Boolean(o['boleh_report']), bolehAdmin: Boolean(o['boleh_admin']),
      section: (o['section'] as string[]) ?? [],
      token: (o['token'] as string) ?? null,
      jejak: n(o['jejak']),
    })),
    tarif: (tarif as unknown as Record<string, unknown>[]).map((t) => ({
      id: n(t['id']), posisi: String(t['posisi']), label: String(t['label']),
      idrPerPoint: n(t['idr_per_point']), aktif: Boolean(t['aktif']),
    })),
    faktor: (faktor as unknown as Record<string, unknown>[]).map((f) => ({
      id: n(f['id']), jenis: String(f['jenis']), kunci: String(f['kunci']),
      nilai: n(f['nilai']), deskripsi: (f['deskripsi'] as string) ?? null,
    })),
    setelan: (setelan as unknown as Record<string, unknown>[]).map((s) => ({
      kunci: String(s['kunci']), nilai: (s['nilai'] as string) ?? null,
      keterangan: (s['keterangan'] as string) ?? null,
    })),
    setelanDampak: dampak as SetelanBerdampak[],
    section: section.map((s) => s.code),
    bentukSection: section.map((s) => ({ code: s.code, picker: s.picker })),
    job: (job as unknown as Record<string, unknown>[]).map((j) => ({
      id: n(j['id']), kode: String(j['kode']), nama: String(j['nama']),
      section: String(j['section']), basePoints: n(j['base_points']),
      planHours: n(j['plan_hours']), aktif: Boolean(j['aktif']),
      unitModel: (j['unit_model'] as string) ?? null,
      komponen: (j['komponen'] as string) ?? null,
      subKomponen: (j['sub_komponen'] as string) ?? null,
      woApproved: n(j['wo_approved']), woTotal: n(j['wo_total']),
    })),
    cabang: (cabang as unknown as Record<string, unknown>[]).map((c) => ({
      section: String(c['section']), model: String(c['model']),
      komponen: String(c['komponen']), subKomponen: String(c['sub_komponen']),
    })),
    unit: (unit as unknown as Record<string, unknown>[]).map((u) => ({
      id: n(u['id']), kode: String(u['kode']), nama: String(u['nama']),
      unitModel: (u['unit_model'] as string) ?? null,
      section: (u['section'] as string[]) ?? [],
      global: Boolean(u['is_global']), virtual: Boolean(u['is_virtual']),
      unitFactor: n(u['unit_factor']), odometer: (u['odometer'] as string) ?? null,
      brand: (u['brand'] as string) ?? null,
      modelType: (u['model_type'] as string) ?? null,
      mtbfEligible: Boolean(u['mtbf_eligible']), aktif: Boolean(u['aktif']),
      woTotal: n(u['wo_total']), meterTotal: n(u['meter_total']),
    })),
    model: (model as unknown as Record<string, unknown>[]).map((m) => ({
      code: String(m['code']), section: String(m['section']), job: n(m['job']),
    })),
  };
}

import type { Tx } from '../lib/db.js';
import { sql } from '../lib/db.js';
import { aturanBisnis, tidakBerhak, tidakDitemukan } from '../lib/errors.js';
import { buatToken } from '../lib/auth.js';
import { jalankanPerintah, type HasilPerintah } from './runCommand.js';

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
  jobId: number;
  basePoints: number;
  planHours: number;
  aktif: boolean;
}

export async function simpanJob(
  m: MasukanJob,
): Promise<HasilPerintah<{ jobId: number; lama: { basePoints: number; planHours: number } }>> {
  return jalankanPerintah({
    opId: m.opId, tenantId: m.tenantId, actorId: m.actorId, action: 'admin_job',
    jalankan: async ({ tx }) => {
      await pastikanAdmin(tx, m.actorId);
      if (m.basePoints <= 0) throw aturanBisnis('Base point harus lebih dari 0');
      if (m.planHours <= 0) throw aturanBisnis('Jam rencana harus lebih dari 0');

      const lama = (
        await tx<{ base_points: string; plan_hours: string; kode: string }[]>`
          SELECT base_points, plan_hours, job_code::text AS kode
            FROM jobs WHERE id = ${m.jobId} AND tenant_id = ${m.tenantId}
        `
      )[0];
      if (!lama) throw tidakDitemukan('Job', m.jobId);

      await tx`
        UPDATE jobs SET base_points = ${m.basePoints}, plan_hours = ${m.planHours},
                        is_active = ${m.aktif}
         WHERE id = ${m.jobId}
      `;

      /* WO yang SUDAH disetujui tidak ikut berubah — angkanya dibekukan
         `scoring_snapshots` saat approve. Yang berubah hanya WO yang dibuat
         SESUDAH ini. Itu yang membuat layar ini aman dipakai. */
      await catat(tx, m.tenantId, m.actorId, 'admin_job_ubah', 'job', String(m.jobId), {
        kode: lama.kode,
        base_points: { lama: Number(lama.base_points), baru: m.basePoints },
        plan_hours: { lama: Number(lama.plan_hours), baru: m.planHours },
        aktif: m.aktif,
      });

      return {
        jobId: m.jobId,
        lama: { basePoints: Number(lama.base_points), planHours: Number(lama.plan_hours) },
      };
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
  section: string[];
  job: {
    id: number; kode: string; nama: string; section: string;
    basePoints: number; planHours: number; aktif: boolean;
  }[];
}

export async function bekalAdmin(tenantId: number): Promise<BekalAdmin> {
  const [orang, tarif, faktor, setelan, section, job] = await Promise.all([
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
    sql<{ code: string }[]>`
      SELECT code::text FROM sections WHERE tenant_id = ${tenantId} ORDER BY code
    `,
    sql<Record<string, never>[]>`
      SELECT j.id, j.job_code::text AS kode, j.job_description AS nama,
             s.code::text AS section, j.base_points, j.plan_hours, j.is_active AS aktif
        FROM jobs j JOIN sections s ON s.id = j.section_id
       WHERE j.tenant_id = ${tenantId}
       ORDER BY s.code, j.job_code
    `,
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
    section: section.map((s) => s.code),
    job: (job as unknown as Record<string, unknown>[]).map((j) => ({
      id: n(j['id']), kode: String(j['kode']), nama: String(j['nama']),
      section: String(j['section']), basePoints: n(j['base_points']),
      planHours: n(j['plan_hours']), aktif: Boolean(j['aktif']),
    })),
  };
}

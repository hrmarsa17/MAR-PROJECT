import { sql } from '../lib/db.js';
import type { Identitas } from '../lib/auth.js';
import { sectionYangBoleh } from './kueri.js';
import { periodeSaatIni } from './periode.js';

/**
 * MONITORING — pencapaian & progres WO tiap MEKANIK, berikut tokennya.
 *
 * Diport dari `getMonitoringData()` (`MechanicService.js:149-249`) dan
 * `MechanicDashboard.html:366-419`. Kontrak lengkapnya di
 * docs/SPEK-LAYAR/03-MONITORING.md.
 *
 * Dua hal yang menentukan bentuk layar ini, dan keduanya keputusan Gabriel:
 *
 *   1. HANYA MEKANIK. Sumbernya memanggil `getMechanicsByRole(ROLES.MECHANIC)`
 *      — L1 dan L2 tidak pernah muncul di sini. Yang ditanyakan layar ini
 *      "siapa mengerjakan apa", dan approver bukan yang mengerjakan.
 *
 *   2. TOKEN DITAMPILKAN UTUH. Itu fungsi utamanya: mekanik yang lupa tokennya
 *      bertanya ke L1/L2, yang membukanya di sini lalu menyalinkannya. Lihat
 *      catatan panjang di `db/schema.sql` pada tabel `api_tokens`.
 *
 * Satu kueri untuk semua mekanik sekaligus, bukan satu kueri per orang. Di KMB
 * V2 layar ini pernah jadi salah satu yang terberat karena setiap kartu memicu
 * pencariannya sendiri ke sheet.
 */

export interface KartuMekanik {
  id: number;
  kode: string;
  nama: string;
  section: string | null;
  jabatan: string | null;
  akun_uji: boolean;
  perlu_diisi: number;
  menunggu_l1: number;
  menunggu_l2: number;
  approved: number;
  /** Token utuh, siap disalinkan ke mekanik yang lupa. Kosong = belum punya. */
  token: string | null;
}

export interface RingkasMonitoring {
  mekanik: number;
  perlu_diisi: number;
  menunggu_approval: number;
  approved: number;
  periodeLabel: string;
}

/**
 * Empat angka di kepala layar.
 *
 * `approved` DIBATASI periode gaji berjalan; tiga yang lain TIDAK
 * (`MechanicService.js:198-202`):
 *
 *   "Antrean (belum dikerjakan / menunggu L1 / menunggu L2) SENGAJA tidak
 *    dibatasi: WO Juli yang belum disetujui justru pekerjaan yang harus
 *    dikejar, dan menyaringnya membuat ia lenyap dari pandangan semua orang."
 *
 * ⚠️ Di KMB V2 label kartu keempat berbunyi "Approved (semua waktu)"
 * (`MechanicDashboard.html:375`) padahal angkanya periode berjalan — labelnya
 * yang salah, bukan angkanya. Di sini labelnya diperbaiki jadi menyebut
 * periodenya; angkanya tetap sama persis dengan sumber.
 */
export async function ringkasMonitoring(aku: Identitas): Promise<RingkasMonitoring> {
  const scope = await sectionYangBoleh(aku.mechanicId);
  const p = periodeSaatIni();

  const [wo, orang] = await Promise.all([
    sql<Record<string, string>[]>`
      SELECT
        count(*) FILTER (WHERE w.status = 'pending_mechanic_work')       AS perlu_diisi,
        count(*) FILTER (WHERE w.status IN ('pending_supervisor',
                                            'pending_superintendent'))   AS menunggu_approval,
        count(*) FILTER (WHERE w.status = 'approved'
                           AND w.approved_l2_at BETWEEN ${p.mulai} AND ${p.akhir})
                                                                         AS approved
      FROM work_orders w
      JOIN sections s ON s.id = w.section_id
     WHERE w.tenant_id = ${aku.tenantId}
       -- Batal & ditolak tidak pernah masuk hitungan pipeline.
       AND w.status NOT IN ('cancelled', 'rejected')
       AND (${scope}::text[] IS NULL OR s.code::text = ANY(${scope}::text[]))
    `,
    sql<{ n: string }[]>`
      SELECT count(*) AS n FROM mechanics m
       WHERE m.tenant_id = ${aku.tenantId}
         AND m.is_active
         AND m.role = 'mechanic'
         AND m.is_test_account = false
         AND (${scope}::text[] IS NULL
              OR NOT EXISTS (SELECT 1 FROM mechanic_sections ms WHERE ms.mechanic_id = m.id)
              OR EXISTS (SELECT 1 FROM mechanic_sections ms
                          WHERE ms.mechanic_id = m.id
                            AND ms.section::text = ANY(${scope}::text[])))
    `,
  ]);

  const r = wo[0]!;
  return {
    mekanik: Number(orang[0]!.n),
    perlu_diisi: Number(r['perlu_diisi']),
    menunggu_approval: Number(r['menunggu_approval']),
    approved: Number(r['approved']),
    periodeLabel: p.label,
  };
}

export async function kartuMekanik(aku: Identitas): Promise<KartuMekanik[]> {
  const scope = await sectionYangBoleh(aku.mechanicId);
  const p = periodeSaatIni();

  return sql<KartuMekanik[]>`
    SELECT
      m.id,
      m.mechanic_code::text AS kode,
      m.name               AS nama,
      sec.section          AS section,
      pr.label             AS jabatan,
      m.is_test_account    AS akun_uji,

      coalesce(h.perlu_diisi, 0)  AS perlu_diisi,
      coalesce(h.menunggu_l1, 0)  AS menunggu_l1,
      coalesce(h.menunggu_l2, 0)  AS menunggu_l2,
      coalesce(h.approved, 0)     AS approved,

      t.token              AS token

    FROM mechanics m
    LEFT JOIN pay_rates pr ON pr.id = m.pay_rate_id
    LEFT JOIN LATERAL (
      SELECT string_agg(ms.section::text, ', ' ORDER BY ms.section::text) AS section
        FROM mechanic_sections ms WHERE ms.mechanic_id = m.id
    ) sec ON true
    LEFT JOIN LATERAL (
      -- Dihitung dari keanggotaan tim, bukan dari siapa yang membuat WO:
      -- yang ditunggu mekanik adalah pekerjaan yang MELIBATKAN dia.
      SELECT
        count(*) FILTER (WHERE w.status = 'pending_mechanic_work')     AS perlu_diisi,
        count(*) FILTER (WHERE w.status = 'pending_supervisor')        AS menunggu_l1,
        count(*) FILTER (WHERE w.status = 'pending_superintendent')    AS menunggu_l2,
        -- Hanya yang disahkan di periode berjalan; antreannya tidak dibatasi.
        count(*) FILTER (WHERE w.status = 'approved'
                           AND w.approved_l2_at BETWEEN ${p.mulai} AND ${p.akhir})
                                                                       AS approved
      FROM work_order_team wt
      JOIN work_orders w ON w.id = wt.work_order_id
      JOIN sections   s  ON s.id = w.section_id
      WHERE wt.mechanic_id = m.id
        AND w.status NOT IN ('cancelled', 'rejected')
        AND (${scope}::text[] IS NULL OR s.code::text = ANY(${scope}::text[]))
    ) h ON true
    LEFT JOIN LATERAL (
      -- Token AKTIF paling baru. Ditampilkan utuh — lihat catatan di kepala
      -- berkas ini dan di db/schema.sql.
      SELECT at.token FROM api_tokens at
       WHERE at.mechanic_id = m.id AND at.is_active AND at.revoked_at IS NULL
         AND (at.expires_at IS NULL OR at.expires_at > now())
       ORDER BY at.created_at DESC LIMIT 1
    ) t ON true

    WHERE m.tenant_id = ${aku.tenantId}
      AND m.is_active
      -- HANYA MEKANIK. L1 & L2 tidak mengerjakan WO, jadi tak punya pipeline
      -- untuk dilihat di sini.
      AND m.role = 'mechanic'
      -- Akun uji disaring seperti layar lain. Di KMB V2 layar inilah yang dulu
      -- TIDAK menyaring, dengan alasan melingkar: di sinilah tokennya bisa
      -- disalin, dan token itu yang dipakai masuk sebagai akun uji. Lingkarannya
      -- diputus dari luar — token akun uji diambil lewat alat admin, bukan lewat
      -- layar ini.
      AND (m.is_test_account = false OR ${aku.mechanicId} = m.id)
      AND (${scope}::text[] IS NULL
           OR NOT EXISTS (SELECT 1 FROM mechanic_sections ms WHERE ms.mechanic_id = m.id)
           OR EXISTS (SELECT 1 FROM mechanic_sections ms
                       WHERE ms.mechanic_id = m.id
                         AND ms.section::text = ANY(${scope}::text[])))
    -- Yang punya WO perlu diisi naik ke atas: itu yang harus dikejar hari ini.
    -- Nama sebagai pemutus seri supaya urutannya tidak berpindah tiap muat ulang.
    ORDER BY coalesce(h.perlu_diisi, 0) DESC, m.name ASC
  `;
}

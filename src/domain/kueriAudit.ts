import { sql } from '../lib/db.js';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * RIWAYAT PERUBAHAN — membaca audit_logs supaya bisa dibaca MANUSIA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Kenapa layar ini ada, dan bentuknya ditentukan oleh alasan itu: Gabriel
 * mengubah jam rencana sebuah job, layarnya tergulir, dan ia lupa job mana yang
 * ia ubah dan dari berapa ke berapa. Angkanya SUDAH tercatat sejak awal — yang
 * belum ada cuma tempat untuk melihatnya.
 *
 * Maka pertanyaan yang harus dijawab halaman pertama tanpa disaring apa pun
 * adalah: "apa yang barusan saya ubah, pada apa, dari berapa ke berapa."
 *
 * ── TIGA BENTUK `details`, DAN SATU CARA MEMBACANYA ─────────────────────────
 * Tiap perintah menulis `details` dengan bentuknya sendiri. Ada tiga pola:
 *
 *   1. { medan: { lama, baru } }   admin_job_ubah, terapkan_*_surut
 *   2. { lama, baru, ...konteks }  admin_faktor_ubah, admin_tarif_ubah,
 *                                  admin_setelan_ubah, koreksi_hm, save_override
 *   3. { ...konteks }              yang baru dibuat / dihapus / disetujui
 *
 * Pola 2 tidak menyebutkan medan apa yang berubah — itu tersirat dari aksinya.
 * Karena itu `AKSI` di bawah menyimpan namanya, dan ia satu-satunya tempat di
 * sistem ini yang tahu cara membaca tiap bentuk.
 *
 * ── YANG TIDAK BERUBAH TIDAK DITAMPILKAN ────────────────────────────────────
 * `admin_job_ubah` menulis SEMUA medannya, termasuk yang nilainya sama
 * (`nama: {lama:"Washing", baru:"Washing"}`). Menampilkan semuanya mengubur
 * satu baris yang dicari orang di antara tiga baris yang tidak berubah — jadi
 * yang sama dibuang saat dibaca, bukan saat ditulis. Dengan begitu baris lama
 * yang sudah terlanjur tercatat pun ikut rapi.
 */

export type KategoriAudit = 'katalog' | 'orang' | 'wo' | 'lain';

interface Keterangan {
  label: string;
  kategori: KategoriAudit;
  /** Nama medan untuk pola 2 — `{lama, baru}` di akar tanpa nama medan. */
  medanAkar?: string;
  /** Menggeser rupiah yang SUDAH dibayar. Ditandai merah di layar. */
  uang?: boolean;
}

const AKSI: Record<string, Keterangan> = {
  // ── katalog ───────────────────────────────────────────────────────────────
  admin_job_baru: { label: 'Job baru', kategori: 'katalog' },
  admin_job_ubah: { label: 'Ubah job', kategori: 'katalog' },
  admin_job_hapus: { label: 'Hapus job', kategori: 'katalog' },
  admin_unit_baru: { label: 'Unit baru', kategori: 'katalog' },
  admin_unit_ubah: { label: 'Ubah unit', kategori: 'katalog' },
  admin_unit_hapus: { label: 'Hapus unit', kategori: 'katalog' },
  impor_katalog: { label: 'Impor katalog Excel', kategori: 'katalog' },
  admin_faktor_ubah: { label: 'Ubah faktor', kategori: 'katalog', medanAkar: 'Nilai faktor' },
  admin_tarif_ubah: { label: 'Ubah tarif', kategori: 'katalog', medanAkar: 'Rupiah per poin' },
  admin_setelan_ubah: { label: 'Ubah setelan', kategori: 'katalog', medanAkar: 'Nilai' },

  // ── menggeser uang yang sudah dibayar ─────────────────────────────────────
  terapkan_surut: { label: 'Terapkan base point ke semua WO', kategori: 'katalog', uang: true },
  terapkan_faktor_surut: { label: 'Terapkan faktor ke semua WO', kategori: 'katalog', uang: true },
  terapkan_tarif_surut: { label: 'Terapkan tarif ke semua WO', kategori: 'katalog', uang: true },

  // ── orang ─────────────────────────────────────────────────────────────────
  admin_orang_baru: { label: 'Orang baru', kategori: 'orang' },
  admin_orang_ubah: { label: 'Ubah orang', kategori: 'orang' },
  admin_token_terbit: { label: 'Terbitkan token', kategori: 'orang' },
  admin_token_ganti: { label: 'Ganti token', kategori: 'orang' },
  admin_token_cabut: { label: 'Cabut token', kategori: 'orang' },

  // ── work order ────────────────────────────────────────────────────────────
  create_wo: { label: 'Buat WO', kategori: 'wo' },
  kirim_kerja: { label: 'Kirim kerja', kategori: 'wo' },
  approve_l1: { label: 'Approve L1', kategori: 'wo' },
  approve_l2: { label: 'Approve L2', kategori: 'wo', uang: true },
  reject_wo: { label: 'Tolak WO', kategori: 'wo' },
  cancel_wo: { label: 'Batalkan WO', kategori: 'wo' },
  kembalikan_wo: { label: 'Kembalikan ke mekanik', kategori: 'wo' },
  save_override: { label: 'Override approver', kategori: 'wo' },
  minta_transfer: { label: 'Minta transfer', kategori: 'wo' },
  setujui_transfer: { label: 'Setujui transfer', kategori: 'wo' },
  tolak_transfer: { label: 'Tolak transfer', kategori: 'wo' },
  simpan_detail: { label: 'Simpan detail teknis', kategori: 'wo' },
  koreksi_hm: { label: 'Koreksi HM', kategori: 'wo', medanAkar: 'HM' },
  koreksi_km: { label: 'Koreksi KM', kategori: 'wo', medanAkar: 'KM' },
  ganti_panel_hm: { label: 'Ganti panel HM', kategori: 'wo', medanAkar: 'HM panel baru' },
  ganti_panel_km: { label: 'Ganti panel KM', kategori: 'wo', medanAkar: 'KM panel baru' },
};

/** Nama medan yang enak dibaca. Yang tak ada di sini ditampilkan apa adanya. */
const MEDAN: Record<string, string> = {
  plan_hours: 'Jam rencana',
  base_points: 'Base point',
  nama: 'Nama',
  aktif: 'Aktif',
  nilai: 'Nilai',
  idr_per_point: 'Rupiah per poin',
  unit_factor: 'Faktor unit',
  faktor: 'Faktor unit',
  section: 'Section',
  global: 'Global',
  rupiah: 'Total rupiah',
  peran: 'Peran',
  grade: 'Grade',
  odometer: 'Meter',
  brand: 'Merek',
  model_type: 'Tipe',
  mtbf_eligible: 'Ikut MTBF',
  may_admin: 'Hak admin',
  email: 'Email',
  pay_rate_id: 'Tarif',
  unit_model: 'Model unit',
  komponen: 'Komponen',
  sub_komponen: 'Sub-komponen',
  // Kunci override approver (`work_order_overrides.kind`).
  team: 'Tim',
  target_hours: 'Jam target',
  work_condition: 'Kondisi kerja',
  judgment: 'Catatan approver',
  time: 'Jam kerja',
  unit: 'Unit',
};

export interface PerubahanAudit {
  medan: string;
  lama: string;
  baru: string;
}

export interface BarisAudit {
  id: number;
  waktu: string;
  aksi: string;
  label: string;
  kategori: KategoriAudit;
  uang: boolean;
  entitas: string;
  /** "JOB-1210 — Washing". Kalau barisnya sudah dihapus, dipakai isi details. */
  judul: string;
  aktor: string | null;
  perubahan: PerubahanAudit[];
  /** Sisa isi `details` yang bukan perubahan — ditampilkan kecil di bawahnya. */
  konteks: { kunci: string; nilai: string }[];
}

/**
 * Nol di belakang koma dibuang.
 *
 * Nilai LAMA datang dari Postgres sebagai `numeric` — "1.000" — sementara nilai
 * BARU datang dari JSON sebagai angka JavaScript — 1.4. Tanpa ini, perubahan
 * faktor unit terbaca "1.000 → 1.4", dan yang membacanya berhenti sejenak untuk
 * memastikan ia tidak sedang melihat dua satuan yang berbeda.
 */
function rapikanAngka(s: string): string {
  if (!/^-?\d+\.\d+$/.test(s)) return s;
  return s.replace(/\.?0+$/, '') || '0';
}

function teks(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'ya' : 'tidak';
  if (Array.isArray(v)) return v.length === 0 ? '(kosong)' : v.map(teks).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return rapikanAngka(String(v));
}

function namaMedan(k: string): string {
  return MEDAN[k] ?? k.replace(/_/g, ' ');
}

/** Sepasang `{lama, baru}`? Objek dengan tepat kunci itu, tak lebih. */
function pasangan(v: unknown): { lama: unknown; baru: unknown } | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const k = Object.keys(v as object);
  if (!k.includes('lama') || !k.includes('baru')) return null;
  if (k.length > 2) return null;
  const o = v as { lama: unknown; baru: unknown };
  return { lama: o.lama, baru: o.baru };
}

/**
 * Memisahkan `details` jadi PERUBAHAN dan KONTEKS.
 *
 * Yang nilainya tidak berubah dibuang di sini — lihat catatan di kepala berkas.
 */
export function bacaDetails(
  details: unknown, medanAkar?: string,
): { perubahan: PerubahanAudit[]; konteks: { kunci: string; nilai: string }[] } {
  const perubahan: PerubahanAudit[] = [];
  const konteks: { kunci: string; nilai: string }[] = [];
  if (details === null || typeof details !== 'object') return { perubahan, konteks };

  const d = details as Record<string, unknown>;

  // Pola 2: {lama, baru} di AKAR. Nama medannya datang dari aksinya — kecuali
  // `save_override`, yang menyebut medannya sendiri di `kind`.
  if ('lama' in d && 'baru' in d) {
    const lama = teks(d['lama']);
    const baru = teks(d['baru']);
    if (lama !== baru) {
      const dariKind = typeof d['kind'] === 'string' ? namaMedan(d['kind']) : null;
      perubahan.push({ medan: dariKind ?? medanAkar ?? 'Nilai', lama, baru });
    }
  } else if ('lama' in d) {
    /* Baris LAMA dari sebelum 16 Sep 2026: `admin_orang_ubah` dan
       `admin_unit_ubah` menyimpan potret seluruh baris lama dan tidak pernah
       menyimpan nilai barunya. Perubahannya karena itu tidak bisa dihitung —
       tapi mendiamkannya berarti layar menampilkan entri yang terlihat seperti
       "tidak ada yang berubah", padahal ada. Lebih baik dikatakan apa adanya. */
    konteks.push({
      kunci: 'Nilai lama',
      nilai: 'tersimpan sebagai potret utuh — perubahannya belum dirinci '
        + '(entri sebelum 16 Sep 2026)',
    });
  }

  for (const [k, v] of Object.entries(d)) {
    if (k === 'lama' || k === 'baru') continue;
    // Larik panjang seperti `wo` di terapkan_surut tidak dibentangkan di sini —
    // ia bisa berisi ribuan baris, dan ringkasannya sudah ada di medan lain.
    if (Array.isArray(v)) {
      konteks.push({ kunci: namaMedan(k), nilai: `${v.length} baris` });
      continue;
    }
    const p = pasangan(v);
    if (p) {
      const lama = teks(p.lama);
      const baru = teks(p.baru);
      if (lama !== baru) perubahan.push({ medan: namaMedan(k), lama, baru });
      continue;
    }
    if (v !== null && typeof v === 'object') {
      konteks.push({ kunci: namaMedan(k), nilai: teks(v) });
      continue;
    }
    konteks.push({ kunci: namaMedan(k), nilai: teks(v) });
  }

  return { perubahan, konteks };
}

export interface SaringAudit {
  kategori?: KategoriAudit | 'semua';
  /** Hanya perubahan yang menggeser rupiah yang sudah dibayar. */
  hanyaUang?: boolean;
  aktorId?: number | null;
  cari?: string;
  /** Kursor: ambil yang id-nya LEBIH KECIL dari ini. Stabil walau ada baris baru. */
  sebelum?: number | null;
  limit?: number;
}

export interface HasilAudit {
  baris: BarisAudit[];
  /** id terkecil di halaman ini — dipakai tombol "lebih lama". */
  kursor: number | null;
  adaLagi: boolean;
  /** Daftar orang yang pernah tercatat, untuk saringan. */
  aktor: { id: number; nama: string }[];
}

export async function riwayatAudit(
  tenantId: number, s: SaringAudit = {},
): Promise<HasilAudit> {
  const limit = Math.min(Math.max(s.limit ?? 50, 1), 200);
  const kategori = s.kategori ?? 'semua';

  /* Aksi yang termasuk kategori disusun di TypeScript, bukan ditulis ulang
     sebagai daftar di SQL — `AKSI` sudah jadi satu-satunya tempat yang tahu
     aksi mana milik kategori mana, dan daftar kedua pasti akan tertinggal. */
  const aksiKategori = kategori === 'semua'
    ? null
    : Object.entries(AKSI).filter(([, v]) => v.kategori === kategori).map(([k]) => k);
  const aksiUang = s.hanyaUang
    ? Object.entries(AKSI).filter(([, v]) => v.uang).map(([k]) => k)
    : null;

  const cari = (s.cari ?? '').trim();

  const rows = await sql<{
    id: number; occurred_at: Date; action: string; entity_type: string;
    entity_id: string | null; details: unknown; aktor: string | null; judul: string | null;
  }[]>`
    /* Disaring dan dipotong DULU, judulnya dicari belakangan.
       Dua alasan, dan yang pertama adalah galat sungguhan:

       1. entity_id bertipe text. Untuk setelan isinya nama kunci
          ("shift1_mulai"), bukan angka. Penjaga regex yang ditaruh di KONDISI
          JOIN tidak menjamin urutan evaluasi — Postgres tetap boleh menjalankan
          cast-nya lebih dulu, dan seluruh kueri mati dengan
          "invalid input syntax for type integer". CASE di dalam subkueri
          MATERIALIZED memang dijamin dihitung lebih dulu.

       2. Tanpa ini, judul dicari untuk SELURUH baris yang lolos saringan, lalu
          hanya sepotong kecil yang dipakai.

       (Dan sekali lagi: JANGAN pakai backtick di komentar SQL — ia menutup
       template literal JavaScript-nya, dan galatnya menunjuk ke baris lain.) */
    WITH dasar AS MATERIALIZED (
      SELECT a.id, a.occurred_at, a.action, a.entity_type, a.entity_id, a.details,
             a.actor_id,
             CASE WHEN a.entity_id ~ '^[0-9]+$' THEN a.entity_id::bigint END AS eid
        FROM audit_logs a
        LEFT JOIN mechanics m ON m.id = a.actor_id
       WHERE a.tenant_id = ${tenantId}
         AND (${aksiKategori}::text[] IS NULL OR a.action = ANY(${aksiKategori}::text[]))
         AND (${aksiUang}::text[] IS NULL OR a.action = ANY(${aksiUang}::text[]))
         AND (${s.aktorId ?? null}::int IS NULL OR a.actor_id = ${s.aktorId ?? null}::int)
         AND (${s.sebelum ?? null}::bigint IS NULL OR a.id < ${s.sebelum ?? null}::bigint)
         AND (${cari || null}::text IS NULL OR (
               a.action ILIKE '%' || ${cari} || '%'
            OR coalesce(a.entity_id, '') ILIKE '%' || ${cari} || '%'
            OR a.details::text ILIKE '%' || ${cari} || '%'
            OR coalesce(m.name, '') ILIKE '%' || ${cari} || '%'
         ))
       ORDER BY a.id DESC
       LIMIT ${limit + 1}
    )
    SELECT d.id, d.occurred_at, d.action, d.entity_type, d.entity_id, d.details,
           m.name AS aktor,
           /* Judul diambil dari barisnya sendiri kalau masih ada. Kalau sudah
              dihapus hasilnya NULL, dan layar jatuh ke isi details -- justru
              baris yang dihapus itulah yang paling sering dicari orang. */
           CASE d.entity_type
             WHEN 'job'       THEN j.job_code::text || ' — ' || j.job_description
             WHEN 'unit'      THEN u.unit_name || ' (' || u.unit_code::text || ')'
             WHEN 'mechanic'  THEN mm.name || ' (' || mm.mechanic_code::text || ')'
             WHEN 'factor'    THEN f.factor_type::text || ' · ' || f.factor_key::text
             WHEN 'pay_rate'  THEN pr.label
             WHEN 'setting'   THEN d.entity_id
             WHEN 'work_order' THEN w.wo_number
             ELSE d.entity_id
           END AS judul
      FROM dasar d
      LEFT JOIN mechanics m   ON m.id = d.actor_id
      LEFT JOIN jobs j        ON d.entity_type = 'job'       AND j.id  = d.eid
      LEFT JOIN units u       ON d.entity_type = 'unit'      AND u.id  = d.eid
      LEFT JOIN mechanics mm  ON d.entity_type = 'mechanic'  AND mm.id = d.eid
      LEFT JOIN factors f     ON d.entity_type = 'factor'    AND f.id  = d.eid
      LEFT JOIN pay_rates pr  ON d.entity_type = 'pay_rate'  AND pr.id = d.eid
      LEFT JOIN work_orders w ON d.entity_type = 'work_order' AND w.id = d.eid
     ORDER BY d.id DESC
  `;

  const adaLagi = rows.length > limit;
  const dipakai = adaLagi ? rows.slice(0, limit) : rows;

  const aktor = await sql<{ id: number; nama: string }[]>`
    SELECT DISTINCT m.id, m.name AS nama
      FROM audit_logs a JOIN mechanics m ON m.id = a.actor_id
     WHERE a.tenant_id = ${tenantId}
     ORDER BY m.name
  `;

  return {
    baris: dipakai.map((r) => {
      const k = AKSI[r.action] ?? { label: r.action, kategori: 'lain' as KategoriAudit };
      const { perubahan, konteks } = bacaDetails(r.details, k.medanAkar);
      const d = (r.details ?? {}) as Record<string, unknown>;
      return {
        id: Number(r.id),
        waktu: r.occurred_at.toISOString(),
        aksi: r.action,
        label: k.label,
        kategori: k.kategori,
        uang: k.uang === true,
        entitas: r.entity_type,
        judul: r.judul
          // Baris yang sudah dihapus tidak punya judul lagi. `details` biasanya
          // masih menyimpan kode dan namanya — itu yang dipakai.
          ?? [d['kode'], d['nama'], d['wo_number']].filter(Boolean).map(String).join(' — ')
          ?? '',
        aktor: r.aktor,
        perubahan,
        konteks,
      };
    }),
    kursor: dipakai.length > 0 ? Number(dipakai[dipakai.length - 1]!.id) : null,
    adaLagi,
    aktor,
  };
}

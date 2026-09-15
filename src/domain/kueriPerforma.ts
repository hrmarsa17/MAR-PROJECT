import { sql } from '../lib/db.js';
import type { Identitas } from '../lib/auth.js';
import { sectionYangBoleh } from './kueri.js';
import { periodeSaatIni, periodeTerakhir, type Periode } from './periode.js';
import { shiftBerjalan, type JendelaShift } from './shift.js';
import { nilaiEfektif, muatFaktor } from './nilaiEfektif.js';
import { hitungSkor, bulatkan } from './scoring.js';

/**
 * BACAAN UNTUK DASHBOARD PERFORMA.
 *
 * Kontrak lengkapnya di docs/SPEK-LAYAR/01-PERFORMA.md, diambil dari
 * Main.html + DashboardService.js.
 *
 * Dua patokan waktu yang TIDAK BOLEH tertukar, dan inilah sumber kesalahan
 * paling mahal di layar ini:
 *
 *   papan PERIODE   → mechanic_points.awarded_at   (kapan L2 mengesahkan)
 *   papan HARIAN    → work_orders.submitted_at     (kapan mekanik mengirim)
 *
 * Alasannya di DashboardService.js:457-468: untuk papan harian, awarded_at
 * merusak seluruh maknanya — hari tunggakan dibereskan, papan penuh orang yang
 * bekerja tiga minggu lalu; hari tanpa approval, papan KOSONG padahal semua
 * orang bekerja. Papan berbasis approval menampilkan kegiatan APPROVER, bukan
 * kegiatan mekanik.
 */

export interface Statistik {
  totalWo: number;
  approved: number;
  pending: number;
  /**
   * DIPUTUSKAN GABRIEL 15 Sep 2026: TETAP 1:1 dengan KMB V2. Jangan diubah.
   *
   * Yang berikut ini dibiarkan tertulis lengkap bukan karena masih terbuka,
   * melainkan supaya orang berikutnya yang menemukan selisihnya tahu bahwa ia
   * sudah dilihat, ditimbang, dan sengaja dipertahankan — bukan terlewat.
   *
   * Angka ini menjumlah `work_orders.final_points`: poin PER WO, dihitung sekali.
   * Papan peringkat di layar yang sama menjumlah `mechanic_points.points`: poin
   * PER ORANG. Karena model poin penuh — setiap anggota tim menerima final_points
   * UTUH — kedua angka itu berbeda begitu ada WO berisi lebih dari satu orang.
   *
   * Di data contoh sekarang: 3 WO approved = 52,8 poin, tapi 5 baris poin = 88.
   * Kartunya berbunyi "52,8 · Terdistribusi", sementara papan di bawahnya
   * berjumlah 88. Subtitelnya yang paling menyesatkan: "terdistribusi" justru
   * menggambarkan 88, bukan 52,8.
   *
   * Ditiru apa adanya dari KMB V2 (`DashboardService.js:220` menjumlah
   * wo.final_points; `:754` menjumlah record.points). Gabriel memilih
   * mempertahankannya: orang lapangan sudah membaca layar ini setiap hari, dan
   * mengubah arti sebuah angka uang menuntut mereka belajar ulang sesuatu yang
   * sudah mereka pahami — harga yang lebih besar daripada selisihnya sendiri.
   */
  totalPoin: number;
  mekanikAktif: number;
  jabatan: { jabatan: string; jumlah: number }[];
  bulanIni: number;
  rataJam: number;
  periodeLabel: string;
}

export interface BarisPapan {
  mechanicId: number;
  nama: string;
  grade: string;
  totalPoin: number;
  totalRupiah: number;
  jumlahWo: number;
}

export interface PapanHarian {
  label: string;
  shift: string;
  field: { nama: string; baris: BarisPapan[]; jumlahWo: number; taksir: boolean };
  tyreman: { nama: string; baris: BarisPapan[]; jumlahWo: number; taksir: boolean };
}

export interface BarisWoTerbaru {
  id: number;
  woNumber: string;
  status: string;
  komponen: string;
  mekanik: string;
  judgment: string;
  judgmentLevel: 'L1' | 'L2' | '';
  dibuatOleh: string;
  createdAt: string;
}

export interface TrenPoin {
  labels: string[];
  labelPenuh: string[];
  data: number[];
  jumlahPeriode: number;
}

/* ── kartu statistik ────────────────────────────────────────────────────────
 * Satu kueri, bukan empat. Angka-angka ini dibaca berdampingan di satu baris
 * kartu; kalau diambil lewat empat perjalanan terpisah, dua di antaranya bisa
 * melihat keadaan basis data yang berbeda dan barisnya berhenti berjumlah.
 */
export async function statistikRingkas(aku: Identitas): Promise<Statistik> {
  const scope = await sectionYangBoleh(aku.mechanicId);
  const p = periodeSaatIni();
  const akuMekanik = aku.peran === 'mechanic';

  const [wo, tenaga] = await Promise.all([
    sql<{
      total_wo: string; approved: string; pending: string;
      total_poin: string; bulan_ini: string; rata_jam: string | null;
    }[]>`
      SELECT
        count(*)                                                       AS total_wo,
        count(*) FILTER (WHERE w.status = 'approved'
                           AND w.approved_l2_at BETWEEN ${p.mulai} AND ${p.akhir})
                                                                       AS approved,
        -- SENGAJA tidak dibatasi periode. Tunggakan bulan lalu justru yang
        -- paling perlu terlihat; menyembunyikannya membuat ia lenyap dari
        -- pandangan semua orang (DashboardService.js:193-195).
        count(*) FILTER (WHERE w.status IN ('pending_supervisor',
                                            'pending_superintendent',
                                            'pending_mechanic_work'))  AS pending,
        coalesce(sum(w.final_points) FILTER (WHERE w.status = 'approved'
                           AND w.approved_l2_at BETWEEN ${p.mulai} AND ${p.akhir}), 0)
                                                                       AS total_poin,
        count(*) FILTER (WHERE w.created_at >= ${p.mulai})             AS bulan_ini,
        avg(w.actual_hours) FILTER (WHERE w.status = 'approved'
                           AND w.approved_l2_at BETWEEN ${p.mulai} AND ${p.akhir}
                           AND w.actual_hours > 0)                     AS rata_jam
      FROM work_orders w
      JOIN sections s ON s.id = w.section_id
     WHERE w.tenant_id = ${aku.tenantId}
       AND (${scope}::text[] IS NULL OR s.code::text = ANY(${scope}::text[]))
       -- Mekanik melihat pekerjaannya sendiri; approver melihat scope-nya.
       AND (${!akuMekanik}
            OR EXISTS (SELECT 1 FROM work_order_team t
                        WHERE t.work_order_id = w.id
                          AND t.mechanic_id = ${aku.mechanicId}))
    `,
    // Mekanik tidak melihat jumlah tenaga kerja (activeMechanics: 0 di V2).
    akuMekanik ? Promise.resolve([]) : tenagaKerjaAktif(aku, scope),
  ]);

  const r = wo[0]!;
  const jabatan = tenaga as { jabatan: string; jumlah: number }[];

  return {
    totalWo: Number(r.total_wo),
    approved: Number(r.approved),
    pending: Number(r.pending),
    totalPoin: bulatkan(Number(r.total_poin), 2),
    mekanikAktif: jabatan.reduce((a, b) => a + b.jumlah, 0),
    jabatan,
    bulanIni: Number(r.bulan_ini),
    rataJam: r.rata_jam == null ? 0 : bulatkan(Number(r.rata_jam), 1),
    periodeLabel: p.label,
  };
}

/**
 * Tenaga kerja aktif, dipecah per JABATAN.
 *
 * Satu kueri menghasilkan rinciannya, dan angka besarnya dijumlah DARI rincian
 * itu — bukan dihitung terpisah. Alasannya di DashboardService.js:245-251:
 * kalau dihitung dua kali, suatu hari rinciannya tidak akan berjumlah sama
 * dengan angka di atasnya dan tak ada yang bisa menjelaskan kenapa.
 *
 * `grade`, BUKAN `position`. `position` adalah kunci ke tarif dan tak boleh
 * bocor ke layar. Jabatan kosong tetap dihitung dengan nama yang jujur —
 * membuangnya diam-diam membuat rincian tak pernah berjumlah sama.
 */
async function tenagaKerjaAktif(
  aku: Identitas,
  scope: string[] | null,
): Promise<{ jabatan: string; jumlah: number }[]> {
  const rows = await sql<{ jabatan: string; jumlah: string }[]>`
    SELECT coalesce(nullif(btrim(m.grade), ''), '(tanpa jabatan)') AS jabatan,
           count(*) AS jumlah
      FROM mechanics m
     WHERE m.tenant_id = ${aku.tenantId}
       AND m.is_active
       AND m.role = 'mechanic'
       AND m.is_test_account = false
       AND (${scope}::text[] IS NULL
            OR NOT EXISTS (SELECT 1 FROM mechanic_sections ms WHERE ms.mechanic_id = m.id)
            OR EXISTS (SELECT 1 FROM mechanic_sections ms
                        WHERE ms.mechanic_id = m.id
                          AND ms.section::text = ANY(${scope}::text[])))
     GROUP BY 1
     -- Terbanyak di atas, nama sebagai pemutus seri: supaya urutannya tidak
     -- berpindah-pindah tiap muat ulang saat dua jabatan sama banyaknya.
     ORDER BY count(*) DESC, 1 ASC
  `;
  return rows.map((r) => ({ jabatan: r.jabatan, jumlah: Number(r.jumlah) }));
}

/* ── tabel Work Order Terbaru ───────────────────────────────────────────────
 * Jendelanya 36 JAM: hari ini 06:00 sampai BESOK 18:00
 * (DashboardService.js:303-304). Bukan salah ketik — efeknya WO yang dibuat
 * shift malam tetap terlihat pagi berikutnya. Dipertahankan apa adanya.
 */
export async function woTerbaru(aku: Identitas, batas = 50): Promise<BarisWoTerbaru[]> {
  const scope = await sectionYangBoleh(aku.mechanicId);
  const now = new Date();
  const mulai = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 0, 0, 0);
  const akhir = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 18, 0, 0, 0);

  const rows = await sql<{
    id: number; wo_number: string; status: string; komponen: string | null;
    mekanik: string | null; judgment: string | null; judgment_level: string | null;
    dibuat_oleh: string; created_at: Date;
  }[]>`
    SELECT w.id, w.wo_number, w.status::text AS status,
           CASE
             WHEN w.is_manual THEN 'Others — ' || coalesce(w.manual_description, 'Custom Job')
             WHEN j.id IS NOT NULL
               THEN j.job_description || ' — ' || coalesce(c.name::text, '-')
                    || ' / ' || coalesce(sc.name::text, '-')
             ELSE coalesce(u.unit_name, 'N/A')
           END                                          AS komponen,
           tim.nama                                     AS mekanik,
           ap.judgment,
           ap.stage::text                               AS judgment_level,
           pembuat.name                                 AS dibuat_oleh,
           w.created_at
      FROM work_orders w
      JOIN sections  s       ON s.id = w.section_id
      JOIN mechanics pembuat ON pembuat.id = w.created_by
      LEFT JOIN jobs  j ON j.id = w.job_id
      LEFT JOIN units u ON u.id = w.unit_id
      LEFT JOIN job_sub_components sc ON sc.id = j.sub_component_id
      LEFT JOIN job_components     c  ON c.id  = sc.component_id
      LEFT JOIN LATERAL (
        SELECT string_agg(m.name, ', ' ORDER BY m.name) AS nama
          FROM work_order_team t JOIN mechanics m ON m.id = t.mechanic_id
         WHERE t.work_order_id = w.id
      ) tim ON true
      -- Judgment BERJENJANG: L2 mewarisi dan boleh menimpa L1. Satu aturan,
      -- dipakai bersama layar Approval — jangan disalin ulang di sana.
      LEFT JOIN LATERAL (
        SELECT a.judgment, a.stage
          FROM approvals a
         WHERE a.work_order_id = w.id
           AND a.judgment IS NOT NULL AND btrim(a.judgment) <> ''
         ORDER BY CASE a.stage WHEN 'superintendent' THEN 0 ELSE 1 END,
                  a.decided_at DESC
         LIMIT 1
      ) ap ON true
     WHERE w.tenant_id = ${aku.tenantId}
       AND w.created_at >= ${mulai} AND w.created_at <= ${akhir}
       AND (${scope}::text[] IS NULL OR s.code::text = ANY(${scope}::text[]))
     ORDER BY w.created_at DESC
     LIMIT ${batas}
  `;

  return rows.map((r) => ({
    id: Number(r.id),
    woNumber: r.wo_number,
    status: r.status,
    komponen: r.komponen ?? 'N/A',
    mekanik: r.mekanik ?? 'N/A',
    judgment: r.judgment ?? '',
    judgmentLevel:
      r.judgment_level === 'superintendent' ? 'L2'
      : r.judgment_level === 'supervisor' ? 'L1'
      : '',
    dibuatOleh: r.dibuat_oleh,
    createdAt: r.created_at.toISOString(),
  }));
}

/* ── papan peringkat PERIODE ────────────────────────────────────────────────
 * `idr_value` DIBACA, tidak dihitung ulang. Ia kolom turunan yang membekukan
 * tarif saat poin terbit (db/schema.sql:495-504). Di KMB V2 dashboard memakai
 * nilai tersimpan sementara payroll menghitung ulang dengan tarif SEKARANG,
 * jadi dua layar tak pernah cocok begitu tarif pernah berubah.
 */
export async function papanPeriode(
  aku: Identitas,
  batas = 100,
  periode?: Periode,
): Promise<BarisPapan[]> {
  const scope = await sectionYangBoleh(aku.mechanicId);
  const p = periode ?? periodeSaatIni();

  const rows = await sql<{
    mechanic_id: number; nama: string; grade: string;
    total_poin: string; total_rupiah: string; jumlah_wo: string;
  }[]>`
    SELECT m.id                          AS mechanic_id,
           m.name                        AS nama,
           coalesce(m.grade, '')         AS grade,
           sum(mp.points)                AS total_poin,
           sum(mp.idr_value)             AS total_rupiah,
           count(*)                      AS jumlah_wo
      FROM mechanic_points mp
      JOIN mechanics m ON m.id = mp.mechanic_id
      JOIN sections  s ON s.id = mp.section_id
     WHERE mp.points > 0
       AND mp.awarded_at BETWEEN ${p.mulai} AND ${p.akhir}
       AND m.tenant_id = ${aku.tenantId}
       -- Papan peringkat adalah pemacu. Akun uji yang menumpuk poin dari
       -- percobaan akan mendudukinya tanpa pernah mengangkat kunci — dan sejak
       -- saat itu papan ini berhenti memacu siapa pun.
       AND m.is_test_account = false
       AND (${scope}::text[] IS NULL OR s.code::text = ANY(${scope}::text[]))
     GROUP BY m.id, m.name, m.grade
     ORDER BY sum(mp.points) DESC, m.name ASC
     LIMIT ${batas}
  `;

  return rows.map(barisPapan);
}

function barisPapan(r: {
  mechanic_id: number; nama: string; grade: string;
  total_poin: string; total_rupiah: string; jumlah_wo: string;
}): BarisPapan {
  return {
    mechanicId: Number(r.mechanic_id),
    nama: r.nama,
    grade: r.grade,
    totalPoin: bulatkan(Number(r.total_poin), 2),
    totalRupiah: Math.round(Number(r.total_rupiah)),
    jumlahWo: Number(r.jumlah_wo),
  };
}

/* ── papan HARIAN, dipisah per section ──────────────────────────────────────
 * Section diambil dari WO-nya, BUKAN dari orangnya: yang ditanyakan papan ini
 * adalah "pekerjaan apa yang selesai hari ini", jadi tyreman yang membantu WO
 * field muncul di papan field untuk WO itu (DashboardService.js:592-597).
 */
export async function papanHarian(
  aku: Identitas,
  batas = 10,
  acuan?: Date,
): Promise<PapanHarian> {
  const scope = await sectionYangBoleh(aku.mechanicId);
  const jendela: JendelaShift = shiftBerjalan(acuan);

  // WO yang DIKIRIM di dalam jendela ini. Biasanya belasan, bukan ratusan.
  const woShift = await sql<{
    id: number; section: string; sudah_lengkap: boolean;
  }[]>`
    SELECT w.id, s.code::text AS section,
           -- Lengkap = SETIAP anggota tim sudah punya baris poin. Kalau ada
           -- satu pun yang belum, seluruh WO ini harus ditaksir.
           NOT EXISTS (
             SELECT 1 FROM work_order_team t
              WHERE t.work_order_id = w.id
                AND NOT EXISTS (SELECT 1 FROM mechanic_points mp
                                 WHERE mp.work_order_id = w.id
                                   AND mp.mechanic_id = t.mechanic_id)
           ) AS sudah_lengkap
      FROM work_orders w
      JOIN sections s ON s.id = w.section_id
     WHERE w.tenant_id = ${aku.tenantId}
       AND w.submitted_at BETWEEN ${jendela.mulai} AND ${jendela.akhir}
       AND w.status NOT IN ('cancelled', 'rejected')
       AND EXISTS (SELECT 1 FROM work_order_team t WHERE t.work_order_id = w.id)
       AND (${scope}::text[] IS NULL OR s.code::text = ANY(${scope}::text[]))
  `;

  const ember = new Map<string, {
    total: Map<number, BarisPapan>; jumlahWo: number; taksir: boolean;
  }>();
  const ambil = (sec: string) => {
    let e = ember.get(sec);
    if (!e) { e = { total: new Map(), jumlahWo: 0, taksir: false }; ember.set(sec, e); }
    return e;
  };

  if (woShift.length > 0) {
    // Satu transaksi baca untuk seluruh papan: nilaiEfektif butuh Tx, dan
    // membukanya sekali jauh lebih murah daripada sekali per WO.
    await sql.begin(async (tx) => {
      const faktor = await muatFaktor(tx, aku.tenantId);

      for (const w of woShift) {
        const e = ambil(w.section);
        e.jumlahWo++;

        if (w.sudah_lengkap) {
          const poin = await tx<{
            mechanic_id: number; nama: string; grade: string;
            points: string; idr_value: string;
          }[]>`
            SELECT mp.mechanic_id, m.name AS nama, coalesce(m.grade,'') AS grade,
                   mp.points, mp.idr_value
              FROM mechanic_points mp
              JOIN mechanics m ON m.id = mp.mechanic_id
             WHERE mp.work_order_id = ${w.id}
               AND mp.points > 0
               AND m.is_test_account = false
          `;
          for (const r of poin) {
            tambah(e.total, Number(r.mechanic_id), r.nama, r.grade,
                   Number(r.points), Number(r.idr_value));
          }
          continue;
        }

        /* TAKSIRAN.
         *
         * Poin baru tertulis saat approval. Untuk WO yang dikirim di shift ini
         * tapi belum disahkan, poinnya dihitung DI SINI lewat jalur skoring yang
         * SAMA dengan approval sungguhan — bukan rumus kedua.
         *
         * Ia bisa berubah: safety incident, status MTBF, dan override baru
         * ditentukan approver. Untuk papan harian itu pertukaran yang benar —
         * perkiraan tentang hari yang BENAR jauh lebih berguna daripada angka
         * pasti tentang hari yang SALAH — asal kartunya menyebutkan bahwa ia
         * perkiraan, dan itu yang dilakukan penanda `taksir`.
         */
        e.taksir = true;
        try {
          const ne = await nilaiEfektif(tx, Number(w.id));
          const skor = hitungSkor(ne, faktor);
          if (skor.finalPoints <= 0) continue;

          const orang = await tx<{ id: number; nama: string; grade: string }[]>`
            SELECT m.id, m.name AS nama, coalesce(m.grade,'') AS grade
              FROM mechanics m
             WHERE m.id = ANY(${ne.team.map((t) => t.mechanicId)}::int[])
               AND m.is_test_account = false
          `;
          const petaOrang = new Map(orang.map((o) => [Number(o.id), o]));
          for (const anggota of ne.team) {
            const o = petaOrang.get(anggota.mechanicId);
            if (!o) continue;   // akun uji, sudah disaring di atas
            // POIN PENUH untuk setiap anggota — tidak ada porsi. Di KMB V2
            // rumusnya masih mengalikan `percentage/100`, tapi nilainya selalu
            // 100; kolomnya sengaja tidak dibawa ke sini.
            tambah(e.total, anggota.mechanicId, o.nama, o.grade,
                   skor.finalPoints,
                   Math.round(skor.finalPoints * anggota.idrPerPoint));
          }
        } catch {
          /* Satu WO yang tak bisa ditaksir TIDAK boleh mengosongkan papan.
             Ia sudah terhitung di jumlahWo dan menyalakan `taksir`, jadi
             kartunya tetap jujur menyebut dirinya belum final. */
        }
      }
    });
  }

  const susun = (t: Map<number, BarisPapan>): BarisPapan[] =>
    [...t.values()]
      .map((b) => ({ ...b, totalPoin: bulatkan(b.totalPoin, 2) }))
      .sort((a, b) => b.totalPoin - a.totalPoin || a.nama.localeCompare(b.nama))
      .slice(0, batas);

  const tyre = ember.get('tyreman') ?? { total: new Map(), jumlahWo: 0, taksir: false };

  /* Section SELAIN tyreman dilipat ke papan Field, dan NAMANYA IKUT BERUBAH
     jadi "Field & workshop" — supaya pekerjaannya tidak menghilang diam-diam
     dari kedua papan, dan judulnya tidak berbohong tentang isinya. */
  const lainNama: string[] = [];
  const fieldTotal = new Map<number, BarisPapan>();
  let fieldWo = 0;
  let fieldTaksir = false;
  for (const [sec, e] of ember) {
    if (sec === 'tyreman') continue;
    if (sec !== 'field') lainNama.push(sec);
    fieldWo += e.jumlahWo;
    if (e.taksir) fieldTaksir = true;
    for (const [id, b] of e.total) {
      tambah(fieldTotal, id, b.nama, b.grade, b.totalPoin, b.totalRupiah);
    }
  }

  return {
    label: jendela.label,
    shift: jendela.nama,
    field: {
      nama: lainNama.length ? `Field & ${lainNama.join(' & ')}` : 'Field',
      baris: susun(fieldTotal), jumlahWo: fieldWo, taksir: fieldTaksir,
    },
    tyreman: {
      nama: 'Tyreman',
      baris: susun(tyre.total), jumlahWo: tyre.jumlahWo, taksir: tyre.taksir,
    },
  };
}

function tambah(
  peta: Map<number, BarisPapan>,
  id: number, nama: string, grade: string,
  poin: number, rupiah: number,
): void {
  const ada = peta.get(id);
  if (ada) {
    ada.totalPoin += poin;
    ada.totalRupiah += rupiah;
    ada.jumlahWo++;
  } else {
    peta.set(id, {
      mechanicId: id, nama, grade,
      totalPoin: poin, totalRupiah: rupiah, jumlahWo: 1,
    });
  }
}

/* ── grafik tren ────────────────────────────────────────────────────────────
 * Jumlah periodenya ikut dikirim supaya JUDUL di layar membacanya dari data.
 * Di KMB V2 judulnya pernah berbunyi "6 Bulan Terakhir" sementara isinya
 * ditentukan kode server — dua tempat yang harus diingat bersamaan, dan yang
 * terlupa selalu judulnya (Main.html:506-512).
 */
export async function trenPoin(aku: Identitas, jumlahPeriode = 3): Promise<TrenPoin> {
  const scope = await sectionYangBoleh(aku.mechanicId);
  const deret = periodeTerakhir(jumlahPeriode);

  const total = await Promise.all(
    deret.map(async (p) => {
      const r = await sql<{ jml: string | null }[]>`
        SELECT sum(mp.points) AS jml
          FROM mechanic_points mp
          JOIN mechanics m ON m.id = mp.mechanic_id
          JOIN sections  s ON s.id = mp.section_id
         WHERE mp.points > 0
           AND mp.awarded_at BETWEEN ${p.mulai} AND ${p.akhir}
           AND m.tenant_id = ${aku.tenantId}
           AND m.is_test_account = false
           AND (${scope}::text[] IS NULL OR s.code::text = ANY(${scope}::text[]))
      `;
      return bulatkan(Number(r[0]?.jml ?? 0), 2);
    }),
  );

  return {
    labels: deret.map((p) => p.labelPendek),
    labelPenuh: deret.map((p) => p.label),
    data: total,
    jumlahPeriode,
  };
}

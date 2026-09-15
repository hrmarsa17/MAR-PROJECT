import { sql } from '../lib/db.js';
import type { Identitas } from '../lib/auth.js';
import { sectionYangBoleh } from './kueri.js';
import { periodeBerakhir } from './periode.js';
import { aturanBisnis, masukanTidakSah } from '../lib/errors.js';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DATA EXPORT PAYROLL
 * ════════════════════════════════════════════════════════════════════════════
 * Kontraknya di docs/SPEK-LAYAR/07-REPORTS.md §3.
 *
 * ── SEMUA ANGKA DIBACA, TIDAK SATU PUN DIHITUNG ULANG ───────────────────────
 * Ini aturan tunggal yang menentukan seluruh berkas ini:
 *
 *   poin      mechanic_points.points
 *   rupiah    mechanic_points.idr_value        (GENERATED, sudah bulat)
 *   tarif     mechanic_points.idr_per_point    (DIBEKUKAN saat poin terbit)
 *   rincian   scoring_snapshots.*              (DIBEKUKAN saat L2 menyetujui)
 *
 * KMB V2 mengambil poinnya dari baris yang sama tapi MENGHITUNG ULANG rupiahnya
 * dengan tarif SEKARANG (`PayrollService.js:156-163`). Akibatnya: menaikkan
 * tarif seseorang mengubah slip gaji bulan-bulan yang SUDAH dibayar. Itu
 * benar-benar terjadi — 9 Sep 2026, Rp 17,6 juta bergeser surut.
 *
 * Contoh yang harus tetap benar: 2 poin × Rp2.500 lalu 2 poin × Rp3.500 tetap
 * membayar Rp12.000, walau tarif orang itu sekarang Rp4.500.
 *
 * Maka: JANGAN memanggil nilaiEfektif(), jangan memanggil hitungSkor(), jangan
 * membaca pay_rates. Kalau suatu hari angka di sini terasa salah, yang salah
 * ada di jalur approve — perbaiki di sana, bukan di sini.
 *
 * ── BATAS PERIODE DIHITUNG POSTGRES, BUKAN JAVASCRIPT ───────────────────────
 * Zona waktunya milik tenant (Asia/Jakarta), bukan milik proses Node yang bisa
 * saja berjalan di UTC. `make_date(...) AT TIME ZONE tz` membuat batasnya tepat
 * tanpa menebak.
 * ════════════════════════════════════════════════════════════════════════════
 */

export interface PeriodePermintaan {
  mode: 'month' | 'range';
  /** mode 'month': tahun & bulan PENUTUP periode. */
  tahun?: number;
  bulan?: number;
  /** mode 'range': "YYYY-MM-DD". */
  mulai?: string;
  akhir?: string;
  /** Kode section; kosong = semua yang boleh dilihat penonton. */
  section?: string;
}

export interface BarisDetail {
  mekanikId: number;
  mekanikKode: string;
  nama: string;
  jabatan: string;
  tglSubmit: string | null;
  tglApproved: string | null;
  woNumber: string;
  unitKode: string;
  komponen: string;
  deskripsi: string;
  kondisi: string;
  lokasi: string;
  mulai: string | null;
  selesai: string | null;
  actualHours: number;
  basePts: number;
  xUnit: number;
  xKondisi: number;
  xWaktu: number;
  xSafety: number;
  xRedo: number;
  woPoin: number;
  poinMekanik: number;
  idr: number;
  idrPerPoint: number;
}

export interface BarisRingkas {
  mekanikId: number;
  mekanikKode: string;
  nama: string;
  jabatan: string;
  totalWo: number;
  totalPoin: number;
  /** Angka bila tarifnya tunggal sepanjang periode; null bila bercampur. */
  ratePoin: number | null;
  totalIdr: number;
}

export interface HasilPayroll {
  periodeLabel: string;
  dibuatAt: Date;
  sectionLabel: string;
  detail: BarisDetail[];
  ringkas: BarisRingkas[];
  statistik: { mekanik: number; wo: number; idr: number };
  dikecualikan: { baris: number; nama: string[] };
}

export async function dataPayroll(
  aku: Identitas,
  minta: PeriodePermintaan,
): Promise<HasilPayroll> {
  const batas = batasPeriode(minta);
  const scope = await sectionYangBoleh(aku.mechanicId);

  // Section pilihan disaring TERHADAP SECTION WO, bukan section mekaniknya.
  // Seorang tyreman yang membantu WO field dibayar di bawah section field —
  // yang ditanyakan laporan ini "pekerjaan itu milik section apa".
  const pilih = minta.section?.trim() ? minta.section.trim() : null;
  if (pilih && scope && !scope.includes(pilih)) {
    throw aturanBisnis(`Section ${pilih} di luar cakupan Anda.`);
  }

  const tz = (
    await sql<{ timezone: string }[]>`
      SELECT timezone FROM tenants WHERE id = ${aku.tenantId}
    `
  )[0]?.timezone ?? 'Asia/Jakarta';

  /* Diperiksa LEBIH DULU, sebelum membaca satu pun baris poin: "tidak ada WO
     yang disetujui di periode ini" adalah jawaban yang berbeda dari "ada WO
     tapi poinnya nol", dan orang yang mengekspor berhak tahu yang mana. */
  const adaWo = await sql<{ n: string }[]>`
    SELECT count(*) AS n
      FROM work_orders w
      JOIN sections s ON s.id = w.section_id
     WHERE w.tenant_id = ${aku.tenantId}
       AND w.status = 'approved'
       AND coalesce(w.approved_l2_at, w.created_at)
             >= (make_date(${batas.y1}, ${batas.m1}, ${batas.d1})::timestamp AT TIME ZONE ${tz})
       AND coalesce(w.approved_l2_at, w.created_at)
             <  ((make_date(${batas.y2}, ${batas.m2}, ${batas.d2}) + 1)::timestamp AT TIME ZONE ${tz})
       AND (${scope}::text[] IS NULL OR s.code::text = ANY(${scope}::text[]))
       AND (${pilih}::text IS NULL OR s.code::text = ${pilih})
  `;
  if (Number(adaWo[0]!.n) === 0) {
    throw aturanBisnis(
      'Tidak ada work order yang disetujui pada periode ini. Tidak ada yang bisa diekspor.',
    );
  }

  const baris = await sql<{
    mechanic_id: number; kode: string; nama: string; jabatan: string | null;
    uji: boolean;
    submitted_at: Date | null; approved_at: Date | null;
    wo_number: string; unit_kode: string | null;
    komponen: string | null; deskripsi: string | null;
    kondisi: string | null; lokasi: string | null;
    start_time: Date | null; end_time: Date | null;
    s_actual: string | null; s_base: string | null; s_unit: string | null;
    s_kondisi: string | null; s_waktu: string | null; s_safety: string | null;
    s_mtbf: string | null; s_final: string | null;
    points: string; idr_value: string; idr_per_point: string;
  }[]>`
    SELECT m.id AS mechanic_id, m.mechanic_code::text AS kode, m.name AS nama,
           m.grade AS jabatan, m.is_test_account AS uji,
           w.submitted_at, coalesce(w.approved_l2_at, w.created_at) AS approved_at,
           w.wo_number, u.unit_code::text AS unit_kode,
           -- Kolom 8 & 9 berbeda arti per section, sama dengan sumber:
           -- cascade -> sub-component / job description; manual -> Others.
           CASE WHEN w.is_manual THEN 'Others'
                ELSE coalesce(sc.name::text, c.name::text, '-') END AS komponen,
           CASE WHEN w.is_manual THEN coalesce(w.manual_description, 'Custom Job')
                ELSE coalesce(j.job_description, '-') END            AS deskripsi,
           coalesce(fwc.description, w.work_condition::text) AS kondisi,
           w.location AS lokasi, w.start_time, w.end_time,
           ss.actual_hours          AS s_actual,
           ss.base_points           AS s_base,
           ss.unit_factor           AS s_unit,
           ss.work_condition_factor AS s_kondisi,
           ss.timeliness_factor     AS s_waktu,
           ss.safety_factor         AS s_safety,
           ss.mtbf_factor           AS s_mtbf,
           ss.final_points          AS s_final,
           mp.points, mp.idr_value, mp.idr_per_point
      FROM mechanic_points mp
      JOIN work_orders w ON w.id = mp.work_order_id
      JOIN mechanics   m ON m.id = mp.mechanic_id
      JOIN sections    s ON s.id = w.section_id
      LEFT JOIN scoring_snapshots ss ON ss.work_order_id = w.id
      LEFT JOIN units u ON u.id = w.unit_id
      LEFT JOIN jobs  j ON j.id = w.job_id
      LEFT JOIN job_sub_components sc ON sc.id = j.sub_component_id
      LEFT JOIN job_components     c  ON c.id  = sc.component_id
      LEFT JOIN factors fwc ON fwc.tenant_id = w.tenant_id
                           AND fwc.factor_type = 'work_condition'
                           AND fwc.factor_key = w.work_condition
     WHERE w.tenant_id = ${aku.tenantId}
       AND w.status = 'approved'
       -- Poin nol tidak masuk slip. WO insiden safety berpoin nol memang
       -- hilang dari detail — itu perilaku sumber, dan benar: tak ada yang
       -- dibayarkan untuk baris itu.
       AND mp.points > 0
       AND coalesce(w.approved_l2_at, w.created_at)
             >= (make_date(${batas.y1}, ${batas.m1}, ${batas.d1})::timestamp AT TIME ZONE ${tz})
       AND coalesce(w.approved_l2_at, w.created_at)
             <  ((make_date(${batas.y2}, ${batas.m2}, ${batas.d2}) + 1)::timestamp AT TIME ZONE ${tz})
       AND (${scope}::text[] IS NULL OR s.code::text = ANY(${scope}::text[]))
       AND (${pilih}::text IS NULL OR s.code::text = ${pilih})
     ORDER BY m.name ASC, w.wo_number ASC
  `;

  /* AKUN UJI DIBUANG DARI SLIP, TAPI DIHITUNG DAN DISEBUT NAMANYA.
     Aturan akun uji memuat pola yang berlaku atas siapa pun selamanya; kalau
     suatu hari ia salah mengenai orang sungguhan, satu-satunya cara ketahuan
     adalah membacanya di layar ini. Diam-diam membuangnya berarti seseorang
     tidak dibayar tanpa ada yang tahu. */
  const dipakai = baris.filter((r) => !r.uji);
  const uji = baris.filter((r) => r.uji);
  const namaUji = [...new Set(uji.map((r) => `${r.nama} (${r.kode})`))];

  const n = (v: string | null) => (v === null ? 0 : Number(v));
  const detail: BarisDetail[] = dipakai.map((r) => ({
    mekanikId: Number(r.mechanic_id),
    mekanikKode: r.kode,
    nama: r.nama,
    jabatan: r.jabatan?.trim() || '-',
    tglSubmit: r.submitted_at?.toISOString() ?? null,
    tglApproved: r.approved_at?.toISOString() ?? null,
    woNumber: r.wo_number,
    unitKode: r.unit_kode ?? '-',
    komponen: r.komponen ?? '-',
    deskripsi: r.deskripsi ?? '-',
    kondisi: r.kondisi ?? '-',
    lokasi: r.lokasi ? r.lokasi.charAt(0).toUpperCase() + r.lokasi.slice(1) : '-',
    mulai: r.start_time?.toISOString() ?? null,
    selesai: r.end_time?.toISOString() ?? null,
    actualHours: n(r.s_actual),
    basePts: n(r.s_base),
    xUnit: n(r.s_unit),
    xKondisi: n(r.s_kondisi),
    xWaktu: n(r.s_waktu),
    xSafety: n(r.s_safety),
    xRedo: n(r.s_mtbf),
    woPoin: n(r.s_final),
    poinMekanik: n(r.points),
    idr: n(r.idr_value),
    idrPerPoint: n(r.idr_per_point),
  }));

  // Ringkasan dibangun DARI detail yang sama, bukan dari kueri kedua. Dua
  // kueri yang seharusnya sepakat adalah dua kueri yang suatu hari tidak.
  const peta = new Map<number, BarisRingkas & { tarif: Set<number> }>();
  for (const d of detail) {
    let g = peta.get(d.mekanikId);
    if (!g) {
      g = {
        mekanikId: d.mekanikId, mekanikKode: d.mekanikKode, nama: d.nama,
        jabatan: d.jabatan, totalWo: 0, totalPoin: 0, ratePoin: null, totalIdr: 0,
        tarif: new Set<number>(),
      };
      peta.set(d.mekanikId, g);
    }
    g.totalWo++;
    g.totalPoin += d.poinMekanik;
    g.totalIdr += d.idr;
    g.tarif.add(d.idrPerPoint);
  }

  const ringkas: BarisRingkas[] = [...peta.values()]
    .map(({ tarif, ...g }) => ({
      ...g,
      totalPoin: Math.round(g.totalPoin * 100) / 100,
      /* Satu orang bisa punya LEBIH DARI SATU tarif dalam satu periode — tarif
         dibekukan per baris poin, dan tarif jabatannya bisa berubah di tengah
         jalan. Menampilkan satu angka di kasus itu berbohong, dan menampilkan
         RATA-RATANYA lebih buruk lagi: orang akan memakainya untuk menghitung
         ulang dan hasilnya tidak akan cocok. `null` = "Bervariasi". */
      ratePoin: tarif.size === 1 ? [...tarif][0]! : null,
    }))
    .sort((a, b) => b.totalPoin - a.totalPoin || a.nama.localeCompare(b.nama));

  return {
    periodeLabel: batas.label,
    dibuatAt: new Date(),
    sectionLabel: pilih ?? 'Semua section',
    detail,
    ringkas,
    statistik: {
      mekanik: ringkas.length,
      wo: new Set(detail.map((d) => d.woNumber)).size,
      idr: ringkas.reduce((a, b) => a + b.totalIdr, 0),
    },
    dikecualikan: { baris: uji.length, nama: namaUji },
  };
}

interface Batas {
  y1: number; m1: number; d1: number;
  y2: number; m2: number; d2: number;
  label: string;
}

const BULAN_PANJANG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

/**
 * Batas periode sebagai komponen tanggal, bukan Date.
 *
 * Sengaja tidak mengembalikan objek Date: Date membawa zona waktu proses yang
 * menjalankannya, dan proses itu bisa saja UTC. Komponennya diserahkan ke
 * Postgres yang tahu zona tenantnya.
 */
function batasPeriode(m: PeriodePermintaan): Batas {
  if (m.mode === 'month') {
    const tahun = Number(m.tahun);
    const bulan = Number(m.bulan);
    if (!Number.isInteger(tahun) || tahun < 2000 || tahun > 2100) {
      throw masukanTidakSah('Tahun tidak sah.');
    }
    if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12) {
      throw masukanTidakSah('Bulan harus 1-12.');
    }
    // Satu definisi periode gaji, dipakai bersama seluruh layar.
    const p = periodeBerakhir(tahun, bulan);
    return {
      y1: p.mulai.getFullYear(), m1: p.mulai.getMonth() + 1, d1: p.mulai.getDate(),
      y2: p.akhir.getFullYear(), m2: p.akhir.getMonth() + 1, d2: p.akhir.getDate(),
      label: p.label,
    };
  }

  const a = uraiTanggal(m.mulai, 'Tanggal mulai');
  const b = uraiTanggal(m.akhir, 'Tanggal akhir');
  if (b.t < a.t) throw aturanBisnis('Tanggal akhir harus sesudah tanggal mulai.');
  return {
    y1: a.y, m1: a.m, d1: a.d,
    y2: b.y, m2: b.m, d2: b.d,
    label: `${a.d} ${BULAN_PANJANG[a.m - 1]} ${a.y} – ${b.d} ${BULAN_PANJANG[b.m - 1]} ${b.y}`,
  };
}

function uraiTanggal(v: string | undefined, nama: string) {
  const cocok = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? ''));
  if (!cocok) throw masukanTidakSah(`${nama} tidak sah (format YYYY-MM-DD).`);
  const y = Number(cocok[1]);
  const mm = Number(cocok[2]);
  const d = Number(cocok[3]);
  // Diperiksa sebagai tanggal KALENDER: 2026-02-31 lolos regex tapi tidak ada.
  const uji = new Date(y, mm - 1, d);
  if (uji.getFullYear() !== y || uji.getMonth() + 1 !== mm || uji.getDate() !== d) {
    throw masukanTidakSah(`${nama} bukan tanggal yang ada di kalender.`);
  }
  return { y, m: mm, d, t: uji.getTime() };
}

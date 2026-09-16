import { sql, type Tx } from '../lib/db.js';
import { aturanBisnis, tidakDitemukan } from '../lib/errors.js';
import { jalankanPerintah, type HasilPerintah } from './runCommand.js';
import { pastikanAdmin } from './admin.js';
import { periodeSaatIni } from './periode.js';
import {
  bulatkan, rupiahUntukPoin, statusKetepatanWaktu, type TimelinessStatus,
} from './scoring.js';
import {
  pastikanPratinjauMasihBerlaku, rangkumDampak, type DampakSurut,
} from './surutBersama.js';

/**
 * TERAPKAN SURUT — mengubah angka sebuah job dan MEMBAWANYA MUNDUR ke seluruh
 * WO yang pernah tercatat.
 *
 * ── INI TINDAKAN PALING BERBAHAYA DI SELURUH SISTEM ─────────────────────────
 * Seluruh arsitektur ini berdiri di atas satu jaminan: angka yang sudah
 * disetujui DIBEKUKAN. `scoring_snapshots` menyimpan faktor apa adanya saat
 * approve, dan `mechanic_points.idr_per_point` menyalin tarif saat poin terbit.
 * Karena itu mengubah katalog tidak pernah menggeser gaji yang sudah dibayar —
 * dan ada ujinya yang membuktikan itu.
 *
 * Perintah ini SENGAJA menembus jaminan tersebut. Ia ada karena Gabriel memang
 * kadang perlu melakukannya: di SUM, penyesuaian berlaku surut pernah menggeser
 * pembayaran sebesar -Rp 17,6 juta (9 Sep 2026), dan itu keputusan yang diambil
 * sadar, bukan kecelakaan.
 *
 * Maka yang bisa dilakukan berkas ini bukan mencegahnya, melainkan membuatnya
 * TIDAK MUNGKIN TERJADI TANPA SENGAJA:
 *
 *  1. Perintah TERPISAH dari simpan biasa. Tidak ada jalan tak sengaja ke sini.
 *  2. Pratinjau menyebut RUPIAHNYA — berapa sekarang, jadi berapa, selisihnya,
 *     dipecah per periode gaji. "127 WO terpengaruh" tidak memberi tahu siapa
 *     pun apa yang akan terjadi.
 *  3. WO yang angkanya PERNAH DI-OVERRIDE approver TIDAK DISENTUH. Itu
 *     keputusan manusia atas satu pekerjaan tertentu; menimpanya dengan angka
 *     katalog menghapus penilaian orang yang melihat pekerjaannya langsung.
 *  4. Faktor lain — unit, kondisi, safety, MTBF — tetap dari snapshot. Ini
 *     menjawab "seandainya angka katalognya sejak dulu segini", bukan
 *     menghitung ulang seluruh dunia dengan keadaan hari ini.
 *  5. Nilai lama SETIAP WO masuk audit log, sehingga bisa dijelaskan — dan
 *     kalau perlu, dikembalikan.
 *
 * ── SATU PERHITUNGAN, BUKAN DUA ─────────────────────────────────────────────
 * Pratinjau dan penerapan memanggil `hitungSurut()` yang SAMA, dan penerapan
 * menulis persis angka yang dikembalikannya. Kalau keduanya punya rumus
 * sendiri-sendiri, suatu hari layar akan menjanjikan satu angka dan basis data
 * menuliskan angka lain — dan yang ketahuan belakangan adalah selisih gaji.
 *
 * ── JAM RENCANA IKUT MUNDUR, DAN ITU PUNYA KONSEKUENSI ──────────────────────
 * Mengubah jam rencana menggeser STATUS ketepatan waktu WO lama (on_time bisa
 * jadi late). Snapshot hanya membekukan SATU nilai faktor — nilai untuk status
 * yang berlaku saat itu — jadi status yang berubah terpaksa memakai faktor
 * `factors` HARI INI. Karena itu:
 *   • status TIDAK berubah  → faktor beku dipakai apa adanya, nol pergeseran;
 *   • status BERUBAH        → faktor hari ini, dan jumlahnya disebutkan
 *                             tersendiri di pratinjau supaya terlihat.
 */

export interface BarisSurut {
  woId: number;
  nomor: string;
  periodeKunci: string;
  finalLama: number;
  finalBaru: number;
  statusLama: string;
  statusBaru: TimelinessStatus;
  faktorWaktuLama: number;
  faktorWaktuBaru: number;
  rupiahLama: number;
  rupiahBaru: number;
  orang: number;
}

/**
 * Bentuk laporannya SAMA dengan surut faktor dan tarif (`DampakSurut`), supaya
 * layar menampilkan ketiganya dengan satu komponen. Yang ditambahkan di sini
 * hanya yang benar-benar khas job.
 */
export interface PratinjauSurut extends DampakSurut {
  jobId: number;
  kode: string;
  nama: string;
  section: string;
  basePointLama: number;
  basePointBaru: number;
  planHoursLama: number;
  planHoursBaru: number;
  /** Di antara yang terpengaruh: berapa yang status ketepatan waktunya bergeser. */
  statusBergeser: number;
  baris: BarisSurut[];
}

interface BarisMentah {
  wo_id: number;
  nomor: string;
  disetujui: Date | null;
  actual_hours: string;
  unit_factor: string;
  work_condition_factor: string;
  timeliness_factor: string;
  timeliness_status: string;
  safety_factor: string;
  mtbf_factor: string;
  final_points: string;
}

/**
 * Inti perhitungan. Tidak menulis apa pun.
 *
 * Selalu berjalan DI DALAM transaksi — termasuk saat hanya dipakai pratinjau.
 * Bukan formalitas: ia menjalankan empat kueri (job, WO, faktor, pembayaran),
 * dan di luar transaksi keempatnya bisa melihat keadaan yang berbeda bila ada
 * approve yang lewat di tengah. Angka pratinjau yang tersusun dari dua keadaan
 * adalah angka yang tidak pernah benar.
 */
async function hitungSurut(
  db: Tx, tenantId: number, jobId: number,
  basePointBaru: number, planHoursBaru: number,
): Promise<PratinjauSurut> {
  const job = (
    await db<{
      kode: string; nama: string; section: string;
      base_points: string; plan_hours: string;
    }[]>`
      SELECT j.job_code::text AS kode, j.job_description AS nama,
             s.code::text AS section, j.base_points, j.plan_hours
        FROM jobs j JOIN sections s ON s.id = j.section_id
       WHERE j.id = ${jobId} AND j.tenant_id = ${tenantId}
    `
  )[0];
  if (!job) throw tidakDitemukan('Job', jobId);

  /* WO yang PERNAH disentuh override base_points ATAU target_hours dilewati
     seluruhnya. Membedakannya lebih halus dari itu — "base-nya boleh diganti,
     jamnya tidak" — menghasilkan aturan yang tidak bisa dijelaskan dalam satu
     kalimat kepada orang yang menekan tombolnya. */
  const mentah = await db<BarisMentah[]>`
    SELECT w.id AS wo_id, w.wo_number::text AS nomor,
           coalesce(w.approved_l2_at, w.created_at) AS disetujui,
           s.actual_hours, s.unit_factor, s.work_condition_factor,
           s.timeliness_factor, s.timeliness_status::text, s.safety_factor,
           s.mtbf_factor, s.final_points
      FROM work_orders w
      JOIN scoring_snapshots s ON s.work_order_id = w.id
     WHERE w.tenant_id = ${tenantId} AND w.job_id = ${jobId}
       AND w.status = 'approved'
       AND NOT EXISTS (
         SELECT 1 FROM work_order_overrides o
          WHERE o.work_order_id = w.id
            AND o.kind IN ('base_points', 'target_hours')
       )
    ORDER BY w.id
  `;

  const dilewati = (
    await db<{ n: number }[]>`
      SELECT count(*)::int AS n
        FROM work_orders w
       WHERE w.tenant_id = ${tenantId} AND w.job_id = ${jobId}
         AND w.status = 'approved'
         AND EXISTS (
           SELECT 1 FROM work_order_overrides o
            WHERE o.work_order_id = w.id
              AND o.kind IN ('base_points', 'target_hours')
         )
    `
  )[0]!.n;

  const faktorWaktu = new Map<string, number>(
    (
      await db<{ factor_key: string; factor_value: string }[]>`
        SELECT factor_key::text, factor_value FROM factors
         WHERE tenant_id = ${tenantId} AND factor_type = 'timeliness'
      `
    ).map((f) => [f.factor_key, Number(f.factor_value)]),
  );

  const bayar = new Map<number, { idrPerPoint: number; idrValue: number }[]>();
  if (mentah.length > 0) {
    const ids = mentah.map((m) => m.wo_id);
    const rows = await db<{
      work_order_id: number; idr_per_point: string; idr_value: string;
    }[]>`
      SELECT work_order_id, idr_per_point, idr_value
        FROM mechanic_points WHERE work_order_id = ANY(${ids}::bigint[])
    `;
    for (const r of rows) {
      const daftar = bayar.get(r.work_order_id) ?? [];
      daftar.push({ idrPerPoint: Number(r.idr_per_point), idrValue: Number(r.idr_value) });
      bayar.set(r.work_order_id, daftar);
    }
  }

  const baris: BarisSurut[] = mentah.map((m) => {
    const statusBaru = statusKetepatanWaktu(Number(m.actual_hours), planHoursBaru);
    const faktorLama = Number(m.timeliness_factor);
    /* Status tidak berubah → faktor BEKU dipakai apa adanya. Membacanya ulang
       dari `factors` akan menggeser WO lama setiap kali faktor pernah disunting,
       padahal orang yang menekan tombol ini hanya bermaksud mengubah job. */
    const faktorBaru = statusBaru === m.timeliness_status
      ? faktorLama
      : (faktorWaktu.get(statusBaru) ?? 1.0);

    const finalBaru = bulatkan(
      basePointBaru * Number(m.unit_factor) * Number(m.work_condition_factor)
      * faktorBaru * Number(m.safety_factor) * Number(m.mtbf_factor),
      2,
    );

    const anggota = bayar.get(m.wo_id) ?? [];
    return {
      woId: m.wo_id,
      nomor: m.nomor,
      periodeKunci: periodeSaatIni(m.disetujui ?? new Date()).kunci,
      finalLama: Number(m.final_points),
      finalBaru,
      statusLama: m.timeliness_status,
      statusBaru,
      faktorWaktuLama: faktorLama,
      faktorWaktuBaru: faktorBaru,
      rupiahLama: anggota.reduce((a, x) => a + x.idrValue, 0),
      rupiahBaru: anggota.reduce((a, x) => a + rupiahUntukPoin(finalBaru, x.idrPerPoint), 0),
      orang: anggota.length,
    };
  });

  const statusBergeser = baris.filter((b) => b.statusBaru !== b.statusLama).length;
  const catatan: string[] = [];
  if (statusBergeser > 0) {
    catatan.push(
      `Jam rencana yang baru menggeser status ketepatan waktu ${statusBergeser} WO `
      + '(mis. on time → late). Faktor untuk status barunya diambil dari tabel '
      + 'Faktor HARI INI, karena snapshot hanya membekukan faktor untuk status '
      + 'yang dulu berlaku.',
    );
  }

  const waktu = new Map(mentah.map((m) => [m.wo_id, m.disetujui ?? new Date()]));
  const dampak = rangkumDampak(
    baris.map((b) => ({
      woId: b.woId,
      disetujui: waktu.get(b.woId) ?? new Date(),
      poinLama: b.finalLama, poinBaru: b.finalBaru,
      rupiahLama: b.rupiahLama, rupiahBaru: b.rupiahBaru, orang: b.orang,
    })),
    {
      judul: `${job.kode} — ${job.nama}`,
      perubahan: [
        { label: 'Base point', lama: String(Number(job.base_points)), baru: String(basePointBaru) },
        { label: 'Jam rencana', lama: String(Number(job.plan_hours)), baru: String(planHoursBaru) },
      ],
      dilewati,
      alasanDilewati: dilewati > 0
        ? 'approver pernah menyentuh base point atau jam rencananya sendiri — itu '
          + 'penilaian orang yang melihat pekerjaannya langsung, dan angka katalog '
          + 'tidak menimpanya'
        : null,
      catatan,
    },
  );

  return {
    ...dampak,
    jobId,
    kode: job.kode,
    nama: job.nama,
    section: job.section,
    basePointLama: Number(job.base_points),
    basePointBaru,
    planHoursLama: Number(job.plan_hours),
    planHoursBaru,
    statusBergeser,
    baris,
  };
}

/** Menghitung saja. Tidak menulis apa pun. Dipakai layar sebelum tombolnya muncul. */
export async function pratinjauSurut(
  tenantId: number, jobId: number, basePointBaru: number, planHoursBaru: number,
): Promise<PratinjauSurut> {
  if (!(basePointBaru > 0)) throw aturanBisnis('Base point harus lebih dari 0');
  if (!(planHoursBaru > 0)) throw aturanBisnis('Jam rencana harus lebih dari 0');
  return sql.begin(
    (tx) => hitungSurut(tx, tenantId, jobId, basePointBaru, planHoursBaru),
  ) as Promise<PratinjauSurut>;
}

export interface MasukanSurut {
  opId: string;
  tenantId: number;
  actorId: number;
  jobId: number;
  basePointBaru: number;
  planHoursBaru: number;
  /** Harus sama persis dengan pratinjau yang dilihat. Lihat catatan di bawah. */
  rupiahSesudahDilihat: number;
}

export interface HasilSurut {
  jobId: number;
  kode: string;
  woDihitungUlang: number;
  dilewati: number;
  statusBergeser: number;
  rupiahSebelum: number;
  rupiahSesudah: number;
}

export async function terapkanSurut(m: MasukanSurut): Promise<HasilPerintah<HasilSurut>> {
  return jalankanPerintah({
    opId: m.opId, tenantId: m.tenantId, actorId: m.actorId, action: 'terapkan_surut',
    jalankan: async ({ tx }) => {
      await pastikanAdmin(tx, m.actorId);
      if (!(m.basePointBaru > 0)) throw aturanBisnis('Base point harus lebih dari 0');
      if (!(m.planHoursBaru > 0)) throw aturanBisnis('Jam rencana harus lebih dari 0');

      /* Pratinjau dihitung ULANG di sini dan dibandingkan dengan yang dilihat
         orangnya. Kalau ada WO baru yang disetujui di antara "lihat" dan
         "terapkan", angkanya berubah — dan yang menekan tombol menyetujui angka
         yang sudah tidak berlaku. Ia harus melihat lagi. */
      const p = await hitungSurut(tx, m.tenantId, m.jobId, m.basePointBaru, m.planHoursBaru);
      pastikanPratinjauMasihBerlaku(p.rupiahSesudah, m.rupiahSesudahDilihat);

      await tx`
        UPDATE jobs SET base_points = ${m.basePointBaru}, plan_hours = ${m.planHoursBaru},
                        updated_at = now()
         WHERE id = ${m.jobId} AND tenant_id = ${m.tenantId}
      `;

      if (p.baris.length > 0) {
        /* Angka yang DITULIS adalah angka yang DIHITUNG di atas — bukan rumus
           yang ditulis ulang dalam SQL. Rumus kembar adalah cara paling rapi
           untuk membuat layar dan basis data berselisih tanpa ada yang tahu. */
        const ids = p.baris.map((b) => b.woId);
        const poin = p.baris.map((b) => String(b.finalBaru));
        const faktor = p.baris.map((b) => String(b.faktorWaktuBaru));
        const status = p.baris.map((b) => b.statusBaru);

        await tx`
          UPDATE scoring_snapshots s
             SET base_points       = ${m.basePointBaru},
                 target_hours      = ${m.planHoursBaru},
                 timeliness_factor = v.faktor,
                 timeliness_status = v.status,
                 final_points      = v.poin
            FROM unnest(${ids}::bigint[], ${poin}::numeric[],
                        ${faktor}::numeric[], ${status}::text[])
                 AS v(wo_id, poin, faktor, status)
           WHERE s.work_order_id = v.wo_id
        `;

        /* `mechanic_points.idr_value` kolom GENERATED dari points x idr_per_point
           yang IKUT BEKU. Jadi tarif tidak ikut bergerak — hanya poinnya. */
        await tx`
          UPDATE mechanic_points p
             SET points = v.poin
            FROM unnest(${ids}::bigint[], ${poin}::numeric[]) AS v(wo_id, poin)
           WHERE p.work_order_id = v.wo_id
        `;
        await tx`
          UPDATE work_orders w
             SET final_points = v.poin
            FROM unnest(${ids}::bigint[], ${poin}::numeric[]) AS v(wo_id, poin)
           WHERE w.id = v.wo_id
        `;
      }

      /* Nilai lama SETIAP WO ikut tercatat. Tanpa itu tindakan ini tidak bisa
         dijelaskan kepada orang yang gajinya bergeser, dan tidak bisa dibalik. */
      await tx`
        INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, actor_id, details)
        VALUES (${m.tenantId}, 'terapkan_surut', 'job', ${String(m.jobId)}, ${m.actorId},
                ${tx.json({
                  kode: p.kode,
                  section: p.section,
                  base_points: { lama: p.basePointLama, baru: m.basePointBaru },
                  plan_hours: { lama: p.planHoursLama, baru: m.planHoursBaru },
                  dilewati_override: p.dilewati,
                  status_bergeser: p.statusBergeser,
                  rupiah: { sebelum: p.rupiahSekarang, sesudah: p.rupiahSesudah },
                  periode: p.periode,
                  wo: p.baris.map((b) => ({
                    id: b.woId, nomor: b.nomor,
                    poin: { lama: b.finalLama, baru: b.finalBaru },
                    rupiah: { lama: b.rupiahLama, baru: b.rupiahBaru },
                    ketepatan: { lama: b.statusLama, baru: b.statusBaru },
                  })),
                } as never)})
      `;

      return {
        jobId: m.jobId,
        kode: p.kode,
        woDihitungUlang: p.baris.length,
        dilewati: p.dilewati,
        statusBergeser: p.statusBergeser,
        rupiahSebelum: p.rupiahSekarang,
        rupiahSesudah: p.rupiahSesudah,
      };
    },
  });
}

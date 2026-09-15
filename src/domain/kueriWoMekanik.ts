import { sql } from '../lib/db.js';

/**
 * BACAAN LAYAR MEKANIK — daftar WO milik satu orang.
 *
 * Port dari `getMyAssignedWOs()` (`MechanicService.js:14-133`). Empat perilaku
 * sumber yang WAJIB ikut, karena masing-masing punya sejarahnya sendiri:
 *
 *  1. WO diambil dari KEANGGOTAAN TIM, bukan dari siapa yang membuatnya.
 *  2. `cancelled` dan `rejected` dibuang seluruhnya (`:77`).
 *  3. Hitungan tab dihitung atas SELURUH WO, bukan atas isi tab yang dibuka.
 *  4. `grup_total` & `grup_selesai` dihitung SEBELUM penyaringan tab
 *     (`_lekatkanRingkasBorongan`, `:711`) — lihat catatan panjang di bawah.
 */

export type TabWoMekanik = 'assigned' | 'pending_approval' | 'done';

export const TAB_WO_MEKANIK: readonly TabWoMekanik[] = [
  'assigned', 'pending_approval', 'done',
];

export interface AnggotaTim {
  mechanicId: number;
  nama: string;
  /** Dirinya sendiri. Kartu menaruhnya paling depan dan menebalkannya. */
  akuSendiri: boolean;
}

export interface KartuWoMekanik {
  id: number;
  woNumber: string;
  status: string;
  statusLabel: string;
  statusGroup: TabWoMekanik;

  jobNama: string | null;
  unitNama: string | null;
  targetHours: number | null;
  /** Jam dari shift sebelum transfer. Dipakai peringatan tombol Reset. */
  partialHours: number;
  lokasi: string | null;
  keterangan: string | null;
  hourMeter: number | null;
  kilometers: number | null;
  partCategory: string | null;
  safetyIncident: boolean;

  woGroupId: string | null;
  woGroupMode: string | null;
  grupTotal: number | null;
  grupSelesai: number | null;

  tim: AnggotaTim[];
  /** WO yang menunggu keputusan transfer tidak boleh dikirim. Lihat §catatan. */
  bolehKirim: boolean;
}

export interface HitunganTabMekanik {
  assigned: number;
  pending_approval: number;
  done: number;
}

/**
 * Label status: SAMA PERSIS dengan `STATUS_LABELS` di `Constants.js:146-162`.
 * Mekanik sudah membaca kalimat-kalimat ini tiap hari; menggantinya dengan
 * terjemahan yang "lebih rapi" adalah pelatihan ulang yang tak diminta.
 */
const LABEL_STATUS: Record<string, string> = {
  pending_mechanic_work: 'Pending Mechanic Work',
  in_progress: 'In Progress',
  pending_transfer: 'Menunggu Approval Transfer',
  pending_supervisor: 'Menunggu Planner/PIC Lapangan',
  pending_superintendent: 'Menunggu Manager',
  approved: 'Approved',
};

/**
 * Status → tab. Port dari `_statusToGroup` (`MechanicService.js:661-674`).
 *
 * Sumbernya memetakan `rejected` ke tab Done, TAPI baris `:77` sudah membuang
 * WO rejected sebelum sampai ke situ — jadi cabang itu tak pernah jalan. Di
 * sini rejected dibuang di kueri dan cabangnya tidak ditulis ulang, supaya
 * tidak ada dua aturan yang saling bertentangan seperti di sumber.
 */
/* Ditulis langsung di dalam kueri di bawah (satu-satunya pemakainya):
     CASE w.status::text
       WHEN 'pending_supervisor'     THEN 'pending_approval'
       WHEN 'pending_superintendent' THEN 'pending_approval'
       WHEN 'approved'               THEN 'done'
       ELSE 'assigned'
     END
   Sengaja TIDAK diangkat jadi potongan string yang disisipkan: penyisipan
   mentah ke dalam template SQL adalah pintu yang tidak perlu dibuka untuk
   menghemat enam baris. */

/**
 * Hitungan tiga tab, dihitung atas SELURUH WO orang ini.
 *
 * Dipisah dari daftar kartunya karena daftar itu disaring per tab, sementara
 * angka di tab harus benar untuk tab yang belum dibuka. Di sumber keduanya
 * lahir dari satu pemindaian (`_computeCountsByGroup` dipanggil sebelum
 * `_filterWosByGroup`); di sini dua kueri, hasil yang sama.
 */
export async function hitunganTabMekanik(
  tenantId: number,
  mechanicId: number,
): Promise<HitunganTabMekanik> {
  const r = (
    await sql<Record<string, string>[]>`
      SELECT
        /* Sengaja ditulis sebagai PELENGKAP dua tab lain, bukan sebagai daftar
           status sendiri. Daftar kartunya memakai cabang ELSE (lihat woMekanik),
           jadi kalau di sini dipakai daftar IN yang terpisah, status baru yang
           kelak ditambahkan akan muncul di kartu tapi tidak terhitung di tab —
           mekanik melihat "Assigned 2" di atas tiga kartu. Dua bentuk ini
           sekarang tidak mungkin berbeda. */
        count(*) FILTER (WHERE w.status NOT IN
          ('pending_supervisor','pending_superintendent','approved'))  AS assigned,
        count(*) FILTER (WHERE w.status IN
          ('pending_supervisor','pending_superintendent'))             AS pending_approval,
        count(*) FILTER (WHERE w.status = 'approved')                  AS done
      FROM work_orders w
      JOIN work_order_team t ON t.work_order_id = w.id
                            AND t.mechanic_id = ${mechanicId}
      WHERE w.tenant_id = ${tenantId}
        AND w.status NOT IN ('cancelled','rejected')
    `
  )[0]!;

  return {
    assigned: Number(r['assigned']),
    pending_approval: Number(r['pending_approval']),
    done: Number(r['done']),
  };
}

interface BarisMentah {
  id: number;
  wo_number: string;
  status: string;
  status_group: TabWoMekanik;
  job_nama: string | null;
  unit_nama: string | null;
  target_hours: string | null;
  partial_hours: string;
  lokasi: string | null;
  keterangan: string | null;
  hour_meter: string | null;
  kilometers: string | null;
  part_category: string | null;
  safety_incident: boolean;
  wo_group_id: string | null;
  wo_group_mode: string | null;
  grup_total: string | null;
  grup_selesai: string | null;
  tim: { mechanic_id: number; nama: string }[] | null;
}

export async function woMekanik(
  tenantId: number,
  mechanicId: number,
  tab: TabWoMekanik,
): Promise<KartuWoMekanik[]> {
  const baris = await sql<BarisMentah[]>`
    WITH milik AS (
      SELECT w.*,
             CASE w.status::text
               WHEN 'pending_supervisor'     THEN 'pending_approval'
               WHEN 'pending_superintendent' THEN 'pending_approval'
               WHEN 'approved'               THEN 'done'
               ELSE 'assigned'
             END AS status_group
        FROM work_orders w
        JOIN work_order_team t ON t.work_order_id = w.id
                              AND t.mechanic_id = ${mechanicId}
       WHERE w.tenant_id = ${tenantId}
         AND w.status NOT IN ('cancelled','rejected')
    ),
    /* ── RINGKAS BORONGAN, DIHITUNG SEBELUM PENYARINGAN TAB ────────────────
       Halaman ini dimuat ulang per tab, jadi yang sampai ke layar hanya baris
       yang lolos tab itu — dan layar tak punya cara mengetahui borongan yang
       sama masih punya baris lain di tab sebelah. Di KMB V2 layar sempat
       menghitung sendiri dari apa yang ia pegang, lalu menulis "Selesai 0
       dari 1" untuk borongan berisi lima yang empat di antaranya sudah
       selesai. Angka itu terbaca sebagai kemajuan borongan, dan mekanik
       mengira dirinya jauh lebih tertinggal.

       Jendela di bawah berjalan atas CTE "milik" (belum disaring).
       Memindahkan perhitungan ini ke sesudah WHERE tab akan melahirkan bug
       yang sama, kali ini tanpa ada yang curiga.

       (Tanpa tanda petik-miring di komentar ini: satu saja menutup template
       literal JS di sekelilingnya, dan seluruh berkas gagal dibaca. Sudah
       pernah terjadi di layar approval, 15 Sep 2026.) */
    bergrup AS (
      SELECT m.*,
             CASE WHEN m.wo_group_id IS NULL THEN NULL
                  ELSE count(*) OVER (PARTITION BY m.wo_group_id) END
               AS grup_total,
             CASE WHEN m.wo_group_id IS NULL THEN NULL
                  ELSE count(*) FILTER (WHERE m.status_group = 'done')
                         OVER (PARTITION BY m.wo_group_id) END
               AS grup_selesai
        FROM milik m
    )
    SELECT
      b.id,
      b.wo_number,
      b.status::text AS status,
      b.status_group,

      coalesce(
        nullif(concat_ws(' — ', c.name::text, sc.name::text, j.job_description), ''),
        b.manual_description
      ) AS job_nama,
      u.unit_name AS unit_nama,
      coalesce(j.plan_hours, b.manual_target_hours) AS target_hours,
      b.partial_hours,
      b.location AS lokasi,
      b.keterangan,
      b.hour_meter,
      b.kilometers,
      b.part_category::text AS part_category,
      b.safety_incident,

      b.wo_group_id::text AS wo_group_id,
      b.wo_group_mode::text AS wo_group_mode,
      b.grup_total,
      b.grup_selesai,

      tim.daftar AS tim

    FROM bergrup b
    LEFT JOIN jobs j                ON j.id  = b.job_id
    LEFT JOIN job_sub_components sc ON sc.id = j.sub_component_id
    LEFT JOIN job_components     c  ON c.id  = sc.component_id
    LEFT JOIN units u               ON u.id  = b.unit_id
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object('mechanic_id', m.id, 'nama', m.name)
                      ORDER BY m.name) AS daftar
        FROM work_order_team t2
        JOIN mechanics m ON m.id = t2.mechanic_id
       WHERE t2.work_order_id = b.id
    ) tim ON true

    WHERE b.status_group = ${tab}
    ORDER BY b.created_at DESC
  `;

  return baris.map((r) => {
    const tim: AnggotaTim[] = (r.tim ?? []).map((t) => ({
      mechanicId: Number(t.mechanic_id),
      nama: t.nama,
      akuSendiri: Number(t.mechanic_id) === mechanicId,
    }));
    // Diri sendiri di depan — di WO beranggota banyak, namanya harus ketemu
    // sekali lihat (`timKerjaStr`, MechanicDashboard.html:778-786).
    tim.sort((a, b) => Number(b.akuSendiri) - Number(a.akuSendiri));

    const num = (v: string | null) => (v === null ? null : Number(v));

    return {
      id: Number(r.id),
      woNumber: r.wo_number,
      status: r.status,
      statusLabel: LABEL_STATUS[r.status] ?? r.status,
      statusGroup: r.status_group,
      jobNama: r.job_nama,
      unitNama: r.unit_nama,
      targetHours: num(r.target_hours),
      partialHours: Number(r.partial_hours ?? 0),
      lokasi: r.lokasi,
      keterangan: r.keterangan,
      hourMeter: num(r.hour_meter),
      kilometers: num(r.kilometers),
      partCategory: r.part_category,
      safetyIncident: r.safety_incident,
      woGroupId: r.wo_group_id,
      woGroupMode: r.wo_group_mode,
      grupTotal: r.grup_total === null ? null : Number(r.grup_total),
      grupSelesai: r.grup_selesai === null ? null : Number(r.grup_selesai),
      tim,
      /* KMB V2 menaruh `pending_transfer` di tab Assigned lewat cabang default
         `_statusToGroup` (`:672`), lengkap dengan tombol Kirim-nya. Di sini
         WO-nya TETAP di tab Assigned — kalau disembunyikan, mekanik mengira
         WO-nya hilang — tapi tombol kirimnya dimatikan: mesin transisi kita
         tidak mengizinkan `pending_transfer` → `pending_supervisor`, jadi
         tombol itu dijamin gagal. Tombol yang pasti gagal lebih buruk daripada
         tombol yang mati dengan keterangan. */
      bolehKirim: r.status === 'pending_mechanic_work' || r.status === 'in_progress',
    };
  });
}

/**
 * Identitas orang yang WO-nya sedang dilihat, untuk spanduk "Viewing As".
 * `null` bila tak ditemukan atau di luar scope penonton.
 */
export async function mekanikDilihat(
  tenantId: number,
  mechanicId: number,
): Promise<{ id: number; nama: string; peran: string } | null> {
  const r = (
    await sql<{ id: number; nama: string; peran: string }[]>`
      SELECT id, name AS nama, role::text AS peran
        FROM mechanics
       WHERE id = ${mechanicId} AND tenant_id = ${tenantId} AND is_active
    `
  )[0];
  return r ? { id: Number(r.id), nama: r.nama, peran: r.peran } : null;
}

/**
 * Apakah penonton boleh melihat WO mekanik lain (impersonate `?as=`).
 *
 * Port dari `getMyAssignedWOs:30-40`: hanya approver, dan hanya dalam scope
 * cluster-nya. Mekanik yang mencoba `?as=` orang lain ditolak.
 */
export async function bolehLihatMekanikLain(
  penontonId: number,
  targetId: number,
): Promise<boolean> {
  const scope = await sql<{ section: string }[]>`
    SELECT section::text FROM mechanic_sections WHERE mechanic_id = ${penontonId}
  `;
  if (scope.length === 0) return true;   // tanpa baris scope = lihat semuanya

  /* Aturan yang sama dengan Monitoring (`kueriMonitoring.ts`) dan skema
     (`db/schema.sql:103`): mekanik yang TIDAK punya baris section sama sekali
     terlihat oleh semua approver. Kalau aturan ini beda di dua layar, orang
     yang sama muncul di kartu Monitoring tapi "Buka →"-nya ditolak. */
  const cocok = await sql<{ ada: boolean }[]>`
    SELECT (
      NOT EXISTS (SELECT 1 FROM mechanic_sections s WHERE s.mechanic_id = ${targetId})
      OR EXISTS (SELECT 1 FROM mechanic_sections s
                  WHERE s.mechanic_id = ${targetId}
                    AND s.section::text = ANY(${scope.map((s) => s.section)}::text[]))
    ) AS ada
  `;
  return cocok[0]?.ada === true;
}

import { sql, type Tx } from '../lib/db.js';
import { aturanBisnis, tidakDitemukan } from '../lib/errors.js';
import { jalankanPerintah, type HasilPerintah } from './runCommand.js';
import { pastikanAdmin } from './admin.js';
import { bulatkan, rupiahUntukPoin } from './scoring.js';
import {
  pastikanPratinjauMasihBerlaku, rangkumDampak,
  type BarisDampak, type DampakSurut,
} from './surutBersama.js';

/**
 * TERAPKAN SURUT — NILAI FAKTOR.
 *
 * Lebih luas jangkauannya daripada base point job, dan itu yang membuatnya lebih
 * berbahaya: satu baris faktor menyentuh SETIAP section sekaligus. Mengubah
 * `work_condition.difficult` dari 1,2 ke 1,3 menggeser tiap WO shift malam yang
 * pernah disetujui — field, workshop, tyreman, semuanya.
 *
 * ── MENCOCOKKAN KEMBALI KUNCI FAKTORNYA ─────────────────────────────────────
 * `scoring_snapshots` membekukan NILAI faktornya, bukan kuncinya. Jadi untuk
 * tahu WO mana yang dulu memakai `difficult`, kuncinya harus dicari lagi dari
 * tempat asalnya masing-masing:
 *
 *   timeliness      `scoring_snapshots.timeliness_status` — satu-satunya yang
 *                   kuncinya memang ikut dibekukan.
 *   work_condition  `work_orders.work_condition`, DITIMPA override bila ada.
 *                   Urutan menangnya sama dengan nilaiEfektif(): L2 lalu L1.
 *   safety          `work_orders.safety_incident` → incident / no_incident.
 *   mtbf            `work_orders.mtbf_redo_status`. NULL berarti faktornya tidak
 *                   pernah diambil dari tabel sama sekali (hitungSkor memakai
 *                   1,0), jadi WO itu TIDAK terpengaruh perubahan faktor mtbf.
 *
 * ── KENAPA OVERRIDE APPROVER TIDAK DILEWATI DI SINI ─────────────────────────
 * Pada base point job, WO yang angkanya pernah ditetapkan approver dilewati:
 * itu penilaian orang atas satu pekerjaan tertentu.
 *
 * Faktor berbeda. Approver bisa meng-override KONDISI KERJA sebuah WO ("ini
 * sebenarnya shift 2"), tapi ia tidak pernah menetapkan BERAPA pengali shift 2.
 * Pengalinya kebijakan, bukan penilaian per-WO. Maka perubahan kebijakan memang
 * harus sampai ke WO itu juga — yang dihormati adalah pilihan kuncinya, dan itu
 * sebabnya kunci di atas dibaca SESUDAH override diterapkan.
 */

const JENIS_SAH = ['work_condition', 'timeliness', 'safety', 'mtbf'] as const;

interface BarisMentah {
  wo_id: number;
  disetujui: Date | null;
  base_points: string;
  unit_factor: string;
  work_condition_factor: string;
  timeliness_factor: string;
  safety_factor: string;
  mtbf_factor: string;
  final_points: string;
  /** Kunci faktor yang BERLAKU untuk WO ini, sesudah override diperhitungkan. */
  kunci: string | null;
}

/** Kolom snapshot mana yang diganti untuk tiap jenis faktor. */
const KOLOM: Record<string, keyof BarisMentah> = {
  work_condition: 'work_condition_factor',
  timeliness: 'timeliness_factor',
  safety: 'safety_factor',
  mtbf: 'mtbf_factor',
};

async function hitung(
  db: Tx, tenantId: number, faktorId: number, nilaiBaru: number,
): Promise<{ dampak: DampakSurut; baris: (BarisDampak & { poinBaruStr: string })[] }> {
  const f = (
    await db<{ jenis: string; kunci: string; nilai: string; ket: string | null }[]>`
      SELECT factor_type::text AS jenis, factor_key::text AS kunci,
             factor_value AS nilai, description AS ket
        FROM factors WHERE id = ${faktorId} AND tenant_id = ${tenantId}
    `
  )[0];
  if (!f) throw tidakDitemukan('Faktor', faktorId);
  if (!JENIS_SAH.includes(f.jenis as (typeof JENIS_SAH)[number])) {
    throw aturanBisnis(`Jenis faktor "${f.jenis}" tidak dikenal perhitungan surut.`);
  }

  /* Kunci yang berlaku dicari di SQL, supaya urutan menang override tidak perlu
     ditulis ulang dalam TypeScript untuk kedua kalinya. L2 menang atas L1;
     baris yang ADA berarti level itu pernah menyentuh.

     Penyaringannya juga di SQL, bukan di TypeScript. Membaca SELURUH WO approved
     lalu membuang yang tidak cocok baik-baik saja pada 60 WO basis data
     pengembangan, dan tidak baik sama sekali pada riwayat KMB yang sesungguhnya. */
  const kena = await db<BarisMentah[]>`
    SELECT * FROM (
      SELECT w.id AS wo_id, coalesce(w.approved_l2_at, w.created_at) AS disetujui,
             s.base_points, s.unit_factor, s.work_condition_factor,
             s.timeliness_factor, s.safety_factor, s.mtbf_factor, s.final_points,
             CASE ${f.jenis}
               WHEN 'timeliness' THEN s.timeliness_status::text
               WHEN 'safety' THEN CASE WHEN w.safety_incident THEN 'incident'
                                       ELSE 'no_incident' END
               WHEN 'mtbf' THEN w.mtbf_redo_status::text
               WHEN 'work_condition' THEN coalesce(ov.nilai, w.work_condition::text)
             END AS kunci
        FROM work_orders w
        JOIN scoring_snapshots s ON s.work_order_id = w.id
        LEFT JOIN LATERAL (
          SELECT o.value #>> '{}' AS nilai
            FROM work_order_overrides o
           WHERE o.work_order_id = w.id AND o.kind = 'work_condition'
           ORDER BY (o.level = 'superintendent') DESC
           LIMIT 1
        ) ov ON true
       WHERE w.tenant_id = ${tenantId} AND w.status = 'approved'
    ) t
     WHERE t.kunci = ${f.kunci}
     ORDER BY t.wo_id
  `;

  const kolom = KOLOM[f.jenis]!;

  const bayar = new Map<number, { idrPerPoint: number; idrValue: number }[]>();
  if (kena.length > 0) {
    const ids = kena.map((m) => m.wo_id);
    for (const r of await db<{
      work_order_id: number; idr_per_point: string; idr_value: string;
    }[]>`
      SELECT work_order_id, idr_per_point, idr_value
        FROM mechanic_points WHERE work_order_id = ANY(${ids}::bigint[])
    `) {
      const d = bayar.get(r.work_order_id) ?? [];
      d.push({ idrPerPoint: Number(r.idr_per_point), idrValue: Number(r.idr_value) });
      bayar.set(r.work_order_id, d);
    }
  }

  const baris = kena.map((m) => {
    /* Faktor lain tetap dari snapshot — yang diganti HANYA yang satu ini.
       Ini menjawab "seandainya pengalinya sejak dulu segini", bukan menghitung
       ulang seluruh dunia dengan keadaan hari ini. */
    const f2 = (k: keyof BarisMentah) =>
      (k === kolom ? nilaiBaru : Number(m[k] as string));
    const poinBaru = bulatkan(
      Number(m.base_points) * Number(m.unit_factor)
      * f2('work_condition_factor') * f2('timeliness_factor')
      * f2('safety_factor') * f2('mtbf_factor'),
      2,
    );
    const anggota = bayar.get(m.wo_id) ?? [];
    return {
      woId: m.wo_id,
      disetujui: m.disetujui ?? new Date(),
      poinLama: Number(m.final_points),
      poinBaru,
      poinBaruStr: String(poinBaru),
      rupiahLama: anggota.reduce((a, x) => a + x.idrValue, 0),
      rupiahBaru: anggota.reduce((a, x) => a + rupiahUntukPoin(poinBaru, x.idrPerPoint), 0),
      orang: anggota.length,
    };
  });

  const catatan: string[] = [];
  if (f.jenis === 'safety' && f.kunci === 'incident') {
    catatan.push(
      'Faktor insiden mengalikan SELURUH poin WO. Menaikkannya dari nol berarti '
      + 'menghidupkan kembali bayaran WO yang dulu dinolkan karena kecelakaan.',
    );
  }
  if (f.jenis === 'mtbf') {
    /* WO tanpa status MTBF memakai pengali 1,0 bawaan `hitungSkor` — angkanya
       tidak pernah diambil dari tabel faktor sama sekali, jadi ia tidak ikut
       bergerak. Disebut supaya selisih antara "WO approved" dan "WO terpengaruh"
       tidak terlihat seperti ada yang terlewat. */
    const tanpa = (
      await db<{ n: number }[]>`
        SELECT count(*)::int AS n FROM work_orders w
         JOIN scoring_snapshots s ON s.work_order_id = w.id
         WHERE w.tenant_id = ${tenantId} AND w.status = 'approved'
           AND w.mtbf_redo_status IS NULL`
    )[0]!.n;
    if (tanpa > 0) {
      catatan.push(
        `${tanpa} WO approved tidak punya status MTBF sama sekali dan memakai `
        + 'pengali 1,0 bawaan — WO itu tidak ikut bergerak.',
      );
    }
  }
  catatan.push(
    'Faktor berlaku LINTAS SECTION: satu baris ini menyentuh field, workshop, '
    + 'dan tyreman sekaligus.',
  );

  return {
    dampak: rangkumDampak(baris, {
      judul: `${f.jenis} · ${f.kunci}${f.ket ? ` — ${f.ket}` : ''}`,
      perubahan: [{ label: 'Nilai faktor', lama: String(Number(f.nilai)), baru: String(nilaiBaru) }],
      catatan,
    }),
    baris,
  };
}

export async function pratinjauFaktorSurut(
  tenantId: number, faktorId: number, nilaiBaru: number,
): Promise<DampakSurut> {
  if (!Number.isFinite(nilaiBaru) || nilaiBaru < 0) {
    throw aturanBisnis('Nilai faktor tidak boleh negatif');
  }
  return sql.begin(
    async (tx) => (await hitung(tx, tenantId, faktorId, nilaiBaru)).dampak,
  ) as Promise<DampakSurut>;
}

export interface MasukanFaktorSurut {
  opId: string;
  tenantId: number;
  actorId: number;
  faktorId: number;
  nilaiBaru: number;
  rupiahSesudahDilihat: number;
}

export async function terapkanFaktorSurut(
  m: MasukanFaktorSurut,
): Promise<HasilPerintah<{
  faktorId: number; woDihitungUlang: number;
  rupiahSebelum: number; rupiahSesudah: number;
}>> {
  return jalankanPerintah({
    opId: m.opId, tenantId: m.tenantId, actorId: m.actorId, action: 'terapkan_faktor_surut',
    jalankan: async ({ tx }) => {
      await pastikanAdmin(tx, m.actorId);
      if (!Number.isFinite(m.nilaiBaru) || m.nilaiBaru < 0) {
        throw aturanBisnis('Nilai faktor tidak boleh negatif');
      }

      const { dampak, baris } = await hitung(tx, m.tenantId, m.faktorId, m.nilaiBaru);
      pastikanPratinjauMasihBerlaku(dampak.rupiahSesudah, m.rupiahSesudahDilihat);

      const f = (
        await tx<{ jenis: string; kunci: string; nilai: string }[]>`
          SELECT factor_type::text AS jenis, factor_key::text AS kunci, factor_value AS nilai
            FROM factors WHERE id = ${m.faktorId} AND tenant_id = ${m.tenantId}
        `
      )[0]!;

      await tx`UPDATE factors SET factor_value = ${m.nilaiBaru} WHERE id = ${m.faktorId}`;

      if (baris.length > 0) {
        const ids = baris.map((b) => b.woId);
        const poin = baris.map((b) => b.poinBaruStr);
        const kolom = KOLOM[f.jenis]!;

        /* Kolom snapshot yang diganti ditentukan jenis faktornya. Ia TIDAK bisa
           disisipkan sebagai parameter — nama kolom bukan nilai — jadi
           percabangannya ditulis apa adanya. Empat cabang yang jujur lebih baik
           daripada satu string SQL yang dirangkai. */
        if (kolom === 'work_condition_factor') {
          await tx`UPDATE scoring_snapshots SET work_condition_factor = ${m.nilaiBaru}
                    WHERE work_order_id = ANY(${ids}::bigint[])`;
        } else if (kolom === 'timeliness_factor') {
          await tx`UPDATE scoring_snapshots SET timeliness_factor = ${m.nilaiBaru}
                    WHERE work_order_id = ANY(${ids}::bigint[])`;
        } else if (kolom === 'safety_factor') {
          await tx`UPDATE scoring_snapshots SET safety_factor = ${m.nilaiBaru}
                    WHERE work_order_id = ANY(${ids}::bigint[])`;
        } else {
          await tx`UPDATE scoring_snapshots SET mtbf_factor = ${m.nilaiBaru}
                    WHERE work_order_id = ANY(${ids}::bigint[])`;
        }

        await tx`
          UPDATE scoring_snapshots s SET final_points = v.poin
            FROM unnest(${ids}::bigint[], ${poin}::numeric[]) AS v(wo_id, poin)
           WHERE s.work_order_id = v.wo_id
        `;
        await tx`
          UPDATE mechanic_points p SET points = v.poin
            FROM unnest(${ids}::bigint[], ${poin}::numeric[]) AS v(wo_id, poin)
           WHERE p.work_order_id = v.wo_id
        `;
        await tx`
          UPDATE work_orders w SET final_points = v.poin
            FROM unnest(${ids}::bigint[], ${poin}::numeric[]) AS v(wo_id, poin)
           WHERE w.id = v.wo_id
        `;
      }

      await tx`
        INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, actor_id, details)
        VALUES (${m.tenantId}, 'terapkan_faktor_surut', 'factor', ${String(m.faktorId)},
                ${m.actorId},
                ${tx.json({
                  jenis: f.jenis, kunci: f.kunci,
                  nilai: { lama: Number(f.nilai), baru: m.nilaiBaru },
                  rupiah: { sebelum: dampak.rupiahSekarang, sesudah: dampak.rupiahSesudah },
                  periode: dampak.periode,
                  wo: baris.map((b) => ({
                    id: b.woId,
                    poin: { lama: b.poinLama, baru: b.poinBaru },
                    rupiah: { lama: b.rupiahLama, baru: b.rupiahBaru },
                  })),
                } as never)})
      `;

      return {
        faktorId: m.faktorId,
        woDihitungUlang: baris.length,
        rupiahSebelum: dampak.rupiahSekarang,
        rupiahSesudah: dampak.rupiahSesudah,
      };
    },
  });
}

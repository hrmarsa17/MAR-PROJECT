import { sql, type Tx } from '../lib/db.js';
import { aturanBisnis, tidakDitemukan } from '../lib/errors.js';
import { jalankanPerintah, type HasilPerintah } from './runCommand.js';
import { pastikanAdmin } from './admin.js';
import { rupiahUntukPoin } from './scoring.js';
import {
  pastikanPratinjauMasihBerlaku, rangkumDampak,
  type BarisDampak, type DampakSurut,
} from './surutBersama.js';

/**
 * TERAPKAN SURUT — TARIF PER POIN.
 *
 * Inilah tindakan yang persis pernah terjadi di SUM pada 9 Sep 2026 dan
 * menggeser pembayaran sebesar -Rp 17,6 juta. Di sana ia terjadi TANPA ADA YANG
 * MEMINTANYA: laporan payroll membaca ulang tabel tarif setiap kali disusun,
 * jadi satu penyuntingan tarif diam-diam menulis ulang sejarah.
 *
 * Di sini ia tidak bisa terjadi tanpa sengaja — `mechanic_points.idr_per_point`
 * disalin saat poin terbit, dan `idr_value` kolom GENERATED daripadanya. Yang
 * ada hanyalah perintah ini, terpisah, dengan pratinjau rupiah.
 *
 * ── POINNYA TIDAK DISENTUH, HANYA HARGANYA ──────────────────────────────────
 * Perintah ini tidak menghitung ulang skor apa pun. `scoring_snapshots` dan
 * `final_points` tetap apa adanya — yang berubah cuma berapa rupiah satu poin
 * dihargai. Karena itu ia satu-satunya surut yang tidak menyentuh snapshot.
 *
 * ── KEPUTUSAN YANG HARUS DIKETAHUI: BARIS MANA YANG IKUT ────────────────────
 * `mechanic_points` menyimpan ANGKA tarifnya, bukan baris tarif mana asalnya.
 * Jadi "semua baris yang dibayar dengan tarif ini" tidak bisa dijawab dengan
 * pasti. Yang dipakai di sini: **baris milik orang yang SEKARANG bertarif ini.**
 *
 * Akibatnya yang harus disadari: mekanik yang bulan lalu Junior lalu naik jadi
 * Senior akan ikut terbawa saat tarif SENIOR diubah — termasuk WO-nya sewaktu
 * masih Junior. Itu memang arti "seandainya tarif ini sejak dulu segini" bagi
 * orang yang sekarang memegangnya, tapi ia bukan satu-satunya bacaan yang
 * masuk akal.
 *
 * Karena itu pratinjau MENGHITUNG dan MENYEBUT berapa baris yang tarif bekunya
 * berbeda dari tarif baris ini — merekalah yang paling terpengaruh bacaan itu.
 * Angkanya diperlihatkan sebelum tombolnya bisa ditekan.
 */

interface BarisMentah {
  work_order_id: number;
  mechanic_id: number;
  nama: string;
  disetujui: Date | null;
  points: string;
  idr_per_point: string;
  idr_value: string;
  final_points: string;
}

async function hitung(
  db: Tx, tenantId: number, tarifId: number, idrBaru: number,
): Promise<{
  dampak: DampakSurut;
  baris: { woId: number; mechanicId: number }[];
  orangRingkas: { nama: string; baris: number; lama: number; baru: number }[];
}> {
  const t = (
    await db<{ posisi: string; label: string; idr_per_point: string }[]>`
      SELECT position::text AS posisi, label, idr_per_point
        FROM pay_rates WHERE id = ${tarifId} AND tenant_id = ${tenantId}
    `
  )[0];
  if (!t) throw tidakDitemukan('Tarif', tarifId);

  const mentah = await db<BarisMentah[]>`
    SELECT mp.work_order_id, mp.mechanic_id, m.name AS nama,
           coalesce(w.approved_l2_at, w.created_at) AS disetujui,
           mp.points, mp.idr_per_point, mp.idr_value, w.final_points
      FROM mechanic_points mp
      JOIN mechanics m ON m.id = mp.mechanic_id
      JOIN work_orders w ON w.id = mp.work_order_id
     WHERE m.pay_rate_id = ${tarifId} AND m.tenant_id = ${tenantId}
       AND w.status = 'approved'
     ORDER BY mp.work_order_id, mp.mechanic_id
  `;

  /* Satu WO bisa punya beberapa anggota bertarif sama. Laporan dikelompokkan
     PER WO supaya "berapa WO terpengaruh" berarti apa yang orang kira, sementara
     `orang` tetap menghitung baris pembayarannya. */
  const perWo = new Map<number, BarisDampak>();
  for (const r of mentah) {
    const lama = Number(r.idr_value);
    const baru = rupiahUntukPoin(Number(r.points), idrBaru);
    const ada = perWo.get(r.work_order_id) ?? {
      woId: r.work_order_id, disetujui: r.disetujui ?? new Date(),
      poinLama: Number(r.final_points), poinBaru: Number(r.final_points),
      rupiahLama: 0, rupiahBaru: 0, orang: 0,
    };
    ada.rupiahLama += lama;
    ada.rupiahBaru += baru;
    ada.orang += 1;
    perWo.set(r.work_order_id, ada);
  }

  const perOrang = new Map<string, { nama: string; baris: number; lama: number; baru: number }>();
  for (const r of mentah) {
    const o = perOrang.get(r.nama) ?? { nama: r.nama, baris: 0, lama: 0, baru: 0 };
    o.baris += 1;
    o.lama += Number(r.idr_value);
    o.baru += rupiahUntukPoin(Number(r.points), idrBaru);
    perOrang.set(r.nama, o);
  }

  const catatan: string[] = [
    'Poin tidak disentuh — yang berubah hanya berapa rupiah satu poin dihargai.',
  ];
  /* Baris yang tarif bekunya BERBEDA dari tarif baris ini: orangnya dibayar
     dengan tarif lain saat poin itu terbit (biasanya karena ia naik grade).
     Merekalah yang paling terdampak cara pencocokan ini, jadi jumlahnya disebut
     sebelum tombolnya bisa ditekan. */
  const pindahGrade = mentah.filter((r) => Number(r.idr_per_point) !== Number(t.idr_per_point));
  if (pindahGrade.length > 0) {
    const nama = [...new Set(pindahGrade.map((r) => r.nama))];
    catatan.push(
      `${pindahGrade.length} baris dibayar dengan tarif LAIN saat poinnya terbit `
      + `(${nama.slice(0, 3).join(', ')}${nama.length > 3 ? `, dan ${nama.length - 3} lagi` : ''}) `
      + '— kemungkinan besar karena pindah grade. Baris itu ikut dihargai ulang '
      + 'dengan tarif ini, karena yang dicocokkan adalah grade orangnya SEKARANG.',
    );
  }
  catatan.push(
    'Yang dicocokkan adalah orang yang SEKARANG bertarif ini — bukan baris yang '
    + 'dulu dibayar dengan angka ini.',
  );

  return {
    dampak: rangkumDampak([...perWo.values()], {
      judul: `${t.label} (${t.posisi})`,
      perubahan: [{
        label: 'Rupiah per poin',
        lama: String(Number(t.idr_per_point)),
        baru: String(idrBaru),
      }],
      catatan,
    }),
    baris: mentah.map((r) => ({ woId: r.work_order_id, mechanicId: r.mechanic_id })),
    orangRingkas: [...perOrang.values()].sort((a, b) => b.baru - b.lama - (a.baru - a.lama)),
  };
}

export interface PratinjauTarif extends DampakSurut {
  orangRingkas: { nama: string; baris: number; lama: number; baru: number }[];
}

export async function pratinjauTarifSurut(
  tenantId: number, tarifId: number, idrBaru: number,
): Promise<PratinjauTarif> {
  if (!Number.isFinite(idrBaru) || idrBaru <= 0) {
    throw aturanBisnis('Rupiah per poin harus lebih dari 0');
  }
  return sql.begin(async (tx) => {
    const h = await hitung(tx, tenantId, tarifId, idrBaru);
    return { ...h.dampak, orangRingkas: h.orangRingkas };
  }) as Promise<PratinjauTarif>;
}

export interface MasukanTarifSurut {
  opId: string;
  tenantId: number;
  actorId: number;
  tarifId: number;
  idrBaru: number;
  rupiahSesudahDilihat: number;
}

export async function terapkanTarifSurut(
  m: MasukanTarifSurut,
): Promise<HasilPerintah<{
  tarifId: number; barisDihargaiUlang: number;
  rupiahSebelum: number; rupiahSesudah: number;
}>> {
  return jalankanPerintah({
    opId: m.opId, tenantId: m.tenantId, actorId: m.actorId, action: 'terapkan_tarif_surut',
    jalankan: async ({ tx }) => {
      await pastikanAdmin(tx, m.actorId);
      if (!Number.isFinite(m.idrBaru) || m.idrBaru <= 0) {
        throw aturanBisnis('Rupiah per poin harus lebih dari 0');
      }

      const { dampak, baris, orangRingkas } = await hitung(tx, m.tenantId, m.tarifId, m.idrBaru);
      pastikanPratinjauMasihBerlaku(dampak.rupiahSesudah, m.rupiahSesudahDilihat);

      const lama = (
        await tx<{ idr_per_point: string; position: string; label: string }[]>`
          SELECT idr_per_point, position::text, label FROM pay_rates
           WHERE id = ${m.tarifId} AND tenant_id = ${m.tenantId}
        `
      )[0]!;

      await tx`
        UPDATE pay_rates SET idr_per_point = ${m.idrBaru}, updated_at = now()
         WHERE id = ${m.tarifId}
      `;

      if (baris.length > 0) {
        /* `idr_value` kolom GENERATED dari points × idr_per_point, jadi ia ikut
           dihitung ulang sendiri. Poinnya TIDAK disentuh — snapshot tetap utuh. */
        const wo = baris.map((b) => b.woId);
        const mek = baris.map((b) => b.mechanicId);
        await tx`
          UPDATE mechanic_points p SET idr_per_point = ${m.idrBaru}
            FROM unnest(${wo}::bigint[], ${mek}::int[]) AS v(wo_id, mekanik_id)
           WHERE p.work_order_id = v.wo_id AND p.mechanic_id = v.mekanik_id
        `;
      }

      await tx`
        INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, actor_id, details)
        VALUES (${m.tenantId}, 'terapkan_tarif_surut', 'pay_rate', ${String(m.tarifId)},
                ${m.actorId},
                ${tx.json({
                  posisi: lama.position, label: lama.label,
                  idr_per_point: { lama: Number(lama.idr_per_point), baru: m.idrBaru },
                  baris_dihargai_ulang: baris.length,
                  rupiah: { sebelum: dampak.rupiahSekarang, sesudah: dampak.rupiahSesudah },
                  periode: dampak.periode,
                  orang: orangRingkas,
                } as never)})
      `;

      return {
        tarifId: m.tarifId,
        barisDihargaiUlang: baris.length,
        rupiahSebelum: dampak.rupiahSekarang,
        rupiahSesudah: dampak.rupiahSesudah,
      };
    },
  });
}

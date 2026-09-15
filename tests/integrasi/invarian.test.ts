import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from '../../src/lib/db.js';
import { GalatAplikasi } from '../../src/lib/errors.js';
import { approveL2, batalkanWo } from '../../src/domain/approval.js';
import { buatWorkOrder } from '../../src/domain/workOrder.js';
import {
  bersihkanTransaksi,
  siapkanBekal,
  siapkanWoSampaiL2,
  type Bekal,
} from './bekal.js';

/**
 * UJI INVARIAN — melawan Postgres sungguhan.
 *
 * Uji di berkas ini tidak memeriksa "apakah kodenya jalan". Ia memeriksa hal
 * yang di KMB V2 BENAR-BENAR PERNAH GAGAL, dan memastikan kegagalan itu
 * sekarang mustahil — bukan karena kita berhati-hati, melainkan karena basis
 * datanya menolak.
 */

let b: Bekal;

beforeAll(async () => {
  await bersihkanTransaksi();
  b = await siapkanBekal();
});

beforeEach(async () => {
  await bersihkanTransaksi();
});

afterAll(async () => {
  await sql.end();
});

const opId = (nama: string) => `uji-${nama}-${Math.random().toString(36).slice(2, 12)}`;

// ───────────────────────────────────────────────────────────────────────────
describe('dua approver menekan bersamaan', () => {
  it('hanya satu yang berhasil; satunya dapat KONFLIK, bukan galat teknis', async () => {
    const wo = await siapkanWoSampaiL2(b);

    // Dua permintaan sungguhan, dua koneksi, op_id BERBEDA — inilah yang
    // di KMB V2 dijaga LockService, dan tetap bocor bila eksekusi mati
    // di antara "ubah status" dan "tulis poin".
    const hasil = await Promise.allSettled([
      approveL2({ opId: opId('a'), tenantId: b.tenantId, actorId: b.superintendent, woId: wo }),
      approveL2({ opId: opId('b'), tenantId: b.tenantId, actorId: b.superintendent, woId: wo }),
    ]);

    const sukses = hasil.filter((h) => h.status === 'fulfilled');
    const gagal = hasil.filter((h) => h.status === 'rejected');

    expect(sukses).toHaveLength(1);
    expect(gagal).toHaveLength(1);

    const galat = (gagal[0] as PromiseRejectedResult).reason as GalatAplikasi;
    expect(galat).toBeInstanceOf(GalatAplikasi);
    expect(galat.kode).toBe('KONFLIK_KEADAAN');
    // Pesannya harus bisa dibaca approver kedua, bukan jejak tumpukan.
    expect(galat.message).toMatch(/sudah disetujui/i);
  });

  it('mekanik dibayar TEPAT SEKALI walau dua approve bersamaan', async () => {
    const wo = await siapkanWoSampaiL2(b, { tim: [b.mekanikA, b.mekanikB] });

    await Promise.allSettled([
      approveL2({ opId: opId('c'), tenantId: b.tenantId, actorId: b.superintendent, woId: wo }),
      approveL2({ opId: opId('d'), tenantId: b.tenantId, actorId: b.superintendent, woId: wo }),
    ]);

    const poin = await sql<{ mechanic_id: number; points: string; idr_value: string }[]>`
      SELECT mechanic_id, points, idr_value FROM mechanic_points WHERE work_order_id = ${wo}
    `;
    // Dua anggota tim, dua baris. Bukan tiga, bukan empat.
    expect(poin).toHaveLength(2);

    const snapshot = await sql`SELECT 1 FROM scoring_snapshots WHERE work_order_id = ${wo}`;
    expect(snapshot).toHaveLength(1);

    const approval = await sql`
      SELECT 1 FROM approvals WHERE work_order_id = ${wo} AND stage = 'superintendent'
    `;
    expect(approval).toHaveLength(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('kiriman terulang', () => {
  it('op_id sama dikirim 10x berbarengan menghasilkan SATU WO', async () => {
    // Inilah kejadian 12 Agu 2026: 17 WO borongan masuk semua, jawabannya
    // putus di jalan, pembuat menekan kirim lagi. Dari layar, "gagal" dan
    // "berhasil tapi jawabannya hilang" terlihat persis sama.
    const op = opId('ulang');
    const kirim = () =>
      buatWorkOrder({
        opId: op,
        tenantId: b.tenantId,
        actorId: b.supervisor,
        sectionCode: 'field',
        blok: [{ jobId: b.jobId, unitId: b.unitId, teamMechanicIds: [b.mekanikA] }],
      });

    const hasil = await Promise.all(Array.from({ length: 10 }, kirim));

    const jumlahWo = await sql<{ n: string }[]>`SELECT count(*) n FROM work_orders`;
    expect(Number(jumlahWo[0]!.n)).toBe(1);

    // Sembilan di antaranya adalah pengulangan yang dilayani struk.
    expect(hasil.filter((h) => h.diulang)).toHaveLength(9);
    // Dan semuanya menerima nomor WO yang SAMA — pemanggil tidak pernah tahu
    // bedanya, yang memang tujuannya.
    const nomor = new Set(hasil.map((h) => h.hasil.dibuat[0]!.woNumber));
    expect(nomor.size).toBe(1);
  });

  it('op_id berbeda memang membuat WO berbeda, dengan nomor yang tak pernah kembar', async () => {
    // 20 WO dibuat serentak. Di KMB V2 nomor diambil dari (epoch_ms % 1000):
    // 1.000 slot sehari untuk ~100 WO, dan pada 6 Agu 2026 tiga pasang WO
    // berbeda benar-benar bernomor sama — semuanya sudah dibayar.
    await Promise.all(
      Array.from({ length: 20 }, () =>
        buatWorkOrder({
          opId: opId('beda'),
          tenantId: b.tenantId,
          actorId: b.supervisor,
          sectionCode: 'field',
          blok: [{ jobId: b.jobId, unitId: b.unitId, teamMechanicIds: [b.mekanikA] }],
        }),
      ),
    );

    const hitung = await sql<{ total: string; unik: string }[]>`
      SELECT count(*) total, count(DISTINCT wo_number) unik FROM work_orders
    `;
    expect(Number(hitung[0]!.total)).toBe(20);
    expect(Number(hitung[0]!.unik)).toBe(20);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('rupiah', () => {
  it('tarif dibekukan per baris — mengubah tarif tidak menggeser yang sudah dibayar', async () => {
    const wo = await siapkanWoSampaiL2(b, { tim: [b.mekanikA] });
    await approveL2({ opId: opId('beku'), tenantId: b.tenantId, actorId: b.superintendent, woId: wo });

    const sebelum = (
      await sql<{ idr_value: string }[]>`
        SELECT idr_value FROM mechanic_points WHERE work_order_id = ${wo}
      `
    )[0]!.idr_value;

    // Naikkan tarif junior dua kali lipat, seperti kenaikan upah sungguhan.
    await sql`UPDATE pay_rates SET idr_per_point = idr_per_point * 2 WHERE position = 'junior'`;

    const sesudah = (
      await sql<{ idr_value: string }[]>`
        SELECT idr_value FROM mechanic_points WHERE work_order_id = ${wo}
      `
    )[0]!.idr_value;

    // Di KMB V2, dashboard membaca nilai beku sementara payroll menghitung
    // ulang dengan tarif saat ekspor — dua layar tak pernah cocok lagi.
    expect(sesudah).toBe(sebelum);

    await sql`UPDATE pay_rates SET idr_per_point = idr_per_point / 2 WHERE position = 'junior'`;
  });

  it('mengubah base_points katalog tidak mengubah riwayat yang sudah disetujui', async () => {
    // Gabriel menyatakan base_points akan terus disesuaikan seiring sistem
    // berjalan. Uji ini yang menjaga penyesuaian itu tidak menyentuh rupiah
    // yang sudah terbit.
    const wo = await siapkanWoSampaiL2(b);
    await approveL2({ opId: opId('katalog'), tenantId: b.tenantId, actorId: b.superintendent, woId: wo });

    const poinLama = (
      await sql<{ points: string }[]>`
        SELECT points FROM mechanic_points WHERE work_order_id = ${wo}
      `
    )[0]!.points;

    await sql`UPDATE jobs SET base_points = base_points * 5 WHERE id = ${b.jobId}`;

    const poinBaru = (
      await sql<{ points: string }[]>`
        SELECT points FROM mechanic_points WHERE work_order_id = ${wo}
      `
    )[0]!.points;
    expect(poinBaru).toBe(poinLama);

    const snap = (
      await sql<{ base_points: string }[]>`
        SELECT base_points FROM scoring_snapshots WHERE work_order_id = ${wo}
      `
    )[0]!;
    expect(Number(snap.base_points)).toBe(b.jobBasePoints);

    await sql`UPDATE jobs SET base_points = ${b.jobBasePoints} WHERE id = ${b.jobId}`;
  });

  it('membatalkan WO menol-kan poin DAN rupiah sekaligus', async () => {
    // Di KMB V2 pembatalan menol-kan points tapi melewatkan idr_value,
    // meninggalkan "rupiah hantu" yang tetap tampil terbayar di dashboard.
    // Di sini idr_value kolom turunan — ia tidak bisa tertinggal.
    const wo = await siapkanWoSampaiL2(b);
    await approveL2({ opId: opId('sebelum-batal'), tenantId: b.tenantId, actorId: b.superintendent, woId: wo });
    await batalkanWo({
      opId: opId('batal'), tenantId: b.tenantId, actorId: b.superintendent,
      woId: wo, alasan: 'salah unit, dibuat ulang',
    });

    const baris = await sql<{ points: string; idr_value: string }[]>`
      SELECT points, idr_value FROM mechanic_points WHERE work_order_id = ${wo}
    `;
    for (const r of baris) {
      expect(Number(r.points)).toBe(0);
      expect(Number(r.idr_value)).toBe(0);
    }
    const w = (
      await sql<{ status: string; final_points: string }[]>`
        SELECT status::text, final_points FROM work_orders WHERE id = ${wo}
      `
    )[0]!;
    expect(w.status).toBe('cancelled');
    expect(Number(w.final_points)).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('penjaga basis data', () => {
  it('transisi status yang tidak sah ditolak mesin, bukan diperiksa kode', async () => {
    const wo = await siapkanWoSampaiL2(b);
    // Melompat dari menunggu L2 langsung ke "sedang dikerjakan".
    await expect(
      sql`UPDATE work_orders SET status = 'in_progress' WHERE id = ${wo}`,
    ).rejects.toThrow(/Transisi status tidak sah/);
  });

  it('satu (WO, mekanik) tidak bisa punya dua baris poin', async () => {
    const wo = await siapkanWoSampaiL2(b);
    await approveL2({ opId: opId('sekali'), tenantId: b.tenantId, actorId: b.superintendent, woId: wo });

    await expect(
      sql`
        INSERT INTO mechanic_points (work_order_id, mechanic_id, section_id, points, idr_per_point)
        VALUES (${wo}, ${b.mekanikA}, ${b.sectionFieldId}, 999, 999)
      `,
    ).rejects.toThrow();
  });

  it('mekanik tidak bisa dibuat tanpa tarif — tidak ada nilai cadangan senyap', async () => {
    await expect(
      sql`
        INSERT INTO mechanics (tenant_id, mechanic_code, name, role, pay_rate_id)
        VALUES (${b.tenantId}, 'UJI-TANPA-TARIF', 'Tanpa Tarif', 'mechanic', NULL)
      `,
    ).rejects.toThrow();
  });

  it('job dari model unit lain ditolak saat pembuatan WO', async () => {
    // Di KMB V2 kecocokan ini perbandingan teks yang tidak simetris memangkas
    // spasi — satu spasi di ujung sel membuat seluruh model unit lenyap dari
    // dropdown tanpa galat apa pun.
    const unitLain = Number(
      (
        await sql<{ id: number }[]>`
          INSERT INTO units (tenant_id, unit_code, unit_name, unit_model_id, unit_factor)
          VALUES (${b.tenantId}, 'UJI-UNIT-LAIN', 'XLAIN001', NULL, 1.0)
          ON CONFLICT (tenant_id, unit_code) DO UPDATE SET unit_name = EXCLUDED.unit_name
          RETURNING id
        `
      )[0]!.id,
    );

    await expect(
      buatWorkOrder({
        opId: opId('salah-model'),
        tenantId: b.tenantId,
        actorId: b.supervisor,
        sectionCode: 'field',
        blok: [{ jobId: b.jobId, unitId: unitLain, teamMechanicIds: [b.mekanikA] }],
      }),
    ).rejects.toMatchObject({ kode: 'ATURAN_BISNIS' });
  });

  it('mekanik tidak boleh membuat WO manual yang poinnya ia ketik sendiri', async () => {
    await expect(
      buatWorkOrder({
        opId: opId('manual-mekanik'),
        tenantId: b.tenantId,
        actorId: b.mekanikA,
        sectionCode: 'field',
        blok: [{
          unitId: b.unitId,
          teamMechanicIds: [b.mekanikA],
          manual: { description: 'pekerjaan di luar katalog', basePoints: 999, targetHours: 1, unitFactor: 1 },
        }],
      }),
    ).rejects.toMatchObject({ kode: 'TIDAK_BERHAK' });
  });
});

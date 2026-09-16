import { sql } from '../lib/db.js';

/**
 * KESEHATAN SISTEM.
 *
 * Pengganti "pandang mata di sheet". Di KMB V2, Gabriel melihat ada yang salah
 * dengan MEMBUKA spreadsheet-nya: baris yang kosong, angka yang aneh, antrean
 * yang menumpuk. `HealthCheck.js` di sana memeriksa keberadaan sheet, skema,
 * dan izin — hal-hal yang di Postgres dijamin skema, jadi tidak perlu ditiru.
 *
 * Yang DIPERIKSA di sini adalah hal yang basis data TIDAK bisa jamin sendiri:
 * keadaan yang sah secara skema tapi salah secara bisnis. Setiap butir menyebut
 * APA yang harus dilakukan, bukan cuma bahwa ada yang salah — laporan yang
 * berbunyi "3 anomali" tanpa mengatakan anomali apa cuma memindahkan pekerjaan.
 */

export type Tingkat = 'baik' | 'awas' | 'salah';

export interface Butir {
  tingkat: Tingkat;
  judul: string;
  keterangan: string;
  jumlah?: number;
}

export interface Kesehatan {
  butir: Butir[];
  ringkas: { baik: number; awas: number; salah: number };
  diperiksaAt: string;
}

export async function periksaKesehatan(tenantId: number): Promise<Kesehatan> {
  const satu = async (q: Promise<{ n: string }[]>) => Number((await q)[0]?.n ?? 0);

  const [
    tanpaTim, approvedTanpaPoin, poinBedaSnapshot, tokenTanpaOrang,
    orangTanpaToken, transferMenggantung, antreanTua, opLama,
    jobTanpaBase, unitTanpaFaktor, orangTanpaTarif, adminAktif, kembar,
  ] = await Promise.all([
    /* WO tanpa satu pun anggota tim: tidak akan pernah bisa dikerjakan siapa
       pun, dan tidak akan pernah membayar siapa pun. Skema membolehkannya. */
    satu(sql<{ n: string }[]>`
      SELECT count(*) AS n FROM work_orders w
       WHERE w.tenant_id = ${tenantId}
         AND w.status NOT IN ('cancelled','rejected')
         AND NOT EXISTS (SELECT 1 FROM work_order_team t WHERE t.work_order_id = w.id)
    `),
    /* Approved tapi tak ada poinnya = "WO hilang" versi paling berbahaya:
       pekerjaannya diakui, uangnya tidak pernah terbit. */
    satu(sql<{ n: string }[]>`
      SELECT count(*) AS n FROM work_orders w
       WHERE w.tenant_id = ${tenantId} AND w.status = 'approved'
         AND NOT EXISTS (SELECT 1 FROM mechanic_points p WHERE p.work_order_id = w.id)
    `),
    /* Poin yang tidak cocok dengan snapshot-nya: salah satunya berbohong, dan
       yang dibayar adalah poinnya. */
    satu(sql<{ n: string }[]>`
      SELECT count(*) AS n FROM mechanic_points p
       JOIN scoring_snapshots s ON s.work_order_id = p.work_order_id
       JOIN work_orders w ON w.id = p.work_order_id
      WHERE w.tenant_id = ${tenantId} AND p.points <> s.final_points
    `),
    satu(sql<{ n: string }[]>`
      SELECT count(*) AS n FROM api_tokens t
       WHERE t.tenant_id = ${tenantId}
         AND NOT EXISTS (SELECT 1 FROM mechanics m
                          WHERE m.id = t.mechanic_id AND m.is_active)
    `),
    satu(sql<{ n: string }[]>`
      SELECT count(*) AS n FROM mechanics m
       WHERE m.tenant_id = ${tenantId} AND m.is_active AND m.role = 'mechanic'
         AND NOT EXISTS (SELECT 1 FROM api_tokens t WHERE t.mechanic_id = m.id)
    `),
    satu(sql<{ n: string }[]>`
      SELECT count(*) AS n FROM work_order_transfers tr
       JOIN work_orders w ON w.id = tr.work_order_id
      WHERE w.tenant_id = ${tenantId} AND tr.decision IS NULL
        AND tr.requested_at < now() - interval '2 days'
    `),
    satu(sql<{ n: string }[]>`
      SELECT count(*) AS n FROM work_orders
       WHERE tenant_id = ${tenantId}
         AND status IN ('pending_supervisor','pending_superintendent')
         AND submitted_at < now() - interval '7 days'
    `),
    /* `processed_ops` yang menumpuk melewati retensinya: bukan bahaya, tapi
       tabel struk yang tak pernah dipangkas akan jadi tabel terbesar. */
    satu(sql<{ n: string }[]>`
      SELECT count(*) AS n FROM processed_ops
       WHERE tenant_id = ${tenantId} AND created_at < now() - interval '30 days'
    `),
    satu(sql<{ n: string }[]>`
      SELECT count(*) AS n FROM jobs
       WHERE tenant_id = ${tenantId} AND is_active AND base_points <= 0
    `),
    satu(sql<{ n: string }[]>`
      SELECT count(*) AS n FROM units
       WHERE tenant_id = ${tenantId} AND is_active AND NOT is_virtual
         AND unit_factor <= 0
    `),
    satu(sql<{ n: string }[]>`
      SELECT count(*) AS n FROM mechanics m
       JOIN pay_rates r ON r.id = m.pay_rate_id
      WHERE m.tenant_id = ${tenantId} AND m.is_active AND NOT r.is_active
    `),
    satu(sql<{ n: string }[]>`
      SELECT count(*) AS n FROM mechanics
       WHERE tenant_id = ${tenantId} AND is_active AND may_admin
    `),
    satu(sql<{ n: string }[]>`
      SELECT count(*) AS n FROM wo_kembar_dicurigai k
       JOIN work_orders w ON w.id = k.wo_id WHERE w.tenant_id = ${tenantId}
    `),
  ]);

  const butir: Butir[] = [
    nilai('salah', approvedTanpaPoin, 'WO approved tanpa poin',
      'Pekerjaannya sudah diakui tapi uangnya tidak pernah terbit. Ini bentuk '
      + '"WO hilang" yang paling merugikan, dan tidak akan ketahuan sampai '
      + 'orangnya menagih.',
      'Semua WO approved punya poinnya.'),
    nilai('salah', poinBedaSnapshot, 'Poin tidak cocok dengan snapshot',
      'Salah satu dari keduanya berbohong, dan yang dibayar adalah poinnya. '
      + 'Periksa WO-nya satu per satu sebelum periode gaji ditutup.',
      'Poin dan snapshot sejalan.'),
    nilai('awas', tanpaTim, 'WO tanpa anggota tim',
      'WO ini tidak akan pernah muncul di layar mekanik mana pun, dan tidak akan '
      + 'membayar siapa pun. Tambahkan timnya atau batalkan WO-nya.',
      'Setiap WO punya timnya.'),
    nilai('awas', antreanTua, 'WO menunggu approval lebih dari 7 hari',
      'Mekaniknya sudah mengirim dan sedang menunggu. Makin lama menunggu, makin '
      + 'sulit approver mengingat pekerjaannya untuk dinilai.',
      'Tak ada antrean approval yang menua.'),
    nilai('awas', transferMenggantung, 'Permintaan transfer menggantung >2 hari',
      'Selama belum diputuskan, jam sesi mekanik yang mengajukan belum dihitung '
      + 'sama sekali — dan hangus kalau akhirnya ditolak.',
      'Tak ada permintaan transfer yang menggantung.'),
    nilai('awas', orangTanpaToken, 'Mekanik aktif belum punya token',
      'Mereka belum bisa masuk sama sekali. Terbitkan tokennya di tab Orang.',
      'Semua mekanik aktif punya token.'),
    nilai('awas', tokenTanpaOrang, 'Token milik orang nonaktif',
      'Token yang masih bisa dipakai masuk padahal orangnya sudah tidak bekerja. '
      + 'Cabut di tab Orang.',
      'Tak ada token menggantung.'),
    nilai('awas', jobTanpaBase, 'Job aktif ber-base point 0',
      'Job ini bisa dipilih saat membuat WO, tapi pekerjaannya tidak akan '
      + 'menghasilkan poin apa pun.',
      'Semua job aktif punya base point.'),
    nilai('awas', unitTanpaFaktor, 'Unit aktif tanpa faktor yang sah',
      'Faktor unit adalah pengali poin; nol berarti seluruh WO pada unit itu '
      + 'bernilai nol.',
      'Faktor unit semuanya sah.'),
    nilai('awas', orangTanpaTarif, 'Orang aktif memakai tarif nonaktif',
      'Poinnya tetap terbit, tapi tarifnya sudah tidak dipelihara — periksa '
      + 'apakah seharusnya dipindah ke tarif lain.',
      'Semua orang memakai tarif yang aktif.'),
    nilai('awas', kembar, 'WO dicurigai kembar',
      'Dua WO pada unit dan pekerjaan yang sama dengan jam mulai berdekatan. '
      + 'Belum tentu salah — tapi layak dilihat sebelum keduanya dibayar.',
      'Tak ada WO yang dicurigai kembar.'),
    nilai('awas', opLama, 'Struk perintah lebih tua dari retensinya',
      'Tidak berbahaya, tapi tabel struk yang tak pernah dipangkas akan terus '
      + 'tumbuh. Pemangkasan terjadwal belum dibangun.',
      'Struk perintah dalam batas retensi.'),
  ];

  /* Ini satu-satunya butir yang berbunyi SALAH ketika angkanya NOL — tanpa
     seorang pun admin, tak ada yang bisa menambah orang, menerbitkan token,
     atau memperbaiki apa pun dari dalam sistem. */
  butir.unshift(adminAktif === 0
    ? {
        tingkat: 'salah', judul: 'Tidak ada admin aktif',
        keterangan: 'Tak seorang pun bisa membuka menu Admin. Nyalakan lewat '
          + '`npm run admin:nyalakan <KODE>` dari mesin yang memegang basis datanya.',
        jumlah: 0,
      }
    : {
        tingkat: 'baik', judul: `${adminAktif} admin aktif`,
        keterangan: 'Ada yang bisa mengurus orang, token, dan katalog.',
        jumlah: adminAktif,
      });

  return {
    butir,
    ringkas: {
      baik: butir.filter((b) => b.tingkat === 'baik').length,
      awas: butir.filter((b) => b.tingkat === 'awas').length,
      salah: butir.filter((b) => b.tingkat === 'salah').length,
    },
    diperiksaAt: new Date().toISOString(),
  };
}

function nilai(
  tingkatBila: Tingkat, jumlah: number, judul: string,
  ketBermasalah: string, ketBaik: string,
): Butir {
  return jumlah > 0
    ? { tingkat: tingkatBila, judul: `${judul} — ${jumlah}`, keterangan: ketBermasalah, jumlah }
    : { tingkat: 'baik', judul, keterangan: ketBaik, jumlah: 0 };
}

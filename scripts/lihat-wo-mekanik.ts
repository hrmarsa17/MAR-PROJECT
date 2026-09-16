import './muat-env.js';

/**
 * Diagnostik: WO siapa ada di mana.
 *
 * Dibuat 16 Sep 2026 saat daftar WO seorang mekanik tiba-tiba kosong. Menebak
 * sebabnya dari kode memakan waktu lebih lama daripada membaca barisnya.
 */
const { sql } = await import('../src/lib/db.js');

const orang = await sql<{
  id: number; kode: string; nama: string; peran: string;
  assigned: string; pending: string; done: string; lain: string;
}[]>`
  SELECT m.id, m.mechanic_code::text AS kode, m.name AS nama, m.role::text AS peran,
    count(*) FILTER (WHERE w.status IN ('pending_mechanic_work','in_progress','pending_transfer')) AS assigned,
    count(*) FILTER (WHERE w.status IN ('pending_supervisor','pending_superintendent'))            AS pending,
    count(*) FILTER (WHERE w.status = 'approved')                                                  AS done,
    count(*) FILTER (WHERE w.status IN ('cancelled','rejected'))                                   AS lain
  FROM mechanics m
  LEFT JOIN work_order_team t ON t.mechanic_id = m.id
  LEFT JOIN work_orders w ON w.id = t.work_order_id
  WHERE m.is_active
  GROUP BY m.id, m.mechanic_code, m.name, m.role
  ORDER BY m.role, m.name
`;

console.log('\n  KODE         NAMA                    PERAN     ASG  PND  DON  (batal/tolak)');
console.log('  ' + '─'.repeat(78));
for (const o of orang) {
  console.log(
    `  ${o.kode.padEnd(12)} ${o.nama.slice(0, 22).padEnd(23)} ${o.peran.slice(0, 8).padEnd(9)}`
    + `${String(o.assigned).padStart(3)}  ${String(o.pending).padStart(3)}  `
    + `${String(o.done).padStart(3)}  ${String(o.lain).padStart(3)}`,
  );
}

const total = (
  await sql<{ status: string; n: string }[]>`
    SELECT status::text, count(*) AS n FROM work_orders GROUP BY status ORDER BY status
  `
);
console.log('\n  Seluruh WO di basis data:');
for (const t of total) console.log(`    ${t.status.padEnd(24)} ${t.n}`);

const yatim = (
  await sql<{ n: string }[]>`
    SELECT count(*) AS n FROM work_orders w
     WHERE NOT EXISTS (SELECT 1 FROM work_order_team t WHERE t.work_order_id = w.id)
  `
)[0]!;
console.log(`\n  WO tanpa satu pun anggota tim: ${yatim.n}`);

await sql.end();

import './muat-env.js';

/** Diagnostik: job mana terhubung ke form detail mana. */
const { sql } = await import('../src/lib/db.js');

const job = await sql<{
  section: string; kode: string; ket: string; form: string | null;
}[]>`
  SELECT s.code::text AS section, j.job_code::text AS kode,
         j.job_description AS ket, f.code::text AS form
    FROM jobs j
    JOIN sections s ON s.id = j.section_id
    LEFT JOIN job_detail_forms f ON f.id = j.detail_form_id
   ORDER BY s.code, j.id
`;
console.log('\n  SECTION    KODE          PEKERJAAN                        FORM');
console.log('  ' + '─'.repeat(76));
for (const j of job) {
  console.log(`  ${j.section.padEnd(10)} ${j.kode.padEnd(13)} `
    + `${j.ket.slice(0, 32).padEnd(33)}${j.form ?? '—'}`);
}

const form = await sql<{ code: string; medan: string; nyala: boolean }[]>`
  SELECT f.code::text AS code, count(d.id)::text AS medan, f.is_enabled AS nyala
    FROM job_detail_forms f
    LEFT JOIN job_detail_fields d ON d.form_id = f.id
   GROUP BY f.code, f.is_enabled ORDER BY f.code
`;
console.log('\n  Form detail:');
for (const f of form) {
  console.log(`    ${f.code.padEnd(22)} ${f.medan.padStart(2)} medan   ${f.nyala ? 'nyala' : 'MATI'}`);
}

await sql.end();

import './muat-env.js';
const { sql } = await import('../src/lib/db.js');

console.log('\n══ SETELAN: apa isinya ══');
console.table(await sql`
  SELECT setting_key::text AS kunci, setting_value AS nilai, description AS ket
    FROM settings ORDER BY setting_key`);

console.log('\n══ FAKTOR: apa isinya, dan berapa WO memakainya ══');
console.table(await sql`
  SELECT f.factor_type::text AS jenis, f.factor_key::text AS kunci,
         f.factor_value AS nilai, f.description AS ket
    FROM factors f ORDER BY f.factor_type, f.factor_value`);

console.log('\n══ SNAPSHOT: kunci faktor mana yang bisa dicocokkan balik ══');
console.table(await sql`
  SELECT s.timeliness_status::text AS ketepatan,
         w.work_condition::text AS kondisi,
         w.safety_incident AS insiden,
         coalesce(w.mtbf_redo_status::text, '(null)') AS mtbf,
         count(*)::int AS wo
    FROM scoring_snapshots s JOIN work_orders w ON w.id = s.work_order_id
   GROUP BY 1,2,3,4 ORDER BY 5 DESC LIMIT 15`);

console.log('\n══ TARIF: berapa baris bayaran per tarif, dan apakah nilainya masih cocok ══');
console.table(await sql`
  SELECT pr.id, pr.position::text AS posisi, pr.label, pr.idr_per_point AS tarif_kini,
         (SELECT count(*)::int FROM mechanics m WHERE m.pay_rate_id = pr.id) AS orang,
         (SELECT count(*)::int FROM mechanic_points mp
            JOIN mechanics m ON m.id = mp.mechanic_id
           WHERE m.pay_rate_id = pr.id) AS baris_bayar,
         (SELECT count(*)::int FROM mechanic_points mp
            JOIN mechanics m ON m.id = mp.mechanic_id
           WHERE m.pay_rate_id = pr.id AND mp.idr_per_point <> pr.idr_per_point)
           AS baris_beda_tarif
    FROM pay_rates pr ORDER BY pr.id`);

console.log('\n══ apakah ada override work_condition yang menggeser kunci faktor ══');
console.table(await sql`
  SELECT count(*)::int AS wo_approved_dengan_override_kondisi
    FROM work_orders w
   WHERE w.status = 'approved' AND EXISTS (
     SELECT 1 FROM work_order_overrides o
      WHERE o.work_order_id = w.id AND o.kind = 'work_condition')`);

await sql.end();

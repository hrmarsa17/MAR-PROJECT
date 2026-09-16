-- Data contoh untuk melihat layar terisi. Bukan bagian produksi.
--   psql -f db/contoh.sql

DO $$
DECLARE
  v_tenant  smallint;
  v_section smallint;
  v_job     integer;
  v_unit    integer;
  v_l1      integer;
  v_l2      integer;
  v_mek     integer[];
  v_wo      bigint;
  v_status  wo_status;
  v_grup    uuid;
  v_job_ban integer;
  v_unit_ban integer;
  v_sec_ban smallint;
  i         integer;
BEGIN
  SELECT id INTO v_tenant FROM tenants WHERE code = 'KMB';
  SELECT id INTO v_section FROM sections WHERE tenant_id = v_tenant AND code = 'field';
  SELECT id INTO v_job  FROM jobs  WHERE tenant_id = v_tenant AND job_code = 'UJI-JOB-1';
  SELECT id INTO v_unit FROM units WHERE tenant_id = v_tenant AND unit_code = 'UJI-UNIT-1';
  SELECT id INTO v_l1 FROM mechanics WHERE mechanic_code = 'UJI-L1';
  SELECT id INTO v_l2 FROM mechanics WHERE mechanic_code = 'UJI-L2';
  SELECT array_agg(id) INTO v_mek FROM mechanics WHERE mechanic_code IN ('UJI-M1','UJI-M2');

  FOR i IN 1..14 LOOP
    v_status := (ARRAY[
      'pending_superintendent','pending_superintendent','pending_superintendent',
      'pending_superintendent','pending_superintendent','pending_supervisor',
      'pending_supervisor','pending_mechanic_work','in_progress',
      'approved','approved','approved','rejected','pending_transfer'
    ]::wo_status[])[i];

    INSERT INTO work_orders (
      tenant_id, wo_number, section_id, job_id, unit_id, status, created_by,
      work_condition, location, keterangan,
      session_hours, start_time, end_time, submitted_at,
      approved_l1_by, approved_l1_at, mtbf_redo_status, created_at)
    VALUES (
      v_tenant,
      next_wo_number(v_tenant, current_date - (i % 4)),
      v_section, v_job, v_unit, v_status,
      CASE WHEN i % 3 = 0 THEN v_mek[1] ELSE v_l1 END,
      (ARRAY['normal','difficult','extreme'])[1 + (i % 3)],
      CASE WHEN i % 2 = 0 THEN 'Lapangan' ELSE 'Workshop' END,
      CASE WHEN i % 4 = 0 THEN 'Menunggu part dari gudang pusat' ELSE NULL END,
      -- sengaja bervariasi: ada yang tepat waktu, ada yang lewat target
      (ARRAY[6.0, 8.0, 9.5, 13.0, 7.25, 8.0, 2.0])[1 + (i % 7)],
      now() - make_interval(hours => 10 + i),
      now() - make_interval(hours => 2 + i),
      now() - make_interval(hours => 2 + i),
      CASE WHEN v_status IN ('pending_superintendent','approved') THEN v_l1 END,
      CASE WHEN v_status IN ('pending_superintendent','approved') THEN now() - make_interval(hours => i) END,
      CASE WHEN i % 5 = 0 THEN 'redo' ELSE 'first_time' END,
      now() - make_interval(hours => 12 + i))
    RETURNING id INTO v_wo;

    INSERT INTO work_order_team (work_order_id, mechanic_id)
    VALUES (v_wo, v_mek[1]);
    IF i % 2 = 0 THEN
      INSERT INTO work_order_team (work_order_id, mechanic_id) VALUES (v_wo, v_mek[2]);
    END IF;

    -- WO berstatus pending_transfer WAJIB punya baris permintaannya. Tanpa itu
    -- ia terhitung di tab Transfer tapi tidak punya kartu untuk digambar —
    -- angkanya berbunyi "2" di atas daftar kosong, dan tak ada seorang pun bisa
    -- memutuskannya. Data contoh yang tidak koheren melahirkan laporan bug
    -- yang sebenarnya tentang data contohnya sendiri.
    IF v_status = 'pending_transfer' THEN
      INSERT INTO work_order_transfers
        (work_order_id, requested_by, session_start, session_stop, session_hours, note)
      VALUES (v_wo, v_mek[1],
              now() - interval '5 hours', now() - interval '2 hours', 3.0,
              'CONTOH baut roda kiri belum kencang, tinggal torsi ulang');
    END IF;

    -- WO yang sudah approved perlu poin & snapshot supaya layar tidak berbohong
    IF v_status = 'approved' THEN
      UPDATE work_orders SET final_points = 17.6, approved_l2_by = v_l2,
             approved_l2_at = now() - make_interval(hours => i) WHERE id = v_wo;
      INSERT INTO scoring_snapshots (work_order_id, base_points, target_hours,
        actual_hours, unit_factor, work_condition_factor, timeliness_factor,
        timeliness_status, safety_factor, mtbf_factor, final_points)
      VALUES (v_wo, 16, 8, 8, 1.0, 1.0, 1.0, 'on_time', 1.0, 1.1, 17.6);
      INSERT INTO mechanic_points (work_order_id, mechanic_id, section_id, points, idr_per_point)
      SELECT v_wo, t.mechanic_id, v_section, 17.6, p.idr_per_point
        FROM work_order_team t
        JOIN mechanics m ON m.id = t.mechanic_id
        JOIN pay_rates p ON p.id = m.pay_rate_id
       WHERE t.work_order_id = v_wo;
    END IF;
  END LOOP;

  -- ══════════════════════════════════════════════════════════════════════════
  -- BORONGAN + KARTU INSIDEN
  -- ══════════════════════════════════════════════════════════════════════════
  -- Dua bentuk paling rumit di layar mekanik, dan sampai 16 Sep 2026 tak satu
  -- pun punya data contoh — jadi keduanya tidak pernah bisa dilihat dengan mata
  -- tanpa membuat WO sendiri satu per satu.
  --
  -- Sengaja disebar ke dua tab: dua baris tinggal di Assigned (muncul sebagai
  -- KOTAK GRUP), satu baris sudah approved (muncul sendirian di tab Done
  -- sebagai LENCANA borongan). Itu justru keadaan yang dulu salah dihitung —
  -- "Selesai 0 dari 1" — sehingga ia harus ada di data contoh.
  v_grup := gen_random_uuid();
  FOR i IN 1..3 LOOP
    v_status := CASE WHEN i = 3 THEN 'approved' ELSE 'pending_mechanic_work' END::wo_status;

    INSERT INTO work_orders (
      tenant_id, wo_number, section_id, job_id, unit_id, status, created_by,
      work_condition, location, keterangan,
      wo_group_id, wo_group_mode,
      session_hours, start_time, end_time, submitted_at,
      approved_l1_by, approved_l1_at, mtbf_redo_status, created_at)
    VALUES (
      v_tenant, next_wo_number(v_tenant, current_date), v_section, v_job, v_unit,
      v_status, v_l1, 'normal', 'Workshop',
      CASE WHEN i = 1 THEN 'Satu unit, tiga pekerjaan — dikerjakan berurutan' END,
      v_grup, 'unit',
      CASE WHEN v_status = 'approved' THEN 8.0 END,
      CASE WHEN v_status = 'approved' THEN now() - interval '10 hours' END,
      CASE WHEN v_status = 'approved' THEN now() - interval '2 hours' END,
      CASE WHEN v_status = 'approved' THEN now() - interval '2 hours' END,
      CASE WHEN v_status = 'approved' THEN v_l1 END,
      CASE WHEN v_status = 'approved' THEN now() - interval '1 hour' END,
      'first_time', now() - interval '12 hours')
    RETURNING id INTO v_wo;

    INSERT INTO work_order_team (work_order_id, mechanic_id) VALUES (v_wo, v_mek[1]);
    INSERT INTO work_order_team (work_order_id, mechanic_id) VALUES (v_wo, v_mek[2]);

    IF v_status = 'approved' THEN
      UPDATE work_orders SET final_points = 17.6, approved_l2_by = v_l2,
             approved_l2_at = now() - interval '1 hour' WHERE id = v_wo;
      INSERT INTO scoring_snapshots (work_order_id, base_points, target_hours,
        actual_hours, unit_factor, work_condition_factor, timeliness_factor,
        timeliness_status, safety_factor, mtbf_factor, final_points)
      VALUES (v_wo, 16, 8, 8, 1.0, 1.0, 1.0, 'on_time', 1.0, 1.1, 17.6);
      INSERT INTO mechanic_points (work_order_id, mechanic_id, section_id, points, idr_per_point)
      SELECT v_wo, t.mechanic_id, v_section, 17.6, p.idr_per_point
        FROM work_order_team t
        JOIN mechanics m ON m.id = t.mechanic_id
        JOIN pay_rates p ON p.id = m.pay_rate_id
       WHERE t.work_order_id = v_wo;
    END IF;
  END LOOP;

  -- ══════════════════════════════════════════════════════════════════════════
  -- WO YANG SUDAH DIOPER — beserta pesan dari shift sebelumnya
  -- ══════════════════════════════════════════════════════════════════════════
  -- Hasil AKHIR transfer, bukan permintaannya: WO kembali dikerjakan, jam shift
  -- sebelumnya sudah masuk partial_hours, dan pesan mekanik pertama menempel di
  -- kartu penerimanya. Tanpa baris ini, satu-satunya cara melihat bentuk itu
  -- adalah menjalankan seluruh alur transfer dengan tangan.
  INSERT INTO work_orders (
    tenant_id, wo_number, section_id, job_id, unit_id, status, created_by,
    work_condition, location, keterangan, partial_hours,
    mtbf_redo_status, created_at)
  VALUES (
    v_tenant, next_wo_number(v_tenant, current_date), v_section, v_job, v_unit,
    'pending_mechanic_work', v_l1, 'normal', 'Lapangan',
    'Lanjutan shift malam', 3.0, 'first_time', now() - interval '14 hours')
  RETURNING id INTO v_wo;

  -- Penerimanya mekanik KEDUA; yang pertama tetap di tim dan tetap dibayar.
  INSERT INTO work_order_team (work_order_id, mechanic_id) VALUES (v_wo, v_mek[1]);
  INSERT INTO work_order_team (work_order_id, mechanic_id) VALUES (v_wo, v_mek[2]);

  INSERT INTO work_order_transfers
    (work_order_id, requested_by, session_start, session_stop, session_hours,
     note, decided_by, decided_at, decision)
  VALUES (v_wo, v_mek[1],
          now() - interval '13 hours', now() - interval '10 hours', 3.0,
          'CONTOH baut roda kiri belum kencang, tinggal torsi ulang',
          v_l1, now() - interval '9 hours', 'approve');

  INSERT INTO work_order_transfer_recipients (transfer_id, mechanic_id)
  VALUES ((SELECT id FROM work_order_transfers WHERE work_order_id = v_wo), v_mek[2]);

  -- ══════════════════════════════════════════════════════════════════════════
  -- WO BAN — supaya form Detail Tyre bisa dilihat tanpa merakit sendiri
  -- ══════════════════════════════════════════════════════════════════════════
  -- Dua WO tyreman, dan yang pertama dibuat DUA KALI pada unit yang sama: yang
  -- lama sudah approved berikut catatan inspeksinya, yang baru menunggu diisi.
  -- Tanpa catatan lama, seluruh kolom Before berbunyi "belum ada" dan bentuk
  -- yang paling khas dari layar ini justru tidak terlihat.
  SELECT j.id, u.id INTO v_job_ban, v_unit_ban
    FROM jobs j, units u
   WHERE j.tenant_id = v_tenant AND j.detail_form_id = (
           SELECT id FROM job_detail_forms WHERE tenant_id = v_tenant AND code = 'tyre_inspeksi')
     AND u.tenant_id = v_tenant AND u.is_virtual = false AND u.is_active
   ORDER BY j.id, u.id LIMIT 1;

  IF v_job_ban IS NOT NULL THEN
    SELECT id INTO v_sec_ban FROM sections WHERE tenant_id = v_tenant AND code = 'tyreman';

    -- (a) WO LAMA yang sudah selesai — sumber nilai Before.
    INSERT INTO work_orders (tenant_id, wo_number, section_id, job_id, unit_id,
      status, created_by, work_condition, location, session_hours,
      start_time, end_time, submitted_at, approved_l1_by, approved_l1_at,
      approved_l2_by, approved_l2_at, mtbf_redo_status, final_points, created_at)
    VALUES (v_tenant, next_wo_number(v_tenant, current_date - 3), v_sec_ban,
            v_job_ban, v_unit_ban, 'approved', v_l1, 'normal', 'Workshop', 4.0,
            now() - interval '3 days', now() - interval '3 days' + interval '4 hours',
            now() - interval '3 days' + interval '4 hours', v_l1,
            now() - interval '3 days' + interval '5 hours', v_l2,
            now() - interval '3 days' + interval '6 hours', 'first_time', 17.6,
            now() - interval '3 days')
    RETURNING id INTO v_wo;
    INSERT INTO work_order_team (work_order_id, mechanic_id) VALUES (v_wo, v_mek[1]);

    -- Sepuluh posisi tercatat, TAPI dua di antaranya sengaja tidak lengkap:
    -- posisi 9 tanpa suhu, posisi 10 tidak dicatat sama sekali. Keduanya harus
    -- terbaca "belum ada", bukan nol — dan itu justru yang perlu terlihat.
    INSERT INTO work_order_detail_values
      (work_order_id, form_id, position, field_key, value_after, recorded_by, recorded_at)
    SELECT v_wo,
           (SELECT id FROM job_detail_forms WHERE tenant_id = v_tenant AND code = 'tyre_inspeksi'),
           p.pos, d.kunci, d.nilai, v_mek[1], now() - interval '3 days' + interval '4 hours'
      FROM generate_series(1, 9) AS p(pos),
      LATERAL (VALUES
        ('pressure', (95 + p.pos)::text),
        ('rtd',      (28 - p.pos)::text),
        ('suhu',     CASE WHEN p.pos = 9 THEN NULL ELSE (38 + p.pos)::text END)
      ) AS d(kunci, nilai)
     WHERE d.nilai IS NOT NULL;

    -- (b) WO BARU yang menunggu diisi mekanik — inilah yang dibuka di layar.
    INSERT INTO work_orders (tenant_id, wo_number, section_id, job_id, unit_id,
      status, created_by, work_condition, location, keterangan,
      mtbf_redo_status, created_at)
    VALUES (v_tenant, next_wo_number(v_tenant, current_date), v_sec_ban,
            v_job_ban, v_unit_ban, 'pending_mechanic_work', v_l1, 'normal',
            'Workshop', 'Inspeksi rutin — catat tekanan & RTD sepuluh posisi',
            'first_time', now() - interval '3 hours')
    RETURNING id INTO v_wo;
    INSERT INTO work_order_team (work_order_id, mechanic_id) VALUES (v_wo, v_mek[1]);

    -- (c) WO Remove/Instal, bentuk kedua dari form ini.
    SELECT j.id INTO v_job_ban FROM jobs j
     WHERE j.tenant_id = v_tenant AND j.detail_form_id = (
             SELECT id FROM job_detail_forms
              WHERE tenant_id = v_tenant AND code = 'tyre_remove_instal')
     ORDER BY j.id LIMIT 1;

    IF v_job_ban IS NOT NULL THEN
      INSERT INTO work_orders (tenant_id, wo_number, section_id, job_id, unit_id,
        status, created_by, work_condition, location, keterangan,
        mtbf_redo_status, created_at)
      VALUES (v_tenant, next_wo_number(v_tenant, current_date), v_sec_ban,
              v_job_ban, v_unit_ban, 'pending_mechanic_work', v_l1, 'normal',
              'Lapangan', 'Ban posisi 3 pecah — ganti', 'first_time',
              now() - interval '2 hours')
      RETURNING id INTO v_wo;
      INSERT INTO work_order_team (work_order_id, mechanic_id) VALUES (v_wo, v_mek[1]);
    END IF;
  END IF;

  -- WO yang transfernya DITOLAK: jam sesinya hangus, dan mekanik membaca
  -- alasannya di kartunya sendiri. partial_hours sengaja TETAP 0 — itulah
  -- seluruh maksud penolakan, dan data contoh yang menaruh angka di situ akan
  -- menyembunyikan justru bagian yang paling perlu terlihat benar.
  INSERT INTO work_orders (
    tenant_id, wo_number, section_id, job_id, unit_id, status, created_by,
    work_condition, location, keterangan, mtbf_redo_status, created_at)
  VALUES (
    v_tenant, next_wo_number(v_tenant, current_date), v_section, v_job, v_unit,
    'pending_mechanic_work', v_l1, 'normal', 'Workshop',
    'Selesaikan hari ini', 'first_time', now() - interval '8 hours')
  RETURNING id INTO v_wo;

  INSERT INTO work_order_team (work_order_id, mechanic_id) VALUES (v_wo, v_mek[1]);

  INSERT INTO work_order_transfers
    (work_order_id, requested_by, session_start, session_stop, session_hours,
     note, decided_by, decided_at, decision, decision_reason)
  VALUES (v_wo, v_mek[1],
          now() - interval '7 hours', now() - interval '5 hours', 2.0,
          'CONTOH tinggal pasang cover', v_l1, now() - interval '4 hours',
          'reject', 'CONTOH shift berikutnya kosong, kerjakan sampai selesai');

  -- Kartu insiden: approved TAPI safety_incident, sehingga poinnya nol. Kartunya
  -- bertepi merah dan statusnya berbunyi "⚠️ Insiden" — bentuk yang harus bisa
  -- dilihat tanpa perlu menimbulkan insiden sungguhan.
  INSERT INTO work_orders (
    tenant_id, wo_number, section_id, job_id, unit_id, status, created_by,
    work_condition, location, keterangan, safety_incident,
    session_hours, start_time, end_time, submitted_at,
    approved_l1_by, approved_l1_at, approved_l2_by, approved_l2_at,
    mtbf_redo_status, final_points, created_at)
  VALUES (
    v_tenant, next_wo_number(v_tenant, current_date), v_section, v_job, v_unit,
    'approved', v_l1, 'normal', 'Lapangan',
    'Tangan terjepit saat melepas hose — dirujuk ke klinik', true,
    9.0, now() - interval '11 hours', now() - interval '2 hours',
    now() - interval '2 hours', v_l1, now() - interval '90 minutes',
    v_l2, now() - interval '1 hour', 'first_time', 0, now() - interval '13 hours')
  RETURNING id INTO v_wo;

  INSERT INTO work_order_team (work_order_id, mechanic_id) VALUES (v_wo, v_mek[1]);
  INSERT INTO scoring_snapshots (work_order_id, base_points, target_hours,
    actual_hours, unit_factor, work_condition_factor, timeliness_factor,
    timeliness_status, safety_factor, mtbf_factor, final_points)
  VALUES (v_wo, 16, 8, 9, 1.0, 1.0, 0.8, 'late', 0, 1.0, 0);
  INSERT INTO mechanic_points (work_order_id, mechanic_id, section_id, points, idr_per_point)
  SELECT v_wo, t.mechanic_id, v_section, 0, p.idr_per_point
    FROM work_order_team t
    JOIN mechanics m ON m.id = t.mechanic_id
    JOIN pay_rates p ON p.id = m.pay_rate_id
   WHERE t.work_order_id = v_wo;

  RAISE NOTICE 'Data contoh dibuat.';
END $$;

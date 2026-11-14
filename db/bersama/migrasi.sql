-- Fungsi pendukung tombol "Mulai migrasi" dan "Kembali ke GAS" di panel saklar (docs/SAKLAR.md, 14 Nov 2026).
-- Semua SECURITY DEFINER, hanya service_role (pintu) yang boleh memanggil. Tidak ada yang menulis ke cermin asli:
-- pembanding dan kesehatan hanya membaca; cadangan membuat skema baru cad_<skema>_<waktu>.

-- Bandingkan dua cermin sheet per sheet: jumlah baris, judul kolom, dan sidik isi (md5 baris+nilai urut baris).
-- Dipakai panel staging untuk mensimulasikan "periksa selisih" (uji_<skema> vs <skema>), dan oleh cermin balik
-- untuk memastikan spreadsheet dan Supabase sama sebelum GAS dibuka lagi.
CREATE OR REPLACE FUNCTION public.cermin_bandingkan(p_a text, p_b text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  r        record;
  v_tabel_b text;
  v_sidik_a text;
  v_sidik_b text;
  v_n_a    bigint;
  v_n_b    bigint;
  v_head_b text[];
  n_sama   integer := 0;
  v_beda   jsonb := '[]'::jsonb;
BEGIN
  IF to_regclass(format('%I.cermin_header', p_a)) IS NULL OR to_regclass(format('%I.cermin_header', p_b)) IS NULL THEN
    RAISE EXCEPTION 'kedua skema harus cermin: % dan %', p_a, p_b USING ERRCODE = '22023';
  END IF;
  FOR r IN EXECUTE format('SELECT sheet, tabel, headers FROM %I.cermin_header ORDER BY sheet', p_a) LOOP
    v_tabel_b := NULL;
    EXECUTE format('SELECT tabel, headers FROM %I.cermin_header WHERE sheet = $1', p_b) INTO v_tabel_b, v_head_b USING r.sheet;
    IF v_tabel_b IS NULL THEN
      v_beda := v_beda || jsonb_build_object('sheet', r.sheet, 'sebab', 'tidak ada di ' || p_b);
      CONTINUE;
    END IF;
    EXECUTE format('SELECT count(*), md5(coalesce(string_agg(baris::text || '':'' || nilai::text, ''|'' ORDER BY baris), '''')) FROM %I.%I', p_a, r.tabel)
      INTO v_n_a, v_sidik_a;
    EXECUTE format('SELECT count(*), md5(coalesce(string_agg(baris::text || '':'' || nilai::text, ''|'' ORDER BY baris), '''')) FROM %I.%I', p_b, v_tabel_b)
      INTO v_n_b, v_sidik_b;
    IF v_n_a = v_n_b AND v_sidik_a = v_sidik_b AND r.headers IS NOT DISTINCT FROM v_head_b THEN
      n_sama := n_sama + 1;
    ELSE
      v_beda := v_beda || jsonb_build_object('sheet', r.sheet, 'baris_a', v_n_a, 'baris_b', v_n_b,
        'sebab', CASE WHEN r.headers IS DISTINCT FROM v_head_b THEN 'judul kolom berbeda' ELSE 'isi berbeda' END);
    END IF;
  END LOOP;
  FOR r IN EXECUTE format('SELECT sheet FROM %I.cermin_header b WHERE NOT EXISTS (SELECT 1 FROM %I.cermin_header a WHERE a.sheet = b.sheet)', p_b, p_a) LOOP
    v_beda := v_beda || jsonb_build_object('sheet', r.sheet, 'sebab', 'tidak ada di ' || p_a);
  END LOOP;
  RETURN jsonb_build_object('a', p_a, 'b', p_b, 'sama', n_sama, 'beda', v_beda, 'nol', jsonb_array_length(v_beda) = 0);
END;
$$;
REVOKE ALL ON FUNCTION public.cermin_bandingkan(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cermin_bandingkan(text, text) TO service_role;

-- Cadangan sesaat sebelum mulai migrasi: salinan utuh <skema> ke cad_<skema>_<YYYYMMDD_HH24MI> (UTC), di dalam
-- database. Disimpan sampai dihapus manual (keputusan Gabriel); tidak dibaca kode mana pun.
CREATE OR REPLACE FUNCTION public.cermin_cadangkan(p_skema text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_cad   text := 'cad_' || p_skema || '_' || to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD_HH24MI');
  r       record;
  n_tabel integer := 0;
  n_baris bigint := 0;
  c       bigint;
BEGIN
  IF p_skema IS NULL OR left(p_skema, 4) IN ('uji_', 'cad_') OR to_regclass(format('%I.cermin_header', p_skema)) IS NULL THEN
    RAISE EXCEPTION 'skema % bukan cermin asli', p_skema USING ERRCODE = '22023';
  END IF;
  IF to_regnamespace(v_cad) IS NOT NULL THEN
    RAISE EXCEPTION 'cadangan % sudah ada (tunggu satu menit)', v_cad USING ERRCODE = '22023';
  END IF;
  EXECUTE format('CREATE SCHEMA %I', v_cad);
  FOR r IN SELECT cl.relname FROM pg_class cl JOIN pg_namespace ns ON ns.oid = cl.relnamespace
            WHERE ns.nspname = p_skema AND cl.relkind = 'r' ORDER BY cl.relname LOOP
    -- Tanpa INCLUDING DEFAULTS: cadangan tidak pernah ditulis, jadi tidak perlu sequence sendiri.
    EXECUTE format('CREATE TABLE %I.%I (LIKE %I.%I INCLUDING CONSTRAINTS INCLUDING INDEXES)', v_cad, r.relname, p_skema, r.relname);
    EXECUTE format('INSERT INTO %I.%I SELECT * FROM %I.%I', v_cad, r.relname, p_skema, r.relname);
    GET DIAGNOSTICS c = ROW_COUNT;
    n_tabel := n_tabel + 1;
    n_baris := n_baris + c;
  END LOOP;
  EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC, anon, authenticated', v_cad);
  EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM PUBLIC, anon, authenticated', v_cad);
  RETURN jsonb_build_object('skema', v_cad, 'tabel', n_tabel, 'baris', n_baris);
END;
$$;
REVOKE ALL ON FUNCTION public.cermin_cadangkan(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cermin_cadangkan(text) TO service_role;

-- Kesehatan cermin untuk kartu panel: isi cermin_meta (sinkron_terakhir, periksa_hasil, hari_tanpa_selisih, ...)
-- dan izin tulis skema itu. Hanya membaca.
CREATE OR REPLACE FUNCTION public.cermin_kesehatan(p_skema text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_meta jsonb;
  v_izin jsonb;
BEGIN
  IF p_skema IS NULL OR to_regclass(format('%I.cermin_meta', p_skema)) IS NULL THEN
    RAISE EXCEPTION 'skema % bukan cermin', p_skema USING ERRCODE = '22023';
  END IF;
  EXECUTE format('SELECT coalesce(jsonb_object_agg(kunci, jsonb_build_object(''nilai'', nilai, ''diubah_at'', diubah_at)), ''{}''::jsonb) FROM %I.cermin_meta', p_skema)
    INTO v_meta;
  SELECT to_jsonb(i) - 'skema' INTO v_izin FROM public.cermin_izin_tulis i WHERE i.skema = p_skema;
  RETURN jsonb_build_object('skema', p_skema, 'meta', v_meta, 'izin_tulis', coalesce(v_izin, jsonb_build_object('boleh', false)),
    'sekarang', now());
END;
$$;
REVOKE ALL ON FUNCTION public.cermin_kesehatan(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cermin_kesehatan(text) TO service_role;

-- Panel staging menyegarkan ruang uji sebagai "sinkron terakhir" simulasi. Hanya menyentuh uji_<skema>.
GRANT EXECUTE ON FUNCTION public.cermin_salin_ke_uji(text) TO service_role;

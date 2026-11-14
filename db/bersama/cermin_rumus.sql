-- Rumus sheet config (keputusan Gabriel 15 Nov 2026: pusat admin menghitung ulang rumus setelah migrasi).
-- Tabel <skema>.cermin_rumus diisi tools/cermin/sinkron.mjs (sheet Config_*): satu baris per sel berumus, persis
-- seperti di spreadsheet. Pusat admin membacanya lewat fungsi ini; cermin balik memakainya supaya tidak menimpa
-- sel berumus. Hanya service_role.
CREATE OR REPLACE FUNCTION public.cermin_baca_rumus(p_skema text, p_sheet text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v jsonb;
BEGIN
  IF p_skema IS NULL OR to_regclass(format('%I.cermin_header', p_skema)) IS NULL THEN
    RAISE EXCEPTION 'skema % bukan cermin', p_skema USING ERRCODE = '22023';
  END IF;
  IF to_regclass(format('%I.cermin_rumus', p_skema)) IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  EXECUTE format(
    'SELECT coalesce(jsonb_agg(jsonb_build_object(''baris'', baris, ''kolom'', kolom, ''judul_kolom'', judul_kolom, ''rumus'', rumus)
                               ORDER BY baris, kolom), ''[]''::jsonb)
       FROM %I.cermin_rumus WHERE sheet = $1', p_skema)
    INTO v USING p_sheet;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.cermin_baca_rumus(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cermin_baca_rumus(text, text) TO service_role;

-- Daftarkan rumus sel baru (baris yang ditambahkan pusat admin, rumus kolom yang seragam seperti base_point =F{r}*2).
-- Kunci tulis sama dengan cermin_tulis: skema uji_* selalu boleh; skema asli hanya setelah izin tulis dibuka.
-- p_rumus: [{ baris, kolom, judul_kolom, rumus }]
CREATE OR REPLACE FUNCTION public.cermin_tambah_rumus(p_skema text, p_sheet text, p_rumus jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  n integer;
BEGIN
  IF p_skema IS NULL OR to_regclass(format('%I.cermin_rumus', p_skema)) IS NULL THEN
    RAISE EXCEPTION 'skema % belum punya cermin_rumus', p_skema USING ERRCODE = '22023';
  END IF;
  IF left(p_skema, 4) <> 'uji_' AND NOT coalesce(
       (SELECT i.boleh FROM public.cermin_izin_tulis i WHERE i.skema = p_skema), false) THEN
    RAISE EXCEPTION 'TERKUNCI: cermin % belum boleh ditulis jalur Supabase (saklar rumah itu belum supabase)', p_skema
      USING ERRCODE = 'PT423';
  END IF;
  EXECUTE format(
    'INSERT INTO %I.cermin_rumus (sheet, baris, kolom, judul_kolom, rumus)
       SELECT $1, (x ->> ''baris'')::integer, (x ->> ''kolom'')::integer, x ->> ''judul_kolom'', x ->> ''rumus''
         FROM jsonb_array_elements($2) AS x
     ON CONFLICT (sheet, baris, kolom) DO UPDATE SET rumus = EXCLUDED.rumus, judul_kolom = EXCLUDED.judul_kolom', p_skema)
    USING p_sheet, coalesce(p_rumus, '[]'::jsonb);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.cermin_tambah_rumus(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cermin_tambah_rumus(text, text, jsonb) TO service_role;

-- KUNCI SINKRON MAJU (15 Nov 2026). Pasang SESUDAH cermin_tulis.sql (tabel public.cermin_izin_tulis); fungsi
-- cermin_atur_izin_tulis di sini menggantikan versi di cermin_tulis.sql.
--
-- Masalahnya: sinkron maju (spreadsheet → cermin, tools/cermin/sinkron.mjs) tiap jam dan sinkron terakhir prosedur
-- "Mulai migrasi" (pelaksana GitHub) bisa berjalan bersamaan. Tanpa kunci:
--   * putaran tiap jam yang membaca sebuah sheet SEBELUM GAS ditutup bisa menulisnya SESUDAH sinkron terakhir,
--     sehingga tulisan terakhir GAS hilang dari cermin; bila jatuh sesudah saklar `supabase`, tulisan Worker
--     tertimpa potret spreadsheet yang lebih tua;
--   * dua putaran yang menulis sheet yang sama bersamaan bisa saling melihat tulisan setengah jadi, dan periksa
--     melaporkan selisih palsu (memutus syarat "7 hari tanpa selisih").
--
-- Protokol (kunci advisory 'cermin_maju:<skema>', berlingkup transaksi sehingga aman lewat pooler apa pun):
--   1. Setiap transaksi sheet sinkron maju mengambil kunci BERSAMA, lalu membaca ulang baris izin rumah itu. Bila
--      boleh = true, atau maju_dikunci = true tanpa opsi --akhir, transaksi itu tidak menulis apa pun dan putaran
--      itu berhenti untuk rumah tersebut. Sheet yang sama juga dikunci EKSKLUSIF ('cermin_sinkron:<skema>:<sheet>')
--      supaya dua putaran tidak menulisnya bersamaan.
--   2. cermin_kunci_maju(skema, true) (langkah sinkron prosedur Mulai, SEBELUM sinkron terakhir diminta) mencoba
--      kunci EKSKLUSIF. Selama ada transaksi sheet yang sedang menulis, jawabannya {menunggu: true} dan prosedur
--      mencoba lagi pada alarm berikutnya. Begitu berhasil, semua transaksi sheet sesudahnya melihat
--      maju_dikunci = true; hanya sinkron terakhir pelaksana (--akhir) yang masih boleh menulis.
--   3. cermin_atur_izin_tulis(skema, true) hanya diterima bila sinkron maju sudah dikunci, dan juga menunggu
--      (menjawab {menunggu: true}) selama ada transaksi sheet yang menulis. Sesudah izin terbuka, tidak ada sinkron
--      maju yang menulis, termasuk --akhir: Supabase satu-satunya penulis cermin.
--   4. Menutup izin (false) TIDAK melepas kunci sinkron maju: selama belum dipastikan spreadsheet sama dengan cermin
--      (cermin balik terakhir), sinkron maju tidak boleh menimpa cermin dengan isi spreadsheet. Kunci dilepas
--      terpisah dengan cermin_kunci_maju(skema, false), hanya bila izin sudah tertutup: oleh prosedur "Kembali ke
--      GAS" sesudah cermin balik terakhir, atau oleh pemulihan prosedur Mulai yang gagal sebelum ada yang menulis.
--      Melepas manual (bila prosedur macet di tengah):
--        SELECT public.cermin_kunci_maju('<skema>', false, '<alasan>', '<nama>');

ALTER TABLE public.cermin_izin_tulis ADD COLUMN IF NOT EXISTS maju_dikunci boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.cermin_kunci_maju(p_skema text, p_kunci boolean, p_alasan text, p_oleh text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_boleh boolean;
BEGIN
  IF p_skema IS NULL OR left(p_skema, 4) = 'uji_' OR to_regclass(format('%I.cermin_header', p_skema)) IS NULL THEN
    RAISE EXCEPTION 'skema % bukan cermin asli', p_skema USING ERRCODE = '22023';
  END IF;
  IF p_kunci IS NULL OR coalesce(btrim(p_alasan), '') = '' OR coalesce(btrim(p_oleh), '') = '' THEN
    RAISE EXCEPTION 'kunci, alasan, dan pelaku wajib diisi' USING ERRCODE = '22023';
  END IF;
  SELECT i.boleh INTO v_boleh FROM public.cermin_izin_tulis i WHERE i.skema = p_skema FOR UPDATE;
  IF NOT p_kunci AND coalesce(v_boleh, false) THEN
    RAISE EXCEPTION 'izin tulis % masih terbuka (Supabase penulisnya); sinkron maju tidak boleh dibuka', p_skema
      USING ERRCODE = '22023';
  END IF;
  -- Mengunci harus menunggu transaksi sheet yang sedang menulis; membuka tidak (tidak ada yang bisa rusak).
  IF p_kunci AND NOT pg_try_advisory_xact_lock(hashtext('cermin_maju:' || p_skema)) THEN
    RETURN jsonb_build_object('skema', p_skema, 'menunggu', true);
  END IF;
  INSERT INTO public.cermin_izin_tulis AS i (skema, boleh, maju_dikunci, alasan, diubah_oleh, diubah_at)
  VALUES (p_skema, false, p_kunci, p_alasan, p_oleh, now())
  ON CONFLICT (skema) DO UPDATE SET maju_dikunci = EXCLUDED.maju_dikunci, alasan = EXCLUDED.alasan,
    diubah_oleh = EXCLUDED.diubah_oleh, diubah_at = EXCLUDED.diubah_at;
  RETURN jsonb_build_object('skema', p_skema, 'maju_dikunci', p_kunci, 'boleh', coalesce(v_boleh, false));
END;
$$;
REVOKE ALL ON FUNCTION public.cermin_kunci_maju(text, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cermin_kunci_maju(text, boolean, text, text) TO service_role;

-- Dipanggil prosedur Mulai migrasi (boleh = true) dan prosedur Kembali ke GAS / pemulihan (boleh = false).
CREATE OR REPLACE FUNCTION public.cermin_atur_izin_tulis(p_skema text, p_boleh boolean, p_alasan text, p_oleh text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_maju boolean;
BEGIN
  IF p_skema IS NULL OR left(p_skema, 4) = 'uji_' OR to_regclass(format('%I.cermin_header', p_skema)) IS NULL THEN
    RAISE EXCEPTION 'skema % bukan cermin asli', p_skema USING ERRCODE = '22023';
  END IF;
  IF p_boleh IS NULL OR coalesce(btrim(p_alasan), '') = '' OR coalesce(btrim(p_oleh), '') = '' THEN
    RAISE EXCEPTION 'alasan dan pelaku wajib diisi' USING ERRCODE = '22023';
  END IF;
  IF p_boleh THEN
    SELECT i.maju_dikunci INTO v_maju FROM public.cermin_izin_tulis i WHERE i.skema = p_skema FOR UPDATE;
    IF NOT coalesce(v_maju, false) THEN
      RAISE EXCEPTION 'sinkron maju % belum dikunci (cermin_kunci_maju); izin tulis tidak dibuka', p_skema
        USING ERRCODE = '22023';
    END IF;
    IF NOT pg_try_advisory_xact_lock(hashtext('cermin_maju:' || p_skema)) THEN
      RETURN jsonb_build_object('skema', p_skema, 'boleh', false, 'menunggu', true);
    END IF;
  END IF;
  INSERT INTO public.cermin_izin_tulis AS i (skema, boleh, alasan, diubah_oleh, diubah_at)
  VALUES (p_skema, p_boleh, p_alasan, p_oleh, now())
  ON CONFLICT (skema) DO UPDATE SET boleh = EXCLUDED.boleh, alasan = EXCLUDED.alasan,
    diubah_oleh = EXCLUDED.diubah_oleh, diubah_at = EXCLUDED.diubah_at;
  RETURN jsonb_build_object('skema', p_skema, 'boleh', p_boleh);
END;
$$;
REVOKE ALL ON FUNCTION public.cermin_atur_izin_tulis(text, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cermin_atur_izin_tulis(text, boolean, text, text) TO service_role;

-- ==============================================================================
-- BUG #13 (28 Okt 2026): RPC BACA KMB PROJECT WAJIB TOKEN, SAMA SEPERTI GAS
-- Lihat docs/BUG-DICATAT.md #13.
-- ==============================================================================
--
-- Masalah: kmb_create_refs(), kmb_monitoring(), kmb_my_wos(text), dan
-- kmb_wos_by_status(text) bisa dipanggil siapa saja yang memegang kunci anon
-- publik, tanpa token. kmb_monitoring() bahkan mengembalikan token semua mekanik.
-- Di GAS, aksi yang setara menolak token palsu ("Token tidak dikenal / nonaktif").
--
-- Perbaikan, tanpa mengubah isi keempat fungsi itu:
--   1. Keempatnya tidak bisa lagi dipanggil langsung oleh anon/authenticated.
--   2. Pintu masuknya pembungkus *_bertoken. Pembungkus memeriksa token di
--      kmb_projek.api_tokens (status ACTIVE) lalu memanggil fungsi aslinya.
--   3. kmb_my_wos_bertoken mengambil identitas mekanik dari token, sama seperti
--      GAS, bukan dari parameter yang bisa diisi siapa saja.
--
-- Jalankan sesudah rpc_baca.sql dan migration_20261028_drop_golongan.sql.
-- Aman dijalankan berkali-kali. Worker sudah memanggil *_bertoken.

-- 1. Tutup akses langsung
REVOKE EXECUTE ON FUNCTION public.kmb_create_refs() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kmb_monitoring() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kmb_my_wos(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kmb_wos_by_status(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kmb_create_refs() TO service_role;
GRANT EXECUTE ON FUNCTION public.kmb_monitoring() TO service_role;
GRANT EXECUTE ON FUNCTION public.kmb_my_wos(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.kmb_wos_by_status(text) TO service_role;

-- 2. Pembungkus bertoken
CREATE OR REPLACE FUNCTION public.kmb_create_refs_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM kmb_projek.api_tokens t
         WHERE t.token = btrim(coalesce(p_token, '')) AND t.status = 'ACTIVE'
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Token tidak dikenal / nonaktif', 'source', 'SUPABASE');
    END IF;
    RETURN public.kmb_create_refs();
END;
$$;

-- Di GAS (cek 28 Okt): supervisor menerima daftar 20 mekanik beserta tokennya,
-- sedangkan token mekanik (MECH-003) menerima daftar kosong. Pembungkus ini
-- meniru itu. Kalau uji kembar dengan mekanik yang punya baris di Config_Mechanics
-- menunjukkan GAS memberi baris dirinya sendiri, sesuaikan di sini.
CREATE OR REPLACE FUNCTION public.kmb_monitoring_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role text;
    v_hasil json;
BEGIN
    SELECT t.role INTO v_role
      FROM kmb_projek.api_tokens t
     WHERE t.token = btrim(coalesce(p_token, '')) AND t.status = 'ACTIVE'
     LIMIT 1;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Token tidak dikenal / nonaktif', 'source', 'SUPABASE');
    END IF;
    v_hasil := public.kmb_monitoring();
    IF lower(coalesce(v_role, 'mechanic')) = 'mechanic' AND (v_hasil::jsonb #> '{result,mechanics}') IS NOT NULL THEN
        v_hasil := jsonb_set(v_hasil::jsonb, '{result,mechanics}', '[]'::jsonb)::json;
    END IF;
    RETURN v_hasil;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_my_wos_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id text;
BEGIN
    SELECT t.user_id INTO v_user_id
      FROM kmb_projek.api_tokens t
     WHERE t.token = btrim(coalesce(p_token, '')) AND t.status = 'ACTIVE'
     LIMIT 1;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Token tidak dikenal / nonaktif', 'source', 'SUPABASE');
    END IF;
    RETURN public.kmb_my_wos(v_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_wos_by_status_bertoken(p_token text, p_status text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM kmb_projek.api_tokens t
         WHERE t.token = btrim(coalesce(p_token, '')) AND t.status = 'ACTIVE'
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Token tidak dikenal / nonaktif', 'source', 'SUPABASE');
    END IF;
    RETURN public.kmb_wos_by_status(p_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.kmb_create_refs_bertoken(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_monitoring_bertoken(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_my_wos_bertoken(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_wos_by_status_bertoken(text, text) TO anon, authenticated, service_role;

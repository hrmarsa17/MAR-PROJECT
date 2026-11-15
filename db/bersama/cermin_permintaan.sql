-- Antrean permintaan prosedur migrasi (docs/SAKLAR.md, Tonggak 2): pintu (Durable Object saklar) meminta pekerjaan
-- yang butuh akun layanan Google, dan pelaksana di GitHub Actions (tools/cermin/peralihan.mjs, workflow
-- .github/workflows/peralihan.yml) mengambil, menjalankan, lalu menulis hasilnya. Pintu tidak memegang kunci
-- Google maupun token GitHub; pelaksana tidak menerima apa pun dari internet selain baris di tabel ini.
--
-- jenis:
--   sinkron_akhir  sinkron maju terakhir + periksa selisih (tools/cermin/sinkron.mjs --periksa), saat GAS sudah ditutup
--   balik_awal     penanda cermin balik + uji hak Editor + periksa (tools/cermin/balik.mjs --penuh --tulis --periksa --uji-editor)
--   balik_akhir    cermin balik terakhir + periksa sebelum GAS dibuka lagi (balik.mjs --tulis --periksa, lalu --penuh bila perlu)
-- Hanya service_role (pintu) yang boleh meminta dan membaca lewat RPC; tabelnya tidak terbuka untuk anon/authenticated.
CREATE TABLE IF NOT EXISTS public.cermin_permintaan (
  id           bigserial PRIMARY KEY,
  skema        text NOT NULL,
  jenis        text NOT NULL CHECK (jenis IN ('sinkron_akhir', 'balik_awal', 'balik_akhir')),
  diminta_at   timestamptz NOT NULL DEFAULT now(),
  diminta_oleh text,
  alasan       text,
  mulai_at     timestamptz,
  pelaksana    text,
  selesai_at   timestamptz,
  berhasil     boolean,
  hasil        text
);
CREATE INDEX IF NOT EXISTS cermin_permintaan_antre ON public.cermin_permintaan (id) WHERE selesai_at IS NULL;
ALTER TABLE public.cermin_permintaan ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cermin_permintaan FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.cermin_permintaan_id_seq FROM PUBLIC, anon, authenticated;

-- Buat permintaan. Satu permintaan terbuka per (skema, jenis): permintaan yang sama yang belum selesai dipakai ulang.
CREATE OR REPLACE FUNCTION public.cermin_minta(p_skema text, p_jenis text, p_oleh text DEFAULT NULL, p_alasan text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v bigint;
BEGIN
  IF p_skema IS NULL OR to_regclass(format('%I.cermin_header', p_skema)) IS NULL THEN
    RAISE EXCEPTION 'skema % bukan cermin', p_skema USING ERRCODE = '22023';
  END IF;
  IF p_jenis NOT IN ('sinkron_akhir', 'balik_awal', 'balik_akhir') THEN
    RAISE EXCEPTION 'jenis permintaan % tidak dikenal', p_jenis USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v FROM public.cermin_permintaan
   WHERE skema = p_skema AND jenis = p_jenis AND selesai_at IS NULL ORDER BY id DESC LIMIT 1;
  IF v IS NOT NULL THEN RETURN v; END IF;
  INSERT INTO public.cermin_permintaan (skema, jenis, diminta_oleh, alasan)
  VALUES (p_skema, p_jenis, left(p_oleh, 120), left(p_alasan, 500))
  RETURNING id INTO v;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.cermin_minta(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cermin_minta(text, text, text, text) TO service_role;

-- Batalkan permintaan yang BELUM diambil pelaksana (prosedur gagal atau dibatalkan). Yang sedang dikerjakan dibiarkan
-- selesai; hasilnya tidak dipakai prosedur mana pun. Kembalikan true bila benar-benar dibatalkan.
CREATE OR REPLACE FUNCTION public.cermin_permintaan_batal(p_id bigint, p_sebab text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.cermin_permintaan
     SET selesai_at = now(), berhasil = false, hasil = left('dibatalkan: ' || coalesce(p_sebab, 'prosedur berhenti'), 500)
   WHERE id = p_id AND selesai_at IS NULL AND mulai_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.cermin_permintaan_batal(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cermin_permintaan_batal(bigint, text) TO service_role;

-- Status satu permintaan (untuk pintu yang menunggu).
CREATE OR REPLACE FUNCTION public.cermin_permintaan_status(p_id bigint)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT to_jsonb(p) FROM public.cermin_permintaan p WHERE p.id = p_id;
$$;
REVOKE ALL ON FUNCTION public.cermin_permintaan_status(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cermin_permintaan_status(bigint) TO service_role;

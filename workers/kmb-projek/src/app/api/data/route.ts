import { akuDari, tokenDari, jawab, jawabGalat } from '../_bantu.js';
import { pakaiAppsScript } from '../../../lib/backendConfig.js';
import { handleDataAppsScript } from '../../../backends/appscript/data.js';
import { handleDataSupabase } from '../../../backends/supabase/data.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  try {
    const aku = await akuDari(req);
    const url = new URL(req.url);
    const jenis = url.searchParams.get('jenis');

    if (pakaiAppsScript()) {
      const token = await tokenDari(req);
      const hasil = await handleDataAppsScript(jenis, url, aku, token);
      if (hasil !== null) return jawab(hasil);
    }

    const hasil = await handleDataSupabase(jenis, url, aku);
    return jawab(hasil);
  } catch (e) {
    return jawabGalat(e);
  }
}

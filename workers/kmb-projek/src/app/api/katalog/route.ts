import { akuDari, jawab, jawabGalat } from '../_bantu.js';
import { masukanTidakSah, tidakBerhak } from '../../../lib/errors.js';
import {
  bacaUntukPratinjau, eksporKatalog, type JenisImpor,
} from '../../../domain/imporKatalog.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * KATALOG lewat berkas — dua arah, dua bentuk yang berbeda dari rute lain:
 *
 *   GET  → unduh .xlsx (isi sekarang, atau templat kosong bila belum ada isinya)
 *   POST → unggah .xlsx, jawab PRATINJAU. TIDAK menulis apa pun.
 *
 * Yang MENULIS adalah perintah `impor_katalog` di /api/perintah, dengan op_id
 * seperti tulisan lain. Memisahkannya begini yang membuat langkah "lihat dulu
 * apa yang akan berubah" mungkin — dan untuk berkas berisi ribuan angka yang
 * menentukan poin, langkah itu bukan kemewahan.
 */

function jenisDari(v: string | null): JenisImpor {
  if (v === 'job' || v === 'unit') return v;
  throw masukanTidakSah('Parameter jenis harus "job" atau "unit"');
}

export async function GET(req: Request): Promise<Response> {
  try {
    const aku = await akuDari(req);
    if (!aku.bolehAdmin) throw tidakBerhak('Hanya yang diberi hak admin.');

    const url = new URL(req.url);
    const jenis = jenisDari(url.searchParams.get('jenis'));
    const section = url.searchParams.get('section');

    const buf = await eksporKatalog(aku.tenantId, jenis, section);
    const nama = jenis === 'job'
      ? `katalog-job-${section ?? 'semua'}.xlsx`
      : 'katalog-unit.xlsx';

    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        // ASCII saja di `filename`; nama ber-aksen dikirim lewat filename*.
        'Content-Disposition': `attachment; filename="${nama}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return jawabGalat(e);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const aku = await akuDari(req);
    if (!aku.bolehAdmin) throw tidakBerhak('Hanya yang diberi hak admin.');

    const form = await req.formData();
    const berkas = form.get('berkas');
    if (!(berkas instanceof File)) throw masukanTidakSah('Berkas belum dipilih');
    if (berkas.size > 15 * 1024 * 1024) {
      throw masukanTidakSah('Berkas lebih dari 15 MB — pecah dulu');
    }

    const jenis = jenisDari(String(form.get('jenis') ?? ''));
    const section = form.get('section') ? String(form.get('section')) : null;

    const isi = Buffer.from(await berkas.arrayBuffer());
    return jawab(await bacaUntukPratinjau(aku.tenantId, jenis, section, isi));
  } catch (e) {
    return jawabGalat(e);
  }
}

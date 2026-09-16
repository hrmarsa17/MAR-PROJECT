import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Rute lama, dipertahankan sebagai pengalih.
 *
 * Koreksi HM dan KM jadi satu menu pada 16 Sep 2026. Tautan yang sudah disimpan
 * orang — bookmark, pesan WhatsApp, catatan di HP — tidak boleh mati hanya
 * karena menunya dirapikan.
 */
export default async function KoreksiHmLama({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string }>;
}) {
  const sp = await searchParams;
  redirect(`/koreksi?jenis=HM${sp.unit ? `&unit=${encodeURIComponent(sp.unit)}` : ''}`);
}

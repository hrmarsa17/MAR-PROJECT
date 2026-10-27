import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Rute lama, dipertahankan sebagai pengalih. Lihat catatan di `hm/page.tsx`. */
export default async function KoreksiKmLama({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string }>;
}) {
  const sp = await searchParams;
  redirect(`/koreksi?jenis=KM${sp.unit ? `&unit=${encodeURIComponent(sp.unit)}` : ''}`);
}

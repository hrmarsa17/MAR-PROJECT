import { HalamanKoreksi } from '../halaman.js';

export const dynamic = 'force-dynamic';

export default function KoreksiKm({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string }>;
}) {
  return HalamanKoreksi({ jenis: 'KM', searchParams });
}

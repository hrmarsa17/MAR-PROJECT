import { HalamanKoreksi } from '../halaman.js';

export const dynamic = 'force-dynamic';

export default function KoreksiHm({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string }>;
}) {
  return HalamanKoreksi({ jenis: 'HM', searchParams });
}

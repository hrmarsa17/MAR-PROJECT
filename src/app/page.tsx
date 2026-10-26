import { redirect } from 'next/navigation';
import { akuServer } from '../lib/sesi.js';
import { dapatkanPathAwal } from '../lib/tenantRouter.js';

export const dynamic = 'force-dynamic';

export default async function Beranda() {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');

  redirect(dapatkanPathAwal(aku));
}

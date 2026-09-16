import type { Metadata, Viewport } from 'next';
import { akuServer } from '../lib/sesi.js';
import { NavBar } from './NavBar.js';
import { DaftarSW } from './DaftarSW.js';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mechanic Activity Report',
  description: 'Work order & insentif mekanik',
  manifest: '/manifest.json',
  /* Tanpa ini iOS membuka aplikasi yang dipasang ke layar depan di dalam
     Safari lengkap dengan bilah alamatnya, bukan sebagai aplikasi. Dan di iOS
     Web Push hanya bekerja untuk aplikasi yang benar-benar terpasang — jadi
     baris ini bukan soal tampilan. */
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'MAR KMB' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#DC2626',
};

export default async function Layout({ children }: { children: React.ReactNode }) {
  const aku = await akuServer();

  return (
    <html lang="id">
      <body>
        {aku && (
          <NavBar
            aku={{
              peran: aku.peran, nama: aku.nama,
              bolehLihat: aku.bolehLihat, bolehAdmin: aku.bolehAdmin,
            }}
          />
        )}
        {/* Di bawah navbar, di atas segalanya yang lain: kalau ada yang belum
            terkirim, itu hal pertama yang harus dilihat orang — bukan sesuatu
            yang ditemukan sesudah menggulir. */}
        <DaftarSW />
        {children}
      </body>
    </html>
  );
}

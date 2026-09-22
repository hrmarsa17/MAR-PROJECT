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
              mechanicId: aku.mechanicId, peran: aku.peran, nama: aku.nama,
              tenantCode: aku.tenantCode,
              bolehLihat: aku.bolehLihat, bolehAdmin: aku.bolehAdmin,
            }}
          />
        )}
        {/* Di bawah navbar, di atas segalanya yang lain: kalau ada yang belum
            terkirim, itu hal pertama yang harus dilihat orang — bukan sesuatu
            yang ditemukan sesudah menggulir.

            `aku` diturunkan bukan untuk ditampilkan, melainkan untuk DISIMPAN
            ke IndexedDB. Service worker membacanya dari sana untuk tahu peran
            siapa yang sedang masuk — dan tanpa itu seluruh jalur notifikasinya
            berhenti di baris pertama. Lihat DaftarSW. */}
        <DaftarSW
          aku={aku ? { mechanicId: aku.mechanicId, peran: aku.peran, nama: aku.nama } : null}
        />
        {children}
      </body>
    </html>
  );
}

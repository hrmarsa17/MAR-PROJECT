import type { Metadata, Viewport } from 'next';
import { akuServer } from '../lib/sesi.js';
import { NavBar } from './NavBar.js';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mechanic Activity Report',
  description: 'Work order & insentif mekanik',
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
        {children}
      </body>
    </html>
  );
}

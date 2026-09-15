import type { Metadata, Viewport } from 'next';
import { akuServer } from '../lib/sesi.js';
import './globals.css';

export const metadata: Metadata = {
  title: 'KMB Project',
  description: 'Work order & insentif mekanik',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

const LABEL_PERAN: Record<string, string> = {
  mechanic: 'Mekanik',
  supervisor: 'L1 · Planner',
  superintendent: 'L2 · Manager',
};

export default async function Layout({ children }: { children: React.ReactNode }) {
  const aku = await akuServer();
  const approver = aku?.peran === 'supervisor' || aku?.peran === 'superintendent';

  return (
    <html lang="id">
      <body>
        <header className="atas">
          <div className="bungkus">
            <span className="merek">KMB Project</span>
            {aku && (
              <nav>
                <a href="/">Beranda</a>
                <a href="/wo/baru">Buat WO</a>
                {approver && <a href="/approval">Approval</a>}
              </nav>
            )}
            {aku && (
              <span className="aku">
                {aku.nama} · {LABEL_PERAN[aku.peran] ?? aku.peran}
              </span>
            )}
          </div>
        </header>
        <main className="bungkus">{children}</main>
      </body>
    </html>
  );
}

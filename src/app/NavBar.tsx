'use client';

import { usePathname } from 'next/navigation';

/**
 * NAVBAR — urutan, label, dan aturan tampilnya sama persis dengan KMB V2.
 *
 * Diambil dari `Main.html:267-275`. Urutan menu TIDAK boleh diacak "supaya
 * lebih logis": tangan orang lapangan sudah hafal posisinya, dan menggeser
 * satu item berarti melatih ulang dua puluh empat orang untuk sesuatu yang
 * tidak mereka minta.
 */

export interface AksesMenu {
  peran: 'mechanic' | 'supervisor' | 'superintendent';
  nama: string;
  bolehLihat: { performa: boolean; teknis: boolean; report: boolean };
}

const LABEL_PERAN: Record<string, string> = {
  mechanic: 'MEKANIK',
  supervisor: 'PLANNER',
  superintendent: 'MANAGER',
};

export function NavBar({ aku }: { aku: AksesMenu }) {
  const path = usePathname();
  const approver = aku.peran === 'supervisor' || aku.peran === 'superintendent';

  const menu: { href: string; label: string; tampil: boolean }[] = [
    { href: '/performa', label: 'Performa', tampil: aku.bolehLihat.performa },
    { href: '/wo/baru', label: 'Create WO', tampil: true },
    { href: '/monitoring', label: 'Monitoring', tampil: true },
    { href: '/approval', label: 'Approvals', tampil: approver },
    { href: '/teknis', label: 'Teknis', tampil: aku.bolehLihat.teknis },
    { href: '/koreksi/hm', label: 'Koreksi HM', tampil: approver },
    { href: '/koreksi/km', label: 'Koreksi KM', tampil: approver },
    { href: '/reports', label: 'Reports', tampil: aku.bolehLihat.report },
  ];

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <span className="nav-brand">⚙️ Mechanic Activity Report</span>

        <div className="nav-links">
          {menu
            .filter((m) => m.tampil)
            .map((m) => (
              <a
                key={m.href}
                href={m.href}
                className={`nav-link${path === m.href || path.startsWith(m.href + '/') ? ' active' : ''}`}
              >
                {m.label}
              </a>
            ))}
        </div>

        <div className="nav-user">
          <span className="badge badge-purple">{LABEL_PERAN[aku.peran] ?? aku.peran}</span>
          <span className="user-email">{aku.nama}</span>
        </div>
      </div>
    </nav>
  );
}

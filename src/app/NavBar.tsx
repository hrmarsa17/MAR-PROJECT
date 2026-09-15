'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * NAVBAR — urutan, label, dan aturan tampilnya sama persis dengan KMB V2.
 *
 * Diambil dari `Main.html:267-275`. Urutan menu TIDAK boleh diacak "supaya
 * lebih logis": tangan orang lapangan sudah hafal posisinya, dan menggeser
 * satu item berarti melatih ulang dua puluh empat orang untuk sesuatu yang
 * tidak mereka minta.
 *
 * ── <Link>, BUKAN <a> ───────────────────────────────────────────────────────
 * Sampai 15 Sep 2026 menu ini memakai <a href> biasa, dan setiap klik memuat
 * ulang SELURUH halaman: kedip putih, gulir kembali ke atas, navbar sendiri
 * digambar ulang. Itu penyebab terbesar layar ini terasa kaku — bukan warnanya,
 * bukan jaraknya.
 *
 * Dengan <Link>, navbar tetap terpasang dan hanya isinya yang berganti; Next
 * juga mengambil halaman tujuan lebih dulu saat kursor menyentuh menunya.
 * Di titik ini layar justru lebih ringan daripada KMB V2, yang memang tak punya
 * pilihan lain selain memuat ulang.
 */

export interface AksesMenu {
  peran: 'mechanic' | 'supervisor' | 'superintendent';
  nama: string;
  bolehLihat: { performa: boolean; teknis: boolean; report: boolean };
}

/**
 * Lencana peran — 1:1 dengan `MechanicDashboard.html:300-303`.
 *
 * L1 (supervisor) sengaja TANPA lencana; itu permintaan 10 Agu 2026 yang
 * tertulis di sumbernya. Warnanya pun berbeda per peran: mekanik amber,
 * manager ungu. Sampai 16 Sep 2026 layar ini memberi ketiganya lencana ungu
 * yang sama — bukan salah fatal, tapi tiap orang lapangan mengenali dirinya
 * dari warna itu.
 */
const LENCANA: Record<string, { teks: string; kelas: string } | null> = {
  mechanic: { teks: 'MECHANIC', kelas: 'badge badge-warning' },
  supervisor: null,
  superintendent: { teks: 'MANAGER', kelas: 'badge badge-purple' },
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
              <Link
                key={m.href}
                href={m.href}
                className={`nav-link${path === m.href || path.startsWith(m.href + '/') ? ' active' : ''}`}
              >
                {m.label}
              </Link>
            ))}
        </div>

        <div className="nav-user">
          {LENCANA[aku.peran] && (
            <span className={LENCANA[aku.peran]!.kelas}>{LENCANA[aku.peran]!.teks}</span>
          )}
          <span className="user-email">{aku.nama}</span>
        </div>
      </div>
    </nav>
  );
}

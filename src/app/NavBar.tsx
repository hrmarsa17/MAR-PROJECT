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
  bolehAdmin?: boolean;
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

/**
 * ── DUA PINTU MASUK, SATU APLIKASI ──────────────────────────────────────────
 *
 * `/lapangan` adalah pintu kedua: manifest-nya sendiri, ikon sendiri di layar
 * depan HP, dan navbar yang hanya berisi pekerjaan operasional. Dipasang dari
 * sana, HP mendapat aplikasi yang terasa terpisah — persis bentuk yang dikenal
 * orang lapangan dari KMB V2, yang memang punya dua alamat.
 *
 * Bedanya dengan V2: di sana kedua pintu itu DUA KODE. Layar Create WO ditulis
 * sekali di `WorkOrder.html` dan sekali lagi di PWA-nya, dan tiap perbaikan
 * harus dikerjakan dua kali — yang satu selalu tertinggal. Di sini yang berbeda
 * hanya navbar dan alamatnya; layarnya komponen yang sama persis.
 */
const DI_LAPANGAN = (path: string) => path === '/lapangan' || path.startsWith('/lapangan/');

export function NavBar({ aku }: { aku: AksesMenu }) {
  const path = usePathname();
  const approver = aku.peran === 'supervisor' || aku.peran === 'superintendent';

  if (DI_LAPANGAN(path)) return <NavLapangan aku={aku} path={path} approver={approver} />;

  /**
   * ── TIGA PERGESERAN DARI URUTAN V2, ATAS PERMINTAAN GABRIEL 16 SEP 2026 ────
   *
   * 1. Teknis naik menyusul Performa, sehingga KEDUA dashboard berdampingan.
   *    Keduanya tetap DUA menu terpisah — isinya memang berbeda: Performa
   *    tentang kinerja orang, Teknis tentang keadaan alat.
   * 2. Keduanya diberi awalan "Dashboard", supaya apa yang dibuka jelas
   *    sebelum diklik.
   * 3. Koreksi HM dan Koreksi KM disatukan jadi SATU menu. Di V2 keduanya dua
   *    halaman yang isinya identik kecuali kata meternya — dan di sini pun
   *    sudah satu komponen (`LayarKoreksi`), jadi dua menu untuk satu layar
   *    hanya menambah lebar navbar tanpa menambah apa pun.
   *
   * Urutan sisanya TIDAK diacak. Tangan orang lapangan hafal posisinya.
   */
  const menu: { href: string; label: string; tampil: boolean }[] = [
    // Tanpa ikon: lima menu lainnya pun tanpa ikon, dan dua yang berbeda
    // sendiri justru menarik mata ke tempat yang tidak menuntut perhatian.
    { href: '/performa', label: 'Dashboard Performa', tampil: aku.bolehLihat.performa },
    { href: '/teknis', label: 'Dashboard Teknis', tampil: aku.bolehLihat.teknis },
    { href: '/wo/baru', label: 'Create WO', tampil: true },
    { href: '/monitoring', label: 'Monitoring', tampil: true },
    { href: '/approval', label: 'Approvals', tampil: approver },
    { href: '/koreksi', label: 'Koreksi Meter', tampil: approver },
    { href: '/reports', label: 'Reports', tampil: aku.bolehLihat.report },
    // Paling kanan, sesudah semua menu kerja: Admin bukan pekerjaan harian.
    { href: '/admin', label: 'Admin', tampil: aku.bolehAdmin === true },
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

/**
 * NAVBAR LAPANGAN — hanya yang dikerjakan di lapangan.
 *
 * Empat menu, dan tidak lebih. Reports, kedua dashboard, dan Admin sengaja
 * tidak ada di sini: tak satu pun bisa dikerjakan sambil berdiri di sebelah
 * unit, dan tiap menu tambahan adalah satu kemungkinan lagi untuk salah tekan
 * dengan tangan yang kotor oli di layar yang kena matahari.
 *
 * "Antrean" berdiri sebagai menu SENDIRI, bukan disembunyikan di dalam sesuatu.
 * Di mode luring ia jawaban atas satu-satunya pertanyaan yang paling sering
 * ditanyakan orang lapangan — "kiriman saya sudah masuk atau belum?" — dan di
 * KMB V2 pertanyaan itu dijawab dengan menelepon kantor.
 */
function NavLapangan({ aku, path, approver }: {
  aku: AksesMenu; path: string; approver: boolean;
}) {
  /* LABEL, IKON, DAN URUTAN DIAMBIL APA ADANYA DARI PWA KMB V2
     (`mar-offline/index.html:276-281`), yang berbunyi:

         📋 WO Saya   ➕ Buat WO   ✅ Approval   👥 Monitoring

     Dua hal yang sempat saya karang sendiri, dan keduanya salah:

     1. "Kerja Saya" — tidak ada nama itu di mana pun. Yang dikenal orang
        lapangan adalah "WO Saya" untuk pekerjaannya sendiri, dan "Monitoring"
        untuk melihat pekerjaan orang lain. Keduanya nama yang berbeda karena
        isinya memang berbeda, dan approver memakai keduanya.
     2. Ikonnya saya buang. Di navbar tampilan lengkap itu memang benar —
        delapan menu tanpa ikon, konsisten. Tapi PWA V2 memakai ikon, dan di
        layar HP yang kena matahari bentuk lebih cepat dikenali daripada kata.

     Urutannya pun tidak digeser: tangan orang lapangan hafal posisinya. */
  const menu: { href: string; label: string; tampil: boolean }[] = [
    // "WO Saya" HANYA untuk mekanik — `app.js:2583`:
    //     tabWos.style.display = isApprover ? 'none' : '';
    // Approver tidak punya WO sendiri untuk dikerjakan; ia memutuskan WO orang
    // lain. Menampilkannya berarti memberi L1 dan L2 satu menu yang selalu
    // kosong, dan menyiratkan bahwa mereka punya pekerjaan yang belum dikirim.
    { href: '/lapangan/monitoring', label: '📋 WO Saya', tampil: !approver },
    { href: '/lapangan/wo/baru', label: '➕ Buat WO', tampil: true },
    // "Approval" HANYA untuk approver — `app.js:2590`.
    { href: '/lapangan/approval', label: '✅ Approval', tampil: approver },
    /* Antrean tidak ada di V2 sebagai tab; di sana ia baris yang bisa diklik
       dan hanya muncul saat ada yang mengantre (`app.js:2594-2611`). Di sini ia
       menu tetap, atas permintaan Gabriel 16 Sep 2026 — dan alasannya masuk
       akal: baris yang menghilang saat antrean kosong juga menghilangkan satu-
       satunya tempat melihat kiriman yang DITOLAK server. */
    { href: '/lapangan/antrean', label: '📤 Antrean', tampil: true },
  ];

  return (
    <nav className="navbar navbar-lapangan">
      <div className="navbar-inner">
        <span className="nav-brand">⚙️ MAR Lapangan</span>

        <div className="nav-links">
          {menu.filter((m) => m.tampil).map((m) => (
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

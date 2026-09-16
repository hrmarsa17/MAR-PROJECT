import { redirect } from 'next/navigation';
import Link from 'next/link';
import { akuServer } from '../../lib/sesi.js';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * BERANDA LAPANGAN — pintu kedua
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Manifest-nya sendiri, jadi dipasang dari alamat ini HP mendapat ikon dan
 * aplikasi yang terpisah dari pintu utama — bentuk yang sudah dikenal orang
 * lapangan dari KMB V2, yang memang punya dua alamat.
 *
 * Bedanya dengan V2: di sana dua pintu berarti DUA KODE. Layar Create WO
 * ditulis sekali di `WorkOrder.html` dan sekali lagi di PWA-nya; tiap
 * perbaikan dikerjakan dua kali, dan yang satu selalu tertinggal. Di sini yang
 * berbeda hanya navbar, alamat, dan manifest — layarnya komponen yang sama
 * persis.
 *
 * ── KENAPA ADA BERANDA, BUKAN LANGSUNG KE DAFTAR WO ─────────────────────────
 * Karena `start_url` manifest menunjuk ke sini, dan halaman pertama yang
 * terbuka setiap kali aplikasi dinyalakan adalah halaman yang paling sering
 * dilihat orang. Tombol besar bernama jelas lebih baik daripada daftar yang
 * masih memuat — terutama di HP yang sinyalnya belum tentu ada saat dibuka.
 */

export const dynamic = 'force-dynamic';

export default async function Lapangan() {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');
  const approver = aku.peran === 'supervisor' || aku.peran === 'superintendent';

  return (
    <div className="container-sempit lapangan-beranda">
      <div className="page-header">
        <h1 className="page-title">Halo, {aku.nama}</h1>
        <p className="page-subtitle">Apa yang mau dikerjakan?</p>
      </div>

      <div className="lapangan-tombol">
        <Link href="/lapangan/monitoring" className="lapangan-kartu utama">
          <span className="lapangan-ikon">📋</span>
          <span className="lapangan-judul">WO Saya</span>
          <span className="lapangan-ket">WO yang ditugaskan ke Anda, dan kirim jam kerjanya</span>
        </Link>

        <Link href="/lapangan/wo/baru" className="lapangan-kartu">
          <span className="lapangan-ikon">➕</span>
          <span className="lapangan-judul">Buat WO</span>
          <span className="lapangan-ket">Work order baru</span>
        </Link>

        {approver && (
          <Link href="/lapangan/approval" className="lapangan-kartu">
            <span className="lapangan-ikon">✅</span>
            <span className="lapangan-judul">Approval</span>
            <span className="lapangan-ket">WO yang menunggu keputusan Anda</span>
          </Link>
        )}

        <Link href="/lapangan/antrean" className="lapangan-kartu">
          <span className="lapangan-ikon">📤</span>
          <span className="lapangan-judul">Antrean</span>
          <span className="lapangan-ket">Yang belum terkirim ke server</span>
        </Link>
      </div>

      {/* Jalan keluar ke pintu utama. Sengaja kecil dan di bawah: Reports,
          dashboard, dan Admin memang ada, tapi tak satu pun dikerjakan sambil
          berdiri di sebelah unit. Menyembunyikannya sama sekali cuma membuat
          orang mengira aplikasinya rusak. */}
      <p className="lapangan-keluar">
        Butuh Reports, Dashboard, atau Admin?{' '}
        <Link href="/">Buka tampilan lengkap</Link>
      </p>
    </div>
  );
}

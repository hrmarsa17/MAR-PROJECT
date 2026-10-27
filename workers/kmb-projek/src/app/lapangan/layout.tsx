import type { Metadata } from 'next';

/**
 * Manifest lapangan berlaku untuk SELURUH `/lapangan`, bukan cuma berandanya.
 *
 * Next menggabungkan metadata dari layout ke halaman: yang tidak disebut ulang
 * diwarisi dari induknya. Karena `src/app/layout.tsx` menyebut
 * `manifest: '/manifest.json'`, setiap halaman di bawah `/lapangan` yang tidak
 * menyebutnya sendiri akan menunjuk ke manifest PINTU UTAMA.
 *
 * Akibatnya tidak terlihat pada pemakaian biasa — aplikasi yang sudah terpasang
 * memakai manifest yang dibaca saat dipasang, dan tidak membacanya lagi saat
 * berpindah halaman. Tapi orang yang membuka `/lapangan/monitoring` langsung
 * dari tautan lalu menekan Install akan memasang "MAR KMB" ber-scope `/` —
 * aplikasi yang salah, dengan nama yang salah, dan tanpa satu pun tanda bahwa
 * ada yang keliru.
 *
 * Layout ini menyebutkannya sekali untuk seluruh cabang.
 */
export const metadata: Metadata = {
  title: { default: 'MAR Lapangan', template: '%s · MAR Lapangan' },
  manifest: '/lapangan.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'MAR Lapangan' },
};

export default function LayoutLapangan({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useDaring } from '../pwa/useDaring.js';

/**
 * Mendaftarkan service worker, dan menampilkan satu baris keadaan.
 *
 * ── KENAPA TIDAK DIDAFTARKAN SAAT `next dev` ────────────────────────────────
 * Service worker menyimpan berkas, sementara dev server menggantinya tiap kali
 * berkas diubah. Hasilnya layar yang menampilkan kode dari sepuluh menit lalu
 * dan tidak ada satu pun cara menyadarinya — waktu yang hilang untuk mengejar
 * bug yang sudah diperbaiki. Diuji lewat `npm run build && npm start`.
 */
export function DaftarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* Ditolak peramban (mode penyamaran, penyimpanan diblokir). Aplikasi
         tetap jalan penuh selama ada sinyal — hanya mode luringnya yang tidak
         ada. Bukan alasan menampilkan galat kepada orang. */
    });
  }, []);

  return <BarisKeadaan />;
}

function BarisKeadaan() {
  const { daring, antre, umurHari, dorong, sibuk } = useDaring();
  const path = usePathname();

  /* Tautan Antrean harus tetap DI DALAM pintu yang sedang dipakai. Dari
     aplikasi lapangan yang terpasang, `/antrean` berada di luar `scope`
     manifest-nya — peramban akan membukanya di tab biasa lengkap dengan bilah
     alamat, dan itu terbaca seperti aplikasinya keluar sendiri. */
  const keAntrean = path.startsWith('/lapangan') ? '/lapangan/antrean' : '/antrean';

  // Semua beres dan tidak ada yang menunggu: jangan tambahi layar orang.
  if (daring && antre === 0) return null;

  /* Tujuh hari adalah ambang yang nyata, bukan angka pilihan: Safari membuang
     penyimpanan situs yang tidak dibuka sekitar selama itu. Diperingatkan pada
     hari ketiga supaya masih ada waktu mencari sinyal. */
  const menua = umurHari >= 3;

  return (
    <div className={`pita-luring${menua ? ' pita-luring-bahaya' : ''}`} role="status">
      {!daring && <span>📴 Tidak ada sinyal</span>}

      {antre > 0 && (
        <>
          <span>
            {daring ? '📤' : '📴'} {antre} belum terkirim
          </span>
          {menua && (
            <strong>
              — tertua {Math.floor(umurHari)} hari. Cari sinyal, jangan tunggu lagi.
            </strong>
          )}
          <Link href={keAntrean} className="pita-luring-tautan">Lihat antrean</Link>
          {daring && (
            <button type="button" className="pita-luring-tombol" disabled={sibuk} onClick={() => void dorong()}>
              {sibuk ? 'Mengirim…' : 'Kirim sekarang'}
            </button>
          )}
        </>
      )}

      {!daring && antre === 0 && (
        <span className="pita-luring-samar">
          Pekerjaan yang Anda kirim akan tersimpan dan terkirim sendiri.
        </span>
      )}
    </div>
  );
}

'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useDaring, usePintu } from '../pwa/useDaring.js';
import { adaIndexedDb, simpanKv } from '../pwa/simpanan.js';

/**
 * Mendaftarkan service worker, dan menampilkan satu baris keadaan.
 *
 * ── KENAPA TIDAK DIDAFTARKAN SAAT `next dev` ────────────────────────────────
 * Service worker menyimpan berkas, sementara dev server menggantinya tiap kali
 * berkas diubah. Hasilnya layar yang menampilkan kode dari sepuluh menit lalu
 * dan tidak ada satu pun cara menyadarinya — waktu yang hilang untuk mengejar
 * bug yang sudah diperbaiki. Diuji lewat `npm run build && npm start`.
 */
export interface AkuRingkas {
  mechanicId: number;
  peran: 'mechanic' | 'supervisor' | 'superintendent';
  nama: string;
}

export function DaftarSW({ aku }: { aku: AkuRingkas | null }) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* Ditolak peramban (mode penyamaran, penyimpanan diblokir). Aplikasi
         tetap jalan penuh selama ada sinyal — hanya mode luringnya yang tidak
         ada. Bukan alasan menampilkan galat kepada orang. */
    });
  }, []);

  /**
   * SIAPA YANG SEDANG MASUK, DISIMPAN KE IndexedDB.
   *
   * Service worker tidak bisa membaca sesi React, dan cookie httpOnly hanya
   * bisa ia KIRIM, bukan ia baca. Untuk tahu apakah yang memegang HP ini
   * approver atau mekanik — yang menentukan kabar apa yang pantas dikirim — ia
   * membaca `kv.aku` (`public/sw.js:177`).
   *
   * Sampai 17 Sep 2026 tidak ada satu pun kode yang MENULIS kunci itu.
   * Akibatnya `periksaPerubahan()` berhenti di baris pertamanya,
   * `if (!aku) return 0;`, dan SELURUH jalur notifikasi mati untuk semua orang.
   * Tidak ada galat di mana pun: daftar kosong adalah keadaan yang sah, dan
   * diam adalah keadaan yang sah bagi notifikasi.
   */
  useEffect(() => {
    if (!adaIndexedDb()) return;
    void (async () => {
      try {
        /* Yang KELUAR ikut menghapusnya. Kalau tidak, service worker terus
           menarik antrean approval atas nama orang yang sudah pergi, lalu
           mengirim kabarnya ke HP yang sekarang dipegang orang lain. */
        await simpanKv('aku', aku);
      } catch { /* penyimpanan diblokir — notifikasi saja yang tidak jalan */ }
    })();
  }, [aku]);

  return <BarisKeadaan />;
}

function BarisKeadaan() {
  const { daring, antre, umurHari, dorong, sibuk } = useDaring();
  /* Tautan Antrean harus tetap DI DALAM pintu yang sedang dipakai. Dari
     aplikasi lapangan yang terpasang, `/antrean` berada di luar `scope`
     manifest-nya — peramban akan membukanya di tab biasa lengkap dengan bilah
     alamat, dan itu terbaca seperti aplikasinya keluar sendiri. */
  const keAntrean = `${usePintu()}/antrean`;

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

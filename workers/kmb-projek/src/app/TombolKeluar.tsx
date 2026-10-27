'use client';

import { useState } from 'react';
import { adaIndexedDb, antrean, antreanOrangLain } from '../pwa/simpanan.js';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * KELUAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Sampai 17 Sep 2026 tidak ada tombol ini di mana pun, sementara cookie sesinya
 * berumur 90 hari. Akibatnya nyata di lapangan:
 *
 *   - HP dipinjam antar mekanik — hal biasa di shift. Yang meminjam LANGSUNG
 *     masuk sebagai pemilik HP, dan jam kerja yang ia kirim tercatat atas nama
 *     orang lain. Itu jalur uang.
 *   - Orang yang berhenti kerja tetap bisa masuk selama 90 hari, sampai ada
 *     yang ingat mencabut tokennya lewat Admin.
 *   - Di aplikasi yang terpasang tidak ada bilah alamat dan tidak ada menu
 *     peramban. Orang yang masuk sebagai orang lain benar-benar tidak punya
 *     jalan keluar.
 *
 * PWA KMB V2 punya `Logout` (`mar-offline/index.html`). Ia tidak ikut terport.
 *
 * ── ANTREAN TIDAK DIHAPUS SAAT KELUAR ───────────────────────────────────────
 * Kiriman yang belum sampai adalah satu-satunya data di aplikasi ini yang tidak
 * punya salinan di tempat lain. Menghapusnya saat keluar berarti membuang jam
 * kerja seseorang karena ia menekan tombol yang sama sekali tidak berbunyi
 * "buang pekerjaan saya".
 *
 * Yang dilakukan justru sebaliknya: antrean itu DITANDAI miliknya
 * (`ItemOutbox.milik`), jadi ia menunggu dengan sabar sampai orangnya masuk
 * lagi — di HP ini atau di HP mana pun — dan TIDAK ikut terkirim lewat sesi
 * orang berikutnya.
 *
 * Yang dihapus hanya salinan yang boleh basi: katalog, daftar WO, antrean
 * approval, dan seluruh Cache Storage. Semuanya bisa diambil lagi dari server.
 */
export function TombolKeluar({ mechanicId }: { mechanicId: number }) {
  const [sibuk, setSibuk] = useState(false);

  async function keluar() {
    if (sibuk) return;

    /* Diberitahu, bukan dihalangi. Orang yang perlu menyerahkan HP-nya sekarang
       tidak boleh ditahan oleh sinyal yang tidak ada — yang ia butuhkan adalah
       tahu bahwa pekerjaannya tidak hilang. */
    if (adaIndexedDb()) {
      try {
        const punyaku = (await antrean(mechanicId)).length;
        const lain = await antreanOrangLain(mechanicId);
        if (punyaku > 0) {
          const lanjut = confirm(
            `Masih ada ${punyaku} kiriman Anda yang belum sampai ke server.\n\n`
            + 'Semuanya TIDAK akan hilang dan TIDAK akan terkirim atas nama orang '
            + 'lain — ia menunggu sampai Anda masuk lagi di HP ini.\n\n'
            + 'Kalau HP ini akan dipegang orang lain untuk waktu lama, lebih baik '
            + 'cari sinyal dulu dan tekan "Kirim sekarang".\n\nTetap keluar?',
          );
          if (!lanjut) return;
        } else if (lain > 0) {
          alert(`Catatan: ada ${lain} kiriman milik orang lain yang masih `
            + 'menunggu di HP ini. Itu bukan milik Anda dan tidak akan terkirim '
            + 'lewat akun Anda.');
        }
      } catch { /* penyimpanan diblokir — keluar saja, tidak ada antrean */ }
    }

    setSibuk(true);
    try {
      await fetch('/api/masuk', { method: 'DELETE' });
    } catch {
      /* Tanpa sinyal, cookie di server tidak bisa dihapus — tapi yang menentukan
         adalah cookie di HP ini, dan itu dihapus jawaban DELETE. Kalau
         jawabannya tak pernah sampai, teruskan saja: langkah berikutnya
         membuang simpanan, dan layar masuk akan menolaknya. */
    }

    /* Cache Storage dibuang lewat service worker. Tanpa ini, halaman hasil
       render milik orang sebelumnya masih tersimpan, dan orang berikutnya di HP
       yang sama bisa melihatnya saat luring. */
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      reg?.active?.postMessage('buang-cache');
    } catch { /* tidak ada service worker — tidak ada cache untuk dibuang */ }

    /* Simpanan yang boleh basi dibuang; OUTBOX TIDAK DISENTUH. */
    if (adaIndexedDb()) {
      try {
        const { simpanKv } = await import('../pwa/simpanan.js');
        await Promise.all([
          simpanKv('aku', null),
          simpanKv('katalog', null),
          simpanKv('approval', null),
          simpanKv('monitoring', null),
          simpanKv('sw_snap', null),
        ]);
      } catch { /* diblokir — layar masuk tetap menolak tanpa cookie */ }
    }

    /* `location.assign`, bukan router.push: seluruh keadaan React harus dibuang
       bersama sesinya. Navigasi klien akan mempertahankan komponen yang masih
       memegang data orang sebelumnya di memori. */
    location.assign('/masuk');
  }

  return (
    <button
      type="button"
      className="nav-keluar"
      disabled={sibuk}
      onClick={() => void keluar()}
      title="Keluar dari akun ini di HP/peramban ini"
    >
      {sibuk ? '…' : 'Keluar'}
    </button>
  );
}

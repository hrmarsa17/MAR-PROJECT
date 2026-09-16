'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Pintu mana yang sedang dipakai — '' untuk tampilan lengkap, '/lapangan' untuk
 * aplikasi lapangan.
 *
 * ── `usePathname()` BISA MENGEMBALIKAN null ─────────────────────────────────
 * Tipenya `string`, tapi pada halaman yang dirender statis ia bisa null saat
 * hidrasi. Dan `null.startsWith(...)` melempar TypeError SAAT RENDER — bukan
 * di dalam effect, jadi tidak ada try/catch yang menangkapnya dan React
 * merobohkan seluruh pohon.
 *
 * Yang terlihat orang: "Application error: a client-side exception has
 * occurred", layar putih, di SETIAP halaman — karena pemanggilnya ada di
 * layout. Itu yang terjadi di produksi 16 Sep 2026, beberapa menit sesudah
 * pita luring dipasang.
 *
 * Dipusatkan di sini supaya hanya ada SATU tempat yang perlu benar.
 */
export function pintu(path: string | null): '' | '/lapangan' {
  return path?.startsWith('/lapangan') ? '/lapangan' : '';
}

/** Hook pembungkusnya, untuk komponen yang butuh awalan rute. */
export function usePintu(): '' | '/lapangan' {
  return pintu(usePathname());
}
import { adaIndexedDb, antrean, umurAntreanHari } from './simpanan.js';
import { kosongkanAntrean } from './kirim.js';

/**
 * Keadaan sambungan dan antrean, beserta yang mendorong antrean itu bergerak.
 *
 * ── KENAPA PEMICUNYA ADA EMPAT ──────────────────────────────────────────────
 * Di Chrome/Android, Background Sync mengurus semuanya: antrean terkirim walau
 * aplikasi sudah ditutup. Di iOS, Background Sync TIDAK ADA — Safari tidak
 * pernah menjalankan service worker di latar belakang untuk keperluan ini.
 *
 * Artinya di separuh HP lapangan, antrean hanya bergerak kalau HALAMAN yang
 * menggerakkannya. Maka keempatnya:
 *
 *   1. saat dipasang            — begitu aplikasi dibuka
 *   2. event `online`           — sinyal pulih selagi layar menyala
 *   3. `visibilitychange`       — kembali dari saku, atau dari aplikasi lain
 *   4. selang waktu 30 detik    — HANYA selagi terlihat, dan hanya bila ada antrean
 *
 * Yang keempat sengaja dibatasi: menembak terus-menerus di HP tanpa sinyal
 * menguras baterai orang yang sedang bekerja seharian di lapangan, dan tidak
 * satu pun kiriman jadi lebih cepat karenanya.
 */
export interface KeadaanLuring {
  daring: boolean;
  /** Berapa yang belum sampai ke server. */
  antre: number;
  /** Umur item tertua, dalam hari. Nol kalau antrean kosong. */
  umurHari: number;
  /** Mengosongkan antrean sekarang juga. Aman ditekan berkali-kali. */
  dorong: () => Promise<void>;
  /** Sedang mengirim. */
  sibuk: boolean;
}

const SELANG_MS = 30_000;

export function useDaring(): KeadaanLuring {
  /* Bawaannya `true`, BUKAN dibaca dari navigator, karena render pertama
     terjadi di server tempat `navigator` tidak ada. Menebak "luring" di sana
     membuat layar berkedip memperlihatkan spanduk luring kepada orang yang
     sinyalnya baik-baik saja. */
  const [daring, setDaring] = useState(true);
  const [antre, setAntre] = useState(0);
  const [umurHari, setUmurHari] = useState(0);
  const [sibuk, setSibuk] = useState(false);
  const sedang = useRef(false);

  const hitung = useCallback(async () => {
    if (!adaIndexedDb()) return;
    try {
      setAntre((await antrean()).length);
      setUmurHari(await umurAntreanHari());
    } catch { /* penyimpanan diblokir — indikator saja yang tidak akurat */ }
  }, []);

  const dorong = useCallback(async () => {
    /* Penjaga masuk-ganda: `online` dan `visibilitychange` sering menyala
       bersamaan saat HP dikeluarkan dari saku. Dua pengosongan yang berjalan
       bersamaan akan mengirim item yang sama dua kali — `op_id` menahannya di
       server, tapi dua permintaan lewat sinyal lapangan yang tipis adalah
       pemborosan yang bisa dihindari di sini. */
    if (sedang.current) return;
    sedang.current = true;
    setSibuk(true);
    try {
      await kosongkanAntrean();
    } catch { /* biar antrean tetap; percobaan berikutnya menyusul */ }
    sedang.current = false;
    setSibuk(false);
    await hitung();
  }, [hitung]);

  useEffect(() => {
    setDaring(navigator.onLine !== false);
    void hitung();
    void dorong();

    const naik = () => { setDaring(true); void dorong(); };
    const turun = () => setDaring(false);
    const lihat = () => {
      if (document.visibilityState !== 'visible') return;
      setDaring(navigator.onLine !== false);
      void dorong();
    };

    window.addEventListener('online', naik);
    window.addEventListener('offline', turun);
    document.addEventListener('visibilitychange', lihat);

    const jam = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (!navigator.onLine) return;
      void (async () => { if ((await antrean()).length > 0) await dorong(); })();
    }, SELANG_MS);

    return () => {
      window.removeEventListener('online', naik);
      window.removeEventListener('offline', turun);
      document.removeEventListener('visibilitychange', lihat);
      clearInterval(jam);
    };
  }, [dorong, hitung]);

  return { daring, antre, umurHari, dorong, sibuk };
}

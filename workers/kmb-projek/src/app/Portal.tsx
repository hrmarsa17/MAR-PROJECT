'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Memindahkan isinya ke <body>, keluar dari induknya di pohon DOM.
 *
 * ── KENAPA INI PERLU, DAN BUKAN KERAPIAN ────────────────────────────────────
 * `position: fixed` biasanya mengacu ke layar. Biasanya. Begitu SALAH SATU
 * leluhurnya punya `transform`, `filter`, `perspective`, `backdrop-filter`,
 * atau `will-change` yang bukan `none`, leluhur itu berubah jadi containing
 * block — dan `fixed` di dalamnya mengacu ke DIA, bukan ke layar.
 *
 * Itu yang terjadi 15 Sep 2026. Lapisan gerak memasang
 *
 *     .wo-card:hover { transform: translateY(-2px); }
 *
 * dan modal Edit Override dirender DI DALAM kartu WO. Akibatnya persis seperti
 * yang dilaporkan Gabriel: modalnya muncul menempel di atas kartu saat kursor
 * menyentuh kartu itu, kembali ke tengah layar saat kursor menjauh, dan
 * terpotong karena `.card` punya `overflow: hidden`.
 *
 * Tiga gejala, satu sebab, dan tak satu pun kelihatan dari membaca kode
 * modalnya. Menaikkan z-index tidak menolong sama sekali — persoalannya bukan
 * urutan tumpukan melainkan titik acuannya.
 *
 * Maka modal apa pun dibungkus ini. Di <body> tak ada leluhur yang bisa
 * menjebaknya.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  // Render pertama di server tidak punya document. Menunggu satu putaran
  // menghindari ketidakcocokan hidrasi.
  const [siap, setSiap] = useState(false);
  useEffect(() => { setSiap(true); }, []);
  if (!siap) return null;
  return createPortal(children, document.body);
}

'use client';

import { useRef, useState } from 'react';

/**
 * PICKER TANGGAL & JAM, SELALU 24 JAM. Port dari `DateTime24.html`.
 *
 * KENAPA bukan `<input type="datetime-local">`: format 12/24 jam picker bawaan
 * ditentukan LOCALE PERANGKAT, bukan HTML. Di ponsel ber-locale Inggris ia
 * memunculkan AM/PM — bentuk yang tidak dipakai di lapangan sini, dan sumber
 * salah isi yang mahal: jam 13.00 terbaca "1", tersimpan jadi 01.00, dan
 * `session_hours` meleset dua belas jam. Itu jalur uang.
 *
 * Tidak ada atribut HTML/CSS yang bisa memaksanya, jadi bagian jamnya dibuat
 * sendiri. Bagian TANGGAL tetap `<input type="date">` — di sana tidak ada
 * urusan AM/PM.
 *
 * ── TIGA BAGIAN MENYIMPAN ISINYA SENDIRI, DAN ITU WAJIB ─────────────────────
 * Sampai 16 Sep 2026 ketiga kontrol di sini DITURUNKAN dari satu nilai
 * gabungan: `tgl = nilai.slice(0,10)`, dan `susun()` mengirim string KOSONG ke
 * atas selama ketiganya belum lengkap.
 *
 * Akibatnya picker ini tidak bisa diisi sama sekali. Pilih tanggal → yang naik
 * ke induk masih `''` karena jam belum diisi → `tgl` dihitung ulang jadi `''`
 * → kotaknya kosong lagi seketika. Pilih jam → hal yang sama. Ketiganya saling
 * menghapus, dan karena tak satu pun bisa terisi lebih dulu, gabungannya tak
 * akan pernah lengkap. Yang terlihat di layar: kalender terbuka, tanggal
 * dipilih, lalu tidak terjadi apa-apa — persis seperti kontrol yang mati.
 *
 * `DateTime24.html` tidak punya penyakit ini karena di sana ketiga kontrol
 * adalah elemen DOM biasa yang memegang nilainya sendiri; yang gabungan cuma
 * ditulis ke sebuah `input hidden`. Bentuk itu yang ditiru di sini: state
 * lokal untuk tiap bagian, dan gabungannya baru naik ke induk.
 *
 * Nilai keluar-masuk tetap `YYYY-MM-DDTHH:MM`, sama persis dengan
 * `datetime-local`, sehingga yang membacanya tidak perlu tahu bedanya.
 */

const DUA = (n: number) => String(n).padStart(2, '0');
const JAM = Array.from({ length: 24 }, (_, i) => DUA(i));
const MENIT = Array.from({ length: 60 }, (_, i) => DUA(i));

export function PilihWaktu24({
  id, nilai, onUbah, mati = false,
}: {
  id: string;
  nilai: string;
  onUbah: (baru: string) => void;
  mati?: boolean;
}) {
  const [tgl, setTgl] = useState(() => nilai.slice(0, 10));
  const [jam, setJam] = useState(() => nilai.slice(11, 13));
  const [mnt, setMnt] = useState(() => nilai.slice(14, 16));

  /* Ikut berubah saat INDUK yang menulis — tombol "Finish & Isi Jam" mengisi
     kedua picker, "Reset" mengosongkannya. Dibandingkan dengan nilai yang
     terakhir kali diketahui, bukan dipasang tiap gambar ulang: kalau tiap
     gambar ulang, isian yang baru terisi sebagian akan terhapus lagi — dan
     itulah bug yang baru saja diperbaiki. */
  const terakhir = useRef(nilai);
  if (nilai !== terakhir.current) {
    terakhir.current = nilai;
    setTgl(nilai.slice(0, 10));
    setJam(nilai.slice(11, 13));
    setMnt(nilai.slice(14, 16));
  }

  // Belum lengkap = kosong KE ATAS, tapi yang sudah dipilih tetap terlihat di
  // layar. Separuh terisi tidak boleh jadi waktu tebakan; validasi tombol
  // Kirim yang menolaknya, bukan kotaknya yang mengosongkan diri.
  function susun(t: string, j: string, m: string) {
    const gabung = t && j !== '' && m !== '' ? `${t}T${j}:${m}` : '';
    terakhir.current = gabung;
    onUbah(gabung);
  }

  return (
    <div className="dt24">
      <input
        type="date" className="form-control dtTgl" aria-label="Tanggal"
        id={id} value={tgl} disabled={mati}
        onChange={(e) => { setTgl(e.target.value); susun(e.target.value, jam, mnt); }}
      />
      <select
        className="form-control dtJam" aria-label="Jam"
        value={jam} disabled={mati}
        onChange={(e) => { setJam(e.target.value); susun(tgl, e.target.value, mnt); }}
      >
        <option value="">--</option>
        {JAM.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="dtTitik">:</span>
      <select
        className="form-control dtMnt" aria-label="Menit"
        value={mnt} disabled={mati}
        onChange={(e) => { setMnt(e.target.value); susun(tgl, jam, e.target.value); }}
      >
        <option value="">--</option>
        {MENIT.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
    </div>
  );
}

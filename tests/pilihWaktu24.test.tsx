// @vitest-environment happy-dom
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PilihWaktu24 } from '../src/app/PilihWaktu24.js';

/**
 * PICKER 24 JAM — uji pertama di proyek ini yang benar-benar menggambar
 * komponen React.
 *
 * Alasannya satu kejadian nyata, 16 Sep 2026: picker jam di modal kerja tidak
 * bisa diisi sama sekali. Ketiga kontrolnya diturunkan dari satu nilai
 * gabungan, dan gabungan itu KOSONG selama belum lengkap — sehingga tiap
 * bagian yang baru dipilih langsung terhapus oleh bagian lain yang masih
 * kosong. Di layar terlihat seperti kontrol mati.
 *
 * Tidak ada satu pun uji yang bisa menangkapnya: seluruh uji di proyek ini
 * menyentuh basis data dan perintah, tak satu pun menyentuh komponen. Maka
 * lingkungan DOM dipasang, dan yang diuji di sini BUKAN nama fungsinya
 * melainkan apa yang dirasakan mekanik: "saya pilih tanggal, tanggalnya
 * bertahan".
 */

/* Pembersihan antar uji TIDAK otomatis di sini: RTL memasangnya sendiri hanya
   kalau `globals` vitest menyala. Tanpa ini, komponen dari uji sebelumnya
   tertinggal di dokumen dan pencarian label menemukan dua kontrol bernama sama. */
afterEach(cleanup);

/** Induk sungguhan: menyimpan nilainya, persis seperti ModalKerja. */
function Induk({ awal = '' }: { awal?: string }) {
  const [nilai, setNilai] = useState(awal);
  return (
    <>
      <PilihWaktu24 id="uji" nilai={nilai} onUbah={setNilai} />
      <output data-testid="keluar">{nilai}</output>
    </>
  );
}

const tanggal = () => screen.getByLabelText('Tanggal') as HTMLInputElement;
const jam = () => screen.getByLabelText('Jam') as HTMLSelectElement;
const menit = () => screen.getByLabelText('Menit') as HTMLSelectElement;
const keluar = () => screen.getByTestId('keluar').textContent;

describe('PilihWaktu24', () => {
  it('tanggal yang dipilih BERTAHAN walau jam & menit belum diisi', () => {
    render(<Induk />);
    fireEvent.change(tanggal(), { target: { value: '2026-09-16' } });
    // Inilah bugnya dulu: kotaknya kosong lagi seketika.
    expect(tanggal().value).toBe('2026-09-16');
    // Ke atas tetap kosong — separuh terisi bukan waktu yang sah.
    expect(keluar()).toBe('');
  });

  it('jam yang dipilih bertahan walau tanggal & menit belum diisi', () => {
    render(<Induk />);
    fireEvent.change(jam(), { target: { value: '08' } });
    expect(jam().value).toBe('08');
    expect(keluar()).toBe('');
  });

  it('bertahap: tanggal, lalu jam, lalu menit — tak satu pun terhapus', () => {
    render(<Induk />);
    fireEvent.change(tanggal(), { target: { value: '2026-09-16' } });
    fireEvent.change(jam(), { target: { value: '08' } });
    expect(tanggal().value).toBe('2026-09-16');   // masih ada setelah jam diisi
    fireEvent.change(menit(), { target: { value: '30' } });

    expect(tanggal().value).toBe('2026-09-16');
    expect(jam().value).toBe('08');
    expect(menit().value).toBe('30');
    // Baru sekarang nilainya naik ke induk, dalam bentuk datetime-local.
    expect(keluar()).toBe('2026-09-16T08:30');
  });

  it('mengoreksi jam setelah lengkap tidak menghapus tanggal', () => {
    render(<Induk awal="2026-09-16T08:30" />);
    fireEvent.change(jam(), { target: { value: '17' } });
    expect(tanggal().value).toBe('2026-09-16');
    expect(menit().value).toBe('30');
    expect(keluar()).toBe('2026-09-16T17:30');
  });

  it('nilai dari induk terpasang ke tiga kontrolnya (tombol Finish)', () => {
    render(<Induk awal="2026-09-16T23:05" />);
    expect(tanggal().value).toBe('2026-09-16');
    expect(jam().value).toBe('23');
    expect(menit().value).toBe('05');
  });

  it('jam ditawarkan 00-23, tanpa AM/PM', () => {
    render(<Induk />);
    const pilihan = Array.from(jam().options).map((o) => o.value);
    expect(pilihan).toEqual(['', ...Array.from({ length: 24 },
      (_, i) => String(i).padStart(2, '0'))]);
    expect(pilihan).toContain('13');   // 13.00, bukan "1 PM"
    expect(menit().options.length).toBe(61);
  });
});

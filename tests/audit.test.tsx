// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { Audit } from '../src/app/admin/Audit.js';
import type { BarisAudit, HasilAudit } from '../src/domain/kueriAudit.js';

/**
 * RIWAYAT PERUBAHAN — layarnya.
 *
 * Yang diuji di sini bukan kuerinya (itu di scripts/uji-audit.ts), melainkan
 * apakah jawaban atas pertanyaan yang membuat layar ini dibangun benar-benar
 * TERGAMBAR: "8 → 3" harus terbaca, bukan tersembunyi di balik klik.
 */

afterEach(cleanup);

const BARIS = (b: Partial<BarisAudit> = {}): BarisAudit => ({
  id: 1, waktu: '2026-09-16T07:52:12.986Z', aksi: 'admin_job_ubah',
  label: 'Ubah job', kategori: 'katalog', uang: false, entitas: 'job',
  judul: 'JOB-1210 — Washing', aktor: 'Manager Uji',
  perubahan: [{ medan: 'Jam rencana', lama: '8', baru: '3' }],
  konteks: [{ kunci: 'kode', nilai: 'JOB-1210' }],
  ...b,
});

function pasang(baris: BarisAudit[], adaLagi = false) {
  const jawab: HasilAudit = {
    baris, kursor: baris.length ? baris[baris.length - 1]!.id : null, adaLagi,
    aktor: [{ id: 4, nama: 'Manager Uji' }, { id: 3, nama: 'Planner Uji' }],
  };
  const ambil = vi.fn().mockResolvedValue({
    ok: true, json: async () => ({ ok: true, data: jawab }),
  });
  vi.stubGlobal('fetch', ambil);
  render(<Audit akuId={4} />);
  return ambil;
}

describe('Riwayat perubahan', () => {
  it('menggambar "dari berapa ke berapa" apa adanya, tanpa perlu diklik', async () => {
    pasang([BARIS()]);
    await waitFor(() => expect(screen.getByText('Jam rencana')).toBeTruthy());
    const b = screen.getByText('Jam rencana').closest('.audit-ubah-baris') as HTMLElement;
    expect(within(b).getByText('8')).toBeTruthy();
    expect(within(b).getByText('3')).toBeTruthy();
  });

  it('menyebut job mana dan siapa yang mengubahnya', async () => {
    pasang([BARIS()]);
    await waitFor(() => expect(screen.getByText('JOB-1210 — Washing')).toBeTruthy());
    expect(screen.getByText(/Manager Uji/)).toBeTruthy();
  });

  it('nilai lama dicoret, nilai baru ditebalkan — arahnya terbaca sekilas', async () => {
    pasang([BARIS()]);
    await waitFor(() => expect(screen.getByText('8')).toBeTruthy());
    expect(screen.getByText('8').className).toContain('riwayat-lama');
    expect(screen.getByText('3').className).toContain('riwayat-baru');
  });

  it('baris yang menggeser uang ditandai, bukan terlihat sama dengan yang lain', async () => {
    pasang([BARIS({ uang: true, label: 'Terapkan tarif ke semua WO' })]);
    await waitFor(() => expect(screen.getByText('menggeser uang')).toBeTruthy());
    expect(document.querySelector('.audit-baris.uang')).toBeTruthy();
  });

  it('baris tanpa perubahan apa pun tidak menggambar blok kosong', async () => {
    // Token terbit, WO dibuat, detail disimpan — semuanya tanpa lama→baru.
    pasang([BARIS({ aksi: 'admin_token_terbit', label: 'Terbitkan token', perubahan: [] })]);
    await waitFor(() => expect(screen.getByText('Terbitkan token')).toBeTruthy());
    expect(document.querySelector('.audit-ubah')).toBeNull();
  });

  it('memanggil rute audit, bukan rute lain', async () => {
    const ambil = pasang([BARIS()]);
    await waitFor(() => expect(ambil).toHaveBeenCalled());
    expect(String(ambil.mock.calls[0]![0])).toContain('jenis=audit');
  });

  it('saringan kategori ikut terkirim ke server, bukan disaring di layar', async () => {
    const ambil = pasang([BARIS()]);
    await waitFor(() => expect(ambil).toHaveBeenCalled());
    screen.getByRole('button', { name: 'Work order' }).click();
    await waitFor(() => expect(ambil.mock.calls.length).toBeGreaterThan(1));
    const terakhir = String(ambil.mock.calls[ambil.mock.calls.length - 1]![0]);
    expect(terakhir).toContain('kategori=wo');
  });

  it('"hanya perubahan saya" mengirim id saya', async () => {
    const ambil = pasang([BARIS()]);
    await waitFor(() => expect(ambil).toHaveBeenCalled());
    (screen.getByLabelText('Hanya perubahan saya') as HTMLInputElement).click();
    await waitFor(() => expect(ambil.mock.calls.length).toBeGreaterThan(1));
    expect(String(ambil.mock.calls[ambil.mock.calls.length - 1]![0])).toContain('aktor=4');
  });

  it('tombol "muat yang lebih lama" hanya muncul kalau memang ada lagi', async () => {
    pasang([BARIS()], false);
    await waitFor(() => expect(screen.getByText('JOB-1210 — Washing')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /lebih lama/ })).toBeNull();

    cleanup();
    pasang([BARIS()], true);
    await waitFor(() => expect(screen.getByRole('button', { name: /lebih lama/ })).toBeTruthy());
  });

  it('daftar kosong menjelaskan apa yang harus dilakukan, bukan diam', async () => {
    pasang([]);
    await waitFor(() => expect(screen.getByText(/Tidak ada perubahan yang cocok/)).toBeTruthy());
    expect(screen.getByText(/Longgarkan saringannya/)).toBeTruthy();
  });
});

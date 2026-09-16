// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Katalog } from '../src/app/admin/Katalog.js';
import type { BekalAdmin } from '../src/domain/admin.js';

/**
 * KATALOG JOB — yang diuji di sini adalah LAYARNYA, bukan domainnya.
 *
 * Alasannya sebuah kejadian nyata: sebuah kotak isian pernah tergambar DUA KALI
 * di layar transfer, dan tak satu pun uji menangkapnya karena semuanya menguji
 * perintah dan basis data. Yang menemukannya Gabriel, di layar.
 *
 * Tiga hal yang dijaga di sini, ketiganya pernah nyaris jadi jebakan:
 *
 *   1. Section CASCADE menuntut Model → Komponen → Sub-komponen. Kalau
 *      formulirnya tidak menanyakannya, job tersimpan rapi lalu tidak pernah
 *      muncul di layar buat WO — data mati tanpa satu pun tanda.
 *   2. Tombol "Terapkan ke semua WO" TIDAK boleh mensyaratkan ada suntingan yang
 *      belum disimpan. Yang dibandingkannya katalog dengan snapshot WO, bukan
 *      kotak isian dengan katalog; kalau syaratnya salah, orang yang menekan
 *      Simpan lebih dulu menemukan tombolnya mati selamanya tanpa sebab.
 *   3. Nama pekerjaan harus benar-benar bisa disunting, dan Simpan harus hidup
 *      hanya kalau ADA yang berubah.
 */

afterEach(cleanup);

/* `useRouter` hanya hidup di dalam App Router yang sungguhan. Di sini yang
   diuji tabelnya, bukan navigasinya — jadi routernya dipalsukan seadanya. */
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

const JOB_FIELD: BekalAdmin['job'][number] = {
  id: 1, kode: 'JOB-1210', nama: 'Remove & Install Cylinder Head', section: 'field',
  basePoints: 20, planHours: 8, aktif: true,
  unitModel: 'hauler', komponen: 'Engine', subKomponen: 'Cylinder Head',
  woApproved: 12,
};
const JOB_BELUM_DIPAKAI: BekalAdmin['job'][number] = {
  ...JOB_FIELD, id: 2, kode: 'JOB-1211', nama: 'Ganti Turbocharger', woApproved: 0,
};
const JOB_TYRE: BekalAdmin['job'][number] = {
  id: 3, kode: 'COM-001', nama: 'Rotasi Ban', section: 'tyreman',
  basePoints: 6, planHours: 2, aktif: true,
  unitModel: null, komponen: null, subKomponen: null, woApproved: 0,
};

const BEKAL: BekalAdmin = {
  orang: [], tarif: [], faktor: [], setelan: [],
  section: ['field', 'tyreman'],
  bentukSection: [
    { code: 'field', picker: 'cascade' },
    { code: 'tyreman', picker: 'flat' },
  ],
  job: [JOB_FIELD, JOB_BELUM_DIPAKAI, JOB_TYRE],
  cabang: [
    { section: 'field', model: 'hauler', komponen: 'Engine', subKomponen: 'Cylinder Head' },
    { section: 'field', model: 'hauler', komponen: 'Engine', subKomponen: 'Turbocharger' },
    { section: 'field', model: 'dozer', komponen: 'Undercarriage', subKomponen: 'Track Link' },
  ],
};

function pasang(kirim = vi.fn().mockResolvedValue({})) {
  render(<Katalog bekal={BEKAL} kirim={kirim} sibuk={false} />);
  return kirim;
}

/** Baris tabel yang memuat kode job tertentu. */
function baris(kode: string): HTMLElement {
  const sel = screen.getAllByText(kode).find((e) => e.closest('tr'));
  if (!sel) throw new Error(`baris ${kode} tidak ada di layar`);
  return sel.closest('tr') as HTMLElement;
}

function bukaLembar(label: string) {
  fireEvent.click(screen.getByRole('button', { name: label }));
}

describe('Katalog job — tabel', () => {
  it('membuka lembar section pertama dan menampilkan jobnya', () => {
    pasang();
    expect(screen.getByText(/2 job di section field/)).toBeTruthy();
    expect(baris('JOB-1210')).toBeTruthy();
  });

  it('menampilkan cabang cascade tiap job, supaya dua job senama bisa dibedakan', () => {
    pasang();
    expect(within(baris('JOB-1210')).getByText(/hauler · Engine · Cylinder Head/)).toBeTruthy();
  });

  it('nama pekerjaan bisa disunting di tempat', () => {
    pasang();
    const kotak = within(baris('JOB-1210')).getByDisplayValue(
      'Remove & Install Cylinder Head',
    ) as HTMLInputElement;
    fireEvent.change(kotak, { target: { value: 'Remove & Install Cyl Head (rev)' } });
    expect(kotak.value).toBe('Remove & Install Cyl Head (rev)');
  });

  it('Simpan mati selama belum ada yang berubah, lalu hidup setelah diubah', () => {
    pasang();
    const b = () => within(baris('JOB-1210')).getByRole('button', { name: 'Simpan' }) as HTMLButtonElement;
    expect(b().disabled).toBe(true);

    fireEvent.change(
      within(baris('JOB-1210')).getByDisplayValue('Remove & Install Cylinder Head'),
      { target: { value: 'Nama Baru' } },
    );
    expect(b().disabled).toBe(false);
  });

  it('mengirim nama baru bersama angkanya, bukan angkanya saja', () => {
    const kirim = pasang();
    fireEvent.change(
      within(baris('JOB-1210')).getByDisplayValue('Remove & Install Cylinder Head'),
      { target: { value: 'Nama Baru' } },
    );
    fireEvent.click(within(baris('JOB-1210')).getByRole('button', { name: 'Simpan' }));

    expect(kirim).toHaveBeenCalledWith('admin_job', expect.objectContaining({
      jobId: 1, nama: 'Nama Baru', basePoints: 20, planHours: 8, aktif: true,
    }), expect.any(String));
  });

  it('kolom Aktif bisa dimatikan — job salah tambah tidak perlu menunggu impor Excel', () => {
    const kirim = pasang();
    const centang = within(baris('JOB-1210')).getByRole('checkbox') as HTMLInputElement;
    fireEvent.click(centang);
    fireEvent.click(within(baris('JOB-1210')).getByRole('button', { name: 'Simpan' }));
    expect(kirim).toHaveBeenCalledWith('admin_job', expect.objectContaining({ aktif: false }),
      expect.any(String));
  });
});

describe('Katalog job — tombol "Terapkan ke semua WO"', () => {
  const tombol = (kode: string) =>
    within(baris(kode)).getByRole('button', { name: 'Terapkan ke semua WO' }) as HTMLButtonElement;

  it('mati untuk job yang belum pernah dipakai WO approved', () => {
    pasang();
    expect(tombol('JOB-1211').disabled).toBe(true);
  });

  it('HIDUP walau belum ada suntingan — yang dibandingkan snapshot WO, bukan kotak isian', () => {
    pasang();
    expect(tombol('JOB-1210').disabled).toBe(false);
  });

  it('tetap hidup sesudah angkanya diubah', () => {
    pasang();
    fireEvent.change(within(baris('JOB-1210')).getAllByRole('spinbutton')[0]!,
      { target: { value: '40' } });
    expect(tombol('JOB-1210').disabled).toBe(false);
  });

  it('warnanya berbeda dari Simpan — ia menggeser gaji yang sudah dibayar', () => {
    pasang();
    expect(tombol('JOB-1210').className).toContain('btn-danger');
    expect(within(baris('JOB-1210')).getByRole('button', { name: 'Simpan' }).className)
      .toContain('btn-primary');
  });
});

describe('Katalog job — "+ Tambah job"', () => {
  it('section cascade menanyakan Model, Komponen, dan Sub-komponen', () => {
    pasang();
    fireEvent.click(screen.getByRole('button', { name: '+ Tambah job' }));
    expect(screen.getByLabelText(/Model unit/)).toBeTruthy();
    expect(screen.getByLabelText(/^Komponen/)).toBeTruthy();
    expect(screen.getByLabelText(/Sub-komponen/)).toBeTruthy();
  });

  it('section datar TIDAK menanyakannya', () => {
    pasang();
    bukaLembar('Job — tyreman');
    fireEvent.click(screen.getByRole('button', { name: '+ Tambah job' }));
    expect(screen.queryByLabelText(/Model unit/)).toBeNull();
  });

  it('tombol Tambah mati sampai cabangnya lengkap', () => {
    pasang();
    fireEvent.click(screen.getByRole('button', { name: '+ Tambah job' }));
    const simpan = () => screen.getByRole('button', { name: 'Tambah job' }) as HTMLButtonElement;

    fireEvent.change(screen.getByLabelText(/Kode job/), { target: { value: 'JOB-9001' } });
    fireEvent.change(screen.getByLabelText(/Nama pekerjaan/), { target: { value: 'Pekerjaan Baru' } });
    fireEvent.change(screen.getByLabelText(/Base point/), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText(/Jam rencana/), { target: { value: '6' } });
    expect(simpan().disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Model unit/), { target: { value: 'hauler' } });
    fireEvent.change(screen.getByLabelText(/^Komponen/), { target: { value: 'Engine' } });
    fireEvent.change(screen.getByLabelText(/Sub-komponen/), { target: { value: 'Cylinder Head' } });
    expect(simpan().disabled).toBe(false);
  });

  it('menolak kode yang sudah dipakai di section ini, dan mengatakannya', () => {
    pasang();
    fireEvent.click(screen.getByRole('button', { name: '+ Tambah job' }));
    fireEvent.change(screen.getByLabelText(/Kode job/), { target: { value: 'JOB-1210' } });
    expect(screen.getByText(/sudah dipakai di section field/)).toBeTruthy();
  });

  it('kode yang sama dengan section LAIN tidak dianggap bentrok', () => {
    pasang();
    bukaLembar('Job — tyreman');
    fireEvent.click(screen.getByRole('button', { name: '+ Tambah job' }));
    fireEvent.change(screen.getByLabelText(/Kode job/), { target: { value: 'JOB-1210' } });
    expect(screen.queryByText(/sudah dipakai/)).toBeNull();
  });

  it('menawarkan cabang yang sudah ada, disaring menurut model yang dipilih', () => {
    pasang();
    fireEvent.click(screen.getByRole('button', { name: '+ Tambah job' }));
    fireEvent.change(screen.getByLabelText(/Model unit/), { target: { value: 'dozer' } });

    const opsi = Array.from(
      document.querySelectorAll('#jb-komp-opsi option'),
    ).map((o) => o.getAttribute('value'));
    expect(opsi).toEqual(['Undercarriage']);
  });

  it('mengirim cabangnya bersama job baru', () => {
    const kirim = pasang();
    fireEvent.click(screen.getByRole('button', { name: '+ Tambah job' }));
    fireEvent.change(screen.getByLabelText(/Kode job/), { target: { value: 'JOB-9001' } });
    fireEvent.change(screen.getByLabelText(/Nama pekerjaan/), { target: { value: 'Pekerjaan Baru' } });
    fireEvent.change(screen.getByLabelText(/Base point/), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText(/Jam rencana/), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText(/Model unit/), { target: { value: 'hauler' } });
    fireEvent.change(screen.getByLabelText(/^Komponen/), { target: { value: 'Engine' } });
    fireEvent.change(screen.getByLabelText(/Sub-komponen/), { target: { value: 'Turbocharger' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tambah job' }));

    expect(kirim).toHaveBeenCalledWith('admin_job', expect.objectContaining({
      sectionCode: 'field', kode: 'JOB-9001', nama: 'Pekerjaan Baru',
      unitModel: 'hauler', komponen: 'Engine', subKomponen: 'Turbocharger',
      basePoints: 12, planHours: 6, aktif: true,
    }), expect.any(String));
  });
});

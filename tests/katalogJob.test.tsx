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
  woApproved: 12, woTotal: 14,
};
const JOB_BELUM_DIPAKAI: BekalAdmin['job'][number] = {
  ...JOB_FIELD, id: 2, kode: 'JOB-1211', nama: 'Ganti Turbocharger',
  woApproved: 0, woTotal: 0,
};
const JOB_TYRE: BekalAdmin['job'][number] = {
  id: 3, kode: 'COM-001', nama: 'Rotasi Ban', section: 'tyreman',
  basePoints: 6, planHours: 2, aktif: true,
  unitModel: null, komponen: null, subKomponen: null, woApproved: 0, woTotal: 0,
};

/** Hauler: modelnya FIELD, tapi yang memilihnya TYREMAN. Inti perkaranya. */
const UNIT_TYRE: BekalAdmin['unit'][number] = {
  id: 1, kode: 'UNIT-001', nama: 'XTN01', unitModel: 'hauler',
  section: ['tyreman'], global: false, virtual: false,
  unitFactor: 1, odometer: 'KM', brand: 'SCANIA', modelType: 'TLD93A',
  mtbfEligible: false, aktif: true, woTotal: 0, meterTotal: 0,
};
const UNIT_DIPAKAI: BekalAdmin['unit'][number] = {
  ...UNIT_TYRE, id: 2, kode: 'UNIT-002', nama: 'XTN02', woTotal: 7,
};
const UNIT_BERMETER: BekalAdmin['unit'][number] = {
  ...UNIT_TYRE, id: 3, kode: 'UNIT-003', nama: 'XTN03', woTotal: 0, meterTotal: 4,
};
const UNIT_SEWA: BekalAdmin['unit'][number] = {
  ...UNIT_TYRE, id: 4, kode: 'UNIT-049', nama: 'EX-12501', unitModel: 'loader',
  section: [], global: true, unitFactor: 1.25, odometer: 'HM',
};
const UNIT_SEMUA: BekalAdmin['unit'][number] = {
  ...UNIT_TYRE, id: 5, kode: 'UNIT-000', nama: 'PREPARATION',
  unitModel: null, section: [],
};

const BEKAL: BekalAdmin = {
  orang: [], tarif: [], faktor: [], setelan: [], setelanDampak: [],
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
  unit: [UNIT_TYRE, UNIT_DIPAKAI, UNIT_BERMETER, UNIT_SEWA, UNIT_SEMUA],
  model: [
    { code: 'hauler', section: 'field', job: 123 },
    { code: 'loader', section: 'field', job: 118 },
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

  it('kolom Hapus mati untuk job yang sudah dipakai WO, dan mengatakan kenapa', () => {
    pasang();
    const b = within(baris('JOB-1210')).getByRole('button', { name: 'Hapus' }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.title).toMatch(/dipakai 14 WO/);
  });

  it('kolom Hapus hidup untuk job yang belum pernah dipakai', () => {
    pasang();
    expect((within(baris('JOB-1211'))
      .getByRole('button', { name: 'Hapus' }) as HTMLButtonElement).disabled).toBe(false);
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

/* ══ UNIT ══════════════════════════════════════════════════════════════════ */

function bukaUnit() {
  bukaLembar('Unit');
}

describe('Katalog unit — tabel', () => {
  it('memisahkan "dipilih section" dari "model", karena keduanya beda hal', () => {
    pasang();
    bukaUnit();
    const r = baris('UNIT-001');
    // Hauler: modelnya field, tapi yang memilihnya tyreman. Kalau layar ini
    // menurunkan section dari model, kolom ini akan berbunyi "field".
    expect(within(r).getByText('hauler')).toBeTruthy();
    expect(within(r).getByText('tyreman')).toBeTruthy();
  });

  it('unit tanpa section ditulis "semua section", bukan dikosongkan', () => {
    pasang();
    bukaUnit();
    expect(within(baris('UNIT-000')).getByText('semua section')).toBeTruthy();
  });

  it('unit sewa ditandai global, bukan didaftar sebagai section biasa', () => {
    pasang();
    bukaUnit();
    expect(within(baris('UNIT-049')).getByText(/global/)).toBeTruthy();
  });

  it('unit tanpa model diberi tahu bahwa ia belum punya joblist', () => {
    pasang();
    bukaUnit();
    expect(within(baris('UNIT-000')).getByText('belum punya joblist')).toBeTruthy();
  });

  it('Hapus mati untuk unit yang sudah dipakai WO', () => {
    pasang();
    bukaUnit();
    const b = within(baris('UNIT-002')).getByRole('button', { name: 'Hapus' }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.title).toMatch(/dipakai 7 WO/);
  });

  it('Hapus mati juga untuk unit yang punya riwayat meter, walau tanpa WO', () => {
    pasang();
    bukaUnit();
    // Angka meter hidup lebih lama dari WO-nya — ia menopang umur ban & MTBF.
    const b = within(baris('UNIT-003')).getByRole('button', { name: 'Hapus' }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.title).toMatch(/4 catatan meter/);
  });

  it('Hapus hidup untuk unit yang benar-benar belum tersentuh', () => {
    pasang();
    bukaUnit();
    expect((within(baris('UNIT-001'))
      .getByRole('button', { name: 'Hapus' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('bisa disaring per lingkup', () => {
    pasang();
    bukaUnit();
    fireEvent.change(screen.getByDisplayValue('Semua lingkup'), { target: { value: 'global' } });
    expect(screen.queryByText('UNIT-001')).toBeNull();
    expect(screen.getByText('UNIT-049')).toBeTruthy();
  });

  it('unit sewa TIDAK ikut saringan per-section walau daftar sectionnya kosong', () => {
    pasang();
    bukaUnit();
    fireEvent.change(screen.getByDisplayValue('Semua lingkup'), { target: { value: 'field' } });
    // UNIT-000 tanpa section memang boleh semua section, jadi ia ikut.
    expect(screen.getByText('UNIT-000')).toBeTruthy();
    // UNIT-049 global: di layar buat WO ia ada di lacinya sendiri, bukan di field.
    expect(screen.queryByText('UNIT-049')).toBeNull();
  });
});

describe('Katalog unit — "+ Tambah unit"', () => {
  function bukaForm() {
    pasang();
    bukaUnit();
    fireEvent.click(screen.getByRole('button', { name: '+ Tambah unit' }));
  }
  const simpan = () => screen.getByRole('button', { name: 'Tambah unit' }) as HTMLButtonElement;

  /* Tabel dan modal memakai kata yang sama ("Dipilih section", "123 job"), dan
     itu memang disengaja — keduanya menjelaskan hal yang sama. Jadi pencarian
     harus dipersempit ke modalnya, bukan katanya yang diubah. */
  const modal = () => document.querySelector('.modal') as HTMLElement;

  it('menanyakan section yang boleh memilih DAN model, terpisah', () => {
    bukaForm();
    expect(within(modal()).getByText('Dipilih section')).toBeTruthy();
    expect(within(modal()).getByLabelText(/Model alat/)).toBeTruthy();
  });

  it('menyebutkan berapa job yang akan ditawarkan model yang dipilih', () => {
    bukaForm();
    fireEvent.change(screen.getByLabelText(/Model alat/), { target: { value: 'hauler' } });
    // Bukan di daftar pilihannya, melainkan di keterangan di bawahnya.
    expect(within(modal()).getByText(/akan menawarkan/)).toBeTruthy();
    expect(within(modal()).getByText('123 job')).toBeTruthy();
  });

  it('menolak faktor unit di luar batas wajar — ia pengali poin', () => {
    bukaForm();
    fireEvent.change(screen.getByLabelText(/Kode unit/), { target: { value: 'UNIT-110' } });
    fireEvent.change(screen.getByLabelText(/Nomor lambung/), { target: { value: 'XTN99' } });
    fireEvent.change(screen.getByLabelText(/Faktor unit/), { target: { value: '15' } });
    expect(screen.getByText(/di luar batas wajar/)).toBeTruthy();
    expect(simpan().disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Faktor unit/), { target: { value: '1.5' } });
    expect(simpan().disabled).toBe(false);
  });

  it('menolak kode unit yang sudah dipakai', () => {
    bukaForm();
    fireEvent.change(screen.getByLabelText(/Kode unit/), { target: { value: 'UNIT-001' } });
    expect(screen.getByText(/sudah dipakai unit lain/)).toBeTruthy();
  });

  it('mencentang global mematikan pilihan section — global menang', () => {
    bukaForm();
    fireEvent.click(screen.getByLabelText(/Global/));
    const centang = screen.getAllByRole('checkbox')
      .filter((c) => (c as HTMLInputElement).disabled);
    expect(centang.length).toBeGreaterThan(0);
  });

  it('mengirim section dan model sebagai dua medan yang berbeda', () => {
    const kirim = vi.fn().mockResolvedValue({});
    render(<Katalog bekal={BEKAL} kirim={kirim} sibuk={false} />);
    bukaUnit();
    fireEvent.click(screen.getByRole('button', { name: '+ Tambah unit' }));
    fireEvent.change(screen.getByLabelText(/Kode unit/), { target: { value: 'UNIT-110' } });
    fireEvent.change(screen.getByLabelText(/Nomor lambung/), { target: { value: 'XTN99' } });
    fireEvent.change(screen.getByLabelText(/Model alat/), { target: { value: 'hauler' } });
    fireEvent.click(screen.getByLabelText('tyreman'));
    fireEvent.click(screen.getByRole('button', { name: 'Tambah unit' }));

    expect(kirim).toHaveBeenCalledWith('admin_unit', expect.objectContaining({
      kode: 'UNIT-110', nama: 'XTN99', unitModel: 'hauler',
      section: ['tyreman'], global: false,
    }), expect.any(String));
  });

  it('kode dikunci saat menyunting — WO lama menunjuk ke sana', () => {
    pasang();
    bukaUnit();
    fireEvent.click(within(baris('UNIT-002')).getByRole('button', { name: 'Ubah' }));
    expect((screen.getByLabelText(/Kode unit/) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/tercatat di/)).toBeTruthy();
  });
});

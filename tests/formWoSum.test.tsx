// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FormWoSum } from '../src/app/wo/baru/FormWoSum.js';
import type { Katalog } from '../src/app/wo/baru/jenis.js';

afterEach(cleanup);

const dummyKatalog: Katalog = {
  sections: [
    { code: 'workshop', name: 'Workshop', picker_style: 'flat', requires_unit: false },
    { code: 'field', name: 'Field', picker_style: 'flat', requires_unit: true },
  ],
  units: [
    { id: 13, unit_code: 'UNIT-001', unit_name: 'Excavator CAT 320', unit_model: 'PC200', sections: ['field', 'workshop'], is_global: false, is_virtual: false, unit_factor: '1.0' },
    { id: 14, unit_code: 'UNIT-002', unit_name: 'Truck Volvo FH16', unit_model: 'FH16', sections: ['field', 'workshop'], is_global: false, is_virtual: false, unit_factor: '1.0' },
  ],
  jobs: [
    {
      id: 193,
      job_code: 'COM-001',
      section: 'workshop',
      unit_model: null,
      component: null,
      sub_component: null,
      job_description: 'Intercooler [Remove & Install - Major Repair]',
      job_type: 'Remove & Install - Major Repair',
      plan_hours: '6',
      base_points: '3',
    },
    {
      id: 194,
      job_code: 'COM-002',
      section: 'workshop',
      unit_model: null,
      component: null,
      sub_component: null,
      job_description: 'Injector Volvo [Remove & Install - Major Repair]',
      job_type: 'Remove & Install - Major Repair',
      plan_hours: '6',
      base_points: '3',
    },
    {
      id: 197,
      job_code: 'COM-005',
      section: 'workshop',
      unit_model: null,
      component: null,
      sub_component: null,
      job_description: 'Alternator [Remove & Install - Minor Repair]',
      job_type: 'Remove & Install - Minor Repair',
      plan_hours: '3',
      base_points: '2',
    },
  ],
  mekanik: [
    { id: 71, name: 'Pandu Wijaksono', role: 'superintendent', sections: [], jabatan: 'Advisor' },
    { id: 73, name: 'Ahmad Fauzi', role: 'mechanic', sections: [], jabatan: 'Senior' },
  ],
  kondisi: [
    { kunci: 'normal', faktor: '1.0', label: 'Normal working conditions' },
    { kunci: 'difficult', faktor: '1.1', label: 'Difficult working conditions' },
  ],
  meter: {},
  tenantCode: 'SUM',
};

describe('FormWoSum (UI Input Work Order SUM)', () => {
  it('menampilkan judul dan semua medan formulir sesuai spesifikasi foto', () => {
    render(<FormWoSum kat={dummyKatalog} />);

    // Header
    expect(screen.getByText('Buat Work Order')).toBeDefined();

    // Labels
    expect(screen.getAllByText(/Kategori Pekerjaan/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/^Unit/i)).toBeDefined();
    expect(screen.getByText(/Work Condition/i)).toBeDefined();
    expect(screen.getByText(/Lokasi/i)).toBeDefined();
    expect(screen.getByText(/Keterangan/i)).toBeDefined();
    expect(screen.getByText(/Tim Mekanik/i)).toBeDefined();

    // Tombol-tombol
    expect(screen.getByText(/Tambah Mekanik/i)).toBeDefined();
    expect(screen.getByText(/Simpan & Buat Lagi/i)).toBeDefined();
  });

  it('menyaring pilihan Komponen / Pekerjaan berdasarkan Kategori Pekerjaan', () => {
    render(<FormWoSum kat={dummyKatalog} />);

    // Awalnya: belum pilih kategori
    expect(screen.getByText('-- Pilih Kategori Dulu --')).toBeDefined();

    // Pilih kategori 'Remove & Install - Major Repair'
    const selects = screen.getAllByRole('combobox');
    const selectKategori = selects[0]!;
    fireEvent.change(selectKategori, { target: { value: 'Remove & Install - Major Repair' } });

    // Pilihan Komponen / Pekerjaan harus memuat Intercooler dan Injector Volvo
    expect(screen.getByText('Intercooler')).toBeDefined();
    expect(screen.getByText('Injector Volvo')).toBeDefined();
    // Tidak boleh memuat Alternator (karena Minor Repair)
    expect(screen.queryByText('Alternator')).toBeNull();
  });

  it('dapat menambah dan menghapus baris mekanik', () => {
    render(<FormWoSum kat={dummyKatalog} />);

    const tombolTambah = screen.getByText(/Tambah Mekanik/i);
    fireEvent.click(tombolTambah);

    // Sekarang harus ada dua tombol hapus ✕
    const tombolHapus = screen.getAllByTitle('Hapus Mekanik');
    expect(tombolHapus.length).toBe(2);

    // Hapus satu
    fireEvent.click(tombolHapus[0]!);
    expect(screen.getAllByTitle('Hapus Mekanik').length).toBe(1);
  });
});

// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BlokJoblist } from '../src/app/wo/baru/BlokJoblist.js';
import type { Blok, Katalog } from '../src/app/wo/baru/jenis.js';

afterEach(cleanup);

const dummyKatalog: Katalog = {
  sections: [
    { code: 'field', name: 'Field', picker_style: 'flat', requires_unit: true },
    { code: 'workshop', name: 'Workshop', picker_style: 'flat', requires_unit: false },
  ],
  units: [
    { id: 101, unit_code: 'UNIT-001', unit_name: 'SUM 011', unit_model: 'AXOR4843', sections: [], is_global: false, is_virtual: false, unit_factor: '1.20' },
    { id: 102, unit_code: 'UNIT-002', unit_name: 'SUM 025', unit_model: 'AXOR4843', sections: [], is_global: false, is_virtual: false, unit_factor: '1.00' },
  ],
  jobs: [
    {
      id: 201,
      job_code: 'COM-097',
      section: 'field',
      unit_model: null,
      component: 'Adjustment - Minor Repair',
      sub_component: 'Adjustment Tail Gate',
      job_description: 'Adjustment Tail Gate',
      plan_hours: '0.25',
      base_points: '0.50',
    },
    {
      id: 202,
      job_code: 'COM-010',
      section: 'field',
      unit_model: null,
      component: 'Adjustment - Minor Repair',
      sub_component: 'Adjust Valve',
      job_description: 'Adjust Valve',
      plan_hours: '3.00',
      base_points: '1.50',
    },
    {
      id: 203,
      job_code: 'COM-005',
      section: 'field',
      unit_model: null,
      component: 'Remove & Install - Minor Repair',
      sub_component: 'Alternator',
      job_description: 'Alternator',
      plan_hours: '1.00',
      base_points: '0.50',
    },
  ],
  mekanik: [
    { id: 1, name: 'Budi Santoso', role: 'mechanic', sections: [], jabatan: 'Senior' },
  ],
  kondisi: [
    { kunci: 'normal', faktor: '1.0', label: 'Normal working conditions' },
    { kunci: 'extreme', faktor: '1.2', label: 'Extreme working conditions' },
  ],
  meter: {},
  tenantCode: 'SUM',
};

const blokAwal: Blok = {
  kunci: 1,
  section: 'field',
  unitId: '',
  model: '',
  komponen: '',
  subKomponen: '',
  jobId: '',
  meter: '',
  keterangan: '',
  others: false,
  othersDesc: '',
  mBase: '',
  mTarget: '',
  mFaktor: '',
  lokasi: 'field',
  kondisi: 'normal',
  tim: [1],
  semuaMekanik: false,
};

describe('BlokJoblist (Mode SUM)', () => {
  it('menampilkan dropdown Unit pada form SUM', () => {
    const ubah = vi.fn();
    render(
      <BlokJoblist
        blok={blokAwal}
        nomor={1}
        total={1}
        kat={dummyKatalog}
        bolehManual={true}
        bolehLihatPoin={true}
        terkunciUnit={false}
        terkunciJob={false}
        terkunciSection={false}
        tampilSemuaUnit={false}
        tenantCode="SUM"
        ubah={ubah}
        hapus={vi.fn()}
      />,
    );

    // Label Unit harus ada
    expect(
      screen.getByText((_, el) => el?.tagName.toLowerCase() === 'label' && !!el?.textContent?.startsWith('Unit')),
    ).toBeDefined();

    // Dropdown Unit harus memuat daftar unit SUM
    expect(screen.getByText('-- Pilih Unit --')).toBeDefined();
    expect(screen.getByText(/SUM 011/)).toBeDefined();
    expect(screen.getByText(/SUM 025/)).toBeDefined();

    // Dropdown Kategori dan Komponen ada
    expect(screen.getAllByText(/Kategori Pekerjaan/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Komponen \/ Pekerjaan/i).length).toBeGreaterThanOrEqual(1);

    // Section dan HM/KM tidak ditampilkan untuk SUM
    expect(screen.queryByText(/^Section \*/i)).toBeNull();
    expect(screen.queryByText(/HM Unit/i)).toBeNull();
  });

  it('memanggil ubah saat unit dipilih', () => {
    const ubah = vi.fn();
    const { container } = render(
      <BlokJoblist
        blok={blokAwal}
        nomor={1}
        total={1}
        kat={dummyKatalog}
        bolehManual={true}
        bolehLihatPoin={true}
        terkunciUnit={false}
        terkunciJob={false}
        terkunciSection={false}
        tampilSemuaUnit={false}
        tenantCode="SUM"
        ubah={ubah}
        hapus={vi.fn()}
      />,
    );

    const selects = container.querySelectorAll('select');
    // Select pertama untuk mode SUM adalah Unit
    const selectUnit = selects[0] as HTMLSelectElement;
    fireEvent.change(selectUnit, { target: { value: '101' } });

    expect(ubah).toHaveBeenCalledWith({ unitId: '101' });
  });

  it('menghitung Preview dengan faktor unit ketika unit dipilih', () => {
    const blokDenganPilihan: Blok = {
      ...blokAwal,
      unitId: '101', // unit_factor: 1.20
      komponen: 'Adjustment - Minor Repair',
      jobId: '202', // base_points: 1.50, target: 3.00 jam
      kondisi: 'normal', // faktor: 1.00
    };

    render(
      <BlokJoblist
        blok={blokDenganPilihan}
        nomor={1}
        total={1}
        kat={dummyKatalog}
        bolehManual={true}
        bolehLihatPoin={true}
        terkunciUnit={false}
        terkunciJob={false}
        terkunciSection={false}
        tampilSemuaUnit={false}
        tenantCode="SUM"
        ubah={vi.fn()}
        hapus={vi.fn()}
      />,
    );

    // Preview
    expect(screen.getByText('1.50')).toBeDefined(); // Base Points
    expect(screen.getByText('1.20x')).toBeDefined(); // Unit Factor
    // Estimated points = 1.50 * 1.20 * 1.0 = 1.80 points
    expect(screen.getByText('1.80 points')).toBeDefined();
  });

  it('mengunci dropdown Unit saat terkunciUnit = true (mode grup unit)', () => {
    const { container } = render(
      <BlokJoblist
        blok={{ ...blokAwal, unitId: '101' }}
        nomor={2}
        total={2}
        kat={dummyKatalog}
        bolehManual={true}
        bolehLihatPoin={true}
        terkunciUnit={true}
        terkunciJob={false}
        terkunciSection={false}
        tampilSemuaUnit={false}
        tenantCode="SUM"
        ubah={vi.fn()}
        hapus={vi.fn()}
      />,
    );

    const selects = container.querySelectorAll('select');
    const selectUnit = selects[0] as HTMLSelectElement;
    expect(selectUnit.disabled).toBe(true);
    expect(screen.getByText(/🔒 Unit dikunci oleh grup/)).toBeDefined();
  });
});

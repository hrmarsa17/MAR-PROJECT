// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NavBar, type AksesMenu } from '../src/app/NavBar.js';

/**
 * NAVBAR — susunannya, bukan tampilannya.
 *
 * Urutan menu adalah hafalan tangan dua puluh empat orang lapangan. Menggesernya
 * "supaya lebih logis" berarti melatih ulang mereka untuk sesuatu yang tidak
 * mereka minta — jadi setiap pergeseran harus keputusan yang disebut, dan
 * berkas ini yang menguncinya.
 *
 * Tiga pergeseran yang disetujui Gabriel 16 Sep 2026:
 *   1. Dashboard Performa dan Dashboard Teknis BERDAMPINGAN, tetap dua menu.
 *   2. Keduanya berawalan "Dashboard".
 *   3. Koreksi HM + Koreksi KM jadi SATU menu "Koreksi Meter".
 */

afterEach(cleanup);

vi.mock('next/navigation', () => ({ usePathname: () => '/monitoring' }));

const AKU = (b: Partial<AksesMenu> = {}): AksesMenu => ({
  mechanicId: 1,
  peran: 'superintendent', nama: 'Manager Uji',
  bolehLihat: { performa: true, teknis: true, report: true },
  bolehAdmin: true,
  ...b,
});

const menu = () =>
  Array.from(document.querySelectorAll('.nav-link')).map((a) => a.textContent ?? '');

describe('NavBar', () => {
  it('menaruh kedua dashboard berdampingan, sebagai DUA menu terpisah', () => {
    render(<NavBar aku={AKU()} />);
    const m = menu();
    const p = m.indexOf('Dashboard Performa');
    const t = m.indexOf('Dashboard Teknis');
    expect(p).toBeGreaterThanOrEqual(0);
    expect(t).toBe(p + 1);
  });

  it('menyatukan Koreksi HM dan KM jadi satu menu', () => {
    render(<NavBar aku={AKU()} />);
    const m = menu();
    expect(m).toContain('Koreksi Meter');
    expect(m.filter((x) => x.startsWith('Koreksi'))).toHaveLength(1);
    expect(m).not.toContain('Koreksi HM');
    expect(m).not.toContain('Koreksi KM');
  });

  it('Koreksi Meter menunjuk ke satu rute, bukan ke salah satu jenis meter', () => {
    render(<NavBar aku={AKU()} />);
    const a = Array.from(document.querySelectorAll('.nav-link'))
      .find((x) => x.textContent === 'Koreksi Meter');
    expect(a?.getAttribute('href')).toBe('/koreksi');
  });

  it('urutan menu kerja TIDAK ikut diacak', () => {
    render(<NavBar aku={AKU()} />);
    const m = menu();
    expect(m.indexOf('Create WO')).toBeLessThan(m.indexOf('Monitoring'));
    expect(m.indexOf('Monitoring')).toBeLessThan(m.indexOf('Approvals'));
    expect(m.indexOf('Approvals')).toBeLessThan(m.indexOf('Koreksi Meter'));
    expect(m.indexOf('Koreksi Meter')).toBeLessThan(m.indexOf('Reports'));
    // Admin paling kanan: ia bukan pekerjaan harian.
    expect(m[m.length - 1]).toBe('Admin');
  });

  it('mekanik tidak melihat Koreksi Meter maupun Approvals', () => {
    render(<NavBar aku={AKU({
      peran: 'mechanic', bolehAdmin: false,
      bolehLihat: { performa: true, teknis: false, report: false },
    })} />);
    const m = menu();
    expect(m).not.toContain('Koreksi Meter');
    expect(m).not.toContain('Approvals');
    expect(m).not.toContain('Admin');
    expect(m).toContain('Dashboard Performa');
  });

  it('tanpa hak teknis, Dashboard Teknis tidak muncul — Performa tetap', () => {
    render(<NavBar aku={AKU({
      bolehLihat: { performa: true, teknis: false, report: true },
    })} />);
    expect(menu()).not.toContain('Dashboard Teknis');
    expect(menu()).toContain('Dashboard Performa');
  });

  it('lencana peran tetap 1:1 — L1 sengaja tanpa lencana', () => {
    render(<NavBar aku={AKU({ peran: 'supervisor' })} />);
    expect(document.querySelector('.nav-user .badge')).toBeNull();
    cleanup();

    render(<NavBar aku={AKU({ peran: 'mechanic' })} />);
    expect(document.querySelector('.nav-user .badge')?.textContent).toBe('MECHANIC');
    cleanup();

    render(<NavBar aku={AKU({ peran: 'superintendent' })} />);
    expect(document.querySelector('.nav-user .badge')?.textContent).toBe('MANAGER');
  });

  it('menampilkan identitas PT di bawah judul brand (KMB vs SUM)', () => {
    // Default KMB
    render(<NavBar aku={AKU({ tenantCode: 'KMB' })} />);
    expect(document.querySelector('.tenant-badge')?.textContent).toBe('PT KMB');
    expect(document.querySelector('.tenant-full-name')).toBeNull();
    cleanup();

    // Tenant SUM
    render(<NavBar aku={AKU({ tenantCode: 'SUM' })} />);
    expect(document.querySelector('.tenant-badge')?.textContent).toBe('PT SUM');
    expect(document.querySelector('.tenant-full-name')).toBeNull();
  });
});

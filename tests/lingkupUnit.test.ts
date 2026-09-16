import { describe, expect, it } from 'vitest';
import { laciUntuk, type Unit } from '../src/app/wo/baru/jenis.js';
import { bacaLingkup, bakuLingkup } from '../src/domain/katalogInduk.js';

/**
 * LINGKUP UNIT — section mana yang boleh memilih sebuah unit.
 *
 * Alasan berkas ini ada, dan ia bukan hipotesis:
 *
 * Sampai 16 Sep 2026 layar buat WO menyaring dropdown unit dengan section MODEL
 * unitnya. Model sebuah Hauler milik `field`. Tapi 35 Hauler adalah pegangan
 * TYREMAN, yang mengurus bannya — dan di KMB V2 itu ditulis di kolom
 * `unit_scope`, bukan diturunkan dari model.
 *
 * Akibatnya tyreman melihat 6 unit dari 50 miliknya, dan 44 sisanya hanya muncul
 * kalau ia menekan "Tampilkan semua unit" — tombol yang tak ada alasan ia tekan,
 * karena tak ada yang memberi tahu bahwa unitnya disembunyikan.
 *
 * Sebaran sebenarnya di KMB (103 unit, backup 15 Sep 2026):
 *   field 36 · tyreman 35 · tyreman,field 15 · global 16 · others 1
 */

const unit = (b: Partial<Unit> = {}): Unit => ({
  id: 1, unit_code: 'UNIT-001', unit_name: 'XTN01', unit_model: 'hauler',
  sections: [], is_global: false, is_virtual: false, unit_factor: '1', ...b,
});

describe('laci dropdown unit', () => {
  it('unit tyreman masuk laci utama tyreman — walau modelnya milik field', () => {
    const hauler = unit({ unit_model: 'hauler', sections: ['tyreman'] });
    expect(laciUntuk(hauler, 'tyreman')).toBe('utama');
  });

  it('dan unit yang sama muncul sebagai "section lain" di field, bukan hilang', () => {
    // V2 tidak pernah menyembunyikan unit section lain: field sesekali memang
    // membantu unit tyreman, dan menyembunyikannya membuat orang mengira
    // unitnya lenyap dari katalog.
    expect(laciUntuk(unit({ sections: ['tyreman'] }), 'field')).toBe('lain');
  });

  it('unit dua section masuk laci utama di KEDUANYA', () => {
    const dua = unit({ sections: ['tyreman', 'field'] });
    expect(laciUntuk(dua, 'tyreman')).toBe('utama');
    expect(laciUntuk(dua, 'field')).toBe('utama');
  });

  it('tanpa section sama sekali = milik semua section', () => {
    expect(laciUntuk(unit({ sections: [] }), 'workshop')).toBe('utama');
  });

  it('unit sewa selalu masuk laci global, walau sectionnya cocok', () => {
    // Urutan pemeriksaan bukan selera: kalau kecocokan section diperiksa lebih
    // dulu, 16 unit sewa berdiri sejajar dengan alat pegangan harian.
    expect(laciUntuk(unit({ sections: ['field'], is_global: true }), 'field'))
      .toBe('global');
  });

  it('unit semu menang atas segalanya — ia bukan alat', () => {
    expect(laciUntuk(unit({ is_global: true, is_virtual: true }), 'field')).toBe('semu');
  });
});

describe('membaca unit_scope dari lembar', () => {
  it('kosong berarti semua section, bukan tidak punya section', () => {
    expect(bacaLingkup('')).toEqual({ section: [], global: false, semu: false });
  });

  it('daftar dipisah koma, spasinya diabaikan', () => {
    expect(bacaLingkup('tyreman, field').section).toEqual(['tyreman', 'field']);
  });

  it('"tyre" diterima sebagai "tyreman" — itu yang ditulis orang lapangan', () => {
    expect(bacaLingkup('tyre').section).toEqual(['tyreman']);
  });

  it('global bukan nama section, jadi tidak jadi baris unit_sections', () => {
    const l = bacaLingkup('global');
    expect(l.global).toBe(true);
    expect(l.section).toEqual([]);
  });

  it('others menandai unit semu, dan juga bukan nama section', () => {
    const l = bacaLingkup('others');
    expect(l.semu).toBe(true);
    expect(l.section).toEqual([]);
  });

  it('urutan koma tidak dianggap perubahan saat impor dibandingkan', () => {
    expect(bakuLingkup('field,tyreman')).toBe(bakuLingkup('tyreman, field'));
  });

  it('huruf besar-kecil tidak dianggap perubahan', () => {
    expect(bakuLingkup('TYREMAN')).toBe(bakuLingkup('tyreman'));
  });
});

/** Bentuk data bersama layar buat-WO. Dipisah supaya form dan blok memakai satu definisi. */

export interface Section {
  code: string; name: string; picker_style: string; requires_unit: boolean;
}
export interface Unit {
  id: number; unit_code: string; unit_name: string;
  /** Model alat — menentukan JOB mana yang ditawarkan untuknya (section cascade). */
  unit_model: string | null;
  /** Section yang boleh MEMILIHnya. Kosong = semua section. Bukan section model. */
  sections: string[];
  /** Unit sewa: boleh dipilih, tapi disembunyikan sampai diminta. */
  is_global: boolean;
  /** Bukan unit sungguhan — penanda jalan pintas ke job manual. */
  is_virtual: boolean;
  unit_factor: string | null;
}

/**
 * Empat laci dropdown unit, persis seperti KMB V2 (`WorkOrder.html:501-535`).
 *
 * Urutan pemeriksaannya penting dan bukan selera: `others` diperiksa lebih dulu,
 * lalu `global`, baru kecocokan section. Unit sewa yang kebetulan ber-scope
 * field TETAP masuk laci global — kalau tidak, 16 unit sewa berdiri sejajar
 * dengan alat pegangan harian di daftar yang sama.
 */
export type LaciUnit = 'utama' | 'lain' | 'global' | 'semu';

export function laciUntuk(u: Unit, sectionAktif: string): LaciUnit {
  if (u.is_virtual) return 'semu';
  if (u.is_global) return 'global';
  // Tanpa section sama sekali = milik semua section (baris yang belum diisi).
  if (u.sections.length === 0 || u.sections.includes(sectionAktif)) return 'utama';
  return 'lain';
}
export interface Job {
  id: number; job_code: string; section: string; unit_model: string | null;
  component: string | null; sub_component: string | null;
  job_description: string; plan_hours: string; base_points: string | null;
  job_type?: string;
}
export interface Mekanik {
  id: number; name: string; role: string; sections: string[]; jabatan: string | null;
}
export interface Kondisi { kunci: string; faktor: string; label: string }
export interface Meter { nilai: number; oleh: string | null; at: string }

export interface Katalog {
  sections: Section[];
  units: Unit[];
  jobs: Job[];
  mekanik: Mekanik[];
  kondisi: Kondisi[];
  /** kunci "HM:12" / "KM:12" */
  meter: Record<string, Meter>;
  tenantCode?: string;
}

/** Satu blok joblist. Tiap blok terbit sebagai 1 WO dengan nomornya sendiri. */
export interface Blok {
  /** Kunci React yang stabil — TIDAK ikut bernomor ulang saat blok dihapus. */
  kunci: number;
  section: string;
  unitId: string;
  /** Hanya workshop: model dipilih langsung, bukan diturunkan dari unit. */
  model: string;
  komponen: string;
  subKomponen: string;
  jobId: string;
  meter: string;
  keterangan: string;
  others: boolean;
  othersDesc: string;
  mBase: string;
  mTarget: string;
  mFaktor: string;
  lokasi: 'workshop' | 'field';
  kondisi: string;
  tim: number[];
  timShare?: number[];
  semuaMekanik: boolean;
}

export type GrupMode = '' | 'unit' | 'job';

export function blokBaru(kunci: number, section: string, kondisi: string): Blok {
  return {
    kunci, section,
    unitId: '', model: '', komponen: '', subKomponen: '', jobId: '',
    meter: '', keterangan: '',
    others: false, othersDesc: '', mBase: '', mTarget: '', mFaktor: '',
    lokasi: section === 'field' ? 'field' : 'workshop',
    kondisi,
    tim: [0],
    semuaMekanik: false,
  };
}

/** Nilai berbeda saja, urut, tanpa yang kosong. */
export function beda(nilai: (string | null)[]): string[] {
  return [...new Set(nilai.filter((v): v is string => !!v))].sort();
}

/**
 * Meter mana yang berlaku untuk satu section.
 *
 * Tyreman memakai KILOMETER; field & workshop memakai jam mesin. Bukan pilihan
 * tampilan belaka — angka yang terkirim masuk ke kolom yang berbeda dan
 * menopang perhitungan yang berbeda (umur tyre vs WH/MTBF unit).
 */
export function meterUntuk(section: string) {
  return section === 'tyreman'
    ? {
        jenis: 'KM' as const, label: 'KM', kunci: 'kilometers' as const,
        contoh: 'cth: 84200',
        petunjuk: '(kilometer saat pekerjaan ini dimulai — opsional)',
      }
    : {
        jenis: 'HM' as const, label: 'HM', kunci: 'hour_meter' as const,
        contoh: 'cth: 12450',
        petunjuk: '(hour meter saat pekerjaan ini dimulai — opsional)',
      };
}

/** Grup hanya masuk akal bila barisnya punya DUA sumbu yang bisa divariasikan. */
export function grupBolehUntuk(section: string): boolean {
  return section === 'tyreman' || section === 'field';
}

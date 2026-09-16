import type { Tx } from '../lib/db.js';

/**
 * INDUK KATALOG — model unit, komponen, sub-komponen.
 *
 * Tiga fungsi kecil yang punya berkas sendiri karena DUA pemanggil butuh
 * keduanya berperilaku sama persis: impor Excel (`imporKatalog.ts`) dan tombol
 * "+ Tambah job" di menu Admin (`admin.ts`).
 *
 * Tidak ditaruh di salah satu dari keduanya karena `imporKatalog` sudah
 * mengimpor `admin` untuk `pastikanAdmin` — menaruhnya di sana lalu diimpor
 * balik akan membuat lingkaran impor yang di ESM baru terasa sebagai
 * "undefined is not a function" jauh dari sumbernya.
 *
 * Kenapa duplikatnya berbahaya: layar buat-WO menyaring joblist dengan
 * MENCOCOKKAN NAMA komponen dan sub-komponen (`BlokJoblist.tsx:65-75`). Dua
 * jalur pembuatan yang menormalkan nama secara berbeda akan melahirkan
 * "Engine Assy" dan "Engine assy" sebagai dua cabang terpisah, dan setengah
 * joblist hilang dari tempat orang mencarinya. (`citext` menutup beda huruf
 * besar-kecil; yang tidak ia tutup adalah spasi berlebih — karena itu semua
 * pemanggil memangkasnya lebih dulu.)
 */

/**
 * `unit_scope` sheet → bentuk yang dipakai basis data.
 *
 * Lima nilai yang berarti di KMB V2 (`ConfigService.js:162`):
 *
 *   ""                kosong  → milik SEMUA section
 *   "field"           satu    → dedicated
 *   "tyreman,field"   banyak  → dedicated ke dua section sekaligus
 *   "global"          sewa    → disembunyikan sampai diminta
 *   "others"          semu    → bukan unit sungguhan, jalan pintas ke job manual
 *
 * "tyre" diterima sebagai sinonim "tyreman" — itu yang ditulis orang lapangan,
 * dan menolaknya cuma membuat data yang benar terlihat rusak.
 *
 * Sebaran sebenarnya di KMB (103 unit, backup 15 Sep 2026):
 *   field 36 · tyreman 35 · tyreman,field 15 · global 16 · others 1 · kosong 0
 */
export interface LingkupUnit {
  section: string[];
  global: boolean;
  semu: boolean;
}

export function bacaLingkup(mentah: string): LingkupUnit {
  const bagian = String(mentah ?? '').toLowerCase()
    .split(',').map((x) => x.trim()).filter(Boolean)
    .map((x) => (x === 'tyre' ? 'tyreman' : x));

  const semu = bagian.includes('others');
  const global = bagian.includes('global');
  return {
    // 'global' dan 'others' BUKAN nama section. Menyimpannya sebagai baris
    // unit_sections akan melahirkan section hantu di setiap dropdown.
    section: semu || global ? [] : bagian.filter((x) => x !== 'all' && x !== 'semua'),
    global,
    semu,
  };
}

/** Bentuk baku untuk dibandingkan — urutan koma tidak boleh dianggap perubahan. */
export function bakuLingkup(mentah: string): string {
  const l = bacaLingkup(mentah);
  if (l.semu) return 'others';
  if (l.global) return 'global';
  return [...l.section].sort().join(',');
}

export async function pastikanModel(
  tx: Tx, tenantId: number, sectionId: number, kode: string, saatBaru: () => void,
): Promise<number> {
  const ada = (
    await tx<{ id: number }[]>`
      SELECT id FROM unit_models
       WHERE tenant_id = ${tenantId} AND code = ${kode} AND section_id = ${sectionId}
    `
  )[0];
  if (ada) return Number(ada.id);
  saatBaru();
  const r = (
    await tx<{ id: number }[]>`
      INSERT INTO unit_models (tenant_id, code, name, section_id)
      VALUES (${tenantId}, ${kode}, ${kode}, ${sectionId})
      RETURNING id
    `
  )[0]!;
  return Number(r.id);
}

export async function pastikanKomponen(
  tx: Tx, sectionId: number, nama: string, saatBaru: () => void,
): Promise<number> {
  const ada = (
    await tx<{ id: number }[]>`
      SELECT id FROM job_components WHERE section_id = ${sectionId} AND name = ${nama}
    `
  )[0];
  if (ada) return Number(ada.id);
  saatBaru();
  const r = (
    await tx<{ id: number }[]>`
      INSERT INTO job_components (section_id, name) VALUES (${sectionId}, ${nama})
      RETURNING id
    `
  )[0]!;
  return Number(r.id);
}

export async function pastikanSub(
  tx: Tx, componentId: number, nama: string, saatBaru: () => void,
): Promise<number> {
  const ada = (
    await tx<{ id: number }[]>`
      SELECT id FROM job_sub_components WHERE component_id = ${componentId} AND name = ${nama}
    `
  )[0];
  if (ada) return Number(ada.id);
  saatBaru();
  const r = (
    await tx<{ id: number }[]>`
      INSERT INTO job_sub_components (component_id, name)
      VALUES (${componentId}, ${nama}) RETURNING id
    `
  )[0]!;
  return Number(r.id);
}

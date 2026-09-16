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

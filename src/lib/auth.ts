import { randomBytes, timingSafeEqual } from 'node:crypto';
import { type Tx } from './db.js';
import { pakaiAppsScript } from './backendConfig.js';
import { identitasDariTokenAppsScript } from '../backends/appscript/auth.js';
import { identitasDariTokenSupabase } from '../backends/supabase/auth.js';

/**
 * TOKEN.
 *
 * Bentuk pemakaiannya sama dengan KMB V2: mekanik mengetik token sekali, lalu
 * tidak pernah diminta lagi.
 *
 * ── DISIMPAN TERBACA ────────────────────────────────────────────────────────
 * Keputusan Gabriel 15 Sep 2026, membatalkan hash yang sempat saya pasang.
 * Alasan penuhnya ada di `db/schema.sql` pada tabel `api_tokens`; ringkasnya:
 * layar Monitoring ADA untuk membacakan token kembali kepada mekanik yang
 * lupa, dan hash mematikan justru fungsi itu.
 *
 * Yang menjaganya bukan hash, melainkan siapa yang bisa membuka layarnya.
 */

export interface Identitas {
  mechanicId: number;
  tenantId: number;
  tenantCode: string;
  nama: string;
  peran: 'mechanic' | 'supervisor' | 'superintendent';
  /**
   * Penanda akses layar per orang — setara kolom `boleh_lihat_*` di
   * Config_Mechanics KMB V2. Menentukan menu mana yang muncul.
   *
   * Ini HANYA mengatur tampilnya menu. Gerbang datanya ada di lapisan data,
   * karena di KMB V2 halaman `reports` dibatasi L2 sementara fungsi di
   * belakangnya menerima L1 juga — gerbang layar bukan gerbang data.
   */
  bolehLihat: { performa: boolean; teknis: boolean; report: boolean };
  /**
   * Hak menu Admin. SENGAJA di luar `bolehLihat`, dan sengaja TIDAK otomatis
   * menyala untuk L2: menyetujui WO dan mengubah tarif rupiah per poin adalah
   * dua kewenangan berbeda, dan yang satu tidak seharusnya membawa yang lain.
   */
  bolehAdmin: boolean;
}

/**
 * Format token: <tenant>-<acak> bila tenantCode diberikan (mis. 'sum-sdan3i12d', 'kmb-dnjasdians'),
 * atau 20 huruf hex jika tidak ada tenantCode.
 */
export function buatToken(tenantCode?: string): string {
  if (tenantCode) {
    const acak = randomBytes(5).toString('hex').slice(0, 9);
    return `${tenantCode.toLowerCase()}-${acak}`;
  }
  return randomBytes(10).toString('hex');
}

/**
 * Menukar token jadi identitas.
 *
 * Pencocokan dilakukan basis data lewat index unik, bukan pemindaian baris demi
 * baris seperti `_resolveToken` di V2 yang membaca seluruh sheet ApiTokens
 * setiap permintaan.
 */
export async function identitasDariToken(
  token: string | null | undefined,
  tx?: Tx,
): Promise<Identitas> {
  if (pakaiAppsScript()) {
    return identitasDariTokenAppsScript(token);
  }
  return identitasDariTokenSupabase(token, tx);
}

/** Pembanding waktu-tetap untuk nilai rahasia yang panjangnya sama. */
export function samaAman(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

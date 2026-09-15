import { randomBytes, timingSafeEqual } from 'node:crypto';
import { sql, type Tx } from './db.js';
import { tidakBerhak } from './errors.js';

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
}

/** 20 huruf hex — panjang yang sama dengan token KMB V2 yang sudah dikenal. */
export function buatToken(): string {
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
  if (!token || token.trim().length < 8) {
    throw tidakBerhak('Token tidak dikenal atau tidak berlaku');
  }
  const q = tx ?? sql;
  const baris = await q<
    {
      mechanic_id: number; tenant_id: number; name: string; role: string;
      may_view_performance: boolean; may_view_technical: boolean; may_view_report: boolean;
    }[]
  >`
    SELECT t.mechanic_id, t.tenant_id, m.name, m.role::text,
           m.may_view_performance, m.may_view_technical, m.may_view_report
      FROM api_tokens t
      JOIN mechanics m ON m.id = t.mechanic_id
     WHERE t.token = ${token.trim()}
       AND t.is_active
       AND t.revoked_at IS NULL
       AND (t.expires_at IS NULL OR t.expires_at > now())
       AND m.is_active
  `;
  const r = baris[0];
  if (!r) throw tidakBerhak('Token tidak dikenal atau tidak berlaku');

  // Jejak pemakaian, sengaja tidak menunggu — kegagalan mencatat tidak boleh
  // menggagalkan permintaan yang sah.
  void q`UPDATE api_tokens SET last_used_at = now() WHERE token = ${token.trim()}`;

  const peran = r.role as Identitas['peran'];
  const l2 = peran === 'superintendent';

  return {
    mechanicId: Number(r.mechanic_id),
    tenantId: Number(r.tenant_id),
    nama: r.name,
    peran,
    // L2 selalu boleh; selain itu ditentukan penanda per orang.
    bolehLihat: {
      performa: l2 || r.may_view_performance === true,
      teknis: l2 || r.may_view_technical === true,
      report: l2 || r.may_view_report === true,
    },
  };
}

/** Pembanding waktu-tetap untuk nilai rahasia yang panjangnya sama. */
export function samaAman(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

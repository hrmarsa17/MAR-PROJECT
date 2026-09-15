import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { sql, type Tx } from './db.js';
import { tidakBerhak } from './errors.js';

/**
 * TOKEN.
 *
 * Bentuk pemakaiannya sengaja sama dengan KMB V2: mekanik mengetik token
 * sekali, lalu tidak pernah diminta lagi. Yang berubah cuma satu — token
 * TIDAK PERNAH disimpan telanjang.
 *
 * Akibatnya yang disengaja: tab Monitoring tidak bisa lagi memamerkan token
 * setiap mekanik ke L1 dan L2 seperti di KMB V2 (`app.js:2663`). Yang tersisa
 * di layar hanya empat huruf terakhir sebagai penanda, dan tombol reset.
 */

export interface Identitas {
  mechanicId: number;
  tenantId: number;
  nama: string;
  peran: 'mechanic' | 'supervisor' | 'superintendent';
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token.trim()).digest('hex');
}

/** 20 huruf hex — panjang yang sama dengan token KMB V2 yang sudah dikenal. */
export function buatToken(): string {
  return randomBytes(10).toString('hex');
}

export function petunjukToken(token: string): string {
  return token.trim().slice(-4);
}

/**
 * Menukar token jadi identitas.
 *
 * Perbandingan hash dilakukan basis data lewat index unik, bukan pemindaian
 * baris demi baris seperti `_resolveToken` di V2 yang membaca seluruh sheet
 * ApiTokens setiap permintaan.
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
    { mechanic_id: number; tenant_id: number; name: string; role: string }[]
  >`
    SELECT t.mechanic_id, t.tenant_id, m.name, m.role::text
      FROM api_tokens t
      JOIN mechanics m ON m.id = t.mechanic_id
     WHERE t.token_hash = ${hashToken(token)}
       AND t.is_active
       AND t.revoked_at IS NULL
       AND (t.expires_at IS NULL OR t.expires_at > now())
       AND m.is_active
  `;
  const r = baris[0];
  if (!r) throw tidakBerhak('Token tidak dikenal atau tidak berlaku');

  // Jejak pemakaian, sengaja tidak menunggu — kegagalan mencatat tidak boleh
  // menggagalkan permintaan yang sah.
  void q`UPDATE api_tokens SET last_used_at = now() WHERE token_hash = ${hashToken(token)}`;

  return {
    mechanicId: Number(r.mechanic_id),
    tenantId: Number(r.tenant_id),
    nama: r.name,
    peran: r.role as Identitas['peran'],
  };
}

/** Pembanding waktu-tetap untuk nilai rahasia yang panjangnya sama. */
export function samaAman(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

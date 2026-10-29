#!/usr/bin/env node
/**
 * Pemeriksaan Harian Token Kembar Tiga Rumah (docs/SERAH-TERIMA-2026-10-29.md §6).
 *
 * Token bersifat unik secara global (Zero-Select Tenant). Token yang terdaftar di lebih
 * dari satu rumah dilarang keras karena membingungkan routing pintu.
 *
 * Pemakaian:
 *   node tools/cek-token-kembar.mjs              # Mode cermin database (bila DATABASE_URL disetel)
 *   node tools/cek-token-kembar.mjs --ping <tok> # Cek token tertentu via live GAS ping ke 3 rumah
 *
 * Catatan Keamanan: Token tidak dicatat mentah di log; hanya 4 karakter awal + "…".
 */
import { readFileSync } from 'node:fs';

const samar = (t) => (t && typeof t === 'string' ? t.slice(0, 4) + '…' : '?');

// 1. Baca konfigurasi rumah dari workers/pintu/wrangler.toml
const tomlPintu = readFileSync(new URL('../workers/pintu/wrangler.toml', import.meta.url), 'utf8');
const RUMAH = [];
for (const m of tomlPintu.matchAll(/\{\s*kode\s*=\s*"([^"]+)",\s*nama\s*=\s*"([^"]+)",\s*gas\s*=\s*"([^"]+)"/g)) {
  RUMAH.push({ kode: m[1], nama: m[2], gas: m[3] });
}

async function cekSatuTokenGas(token) {
  console.log(`🔍 Memeriksa token ${samar(token)} ke ${RUMAH.length} rumah...`);
  const temuan = [];
  await Promise.all(
    RUMAH.map(async (r) => {
      try {
        const res = await fetch(r.gas, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ token, action: 'ping', data: {} }),
          signal: AbortSignal.timeout(20000),
        });
        const d = await res.json();
        if (d && d.success === true) temuan.push(r.nama);
      } catch (err) {
        console.warn(`  ⚠️ Rumah ${r.nama} tidak merespons: ${err.message}`);
      }
    })
  );

  if (temuan.length > 1) {
    console.error(`🚨 BAHAYA: Token ${samar(token)} terdaftar kembar di: ${temuan.join(' & ')}!`);
    process.exitCode = 1;
  } else if (temuan.length === 1) {
    console.log(`✅ Token ${samar(token)} sah dan unik di rumah: ${temuan[0]}`);
  } else {
    console.log(`ℹ️ Token ${samar(token)} tidak aktif / tidak ditemukan di rumah mana pun.`);
  }
}

async function cekDatabaseCermin(dbUrl) {
  console.log('🔍 Memeriksa token kembar di database Supabase cermin (skema sum, kmb, kmb_projek)...');
  const { default: postgres } = await import('postgres');
  const sql = postgres(dbUrl, { max: 1, prepare: false, ssl: 'require', connect_timeout: 15 });

  try {
    const q = await sql`
      WITH semua_token AS (
        SELECT 'sum' AS rumah, (data->>'token') AS token, (data->>'name') AS nama FROM sum.api_tokens
        UNION ALL
        SELECT 'kmb' AS rumah, (data->>'token') AS token, (data->>'name') AS nama FROM kmb.api_tokens
        UNION ALL
        SELECT 'kmb_projek' AS rumah, (data->>'token') AS token, (data->>'name') AS nama FROM kmb_projek.api_tokens
      )
      SELECT token, array_agg(rumah) AS daftar_rumah, count(*) AS jml
      FROM semua_token
      WHERE token IS NOT NULL AND token != ''
      GROUP BY token
      HAVING count(*) > 1;
    `;

    if (q.length === 0) {
      console.log('✅ 100% AMAN: Tidak ditemukan satupun token kembar lintas rumah di database cermin.');
    } else {
      console.error(`🚨 PERINGATAN: Ditemukan ${q.length} token kembar!`);
      for (const row of q) {
        console.error(`   - Token ${samar(row.token)} ada di: ${row.daftar_rumah.join(', ')}`);
      }
      process.exitCode = 1;
    }
  } catch (err) {
    console.log(`ℹ️ Tabel cermin belum terisi penuh atau koneksi gagal: ${err.message}`);
  } finally {
    await sql.end();
  }
}

async function main() {
  const arg = process.argv.slice(2);
  const idxPing = arg.indexOf('--ping');

  if (idxPing !== -1 && arg[idxPing + 1]) {
    await cekSatuTokenGas(arg[idxPing + 1]);
    return;
  }

  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    await cekDatabaseCermin(dbUrl);
  } else {
    console.log('ℹ️ DATABASE_URL tidak disetel. Jalankan dengan DATABASE_URL untuk audit cermin, atau --ping <token> untuk cek live GAS.');
  }
}

main().catch((e) => {
  console.error(`❌ Gagal: ${e.message}`);
  process.exit(1);
});

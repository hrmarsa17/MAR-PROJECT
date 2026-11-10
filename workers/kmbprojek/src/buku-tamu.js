/**
 * Buku Tamu Kiriman (Idempotency Store di Cloudflare, docs/SAKLAR.md §3)
 * Mencegah jaringan seluler yang terputus membuat WO kembar atau dobel persetujuan.
 */

function tentukanUrlPintu(env) {
  if (env && env.PINTU_URL) return env.PINTU_URL;
  const isStaging = (env && (env.ENVIRONMENT === 'staging' || String(env.RUMAH || '').includes('staging') || env.GAS_TIRUAN)) || true;
  return isStaging
    ? 'https://abadiops-pintu-staging.kawanabadigrup.workers.dev'
    : 'https://abadiops.com';
}

export async function cekBukuTamu(opId, env) {
  if (!opId) return null;
  try {
    const pintuBase = tentukanUrlPintu(env);
    const fetcher = (env && env.PINTU && typeof env.PINTU.fetch === 'function')
      ? env.PINTU.fetch.bind(env.PINTU)
      : fetch;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetcher(`${pintuBase}/api/buku-tamu/cek?op_id=${encodeURIComponent(opId)}`, {
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (res.ok) {
      const data = await res.json();
      if (data && data.found && data.record) {
        return data.record;
      }
    }
  } catch (err) {
    console.warn('Gagal cek buku tamu pintu:', (err && err.message) || err);
  }
  return null;
}

export async function catatBukuTamu(opId, result, rumah, env) {
  if (!opId) return;
  try {
    const pintuBase = tentukanUrlPintu(env);
    const fetcher = (env && env.PINTU && typeof env.PINTU.fetch === 'function')
      ? env.PINTU.fetch.bind(env.PINTU)
      : fetch;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    await fetcher(`${pintuBase}/api/buku-tamu/simpan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        op_id: opId,
        result: result,
        rumah: rumah || env?.RUMAH || 'kmbprojek'
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
  } catch (err) {
    console.warn('Gagal catat buku tamu pintu:', (err && err.message) || err);
  }
}

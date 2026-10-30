/**
 * Modul Autentikasi & Sesi Panel Saklar Pintu
 * Sesuai docs/SAKLAR.md § Letak dan akses
 */

const FAILED_ATTEMPTS = new Map(); // IP -> { count: number, resetAt: number }

export async function verifikasiKataSandi(password, env, clientIp) {
  const now = Date.now();
  const attempt = FAILED_ATTEMPTS.get(clientIp);

  if (attempt && attempt.resetAt > now && attempt.count >= 5) {
    const sisaMenit = Math.ceil((attempt.resetAt - now) / 60000);
    return {
      ok: false,
      error: `Terlalu banyak percobaan salah. Akses dikunci sementara selama ${sisaMenit} menit.`,
    };
  }

  const expectedSecret = env.PANEL_SAKLAR_SECRET || 'abadiops2026!';
  let valid = false;

  // Jika secret adalah SHA-256 hex string (64 char)
  if (expectedSecret.length === 64 && /^[0-9a-fA-F]+$/.test(expectedSecret)) {
    const hash = await hitungSha256(password);
    valid = hash.toLowerCase() === expectedSecret.toLowerCase();
  } else {
    valid = password === expectedSecret;
  }

  if (!valid) {
    const count = (attempt && attempt.resetAt > now ? attempt.count : 0) + 1;
    FAILED_ATTEMPTS.set(clientIp, { count, resetAt: now + 15 * 60 * 1000 });
    return { ok: false, error: 'Kata sandi tidak valid. Sisa percobaan: ' + Math.max(0, 5 - count) };
  }

  // Sukses -> bersihkan counter kegagalan
  FAILED_ATTEMPTS.delete(clientIp);

  // Buat session token bertanda tangan HMAC (2 jam)
  const token = await buatSessionToken(env);
  return { ok: true, token };
}

export async function validasiSesi(request, env) {
  const authHeader = request.headers.get('authorization') || '';
  const cookieHeader = request.headers.get('cookie') || '';

  let token = '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (cookieHeader.includes('abadi_saklar_session=')) {
    const match = cookieHeader.match(/abadi_saklar_session=([^;]+)/);
    if (match) token = decodeURIComponent(match[1]);
  }

  if (!token) return false;
  return await verifikasiSessionToken(token, env);
}

async function hitungSha256(str) {
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function dapatkanKunciHmac(env) {
  const secretKeyStr = env.PANEL_SAKLAR_SECRET || 'abadi-saklar-hmac-key-2026-fallback';
  const enc = new TextEncoder().encode(secretKeyStr);
  return await crypto.subtle.importKey(
    'raw',
    enc,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function buatSessionToken(env) {
  const key = await dapatkanKunciHmac(env);
  const payload = JSON.stringify({
    role: 'admin',
    exp: Date.now() + 2 * 60 * 60 * 1000, // 2 jam
    rnd: Math.random().toString(36).slice(2),
  });
  const payloadB64 = btoa(payload);
  const encPayload = new TextEncoder().encode(payloadB64);
  const sigBuf = await crypto.subtle.sign('HMAC', key, encPayload);
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
  return `${payloadB64}.${sigB64}`;
}

async function verifikasiSessionToken(token, env) {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [payloadB64, sigB64] = parts;

    const key = await dapatkanKunciHmac(env);
    const encPayload = new TextEncoder().encode(payloadB64);
    const sigBytes = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));

    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encPayload);
    if (!valid) return false;

    const payload = JSON.parse(atob(payloadB64));
    if (!payload || payload.exp < Date.now()) return false;
    return true;
  } catch (_) {
    return false;
  }
}

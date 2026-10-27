/**
 * LIVE TIMER — cermin dari `MechanicDashboard.html:1313-1470` dan dari PWA.
 *
 * Keadaan disimpan di `localStorage` supaya bertahan saat halaman berpindah
 * (tab Assigned/Pending/Done mengganti URL, jadi halaman memang dimuat ulang).
 * Kalau `localStorage` diblokir, timer tetap jalan di memori — hanya tidak
 * bertahan antar halaman; itu degradasi yang dapat diterima, dan lebih baik
 * daripada layar yang mati total.
 */

export const KUNCI_TIMER = 'mar_kmb_timers';

export interface KeadaanTimer {
  state: 'idle' | 'running' | 'paused';
  start_epoch: number;
  elapsed_ms: number;
}

const KOSONG: KeadaanTimer = { state: 'idle', start_epoch: 0, elapsed_ms: 0 };

let memo: Record<string, KeadaanTimer> | null = null;

export function semuaTimer(): Record<string, KeadaanTimer> {
  if (memo) return memo;
  let terbaca: unknown = null;
  try {
    terbaca = JSON.parse(globalThis.localStorage?.getItem(KUNCI_TIMER) ?? '{}');
  } catch {
    terbaca = null;
  }
  /* Harus benar-benar objek. Kalau isinya `null` atau sesuatu yang bukan objek,
     `memo` tetap null dan setiap pemanggilan berikutnya mengembalikan objek
     BARU — perubahan timer ditulis ke objek yang langsung dibuang, dan jam
     mekanik berhenti bertambah tanpa satu pun tanda. */
  memo = (terbaca && typeof terbaca === 'object')
    ? terbaca as Record<string, KeadaanTimer>
    : {};
  return memo;
}

export function simpanTimer(): void {
  try {
    globalThis.localStorage?.setItem(KUNCI_TIMER, JSON.stringify(memo ?? {}));
  } catch {
    /* diblokir — timer tetap jalan di memori */
  }
}

export function timerWo(woId: number | string): KeadaanTimer {
  const semua = semuaTimer();
  const k = String(woId);
  if (!semua[k]) semua[k] = { ...KOSONG };
  return semua[k];
}

/**
 * JALUR UANG: hanya SATU WO boleh berjalan.
 *
 * Tanpa ini, mekanik yang menekan Start di dua WO mendapat dua timer berjalan
 * bersamaan dan jam yang sama terhitung dua kali — dua kali dibayar untuk satu
 * rentang waktu. Mengembalikan berapa yang dijeda supaya layar bisa
 * memberitahunya, bukan menjeda diam-diam.
 */
export function jedaLainnya(woIdSekarang: number | string): number {
  const semua = semuaTimer();
  let n = 0;
  for (const [id, st] of Object.entries(semua)) {
    if (id === String(woIdSekarang) || st.state !== 'running') continue;
    st.elapsed_ms = (st.elapsed_ms || 0) + (Date.now() - (st.start_epoch || Date.now()));
    st.state = 'paused';
    st.start_epoch = 0;
    n++;
  }
  if (n) simpanTimer();
  return n;
}

export function msBerjalan(st: KeadaanTimer): number {
  const lalu = Number(st.elapsed_ms) || 0;
  /* `start_epoch` wajib ada saat state 'running'. Entri yang rusak (localStorage
     disunting, versi lama, penyimpanan penuh) akan membuat Date.now() - 0
     menghasilkan lima puluh enam tahun — dan angka itu jalur uang. Keadaan
     ganjil dibaca sebagai "belum jalan", bukan sebagai durasi raksasa. */
  if (st.state !== 'running' || !st.start_epoch) return lalu;
  return lalu + (Date.now() - st.start_epoch);
}

export function bersihkanTimer(woId: number | string): void {
  semuaTimer()[String(woId)] = { ...KOSONG };
  simpanTimer();
}

/** `00:00:00` — bentuk yang dipakai penghitung besar di modal. */
export function msKeHms(ms: number): string {
  if (!ms || ms < 0) return '00:00:00';
  const total = Math.floor(ms / 1000);
  const j = Math.floor(total / 3600);
  const m = Math.floor((total - j * 3600) / 60);
  const d = total - j * 3600 - m * 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(j)}:${p(m)}:${p(d)}`;
}

/** "2 jam 15 menit" — bentuk yang dipakai konfirmasi dan ringkasan hijau. */
export function msKeJamMenit(ms: number): string {
  const total = Math.round((ms || 0) / 60000);
  const j = Math.floor(total / 60);
  const m = total % 60;
  if (j > 0 && m > 0) return `${j} jam ${m} menit`;
  if (j > 0) return `${j} jam`;
  return `${m} menit`;
}

/**
 * `Date` → "YYYY-MM-DDTHH:MM" dalam zona waktu peramban.
 *
 * `toISOString()` TIDAK boleh dipakai di sini: ia menggeser ke UTC, dan jam
 * yang muncul di picker akan meleset tujuh jam dari jam dinding di lapangan.
 */
export function keWaktuLokal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    + `T${p(d.getHours())}:${p(d.getMinutes())}`;
}

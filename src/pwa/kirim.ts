import {
  type ItemOutbox, adaIndexedDb, antrean, bacaItem, bacaKv, tulisOutbox,
} from './simpanan.js';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * SATU PINTU UNTUK SEMUA PENULISAN
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Sebelum berkas ini ada, sembilan layar masing-masing memanggil
 * `fetch('/api/perintah')` sendiri. Itu berjalan baik selama semua orang punya
 * sinyal — dan tidak bisa dibuat luring tanpa menyentuh sembilan tempat dengan
 * sembilan cara yang berbeda-beda.
 *
 * ── URUTANNYA MENENTUKAN: TULIS ANTREAN DULU, BARU KIRIM ────────────────────
 * Item ditulis ke outbox SEBELUM permintaan berangkat, bukan sesudah gagal.
 * Kalau ditulis sesudah gagal, ada celah di antara "permintaan berangkat" dan
 * "kita tahu ia gagal" — dan aplikasi yang ditutup, HP yang mati, atau tab yang
 * dibunuh peramban di celah itu membuat pekerjaannya lenyap tanpa jejak.
 * Menulis dulu berarti yang paling buruk yang bisa terjadi adalah kiriman
 * ganda — dan kiriman ganda sudah ditangani `op_id` di server.
 *
 * ── TIGA HASIL YANG BERBEDA, DAN KENAPA TIDAK BOLEH DISAMAKAN ───────────────
 *
 *   berhasil   server menjawab. Selesai.
 *
 *   antre      permintaan tidak sampai (luring), ATAU server menjawab "sedang
 *              sibuk". Keduanya BUKAN penolakan: pekerjaannya sah dan akan
 *              dicoba lagi. Menampilkannya sebagai galat membuat orang mengisi
 *              ulang formulir yang sebenarnya sudah aman tersimpan.
 *
 *   ditolak    server menolak dengan alasan. Mencoba lagi hanya akan ditolak
 *              dengan alasan yang sama. Yang dibutuhkan orang, bukan
 *              pengulangan — jadi item ditandai `gagal` dan berhenti.
 *
 * Di KMB V2 pembedaan ini ada di `sw.js` sebagai `retry_later`. Di sini server
 * sudah menyebutnya sendiri lewat `boleh_coba_lagi` (`src/lib/errors.ts:36`,
 * benar untuk `SEDANG_SIBUK`), jadi klien tidak perlu menebak.
 */

export interface HasilKirim {
  keadaan: 'berhasil' | 'antre' | 'ditolak';
  opId: string;
  /** Isi `data` dari jawaban server; hanya saat berhasil. */
  hasil?: { hasil?: unknown; diulang?: boolean };
  /** Alasan penolakan, apa adanya dari server. */
  pesan?: string;
}

export interface OpsiKirim {
  /** Dipakai ulang saat mencoba kiriman yang SAMA. Kalau kosong, lahir di sini. */
  opId?: string;
  /** Angka yang dilihat orang saat menekan — lihat ItemOutbox.pratinjau. */
  pratinjau?: Record<string, unknown>;
  /** Satu baris untuk layar Antrean, mis. "Kirim kerja WO-2609-0031". */
  ringkas?: string;
}

const ALAMAT = '/api/perintah';

function buatOpId(): string {
  /* randomUUID butuh konteks aman (HTTPS atau localhost). Produksi selalu
     HTTPS — cookie sesi menuntutnya — tapi cadangannya tetap ada supaya
     pembuatan WO tidak pernah gagal karena alasan sepele ini. */
  try {
    return crypto.randomUUID();
  } catch {
    return `op-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

/** Peramban bisa keliru bilang daring, tapi ia TIDAK PERNAH keliru bilang luring. */
function mungkinDaring(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/**
 * Mengirim satu perintah, atau mengantrekannya.
 *
 * Tidak pernah melempar karena jaringan. Yang dilempar hanya hal yang memang
 * kesalahan pemrogram.
 */
export async function kirimPerintah(
  aksi: string,
  data: unknown,
  opsi: OpsiKirim = {},
): Promise<HasilKirim> {
  const opId = opsi.opId ?? buatOpId();
  const punyaDb = adaIndexedDb();

  if (punyaDb) {
    const lama = await bacaItem(opId);
    /* Item yang sudah 'terkirim' tidak dikirim ulang. Ini yang membuat tombol
       yang ditekan dua kali — atau formulir yang di-refresh — tidak melahirkan
       kiriman kedua, bahkan sebelum server sempat menolaknya lewat op_id. */
    if (lama?.status === 'terkirim') {
      return { keadaan: 'berhasil', opId, hasil: lama.hasil as HasilKirim['hasil'] };
    }
    /* Ditandai MILIK siapa. HP dipinjam antar mekanik; tanpa ini kiriman orang
       pertama ikut terkirim lewat sesi orang kedua, dan server menentukan
       pelakunya dari cookie — bukan dari isi kiriman. */
    const aku = await bacaKv<{ mechanicId: number }>('aku');
    const item: ItemOutbox = lama ?? {
      op_id: opId,
      aksi,
      data,
      status: 'antre',
      dibuat_at: new Date().toISOString(),
      percobaan: 0,
      ...(aku?.mechanicId ? { milik: aku.mechanicId } : {}),
      ...(opsi.pratinjau ? { pratinjau: opsi.pratinjau } : {}),
      ...(opsi.ringkas ? { ringkas: opsi.ringkas } : {}),
    };
    await tulisOutbox(item);
  }

  if (!mungkinDaring()) {
    if (punyaDb) await mintaSinkronLatar();
    return { keadaan: 'antre', opId };
  }

  return kirimSekarang(opId, aksi, data, punyaDb);
}

async function kirimSekarang(
  opId: string, aksi: string, data: unknown, punyaDb: boolean,
): Promise<HasilKirim> {
  let r: Response;
  try {
    r = await fetch(ALAMAT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aksi, op_id: opId, data }),
    });
  } catch {
    /* Sambungan putus. Bisa saat permintaan BERANGKAT (server tak pernah
       menerima) atau saat jawaban PULANG (server sudah menulis semuanya) — dari
       sini keduanya terlihat persis sama. Item tetap antre; `op_id` yang
       memastikan pengiriman ulang tidak melahirkan WO kedua. */
    if (punyaDb) {
      await tandai(opId, (it) => ({ ...it, percobaan: it.percobaan + 1 }));
      await mintaSinkronLatar();
    }
    return { keadaan: 'antre', opId };
  }

  let j: {
    ok?: boolean; data?: { hasil?: unknown; diulang?: boolean };
    pesan?: string; boleh_coba_lagi?: boolean;
  };
  try {
    j = await r.json();
  } catch {
    /* Jawaban bukan JSON — nyaris selalu halaman galat perantara (portal wifi
       hotel, proxy kantor) yang menyaru jadi jawaban server. Itu masalah
       jaringan, bukan penolakan, jadi pekerjaannya tetap antre. */
    if (punyaDb) await tandai(opId, (it) => ({ ...it, percobaan: it.percobaan + 1 }));
    return { keadaan: 'antre', opId };
  }

  if (j.ok) {
    if (punyaDb) {
      await tandai(opId, (it) => ({
        ...it, status: 'terkirim', hasil: j.data, percobaan: it.percobaan + 1,
      }));
    }
    return { keadaan: 'berhasil', opId, hasil: j.data ?? {} };
  }

  /* SEDANG_SIBUK dan kawan-kawannya: sah, cuma belum sekarang. */
  if (j.boleh_coba_lagi) {
    if (punyaDb) {
      await tandai(opId, (it) => ({ ...it, percobaan: it.percobaan + 1 }));
      await mintaSinkronLatar();
    }
    return { keadaan: 'antre', opId };
  }

  const pesan = j.pesan ?? 'Ditolak server tanpa alasan yang disebutkan';
  if (punyaDb) {
    await tandai(opId, (it) => ({
      ...it, status: 'gagal', galat: pesan, percobaan: it.percobaan + 1,
    }));
  }
  return { keadaan: 'ditolak', opId, pesan };
}

async function tandai(
  opId: string, ubah: (it: ItemOutbox) => ItemOutbox,
): Promise<void> {
  const it = await bacaItem(opId);
  if (it) await tulisOutbox(ubah(it));
}

/**
 * Mengosongkan antrean. Aman dipanggil berkali-kali dan bersamaan.
 *
 * Dikerjakan BERURUTAN, bukan paralel. Dua alasan: pembuatan WO yang
 * bersamaan saling berebut nomor urut di server, dan mengirim seluruh antrean
 * sekaligus lewat sinyal lapangan yang tipis membuat semuanya gagal bersama.
 */
export async function kosongkanAntrean(): Promise<{ terkirim: number; sisa: number }> {
  if (!adaIndexedDb()) return { terkirim: 0, sisa: 0 };

  /* HANYA milik yang sedang masuk. Mengirim antrean orang lain lewat sesi ini
     berarti mencatat jam kerjanya atas nama orang yang salah — atau ditolak
     server dengan alasan yang tidak dimengerti siapa pun. */
  const aku = await bacaKv<{ mechanicId: number }>('aku');
  const punyaku = aku?.mechanicId ?? null;

  if (!mungkinDaring()) {
    return { terkirim: 0, sisa: (await antrean(punyaku)).length };
  }
  let terkirim = 0;
  for (const it of await antrean(punyaku)) {
    const h = await kirimSekarang(it.op_id, it.aksi, it.data, true);
    if (h.keadaan === 'berhasil') terkirim++;
    /* Berhenti pada kegagalan jaringan yang PERTAMA. Kalau satu tidak sampai,
       sisanya hampir pasti juga tidak — meneruskannya hanya menambah percobaan
       dan menguras baterai di tempat yang justru tidak ada sinyalnya. */
    if (h.keadaan === 'antre') break;
  }
  return { terkirim, sisa: (await antrean(punyaku)).length };
}

/**
 * Menitipkan pengosongan antrean ke peramban, supaya ia jalan walau aplikasi
 * sudah ditutup.
 *
 * HANYA ADA DI CHROME/ANDROID. Safari di iOS tidak punya Background Sync sama
 * sekali — di sana antrean hanya bergerak saat aplikasi dibuka. Karena itu ia
 * bonus, bukan tulang punggung: `kosongkanAntrean()` tetap dipanggil dari
 * halaman saat dibuka, saat kembali terlihat, dan saat sinyal pulih.
 */
export async function mintaSinkronLatar(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
    const reg = await navigator.serviceWorker.ready;
    const sync = (reg as ServiceWorkerRegistration & {
      sync?: { register(tag: string): Promise<void> };
    }).sync;
    if (!sync) return false;
    await sync.register('mar-outbox');
    return true;
  } catch {
    return false;
  }
}

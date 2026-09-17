/**
 * ════════════════════════════════════════════════════════════════════════════
 * SIMPANAN LURING — IndexedDB
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Dua store, dan pembagiannya menentukan:
 *
 *   kv      salinan data yang BOLEH basi. Katalog, daftar WO, antrean
 *           approval. Hilang = layar kosong sampai ada sinyal. Menjengkelkan,
 *           tidak berbahaya.
 *
 *   outbox  pekerjaan yang BELUM sampai ke server. Hilang = jam kerja
 *           seseorang lenyap, dan tidak ada satu pun catatan bahwa ia pernah
 *           ada. Inilah satu-satunya data di aplikasi ini yang tidak punya
 *           salinan di tempat lain.
 *
 * ── KENAPA TOKEN TIDAK DISIMPAN DI SINI ─────────────────────────────────────
 * PWA KMB V2 menyimpan token di `kv` karena GAS menaruh token di BADAN
 * permintaan — service worker-nya harus bisa membacanya untuk menyusun kiriman.
 * Kita tidak: identitas dibawa cookie httpOnly, dan fetch ke origin yang sama
 * membawanya sendiri, termasuk dari dalam service worker. Token karena itu
 * tidak pernah tersentuh JavaScript, dan tidak pernah ada di IndexedDB yang
 * bisa dibaca skrip mana pun yang kebetulan berjalan di halaman.
 *
 * ── KENAPA localStorage TIDAK CUKUP ─────────────────────────────────────────
 * `localStorage` sinkron dan memblokir utas utama, tidak bisa dibaca service
 * worker sama sekali, dan berbatas ~5 MB. Antrean harus bisa dibaca service
 * worker — itu yang membuatnya bisa terkirim saat aplikasi sudah ditutup.
 */

export const NAMA_DB = 'mar_v1';
export const VERSI_DB = 1;

/** Sebuah pekerjaan yang menunggu sampai ke server. */
export interface ItemOutbox {
  /** Lahir di klien, TIDAK PERNAH berubah — kunci idempotensi di server. */
  op_id: string;
  aksi: string;
  data: unknown;
  /**
   * antre    belum sampai, akan dicoba lagi. Termasuk saat server menjawab
   *          "sedang sibuk" — itu bukan penolakan.
   * terkirim server sudah menerima dan menjawab. Selesai.
   * gagal    server MENOLAK dengan alasan yang jelas. Mencoba lagi hanya akan
   *          ditolak dengan alasan yang sama; yang dibutuhkan orang, bukan
   *          pengulangan.
   */
  status: 'antre' | 'terkirim' | 'gagal';
  /** Jawaban server saat berhasil. */
  hasil?: unknown;
  /** Alasan penolakan, apa adanya dari server. */
  galat?: string;
  /**
   * Angka yang DILIHAT orang saat menekan tombol.
   *
   * Approval L2 membekukan uang memakai faktor yang berlaku SAAT SERVER
   * memprosesnya — bukan saat tombol ditekan. Kalau persetujuan menunggu sejam
   * di antrean, keduanya bisa berbeda. Disimpan supaya sesudah terkirim
   * hasilnya bisa dibandingkan dan selisihnya disebutkan, bukan didiamkan.
   */
  pratinjau?: Record<string, unknown>;
  dibuat_at: string;
  percobaan: number;
  /** Ringkasan sependek mungkin untuk layar Antrean. */
  ringkas?: string;
  /**
   * SIAPA yang mengantrekannya — `mechanics.id`.
   *
   * HP dipinjam antar mekanik; itu hal biasa di shift. Tanpa penanda ini,
   * kiriman yang diantrekan orang PERTAMA ikut terkirim saat orang KEDUA masuk
   * dan sinyalnya pulih — dan server menentukan pelakunya dari cookie, bukan
   * dari isi kiriman. Jam kerja orang pertama tercatat atas nama orang kedua,
   * atau ditolak dengan alasan yang tidak dimengerti siapa pun.
   *
   * Item TANPA penanda ini dianggap milik siapa saja, dan itu disengaja: ia
   * lahir sebelum penandanya ada, atau saat belum ada yang masuk. Menyembunyikan
   * pekerjaan yang belum terkirim jauh lebih berbahaya daripada mengirimkannya
   * lewat sesi yang salah — yang terburuk pun masih ditolak server dengan
   * alasan yang tercatat, bukan lenyap tanpa jejak.
   */
  milik?: number;
}

/**
 * `wo_saya` dan `sinkron_terakhir` DIHAPUS dari daftar ini 17 Sep 2026: keduanya
 * tercantum sebagai kunci yang sah tapi tidak pernah ditulis maupun dibaca satu
 * baris pun. Kunci yang ada di tipe tapi tidak di kode membuat orang berikutnya
 * mengira data itu tersedia — lalu membaca `null` dan mengira penyimpanannya
 * rusak.
 *
 * `approval`, bukan `antrean` — meski API-nya bernama `jenis=antrean`.
 * Di aplikasi ini kata "antrean" sudah berarti OUTBOX (layar /antrean, berisi
 * pekerjaan yang belum terkirim). Memakai kata yang sama untuk antrean
 * persetujuan berarti dua hal yang sama sekali berbeda memakai satu nama di
 * satu berkas — dan yang satu tidak boleh hilang sementara yang lain boleh.
 */
export type KunciKv =
  | 'aku' | 'katalog' | 'approval' | 'monitoring' | 'sw_snap';

/** IndexedDB tidak ada di server-render maupun di sebagian peramban jadul. */
export function adaIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

let terbuka: Promise<IDBDatabase> | null = null;

export function bukaDb(): Promise<IDBDatabase> {
  if (terbuka) return terbuka;
  terbuka = new Promise((res, rej) => {
    const r = indexedDB.open(NAMA_DB, VERSI_DB);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      if (!d.objectStoreNames.contains('outbox')) {
        const s = d.createObjectStore('outbox', { keyPath: 'op_id' });
        /* Diindeks per status: layar Antrean dan service worker keduanya cuma
           butuh yang 'antre'. Tanpa indeks, keduanya membaca SELURUH outbox
           tiap kali — termasuk ribuan item yang sudah terkirim berbulan-bulan
           lalu. */
        s.createIndex('status', 'status');
      }
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error ?? new Error('IndexedDB gagal dibuka'));
  });
  return terbuka;
}

/** Hanya untuk uji — melupakan koneksi supaya basis data berikutnya dibuka bersih. */
export function lupakanKoneksi(): void {
  terbuka = null;
}

function jalankan<T>(
  store: 'kv' | 'outbox',
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return bukaDb().then(
    (d) =>
      new Promise<T>((res, rej) => {
        const tx = d.transaction(store, mode);
        const rq = fn(tx.objectStore(store));
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error ?? new Error('IndexedDB gagal'));
      }),
  );
}

/* ── kv ─────────────────────────────────────────────────────────────────── */

export async function simpanKv(kunci: KunciKv, nilai: unknown): Promise<void> {
  await jalankan('kv', 'readwrite', (s) => s.put(nilai, kunci));
}

export async function bacaKv<T>(kunci: KunciKv): Promise<T | null> {
  const v = await jalankan<T | undefined>('kv', 'readonly', (s) => s.get(kunci));
  return v === undefined ? null : v;
}

/* ── outbox ─────────────────────────────────────────────────────────────── */

export async function tulisOutbox(item: ItemOutbox): Promise<void> {
  await jalankan('outbox', 'readwrite', (s) => s.put(item));
}

export async function bacaItem(opId: string): Promise<ItemOutbox | null> {
  const v = await jalankan<ItemOutbox | undefined>('outbox', 'readonly', (s) => s.get(opId));
  return v === undefined ? null : v;
}

/**
 * Yang masih menunggu, terlama lebih dulu — urutan pengerjaannya.
 *
 * @param milik kalau disebut, hanya item milik orang itu (dan yang tak
 *   bertuan). Dipakai supaya kiriman orang sebelumnya tidak ikut terkirim lewat
 *   sesi orang berikutnya di HP yang sama. Lihat `ItemOutbox.milik`.
 */
export async function antrean(milik?: number | null): Promise<ItemOutbox[]> {
  const semua = await jalankan<ItemOutbox[]>('outbox', 'readonly', (s) =>
    s.index('status').getAll('antre'));
  const saring = milik == null
    ? semua
    : semua.filter((i) => i.milik === undefined || i.milik === milik);
  return saring.sort((a, b) => a.dibuat_at.localeCompare(b.dibuat_at));
}

/** Berapa yang menunggu tapi MILIK ORANG LAIN — untuk diberitahukan saat keluar. */
export async function antreanOrangLain(milik: number): Promise<number> {
  const semua = await antrean();
  return semua.filter((i) => i.milik !== undefined && i.milik !== milik).length;
}

export async function semuaItem(): Promise<ItemOutbox[]> {
  const semua = await jalankan<ItemOutbox[]>('outbox', 'readonly', (s) => s.getAll());
  return semua.sort((a, b) => b.dibuat_at.localeCompare(a.dibuat_at));
}

export async function hapusItem(opId: string): Promise<void> {
  await jalankan('outbox', 'readwrite', (s) => s.delete(opId));
}

/**
 * Membuang yang sudah SELESAI dan sudah tua.
 *
 * Yang 'antre' dan 'gagal' TIDAK PERNAH dibuang otomatis, berapa pun umurnya.
 * Item antre adalah pekerjaan yang belum sampai — membuangnya berarti
 * menghapus jam kerja seseorang diam-diam. Item gagal adalah satu-satunya
 * catatan bahwa seseorang pernah mencoba dan ditolak; ia dibuang oleh orang,
 * dari layar Antrean, sesudah dibaca.
 */
export async function pangkasYangSelesai(simpanHari = 7): Promise<number> {
  const batas = Date.now() - simpanHari * 86_400_000;
  const semua = await semuaItem();
  let dibuang = 0;
  for (const it of semua) {
    if (it.status !== 'terkirim') continue;
    if (Date.parse(it.dibuat_at) >= batas) continue;
    await hapusItem(it.op_id);
    dibuang++;
  }
  return dibuang;
}

/**
 * Umur item tertua yang masih menunggu, dalam hari.
 *
 * Dipakai layar Antrean untuk memperingatkan SEBELUM terlambat: Safari di iOS
 * membuang penyimpanan situs yang tidak dibuka sekitar tujuh hari. Antrean yang
 * menua di iPhone bukan sekadar tertunda — ia bisa lenyap, bersama seluruh jam
 * kerja di dalamnya, tanpa ada yang menekan apa pun.
 */
export async function umurAntreanHari(): Promise<number> {
  const a = await antrean();
  if (a.length === 0) return 0;
  const tertua = Math.min(...a.map((i) => Date.parse(i.dibuat_at)));
  return (Date.now() - tertua) / 86_400_000;
}

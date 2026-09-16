/**
 * ════════════════════════════════════════════════════════════════════════════
 * APA YANG DILIHAT ORANG vs APA YANG AKHIRNYA TERJADI
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Persetujuan L2 MEMBEKUKAN uang. Pembekuan itu terjadi di server, memakai
 * faktor dan tarif yang berlaku SAAT SERVER MEMPROSESNYA — bukan saat tombol
 * ditekan.
 *
 * Saat daring keduanya terpisah sepersekian detik dan tidak ada bedanya. Saat
 * luring, persetujuan bisa menunggu berjam-jam di antrean HP seseorang. Di
 * antara keduanya, seorang admin bisa saja menyetel ulang faktor tarif atau
 * mengubah base point — dan itu justru sering terjadi di sistem ini.
 *
 * Akibatnya approver menyetujui angka A, lalu yang membeku angka B. Tidak ada
 * yang salah secara teknis, tidak ada galat, dan tidak ada satu pun cara
 * menyadarinya — kecuali kalau angka yang DILIHAT ikut dibawa dalam antrean
 * lalu dibandingkan sesudahnya. Itulah yang dikerjakan berkas ini.
 *
 * Ia TIDAK membatalkan apa pun. Yang membeku tetap yang dihitung server — itu
 * memang yang benar. Yang ditambahkan cuma: orangnya diberi tahu.
 */

export interface Beda {
  kunci: string;
  dilihat: number | string;
  jadi: number | string;
}

/** Mencari sebuah kunci di mana pun kedalamannya. Yang pertama ketemu dipakai. */
function cari(simpul: unknown, kunci: string, dalam = 0): unknown {
  if (dalam > 6 || simpul === null || typeof simpul !== 'object') return undefined;
  const o = simpul as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(o, kunci)) return o[kunci];
  for (const v of Object.values(o)) {
    const k = cari(v, kunci, dalam + 1);
    if (k !== undefined) return k;
  }
  return undefined;
}

/**
 * Selisih antara yang dilihat dan yang jadi.
 *
 * Kunci yang TIDAK ADA di jawaban server dilewati, bukan dilaporkan berbeda:
 * pratinjau boleh memuat hal yang memang tidak dikembalikan server, dan
 * melaporkannya sebagai selisih akan membuat setiap kiriman tampak bermasalah.
 * Peringatan yang selalu menyala akan berhenti dibaca.
 */
export function bedaPratinjau(
  pratinjau: Record<string, unknown> | undefined,
  hasil: unknown,
): Beda[] {
  if (!pratinjau) return [];
  const out: Beda[] = [];

  for (const [kunci, dilihat] of Object.entries(pratinjau)) {
    if (dilihat === null || dilihat === undefined) continue;
    if (typeof dilihat !== 'number' && typeof dilihat !== 'string') continue;
    /* Teks kosong berarti TIDAK ADA angka yang dilihat — bukan angka nol.
       Tanpa baris ini sebuah kolom pratinjau yang kebetulan belum terisi akan
       dilaporkan "berbeda dari 0" pada setiap kiriman. */
    if (typeof dilihat === 'string' && dilihat.trim() === '') continue;

    const jadi = cari(hasil, kunci);
    if (jadi === undefined || jadi === null) continue;
    if (typeof jadi !== 'number' && typeof jadi !== 'string') continue;

    /* Dibandingkan sebagai ANGKA bila keduanya bisa jadi angka. Server
       mengembalikan numeric Postgres sebagai string ("120.00"), dan
       membandingkannya sebagai teks dengan 120 akan melaporkan selisih yang
       tidak pernah ada. */
    const a = Number(dilihat);
    const b = Number(jadi);
    const angka = Number.isFinite(a) && Number.isFinite(b) && String(dilihat).trim() !== '';
    const sama = angka ? Math.abs(a - b) < 0.005 : String(dilihat) === String(jadi);

    if (!sama) out.push({ kunci, dilihat, jadi });
  }
  return out;
}

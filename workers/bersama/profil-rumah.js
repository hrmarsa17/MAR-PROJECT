/**
 * Profil rumah: config/rumah.json, ditambah RUMAH LATIHAN turunan untuk uji kering prosedur Mulai migrasi / Kembali
 * ke GAS DI PRODUKSI (keputusan Gabriel 15 Nov 2026; docs/SIAP-MULAI.md "Uji kering di produksi").
 *
 * Setiap rumah asli <kode> mendapat kembaran `latihan_<kode>`:
 *   - kode GAS dan seluruh aturan sama (salinan dangkal profil asli, jadi selalu ikut bila rumah asli berubah);
 *   - skema `latihan_<skema>` di Gedung 1, dicermin dari SALINAN spreadsheet rumah itu (bukan spreadsheet asli);
 *     database memperlakukannya seperti rumah asli (kunci tulis PT423, kunci sinkron maju, izin tulis);
 *   - `latihan: true`: pintu TIDAK memakainya untuk mengenali token pengguna (salinan memuat token asli; tanpa ini
 *     token mekanik terdaftar di dua rumah dan login ditolak), syarat 7 hari tidak berlaku;
 *   - jalan kembali siap (salinan sudah dilatih cermin balik 15 Nov).
 * Rumah latihan hanya aktif di lingkungan yang mencantumkannya di RUMAH (wrangler.toml pintu); di tempat lain inert.
 */
import ASLI from '../../config/rumah.json';

export const AWALAN_LATIHAN = 'latihan_';

function turunkan(kode, p) {
  return {
    ...p,
    nama: `${p.nama} (LATIHAN)`,
    skema: AWALAN_LATIHAN + p.skema,
    latihan: true,
    rumah_asli: kode,
    gas: { ...p.gas, jalan_kembali_siap: true },
  };
}

const PROFIL_RUMAH = { ...ASLI };
for (const [kode, p] of Object.entries(ASLI)) {
  if (p && typeof p === 'object' && p.gas && p.skema && !kode.startsWith(AWALAN_LATIHAN)) {
    PROFIL_RUMAH[AWALAN_LATIHAN + kode] = turunkan(kode, p);
  }
}

export const adalahLatihan = (kode) => Boolean((PROFIL_RUMAH[String(kode || '').toLowerCase()] || {}).latihan);

export default PROFIL_RUMAH;

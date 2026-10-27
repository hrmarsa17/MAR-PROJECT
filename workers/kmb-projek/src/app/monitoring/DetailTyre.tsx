'use client';

import { Fragment, useState } from 'react';
import type { BekalForm, DetailWo } from '../../domain/kueriDetailForm.js';

/**
 * DETAIL TYRE — port dari `MechanicDashboard.html:597-670` + `:1094-1311`.
 *
 * Tiga bentuk, dan sebuah WO hanya berhak atas SATU di antaranya. Jenisnya
 * ditentukan SERVER lewat `jobs.detail_form_id`, bukan ditebak layar: kalau
 * layar yang memutuskan, web dan PWA bisa berbeda pendapat tentang WO yang
 * sama (`:597-601`).
 *
 * SELURUHNYA OPSIONAL. Tombol Kirim tidak pernah menunggu satu pun medan di
 * sini; gerbangnya tetap Start & End Time. Mekanik yang sinyalnya hilang di
 * lapangan harus tetap bisa melaporkan kerjanya (`:602-606`).
 */

export type NilaiDetail = Record<string, Record<string, string>>;

export function DetailTyre({
  bekal, detail, nilai, onUbah,
}: {
  bekal: BekalForm;
  detail: DetailWo;
  nilai: NilaiDetail;
  onUbah: (baru: NilaiDetail) => void;
}) {
  const set = (pos: string, kunci: string, v: string) =>
    onUbah({ ...nilai, [pos]: { ...(nilai[pos] ?? {}), [kunci]: v } });

  const ambil = (pos: string, kunci: string) =>
    nilai[pos]?.[kunci] ?? detail.isian[pos]?.after[kunci] ?? '';

  return (
    <div className="modal-bagian">
      <h4 className="modal-bagian-judul">
        Detail Tyre{' '}
        <span className="tyre-opsional">— boleh dikosongkan</span>
      </h4>
      {bekal.kode === 'tyre_inspeksi' && (
        <Inspeksi bekal={bekal} detail={detail} ambil={ambil} set={set} />
      )}
      {bekal.kode === 'tyre_remove_instal' && (
        <RemoveInstal bekal={bekal} detail={detail} nilai={nilai} ambil={ambil} set={set} onUbah={onUbah} />
      )}
      {bekal.kode === 'tyre_repair' && (
        <Repair bekal={bekal} ambil={ambil} set={set} />
      )}
    </div>
  );
}

/* ── A. INSPEKSI: sepuluh posisi sekaligus ─────────────────────────────────── */

function Inspeksi({
  bekal, detail, ambil, set,
}: {
  bekal: BekalForm; detail: DetailWo;
  ambil: (p: string, k: string) => string;
  set: (p: string, k: string, v: string) => void;
}) {
  const medan = bekal.medan.filter((m) => m.hasBeforeAfter);
  const posisi = Array.from({ length: bekal.jumlahPos }, (_, i) => i + 1);

  /* Petunjuk tambahan dipicu oleh Before PRESSURE yang kosong di salah satu
     posisi — bukan oleh setiap medan kosong. Itu perilaku sumber apa adanya
     (`:1165,1177`); teks petunjuknya memang lebih luas daripada pemeriksaannya. */
  const adaKosong = posisi.some((p) => !detail.before[String(p)]?.['pressure']);

  return (
    <>
      <div className="tyre-hint">
        Kolom <b>Before</b> terisi sendiri dari catatan terakhir unit ini.
        Bertanah abu-abu karena bukan Anda yang mengetiknya.
        {adaKosong && (
          <> Sebagian tertulis “belum ada” — unit ini memang belum pernah
          tercatat di posisi itu.</>
        )}
      </div>
      <div className="tyre-scroll">
        <table className="tyre-tbl">
          <thead>
            <tr>
              <th rowSpan={2}>Pos</th>
              {medan.map((m) => <th key={m.fieldKey} colSpan={2}>{judulKolom(m.fieldKey, m.label)}</th>)}
            </tr>
            <tr>
              {/* `Fragment` ber-key, bukan `<>` — pembungkus di dalam `.map()`
                  yang tak ber-key membuat React kehilangan jejak barisnya dan
                  memperingatkan di konsol. */}
              {medan.map((m) => (
                <Fragment key={m.fieldKey}>
                  <th className="sub">Before</th>
                  <th className="sub">After</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {posisi.map((p) => {
              const b = detail.before[String(p)] ?? {};
              return (
                <tr key={p}>
                  <td className="pos">{p}</td>
                  {medan.map((m) => (
                    <Fragment key={m.fieldKey}>
                      <td>
                        <Before
                          nilai={b[m.fieldKey]}
                          kritis={m.fieldKey === 'rtd' ? bekal.rtdKritis : null}
                        />
                      </td>
                      <td>
                        <input
                          type="number" step="any" inputMode="decimal"
                          aria-label={`${m.label} after posisi ${p}`}
                          value={ambil(String(p), m.fieldKey)}
                          onChange={(e) => set(String(p), m.fieldKey, e.target.value)}
                        />
                      </td>
                    </Fragment>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Judul kolom ringkas — label penuh ada di tooltip barisnya. */
function judulKolom(kunci: string, label: string) {
  if (kunci === 'pressure') return 'Pressure';
  if (kunci === 'rtd') return 'RTD';
  if (kunci === 'suhu') return 'Suhu';
  return label;
}

/**
 * Kotak baca-saja untuk nilai Before.
 *
 * Kosong berbunyi “belum ada”, BUKAN nol — nol adalah angka, dan angka yang
 * salah lebih buruk daripada kekosongan yang jujur (`_DetailTyre.js:592-595`).
 * Ia `<div>`, bukan input readonly: yang membedakannya adalah TANAHNYA, bukan
 * warna teksnya. Teks abu-abu terbaca "nonaktif", padahal angka ini justru
 * harus dibaca; tanah abu-abu terbaca "bukan Anda yang mengisi".
 */
function Before({ nilai, kritis }: { nilai: string | undefined; kritis: number | null }) {
  if (nilai === undefined || nilai === '') {
    return <div className="tyre-ro kosong">belum ada</div>;
  }
  const n = Number(nilai);
  const genting = kritis !== null && kritis > 0 && n > 0 && n <= kritis;
  return <div className={`tyre-ro${genting ? ' tyre-rtd-kritis' : ''}`}>{nilai}</div>;
}

/* ── B. REMOVE / INSTAL: satu kesatuan per posisi ──────────────────────────── */

function RemoveInstal({
  bekal, detail, nilai, ambil, set, onUbah,
}: {
  bekal: BekalForm; detail: DetailWo; nilai: NilaiDetail;
  ambil: (p: string, k: string) => string;
  set: (p: string, k: string, v: string) => void;
  onUbah: (baru: NilaiDetail) => void;
}) {
  // Posisi yang sudah pernah disimpan digambar kembali — membuka ulang form
  // (mis. sesudah WO dikembalikan approver) tidak boleh memaksa mengetik ulang
  // semuanya (`:1194-1198`).
  const [blok, setBlok] = useState<string[]>(() =>
    Object.keys(detail.isian).filter((p) => p !== '0').sort((a, b) => Number(a) - Number(b)));
  const [pilih, setPilih] = useState('1');

  const lepas = bekal.medan.filter((m) => m.fieldKey.startsWith('remove_'));
  const pasang = bekal.medan.filter((m) => !m.fieldKey.startsWith('remove_'));

  function tambah() {
    if (blok.includes(pilih)) {
      alert(`Posisi ${pilih} sudah ada di daftar.`);
      return;
    }
    setBlok([...blok, pilih].sort((a, b) => Number(a) - Number(b)));
  }

  function hapus(p: string) {
    /* Membuang blok di layar TIDAK menghapus detail yang sudah tersimpan —
       server hanya menimpa posisi yang dikirim, dan posisi yang tak disertakan
       tidak disentuh. Itu perilaku sumber, dan diam soal itu berarti mekanik
       mengira datanya sudah hilang padahal masih ada. */
    if (detail.isian[p] && !confirm(
      `Buang posisi ${p} dari layar?\n\n`
      + 'Isian posisi ini yang SUDAH TERSIMPAN tidak ikut terhapus — untuk '
      + 'mengosongkannya, hapus isinya satu per satu lalu Kirim.',
    )) return;
    setBlok(blok.filter((x) => x !== p));
    /* Isian yang baru diketik untuk posisi ini ikut dibuang. Tanpa baris ini,
       membuang blok dari layar lalu menekan Kirim tetap menyimpan nilai yang
       barusan dihilangkan — mekanik melihatnya lenyap, lalu ia muncul lagi. */
    if (nilai[p]) {
      const sisa = { ...nilai };
      delete sisa[p];
      onUbah(sisa);
    }
  }

  return (
    <>
      <div className="tyre-hint">
        Remove &amp; Instal adalah <b>satu kesatuan per posisi</b> — ban yang turun
        dan ban yang naik di lubang yang sama. Pilih posisinya dulu, lalu isi keduanya.
      </div>

      {blok.map((p) => (
        <div className="tyre-blok" key={p}>
          <div className="tyre-blok-head">
            <span className="tyre-blok-pos">Posisi {p}</span>
            <button
              type="button" className="tyre-blok-hapus"
              title="Hapus posisi ini" onClick={() => hapus(p)}
            >✕ hapus</button>
          </div>

          <div className="tyre-sub">Ban yang DILEPAS</div>
          <div className="tyre-grid4">
            {lepas.map((m) => (
              <Medan key={m.fieldKey} medan={m} pos={p} ambil={ambil} set={set} />
            ))}
          </div>

          <div className="tyre-sub">Ban yang DIPASANG</div>
          <div className="tyre-grid4">
            {pasang.map((m) => (
              <Medan key={m.fieldKey} medan={m} pos={p} ambil={ambil} set={set} />
            ))}
          </div>
        </div>
      ))}

      <div className="tyre-tambah">
        <select
          className="form-control" aria-label="Pilih posisi"
          value={pilih} onChange={(e) => setPilih(e.target.value)}
        >
          {Array.from({ length: bekal.jumlahPos }, (_, i) => String(i + 1)).map((p) => (
            <option key={p} value={p}>Posisi {p}</option>
          ))}
        </select>
        <button type="button" className="btn-secondary" onClick={tambah}>
          + Tambah posisi
        </button>
      </div>
      {/* Blok yang dibuang dari layar tidak ikut terkirim, jadi nilainya pun
          tidak ikut menimpa apa pun. Disebut supaya tidak jadi kejutan. */}
      {blok.length === 0 && (
        <p className="form-hint">Belum ada posisi. Pilih posisinya lalu tekan Tambah.</p>
      )}
    </>
  );
}

function Medan({
  medan, pos, ambil, set,
}: {
  medan: BekalForm['medan'][number]; pos: string;
  ambil: (p: string, k: string) => string;
  set: (p: string, k: string, v: string) => void;
}) {
  const id = `d-${pos}-${medan.fieldKey}`;
  return (
    <div>
      <label className="form-label" htmlFor={id}>{medan.label}</label>
      {medan.dataType === 'enum' ? (
        <select
          id={id} className="form-control"
          value={ambil(pos, medan.fieldKey)}
          onChange={(e) => set(pos, medan.fieldKey, e.target.value)}
        >
          {/* Pilihan awal "—" bernilai kosong (`:1180-1184`) — belum memilih
              bukan sama dengan memilih yang pertama. */}
          <option value="">—</option>
          {medan.pilihan.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      ) : (
        <input
          id={id} className="form-control" type="text"
          value={ambil(pos, medan.fieldKey)}
          onChange={(e) => set(pos, medan.fieldKey, e.target.value)}
        />
      )}
    </div>
  );
}

/* ── C. REPAIR: tanpa posisi, dan itu memang benar ─────────────────────────── */

const CONTOH: Record<string, string> = {
  sn: 'cth: BS-77398120', merk: 'cth: Bridgestone',
  pattern: 'cth: VSDL', size: 'cth: 18.00R33',
};

function Repair({
  bekal, ambil, set,
}: {
  bekal: BekalForm;
  ambil: (p: string, k: string) => string;
  set: (p: string, k: string, v: string) => void;
}) {
  return (
    <>
      <div className="tyre-hint">
        Tanpa kolom posisi — ban yang direpair sudah turun dari unit lewat
        Remove/Instal. Asal-usulnya tetap terlacak dari nomor serinya.
      </div>
      <div className="tyre-grid4">
        {bekal.medan.map((m) => (
          <div key={m.fieldKey}>
            <label className="form-label" htmlFor={`d-0-${m.fieldKey}`}>{m.label}</label>
            <input
              id={`d-0-${m.fieldKey}`} className="form-control" type="text"
              placeholder={CONTOH[m.fieldKey] ?? ''}
              value={ambil('0', m.fieldKey)}
              onChange={(e) => set('0', m.fieldKey, e.target.value)}
            />
          </div>
        ))}
      </div>
    </>
  );
}

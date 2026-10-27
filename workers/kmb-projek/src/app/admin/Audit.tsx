'use client';

import { useEffect, useState } from 'react';
import { tanggalJam } from '../../lib/format.js';
import type { BarisAudit, HasilAudit, KategoriAudit } from '../../domain/kueriAudit.js';

/**
 * RIWAYAT PERUBAHAN.
 *
 * Bentuknya ditentukan oleh satu kejadian: Gabriel mengubah jam rencana sebuah
 * job, layarnya tergulir, dan ia lupa job mana yang ia ubah dan dari berapa ke
 * berapa. Angkanya sudah tercatat sejak awal — yang belum ada cuma tempat
 * melihatnya.
 *
 * Maka halaman pertama, TANPA disaring apa pun, harus sudah menjawab: apa yang
 * barusan diubah, pada apa, dari berapa ke berapa, oleh siapa. Saringan ada
 * untuk pencarian yang lebih tua — bukan untuk sampai ke jawaban yang biasa.
 *
 * Yang sengaja TIDAK ada di sini: tombol "kembalikan". Membalikkan sebuah
 * perubahan bukan menulis balik satu angka — untuk baris yang berlaku surut ia
 * berarti menghitung ulang uang lagi, dan jalurnya sudah ada di tabnya masing-
 * masing lengkap dengan pratinjau rupiah. Tombol pintas ke sana tanpa pratinjau
 * justru menghapus satu-satunya pagar yang kita punya.
 */

const KATEGORI: { kunci: KategoriAudit | 'semua'; label: string }[] = [
  { kunci: 'semua', label: 'Semua' },
  { kunci: 'katalog', label: 'Katalog & angka' },
  { kunci: 'orang', label: 'Orang & token' },
  { kunci: 'wo', label: 'Work order' },
];

export function Audit({ akuId }: { akuId: number }) {
  const [kategori, setKategori] = useState<KategoriAudit | 'semua'>('semua');
  const [hanyaUang, setHanyaUang] = useState(false);
  const [hanyaAku, setHanyaAku] = useState(false);
  const [cari, setCari] = useState('');
  const [cariAktif, setCariAktif] = useState('');

  const [baris, setBaris] = useState<BarisAudit[]>([]);
  const [aktor, setAktor] = useState<{ id: number; nama: string }[]>([]);
  const [kursor, setKursor] = useState<number | null>(null);
  const [adaLagi, setAdaLagi] = useState(false);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);

  function alamat(sebelum: number | null): string {
    const p = new URLSearchParams({ jenis: 'audit', limit: '40' });
    if (kategori !== 'semua') p.set('kategori', kategori);
    if (hanyaUang) p.set('uang', '1');
    if (hanyaAku) p.set('aktor', String(akuId));
    if (cariAktif.trim()) p.set('cari', cariAktif.trim());
    if (sebelum) p.set('sebelum', String(sebelum));
    return `/api/data?${p.toString()}`;
  }

  /* Saringan berubah → muat dari AWAL, bukan disambung. Menyambung hasil
     saringan baru ke hasil saringan lama menghasilkan daftar yang tidak
     menjawab pertanyaan mana pun. */
  useEffect(() => {
    let hidup = true;
    setMemuat(true);
    setGalat(null);
    void (async () => {
      try {
        const r = await fetch(alamat(null));
        const j = await r.json();
        if (!hidup) return;
        if (j.ok) {
          const d = j.data as HasilAudit;
          setBaris(d.baris);
          setAktor(d.aktor);
          setKursor(d.kursor);
          setAdaLagi(d.adaLagi);
        } else setGalat(j.pesan ?? 'Gagal membaca riwayat');
      } catch {
        if (hidup) setGalat('Sambungan terputus saat membaca riwayat.');
      } finally {
        if (hidup) setMemuat(false);
      }
    })();
    return () => { hidup = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kategori, hanyaUang, hanyaAku, cariAktif, akuId]);

  async function lebihLama() {
    if (!kursor) return;
    setMemuat(true);
    try {
      const r = await fetch(alamat(kursor));
      const j = await r.json();
      if (j.ok) {
        const d = j.data as HasilAudit;
        setBaris((v) => [...v, ...d.baris]);
        setKursor(d.kursor);
        setAdaLagi(d.adaLagi);
      }
    } finally {
      setMemuat(false);
    }
  }

  return (
    <div className="panel">
      <div className="kabar kabar-info">
        Setiap perubahan di seluruh sistem tercatat di sini — siapa, kapan, pada
        apa, dan <b>dari berapa ke berapa</b>. Yang terbaru di atas. Medan yang
        nilainya tidak berubah tidak ditampilkan.
      </div>

      <div className="audit-saring">
        <div className="tabs tabs-rapat">
          {KATEGORI.map((k) => (
            <button
              key={k.kunci} type="button"
              className={`tab${kategori === k.kunci ? ' active' : ''}`}
              onClick={() => setKategori(k.kunci)}
            >{k.label}</button>
          ))}
        </div>
        <div className="audit-saring-baris">
          <label className="pilih-baris">
            <input type="checkbox" checked={hanyaAku}
                   onChange={(e) => setHanyaAku(e.target.checked)} />
            <span>Hanya perubahan saya</span>
          </label>
          {/* Yang menggeser rupiah yang SUDAH dibayar hanya segelintir baris di
              antara ratusan. Saringan ini yang membuatnya bisa ditemukan. */}
          <label className="pilih-baris">
            <input type="checkbox" checked={hanyaUang}
                   onChange={(e) => setHanyaUang(e.target.checked)} />
            <span>Hanya yang menggeser uang</span>
          </label>
          <form
            className="audit-cari"
            onSubmit={(e) => { e.preventDefault(); setCariAktif(cari); }}
          >
            <input className="form-control" value={cari}
                   onChange={(e) => setCari(e.target.value)}
                   placeholder="🔍 Cari kode job, nama unit, nomor WO…" />
            <button type="submit" className="btn-secondary btn-sm">Cari</button>
            {cariAktif && (
              <button type="button" className="btn-secondary btn-sm"
                      onClick={() => { setCari(''); setCariAktif(''); }}>Hapus</button>
            )}
          </form>
        </div>
      </div>

      {galat && <div className="kabar kabar-salah">{galat}</div>}

      {!galat && baris.length === 0 && !memuat && (
        <div className="hampa">
          <b>Tidak ada perubahan yang cocok</b>
          <div className="hampa-ket">Longgarkan saringannya, atau hapus pencariannya.</div>
        </div>
      )}

      <div className="audit-daftar">
        {baris.map((b) => (
          <div key={b.id} className={`audit-baris${b.uang ? ' uang' : ''}`}>
            <div className="audit-waktu">{tanggalJam(b.waktu)}</div>
            <div className="audit-isi">
              <div className="audit-kepala">
                <span className="audit-aksi">{b.label}</span>
                {b.uang && <span className="badge badge-danger">menggeser uang</span>}
                <span className="audit-judul">{b.judul || <i className="ro-kosong">—</i>}</span>
              </div>

              {/* Inilah barisnya. Kalau yang lain hilang pun layar ini masih
                  menjawab pertanyaan yang membuatnya dibangun. */}
              {b.perubahan.length > 0 && (
                <div className="audit-ubah">
                  {b.perubahan.map((p) => (
                    <div key={p.medan} className="audit-ubah-baris">
                      <span className="audit-medan">{p.medan}</span>
                      <span className="riwayat-lama">{p.lama}</span>
                      <span className="audit-panah">→</span>
                      <b className="riwayat-baru">{p.baru}</b>
                    </div>
                  ))}
                </div>
              )}

              {b.konteks.length > 0 && (
                <div className="audit-konteks">
                  {b.konteks.map((k) => (
                    <span key={k.kunci}>{k.kunci}: {k.nilai}</span>
                  ))}
                </div>
              )}

              <div className="audit-oleh">
                oleh {b.aktor ?? <i className="ro-kosong">sistem</i>}
                {aktor.length > 1 && b.aktor && (
                  <button
                    type="button" className="audit-tautan"
                    onClick={() => {
                      setCari(b.aktor!);
                      setCariAktif(b.aktor!);
                    }}
                  >lihat semua perubahannya</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {memuat && <div className="hampa">Memuat…</div>}

      {adaLagi && !memuat && (
        <div className="impor-baris" style={{ marginTop: '0.8rem' }}>
          <button className="btn-secondary" onClick={() => void lebihLama()}>
            Muat yang lebih lama
          </button>
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Portal } from '../Portal.js';
import { rupiah } from '../../lib/format.js';
import type { DampakSurut } from '../../domain/surutBersama.js';

/**
 * NOTIFIKASI DAMPAK — satu layar untuk SETIAP perubahan yang berlaku mundur.
 *
 * Dipakai bersama oleh base point job, nilai faktor, dan tarif per poin.
 * Ketiganya menembus jaminan yang menopang seluruh sistem ini — bahwa angka
 * yang sudah disetujui dibekukan — jadi ketiganya harus memberi tahu hal yang
 * sama, dengan susunan yang sama.
 *
 * Kalau tiap tab punya layar konfirmasinya sendiri, cepat atau lambat akan ada
 * satu yang lupa menyebut rupiahnya. Yang menekan tombolnya tidak akan pernah
 * tahu bahwa ia kurang diberi tahu — dan itulah bentuk kegagalan yang paling
 * mahal di sini.
 *
 * Yang menjadikan layar ini berguna bukan tombolnya, melainkan ANGKA DI ATASNYA:
 * berapa rupiah sekarang, jadi berapa, selisihnya, dan periode gaji MANA saja
 * yang bergeser — karena sebagian dari periode itu slipnya sudah keluar.
 */

export interface PerOrang {
  nama: string; baris: number; lama: number; baru: number;
}

export function ModalDampak({
  alamat, labelTerapkan, sibuk, onTutup, onTerapkan,
}: {
  /** URL pratinjau. Dihitung SERVER — layar tidak punya rumusnya sendiri. */
  alamat: string;
  labelTerapkan: string;
  sibuk: boolean;
  onTutup: () => void;
  onTerapkan: (d: DampakSurut) => void;
}) {
  const [d, setD] = useState<(DampakSurut & { orangRingkas?: PerOrang[] }) | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [paham, setPaham] = useState(false);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const r = await fetch(alamat);
        const j = await r.json();
        if (!hidup) return;
        if (j.ok) setD(j.data as DampakSurut);
        else setGalat(j.pesan ?? 'Gagal menghitung dampaknya');
      } catch {
        if (hidup) setGalat('Sambungan terputus saat menghitung dampaknya.');
      }
    })();
    return () => { hidup = false; };
  }, [alamat]);

  const selisih = d ? d.rupiahSesudah - d.rupiahSekarang : 0;
  const naik = selisih > 0;

  return (
    <Portal>
      <div className="modal-tirai">
        <div className="modal modal-lebar">
          <div className="modal-header">
            <h3>Dampak perubahan</h3>
            <button className="modal-tutup" onClick={onTutup}>✕</button>
          </div>
          <div className="modal-body">
            {d && (
              <>
                <div className="surut-judul">{d.judul}</div>
                <div className="surut-angka">
                  {d.perubahan.map((p) => (
                    <span key={p.label}>{p.label} <b>{p.lama}</b> → <b>{p.baru}</b></span>
                  ))}
                </div>
              </>
            )}

            {galat && <div className="kabar kabar-salah">{galat}</div>}
            {!d && !galat && <div className="hampa">Menghitung dampaknya…</div>}

            {d && (
              <>
                <div className="stat-row">
                  <div className="stat"><div className="stat-num">{d.terpengaruh}</div>
                    <div className="stat-label">WO dihitung ulang</div></div>
                  <div className="stat"><div className="stat-num">{d.orang}</div>
                    <div className="stat-label">baris bayaran</div></div>
                  <div className="stat"><div className="stat-num">{d.periode.length}</div>
                    <div className="stat-label">periode gaji bergeser</div></div>
                  {d.dilewati > 0 && (
                    <div className="stat"><div className="stat-num">{d.dilewati}</div>
                      <div className="stat-label">dilewati</div></div>
                  )}
                </div>

                <div className={`surut-uang ${naik ? 'naik' : 'turun'}`}>
                  <div className="surut-uang-baris">
                    <span>Sekarang terbayar</span><b>{rupiah(d.rupiahSekarang)}</b>
                  </div>
                  <div className="surut-uang-baris">
                    <span>Sesudah diterapkan</span><b>{rupiah(d.rupiahSesudah)}</b>
                  </div>
                  <div className="surut-uang-baris selisih">
                    <span>Selisih</span><b>{naik ? '+' : ''}{rupiah(selisih)}</b>
                  </div>
                </div>

                {d.dilewati > 0 && d.alasanDilewati && (
                  <div className="kabar kabar-info">
                    <b>{d.dilewati} WO tidak disentuh</b> karena {d.alasanDilewati}.
                  </div>
                )}

                {/* Akibat sampingan yang tidak terbaca dari angkanya sendiri.
                    Ditampilkan SEMUA — memilih mana yang "cukup penting" adalah
                    cara paling halus untuk menyembunyikan yang paling mahal. */}
                {d.catatan.map((c) => (
                  <div key={c} className="kabar kabar-awas">{c}</div>
                ))}

                {d.periode.length > 0 && (
                  <>
                    <div className="panel-judul" style={{ marginTop: '0.8rem' }}>
                      Periode gaji yang ikut bergeser
                    </div>
                    <div className="tabel-gulir">
                      <table className="table tabel-admin">
                        <thead>
                          <tr>
                            <th>Periode</th><th className="num">WO</th>
                            <th className="num">Sekarang</th><th className="num">Jadi</th>
                            <th className="num">Selisih</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.periode.map((x) => {
                            const s = x.rupiahSesudah - x.rupiahSekarang;
                            return (
                              <tr key={x.kunci}>
                                <td>{x.label}</td>
                                <td className="num">{x.wo}</td>
                                <td className="num riwayat-lama">{rupiah(x.rupiahSekarang)}</td>
                                <td className="num riwayat-baru">{rupiah(x.rupiahSesudah)}</td>
                                <td className={`num ${s >= 0 ? 'riwayat-baru' : 'riwayat-lama'}`}>
                                  {s > 0 ? '+' : ''}{rupiah(s)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {/* Tarif membawa rincian per ORANG. Di sinilah perubahan tarif
                    berbeda dari yang lain: yang bergeser bukan pekerjaannya,
                    melainkan bayaran orang tertentu — dan namanya harus terbaca
                    sebelum tombolnya ditekan. */}
                {d.orangRingkas && d.orangRingkas.length > 0 && (
                  <>
                    <div className="panel-judul" style={{ marginTop: '0.8rem' }}>
                      Siapa yang bayarannya bergeser
                    </div>
                    <div className="tabel-gulir">
                      <table className="table tabel-admin">
                        <thead>
                          <tr>
                            <th>Nama</th><th className="num">Baris</th>
                            <th className="num">Sekarang</th><th className="num">Jadi</th>
                            <th className="num">Selisih</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.orangRingkas.map((o) => {
                            const s = o.baru - o.lama;
                            return (
                              <tr key={o.nama}>
                                <td>{o.nama}</td>
                                <td className="num">{o.baris}</td>
                                <td className="num riwayat-lama">{rupiah(o.lama)}</td>
                                <td className="num riwayat-baru">{rupiah(o.baru)}</td>
                                <td className={`num ${s >= 0 ? 'riwayat-baru' : 'riwayat-lama'}`}>
                                  {s > 0 ? '+' : ''}{rupiah(s)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {d.terpengaruh === 0 && (
                  <div className="kabar kabar-info">
                    Tidak ada WO yang bisa dihitung ulang
                    {d.dilewati > 0 ? ' — semuanya dilewati.' : '.'}{' '}
                    Simpan saja lewat tombol biasa; ia berlaku untuk WO berikutnya.
                  </div>
                )}

                {d.terpengaruh > 0 && !d.adaGeser && (
                  <div className="kabar kabar-info">
                    <b>Tidak ada yang bergeser.</b> WO lama memang sudah dihitung
                    dengan angka ini.
                  </div>
                )}

                {d.terpengaruh > 0 && d.adaGeser && (
                  <label className="pilih-baris surut-paham">
                    <input type="checkbox" checked={paham}
                           onChange={(e) => setPaham(e.target.checked)} />
                    <span>
                      Saya mengerti ini mengubah gaji periode yang <b>slipnya sudah
                      keluar</b>, sebesar {naik ? '+' : ''}{rupiah(selisih)}.
                    </span>
                  </label>
                )}
              </>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn-cancel" onClick={onTutup} disabled={sibuk}>Batal</button>
            <button
              className="btn-danger"
              disabled={sibuk || !d || !paham || d.terpengaruh === 0 || !d.adaGeser}
              onClick={() => d && onTerapkan(d)}
            >
              {sibuk ? 'Menerapkan…' : `${labelTerapkan} — ${d?.terpengaruh ?? 0} WO`}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

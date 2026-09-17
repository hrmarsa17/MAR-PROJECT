'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Portal } from '../Portal.js';
import { PilihWaktu24 } from '../PilihWaktu24.js';
import { durasiJam } from '../../lib/format.js';
import { kirimPerintah } from '../../pwa/kirim.js';
import type { KartuWoMekanik } from '../../domain/kueriWoMekanik.js';
import type { BekalForm, DetailWo } from '../../domain/kueriDetailForm.js';
import { DetailTyre, type NilaiDetail } from './DetailTyre.js';
import {
  bersihkanTimer, jedaLainnya, keWaktuLokal, msBerjalan, msKeHms, msKeJamMenit,
  simpanTimer, timerWo, type KeadaanTimer,
} from './timer.js';

/**
 * MODAL KERJA — port dari `MechanicDashboard.html:514-682` + `openWoDetail`.
 *
 * Yang dibawa apa adanya dari sumber, masing-masing dengan alasannya:
 *
 *  - Picker jam TETAP TERLIHAT dan boleh dikoreksi manual; timer hanya
 *    mengisinya (`:533-535`). Di SUM V2 pickernya disembunyikan — KMB sengaja
 *    tidak, karena mekanik yang lupa menekan Start harus tetap bisa melapor.
 *  - `↺ Reset` bergaya garis luar dan paling redup (`:543-544`). Ia menghapus
 *    jam kerja, dan jam itu jalur uang; tindakan merusak tak boleh terlihat
 *    semenarik Start.
 *  - Reset ikut MENGOSONGKAN isian jam. Tanpa itu muncul bug paling berbahaya
 *    dari tombol ini: layar sudah 00:00:00 tapi form masih menyimpan jam lama
 *    lalu terkirim apa adanya — mekanik dibayar untuk waktu yang baru saja ia
 *    hapus (`:1392-1395`).
 *  - Pesan putus-sambungan tidak disederhanakan jadi "gagal" (`:1073-1075`).
 */

type Hasil = { baik: boolean; teks: string };

/**
 * PENGHITUNG BERDETAK — komponennya sendiri, dan itu bukan kerapian.
 *
 * Sampai 16 Sep 2026 detaknya tinggal di ModalKerja: satu `setInterval` menaikkan
 * state modal tiap detik, sehingga SELURUH modal — termasuk picker tanggal dan
 * kedua daftar jam — tergambar ulang enam puluh kali semenit.
 *
 * Akibatnya persis seperti yang dilaporkan Gabriel: tanggal maupun jamnya tidak
 * bisa diklik. Bukan karena tombolnya mati, melainkan karena jendela pilihan
 * bawaan peramban (kalender `input[type=date]` dan daftar `select`) ditutup
 * kembali oleh peramban setiap kali React menetapkan ulang isi kontrolnya —
 * dan itu terjadi setiap detik. Yang terlihat hanya kedipan, atau tidak
 * terjadi apa-apa sama sekali.
 *
 * Maka detaknya dikurung di sini. Yang tergambar ulang cuma angka jamnya;
 * picker di bawahnya tidak tersentuh sama sekali. Intervalnya pun hanya hidup
 * saat timer benar-benar berjalan — saat diam, tidak ada gambar ulang apa pun.
 */
function PenghitungTimer({ st }: { st: KeadaanTimer }) {
  const [, detak] = useState(0);
  useEffect(() => {
    if (st.state !== 'running') return;
    const t = setInterval(() => detak((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [st.state, st.start_epoch]);
  return <div className="timer-angka">{msKeHms(msBerjalan(st))}</div>;
}

export function ModalKerja({
  wo, onTutup, bekal = null, detail = null,
}: {
  wo: KartuWoMekanik;
  onTutup: () => void;
  bekal?: BekalForm | null;
  detail?: DetailWo | null;
}) {
  const router = useRouter();
  const bolehIsi = wo.bolehKirim;

  const [mulai, setMulai] = useState('');
  const [selesai, setSelesai] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [ringkas, setRingkas] = useState<string | null>(null);
  const [catatan, setCatatan] = useState('');
  const [nilaiDetail, setNilaiDetail] = useState<NilaiDetail>({});
  /* Dinaikkan HANYA saat tombol timer ditekan — bukan tiap detik. Lihat
     catatan di PenghitungTimer: gambar ulang per detik membuat picker tanggal
     dan jam tidak bisa dibuka sama sekali. */
  const [versi, setVersi] = useState(0);
  const gambarUlang = () => setVersi((n) => n + 1);
  void versi;

  /* Lahir sekali per modal, bukan tiap gambar ulang. Kirim dan Transfer punya
     op_id SENDIRI-SENDIRI: keduanya aksi berbeda, dan memakai satu identitas
     untuk dua maksud berarti yang kedua akan mengembalikan struk yang pertama
     tanpa pernah dijalankan. */
  const opId = useRef<string>('');
  if (!opId.current) opId.current = crypto.randomUUID();
  const opIdTransfer = useRef<string>('');
  if (!opIdTransfer.current) opIdTransfer.current = crypto.randomUUID();
  const opIdDetail = useRef<string>('');
  if (!opIdDetail.current) opIdDetail.current = crypto.randomUUID();
  const st = timerWo(wo.id);

  const sesiJam = (() => {
    if (!mulai || !selesai) return null;
    const a = new Date(mulai).getTime(), b = new Date(selesai).getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    return (b - a) / 3_600_000;
  })();
  const waktuSah = sesiJam !== null && sesiJam > 0;

  function mulaiTimer() {
    const n = jedaLainnya(wo.id);
    st.state = 'running';
    st.start_epoch = Date.now();
    simpanTimer();
    gambarUlang();
    if (n) setRingkas(`⏸ ${n} WO lain otomatis dijeda (waktunya tersimpan).`);
  }

  function jedaTimer() {
    if (st.state !== 'running') return;
    st.elapsed_ms = (st.elapsed_ms || 0) + (Date.now() - st.start_epoch);
    st.state = 'paused';
    st.start_epoch = 0;
    simpanTimer();
    gambarUlang();
  }

  /** Finish TIDAK menghapus waktu — baru dibersihkan setelah kiriman berhasil. */
  function selesaikanTimer() {
    const total = msBerjalan(st);
    if (total > 0 && total < 60_000
        && !confirm(`Durasi kerja baru ${msKeJamMenit(total)}.\n`
                    + 'Yakin hentikan timer dan pakai durasi ini?')) return;
    st.state = 'paused';
    st.elapsed_ms = total;
    st.start_epoch = 0;
    simpanTimer();
    if (total > 0) {
      const kini = new Date();
      const awal = new Date(kini.getTime() - total);
      setMulai(keWaktuLokal(awal));
      setSelesai(keWaktuLokal(kini));
      setRingkas(`✅ Total waktu pengerjaan: ${msKeJamMenit(total)} — `
        + `${keWaktuLokal(awal).replace('T', ' ')} → ${keWaktuLokal(kini).replace('T', ' ')}`);
    }
    gambarUlang();
  }

  function resetTimer() {
    const total = msBerjalan(st);
    if (total > 0) {
      let pesan = 'Reset timer ke 00:00:00?\n\n'
        + `Waktu terekam ${msKeJamMenit(total)} akan DIHAPUS dan tidak bisa dikembalikan.`;
      if (wo.partialHours > 0) {
        pesan += `\n\nJam dari sesi yang sudah ditransfer (${durasiJam(wo.partialHours)}) `
          + 'TIDAK ikut terhapus.';
      }
      if (!confirm(pesan)) return;
    }
    bersihkanTimer(wo.id);
    setMulai('');
    setSelesai('');
    setRingkas(null);
    gambarUlang();
  }

  /**
   * TRANSFER — oper pekerjaan ke shift berikutnya.
   *
   * Jam MULAI diambil dari picker yang sama dengan Kirim; jam berhentinya
   * ditetapkan server. Konfirmasinya wajib menyebut bahwa jamnya baru dihitung
   * kalau L1 menyetujui — kalau ditolak, sesi ini HANGUS. Mekanik yang tidak
   * tahu itu akan menekan Transfer mengira jamnya sudah aman.
   */
  async function transfer() {
    if (!mulai) {
      setHasil({
        baik: false,
        teks: 'Isi Start Time dulu — jam itu dipakai menghitung sesi kerja Anda.',
      });
      return;
    }
    if (new Date(mulai).getTime() > Date.now()) {
      setHasil({ baik: false, teks: 'Start Time tidak boleh melewati jam sekarang.' });
      return;
    }
    if (!confirm(
      `Oper ${wo.woNumber} ke shift berikutnya?\n\n`
      + `Jam kerja Anda sejak ${mulai.replace('T', ' ')} dicatat, dan baru dihitung `
      + 'kalau Planner/PIC Lapangan menyetujui transfernya.\n\n'
      + 'Kalau transfernya DITOLAK, jam sesi ini hangus.',
    )) return;

    setSibuk(true);
    setHasil(null);
    try {
      const k = await kirimPerintah(
        'minta_transfer',
        {
          woId: wo.id,
          sessionStart: new Date(mulai).toISOString(),
          ...(catatan.trim() ? { note: catatan.trim() } : {}),
        },
        { opId: opIdTransfer.current, ringkas: `Transfer ${wo.woNumber}` },
      );

      if (k.keadaan === 'antre') {
        setHasil({
          baik: true,
          teks: `📮 Tersimpan! Permintaan transfer ${wo.woNumber} akan terkirim `
            + 'saat ada sinyal. Jangan diminta ulang — lihat menu Antrean.',
        });
        return;
      }

      if (k.keadaan === 'berhasil') {
        const h = (k.hasil?.hasil ?? {}) as { sudahDiminta?: boolean; sessionHours?: number };
        setHasil({
          baik: true,
          teks: h.sudahDiminta
            ? `${wo.woNumber}: permintaan transfer sudah tercatat sebelumnya — masih menunggu keputusan.`
            : `Permintaan transfer terkirim. ${wo.woNumber} · sesi ${durasiJam(h.sessionHours)}. `
              + 'Menunggu keputusan Planner/PIC Lapangan.',
        });
        router.refresh();
        return;
      }

      setHasil({ baik: false, teks: k.pesan ?? 'Gagal' });
      router.refresh();
    } finally {
      setSibuk(false);
    }
  }

  /**
   * Detail teknis, DIKIRIM SESUDAH jam kerja committed.
   *
   * Mengembalikan kalimat tambahan untuk kabar keberhasilan — dan kalau
   * detailnya gagal, kalimat itu mengatakannya dengan jujur. Menjawab "semua
   * tersimpan" padahal yang tersimpan cuma jam adalah cara paling halus
   * menghilangkan isian yang sudah diketik orang di lapangan.
   */
  async function kirimDetail(): Promise<string> {
    if (!bekal || Object.keys(nilaiDetail).length === 0) return '';

    const k = await kirimPerintah(
      'simpan_detail',
      { woId: wo.id, nilai: nilaiDetail },
      { opId: opIdDetail.current, ringkas: `Detail ban ${wo.woNumber}` },
    );

    /* Luring: TIDAK ada peringatan sama sekali. Detailnya ikut antre di
       belakang jamnya, dan keduanya akan terkirim berurutan — tidak ada yang
       perlu diketik ulang, jadi tidak ada yang perlu dikhawatirkan. Peringatan
       di sini hanya akan membuat mekanik membuka lagi WO yang sudah beres. */
    if (k.keadaan === 'antre') return ' Detail tyre ikut tersimpan di antrean.';

    if (k.keadaan === 'berhasil') {
      const n = Number((k.hasil?.hasil as { ditulis?: number } | undefined)?.ditulis ?? 0);
      return n > 0 ? ` Detail tyre tersimpan (${n} isian).` : '';
    }

    return ` ⚠️ Jam kerja TERSIMPAN, tapi detail tyre ditolak: ${k.pesan ?? 'tidak diketahui'}.`
      + ' Buka lagi WO ini dan simpan detailnya — jamnya tidak perlu dikirim ulang.';
  }

  async function kirim() {
    if (!waktuSah) return;
    setSibuk(true);
    setHasil(null);
    try {
      const k = await kirimPerintah(
        'kirim_kerja',
        {
          woId: wo.id,
          startTime: new Date(mulai).toISOString(),
          endTime: new Date(selesai).toISOString(),
        },
        {
          // op_id lahir sekali per modal. Kalau jawabannya hilang di jalan dan
          // tombol ditekan lagi, server mengenali permintaan yang sama.
          opId: opId.current,
          ringkas: wo.woNumber,
        },
      );

      /* LURING BUKAN GAGAL — dan ini kalimat terpenting di layar mekanik.
         Jamnya sudah tersimpan di HP dan akan terkirim sendiri. Kalau di sini
         tertulis "gagal", ia akan mengisi ulang jam yang sebenarnya sudah
         aman, lalu bertanya-tanya kenapa laporannya jadi dua. Kalimatnya
         sengaja sama dengan yang sudah dibaca orang di PWA KMB V2.

         Timer dibersihkan juga di sini: pekerjaannya sudah diserahkan, dan
         timer yang tetap berjalan membuat mekanik mengira ia belum melapor. */
      if (k.keadaan === 'antre') {
        bersihkanTimer(wo.id);
        const kabarDetail = await kirimDetail();
        setHasil({
          baik: true,
          teks: `📮 Tersimpan! ${wo.woNumber} akan terkirim saat ada sinyal. `
            + 'Jangan dikirim ulang — lihat menu Antrean.' + kabarDetail,
        });
        return;
      }

      if (k.keadaan === 'berhasil') {
        bersihkanTimer(wo.id);   // baru dibersihkan setelah benar-benar terkirim
        const h = (k.hasil?.hasil ?? {}) as { sudahTerkirim?: boolean; actualHours?: number };
        /* Jam sudah COMMITTED di sini, berikut struknya. Detail teknis
           dikirim SESUDAHNYA sebagai perintah tersendiri: kegagalannya tidak
           boleh menyentuh jam yang sudah diakui, dan jawabannya tidak boleh
           berbunyi seolah semuanya tersimpan bila yang tersimpan hanya jam. */
        const kabarDetail = await kirimDetail();
        setHasil({
          baik: true,
          teks: (h.sudahTerkirim
            ? `${wo.woNumber}: laporan ini sudah terkirim sebelumnya — tidak ada yang tercatat dua kali.`
            : `Laporan terkirim! ${wo.woNumber} · ${durasiJam(h.actualHours)}. `
              + 'WO pindah ke tab Pending.') + kabarDetail,
        });
        router.refresh();
        return;
      }

      setHasil({ baik: false, teks: k.pesan ?? 'Gagal' });
      router.refresh();
    } finally {
      setSibuk(false);
    }
  }

  return (
    <Portal>
      {/* Tirai tidak menutup saat diklik: kotaknya berisi jam yang baru diisi
          manual, dan menghilangkannya karena kursor meleset berarti mengisi
          ulang. Sumbernya memang menutup (`:514`), tapi di sana tidak ada
          isian manual yang bisa hilang selain jam yang sama. */}
      <div className="modal-tirai">
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div>
              <h3>{wo.woNumber}</h3>
              <p className="modal-subjudul">{wo.jobNama ?? 'Unknown Component'}</p>
            </div>
            <button className="modal-tutup" onClick={onTutup} aria-label="Tutup">✕</button>
          </div>

          <div className="modal-body">
            <div className="modal-bagian">
              <h4 className="modal-bagian-judul">Work Order Details</h4>
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">Unit</span>
                  <span className="info-value">{wo.unitNama ?? '-'}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Target Hours</span>
                  <span className="info-value">{durasiJam(wo.targetHours)}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Status</span>
                  <span className="info-value">{wo.statusLabel}</span>
                </div>
                {wo.keterangan && (
                  <div className="info-item info-lebar">
                    <span className="info-label">📝 Keterangan Planner/PIC Lapangan</span>
                    <span className="info-value" style={{ whiteSpace: 'pre-wrap' }}>
                      {wo.keterangan}
                    </span>
                  </div>
                )}
              </div>
              {wo.catatanTransfer && (
                <div className="tr-catatan" style={{ marginBottom: 0 }}>
                  <b>🔁 Pesan dari {wo.catatanTransfer.dari}:</b>{' '}
                  {wo.catatanTransfer.teks}
                </div>
              )}
            </div>

            {bolehIsi && (
              <div className="modal-bagian">
                <h4 className="modal-bagian-judul">Isi Jam Kerja</h4>

                <div className="timer-pil">
                  <div className="timer-judul">⏱️ LIVE TIMER REKAM WAKTU</div>
                  <PenghitungTimer st={st} />
                  <div className="timer-tombol">
                    {st.state !== 'running' && (
                      <button type="button" className="timer-btn t-start" onClick={mulaiTimer}>
                        {st.state === 'idle' ? '▶ Start' : '▶ Resume'}
                      </button>
                    )}
                    {st.state === 'running' && (
                      <button type="button" className="timer-btn t-pause" onClick={jedaTimer}>
                        ⏸ Pause
                      </button>
                    )}
                    {st.state !== 'idle' && (
                      <button type="button" className="timer-btn t-stop" onClick={selesaikanTimer}>
                        ⏹ Finish &amp; Isi Jam
                      </button>
                    )}
                    {st.state !== 'idle' && (
                      <button type="button" className="timer-btn t-reset" onClick={resetTimer}>
                        ↺ Reset
                      </button>
                    )}
                  </div>
                  {ringkas && <div className="timer-ringkas">{ringkas}</div>}
                  <div className="timer-ket">
                    ▶ mulai kerja · ⏸ jeda · ⏹ selesai. Durasi terhitung otomatis.
                    Memulai WO lain akan menjeda WO ini. Jam di bawah boleh Anda koreksi manual.
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor={`mulai-${wo.id}`}>Start Time</label>
                  <PilihWaktu24 id={`mulai-${wo.id}`} nilai={mulai} onUbah={setMulai} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor={`selesai-${wo.id}`}>End Time</label>
                  <PilihWaktu24 id={`selesai-${wo.id}`} nilai={selesai} onUbah={setSelesai} />
                </div>

                {mulai && selesai && (
                  <div className="form-group">
                    <label className="form-label">Duration</label>
                    <div className="kotak-durasi" style={{ color: waktuSah ? '#2d3748' : '#e53e3e' }}>
                      {waktuSah
                        ? durasiJam(sesiJam)
                        : '⚠️ End time must be after start time'}
                    </div>
                  </div>
                )}

                {wo.partialHours > 0 && (
                  <p className="form-hint">
                    WO ini pernah dioper antar shift. Jam yang Anda isi adalah sesi{' '}
                    <b>terakhir</b>; {durasiJam(wo.partialHours)} dari sesi sebelumnya
                    sudah tercatat dan ikut dijumlahkan.
                  </p>
                )}

                {/* TRANSFER WO: catatan untuk mekanik shift berikutnya.
                    Jam MULAI diambil dari picker di atas; jam berhentinya
                    ditetapkan server saat permintaan masuk, karena menekan
                    Transfer berarti berhenti bekerja sekarang. */}
                <div className="form-group">
                  <label className="form-label" htmlFor={`catatan-${wo.id}`}>
                    Catatan bila WO dioper ke shift berikutnya{' '}
                    <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>
                      (opsional)
                    </span>
                  </label>
                  <textarea
                    id={`catatan-${wo.id}`} rows={2} value={catatan}
                    onChange={(e) => setCatatan(e.target.value)}
                    placeholder="cth: baut roda kiri belum kencang, tinggal torsi ulang"
                  />
                </div>

              </div>
            )}

            {/* Detail teknis muncul hanya selama WO masih boleh dikirim, dan
                hanya bila jobnya memang terhubung ke sebuah form. WO yang
                bukan pekerjaan ban: bagiannya cukup tidak ada. */}
            {bolehIsi && bekal && detail && (
              <DetailTyre
                bekal={bekal} detail={detail}
                nilai={nilaiDetail} onUbah={setNilaiDetail}
              />
            )}

            {hasil && (
              <div className={`kabar ${hasil.baik ? 'kabar-benar' : 'kabar-salah'}`}>
                {hasil.teks}
              </div>
            )}
          </div>

          {/* Setelah kiriman berhasil, tombol Kirim TIDAK sekadar dimatikan —
              ia hilang, dan Cancel berganti jadi Tutup. Isi modal ini sudah
              menjadi riwayat: WO-nya pindah ke tab Pending, dan tombol mati
              yang masih terpampang terbaca seperti "coba lagi nanti". */}
          <div className="modal-footer">
            <button className="btn-secondary" onClick={onTutup} disabled={sibuk}>
              {hasil?.baik ? 'Tutup' : 'Cancel'}
            </button>
            {bolehIsi && !hasil?.baik && (
              <>
                {/* Garis luar, bukan oranye pekat. Sumbernya menulis alasannya:
                    tombol sekunder ini tidak boleh terlihat lebih menonjol
                    daripada yang primer (`MechanicDashboard.html:675-678`). */}
                <button className="btn-transfer" disabled={sibuk} onClick={transfer}>
                  🔁 Transfer ke Shift Berikutnya
                </button>
                <button className="btn-primary" disabled={sibuk || !waktuSah} onClick={kirim}>
                  {sibuk ? 'Mengirim…' : '📮 Kirim'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}

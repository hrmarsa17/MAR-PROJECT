'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { kirimPerintah } from '../../pwa/kirim.js';
import { ModalKerja } from './ModalKerja.js';
import { durasiJam } from '../../lib/format.js';
import type { KartuWoMekanik } from '../../domain/kueriWoMekanik.js';
import { bersihkanTimer, msBerjalan, msKeJamMenit, timerWo } from './timer.js';
import type { BekalForm, DetailWo } from '../../domain/kueriDetailForm.js';

/**
 * DAFTAR WO MEKANIK — port dari `renderWOs` + `woCardHtml`
 * (`MechanicDashboard.html:835-964`).
 */

function timTeks(tim: KartuWoMekanik['tim']) {
  if (tim.length === 0) return <>-</>;
  return (
    <>
      {tim.map((t, i) => (
        <span key={t.mechanicId}>
          {i > 0 && ', '}
          {/* Namanya TETAP ditampilkan, bukan diganti "Anda" saja — nama itu
              yang dipakai menyebut satu sama lain saat WO dibicarakan di
              lapangan. 1:1 dengan PWA (`timKerjaStr`, :772-786). */}
          {t.akuSendiri ? <b style={{ color: '#b45309' }}>{t.nama} (Anda)</b> : t.nama}
        </span>
      ))}
    </>
  );
}

const LOKASI = (l: string | null) => (l === 'field' ? '🚜 Field' : '🏭 Workshop');

const SPARE: Record<string, string> = {
  baru: '🆕 Sparepart Baru', repair: '🔧 Repair', kanibal: '♻️ Kanibal',
};

interface Kelompok {
  id: string;
  mode: string;
  baris: KartuWoMekanik[];
}

function kelompokkan(daftar: KartuWoMekanik[]): Kelompok[] {
  const grup: Kelompok[] = [];
  const indeks = new Map<string, number>();
  for (const wo of daftar) {
    const g = wo.woGroupId ?? '';
    const kunci = g || `__solo__${wo.id}`;
    /* `Map.has`, bukan `if (!indeks.get(kunci))` — indeks grup pertama adalah 0
       dan `!0` bernilai true, sehingga anggota berikutnya akan dipecah jadi
       grup baru. Bug ini sudah kena sekali di PWA (`:849-851`). */
    if (!indeks.has(kunci)) {
      indeks.set(kunci, grup.length);
      grup.push({ id: g, mode: wo.woGroupMode ?? '', baris: [] });
    }
    grup[indeks.get(kunci)!]!.baris.push(wo);
  }
  return grup;
}

export function DaftarWoMekanik({
  daftar, bekal = [], detail = {},
}: {
  daftar: KartuWoMekanik[];
  /** Metadata form dikirim SEKALI untuk seluruh daftar, bukan disalin per WO. */
  bekal?: BekalForm[];
  detail?: Record<string, DetailWo>;
}) {
  const router = useRouter();
  const [buka, setBuka] = useState<KartuWoMekanik | null>(null);
  const [sibuk, setSibuk] = useState<number | null>(null);
  // op_id per WO: satu kiriman cepat = satu identitas, walau tombolnya ditekan
  // berkali-kali karena jawabannya lambat sampai.
  const opId = useRef(new Map<number, string>());

  /**
   * KIRIM LANGSUNG dari kartu — tanpa membuka form. 1:1 dengan PWA.
   *
   * Jamnya diambil dari timer. Karena tak ada form untuk ditinjau lebih dulu,
   * konfirmasi WAJIB menyebut durasinya: sekali terkirim, WO berpindah ke meja
   * L1 dan mekanik tak bisa mengubahnya lagi. Timer kosong → arahkan ke Isi
   * Manual, jangan diam-diam mengirim 0 jam (`:796-833`).
   */
  async function kirimLangsung(wo: KartuWoMekanik) {
    const total = msBerjalan(timerWo(wo.id));
    if (total <= 0) {
      alert('⏱️ Timer masih 00:00:00.\n\n'
        + 'Tekan ▶ Start dulu lewat ✍️ Isi Manual, atau isi jamnya manual di sana.');
      return;
    }
    const kini = new Date();
    const awal = new Date(kini.getTime() - total);
    if (!confirm(
      `Kirim laporan kerja ${wo.woNumber}?\n\n`
      + `Durasi: ${msKeJamMenit(total)}\n`
      + `${awal.toLocaleString('id-ID')} → ${kini.toLocaleString('id-ID')}\n\n`
      + 'Setelah terkirim, WO masuk ke meja L1 dan tidak bisa Anda ubah lagi.\n'
      + 'Perlu mengoreksi jam atau menambah keterangan? Pakai ✍️ Isi Manual.',
    )) return;

    if (!opId.current.has(wo.id)) opId.current.set(wo.id, crypto.randomUUID());
    setSibuk(wo.id);
    try {
      const k = await kirimPerintah(
        'kirim_kerja',
        { woId: wo.id, startTime: awal.toISOString(), endTime: kini.toISOString() },
        { opId: opId.current.get(wo.id)!, ringkas: wo.woNumber },
      );

      /* Tombol ini dipakai justru di tempat yang sinyalnya paling buruk: ia
         jalan pintas untuk melapor cepat dari daftar, tanpa membuka modal.
         "Tersimpan", bukan "gagal" — timer dibersihkan karena pekerjaannya
         memang sudah diserahkan. */
      if (k.keadaan === 'antre') {
        bersihkanTimer(wo.id);
        alert(`📴 Tersimpan!\n\n${wo.woNumber} akan terkirim saat ada sinyal.\n`
          + 'Jangan dikirim ulang — lihat menu Antrean.');
        return;
      }

      if (k.keadaan === 'berhasil') {
        bersihkanTimer(wo.id);   // baru dibersihkan setelah benar-benar terkirim
        const h = (k.hasil?.hasil ?? {}) as { sudahTerkirim?: boolean; actualHours?: number };
        alert(h.sudahTerkirim
          ? `${wo.woNumber}: laporan ini sudah terkirim sebelumnya.`
          : `✅ Laporan terkirim!\nWO: ${wo.woNumber}\nDurasi: ${durasiJam(h.actualHours)}`);
        router.refresh();
        return;
      }

      alert(`❌ Gagal: ${k.pesan ?? 'Tidak diketahui'}`);
      router.refresh();
    } finally {
      setSibuk(null);
    }
  }

  if (daftar.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📋</div>
        <h3>No work orders</h3>
        <p>No work orders found for this filter.</p>
      </div>
    );
  }

  const grup = kelompokkan(daftar);

  return (
    <>
      <div className="wo-grid">
        {grup.map((G) => {
          // Kotak grup HANYA untuk borongan yang benar-benar punya lebih dari
          // satu baris di tab ini. Satu baris yang tersisa dapat lencana kecil
          // di kartunya — kabar yang sama, seperseratus ruangnya (`:866-878`).
          const borongan = !!G.id && G.baris.length > 1;
          if (!borongan) {
            return G.baris.map((wo) => (
              <Kartu key={wo.id} wo={wo} nomor={0} sibuk={sibuk === wo.id}
                     onBuka={() => setBuka(wo)} onKirim={() => kirimLangsung(wo)} />
            ));
          }
          const w0 = G.baris[0]!;
          const total = w0.grupTotal ?? G.baris.length;
          const selesai = w0.grupSelesai ?? 0;
          const judul = G.mode === 'job'
            ? `${w0.jobNama ?? '-'} · ${total} unit`
            : `${w0.unitNama ?? 'Workshop'} · ${total} job`;
          return (
            <div className="grup-wrap" key={G.id}>
              <div className="grup-head">
                <div className="grup-head-top">
                  <div className="grup-judul">📦 {judul}</div>
                  <span className="grup-tag">
                    {G.mode === 'job' ? '1 Job · Banyak Unit' : '1 Unit · Banyak Job'}
                  </span>
                </div>
                <div className="grup-sub">
                  📍 {LOKASI(w0.lokasi)} · 👥 {timTeks(w0.tim)}
                  <br />
                  ✅ Selesai <span className="grup-maju">{selesai} dari {total}</span> baris
                </div>
              </div>
              <div className="grup-body">
                {G.baris.map((wo, i) => (
                  <Kartu key={wo.id} wo={wo} nomor={i + 1} sibuk={sibuk === wo.id}
                         onBuka={() => setBuka(wo)} onKirim={() => kirimLangsung(wo)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* `key` WAJIB, dan ini jalur uang.
          Tanpa key, membuka WO B setelah WO A memakai ulang komponen yang sama:
          React mempertahankan state-nya, dan jam yang sudah diketik untuk WO A
          tetap duduk di kotak isian WO B. Sekali tekan Kirim, WO B dilaporkan
          dengan jam milik WO A — tanpa satu pun galat. `key` memaksa modalnya
          lahir baru tiap WO. */}
      {buka && (
        <ModalKerja
          key={buka.id}
          wo={buka}
          onTutup={() => setBuka(null)}
          detail={detail[String(buka.id)] ?? null}
          bekal={bekal.find((b) => b.formId === detail[String(buka.id)]?.formId) ?? null}
        />
      )}
    </>
  );
}

function Kartu({
  wo, nomor, sibuk, onBuka, onKirim,
}: {
  wo: KartuWoMekanik;
  nomor: number;
  sibuk: boolean;
  onBuka: () => void;
  onKirim: () => void;
}) {
  const insiden = wo.statusGroup === 'done' && wo.safetyIncident;
  const lencanaBorongan = !nomor && wo.woGroupId && (wo.grupTotal ?? 0) > 1;

  return (
    <div
      className={`wo-card${insiden ? ' incident-card' : ''}`}
      onClick={onBuka}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onBuka(); }}
    >
      <div className="wo-header">
        <div className="wo-id">
          {nomor > 0 && <span className="wo-line-no">{nomor}</span>}
          {wo.woNumber}
        </div>
        <div className={`wo-status ${insiden ? 'status-done-incident' : `status-${wo.statusGroup}`}`}>
          {insiden ? '⚠️ Insiden' : wo.statusLabel}
        </div>
      </div>

      {insiden && <div className="incident-badge">⚠️ Safety Incident — Poin = 0</div>}

      {/* Tanpa lencana ini, satu-satunya baris borongan yang tersisa di sebuah
          tab terlihat seperti WO lepas — dan mekanik tak tahu masih ada
          saudaranya yang menunggu di tab sebelah (`:932-941`). */}
      {lencanaBorongan && (
        <div className="borongan-badge">
          📦 Bagian borongan · <b>{wo.grupSelesai ?? 0} dari {wo.grupTotal}</b> baris selesai
        </div>
      )}

      {/* Pesan dari mekanik shift sebelumnya. Di KARTU, bukan hanya di modal:
          mekanik yang menekan "📮 Kirim" langsung tidak pernah membuka modal,
          dan pesan yang cuma ada di sana tidak akan pernah ia baca. */}
      {wo.catatanTransfer && (
        <div className="tr-pesan">
          🔁 <b>{wo.catatanTransfer.dari}</b>: {wo.catatanTransfer.teks}
        </div>
      )}

      {/* Transfer DITOLAK. Ini kabar buruk tentang uang — mekanik bekerja
          beberapa jam dan jam itu tidak dibayar — jadi ia berwarna penolakan,
          menyebut angkanya, dan menyebut siapa yang memutuskan. Diam soal ini
          adalah persis yang melahirkan pertanyaan "kenapa jam saya hilang". */}
      {wo.transferDitolak && (
        <div className="tr-tolak">
          🔁 <b>Transfer ditolak {wo.transferDitolak.oleh}</b> — sesi{' '}
          {durasiJam(wo.transferDitolak.jamHangus)} tidak dihitung. Lanjutkan
          pekerjaan ini sampai selesai.
          <div className="tr-tolak-alasan">“{wo.transferDitolak.alasan}”</div>
        </div>
      )}

      <div className="wo-component">{wo.jobNama ?? 'Unknown Component'}</div>

      <div className="wo-details">
        <div className="wo-detail-item">
          <span className="wo-detail-label">Unit</span>
          <span className="wo-detail-value">{wo.unitNama ?? '-'}</span>
        </div>
        <div className="wo-detail-item">
          <span className="wo-detail-label">Target Hours</span>
          <span className="wo-detail-value">{durasiJam(wo.targetHours)}</span>
        </div>
        <div className="wo-detail-item lebar">
          <span className="wo-detail-label">
            {wo.tim.length > 1 ? `👥 Tim (${wo.tim.length})` : '👥 Dikerjakan'}
          </span>
          <span className="wo-detail-value">{timTeks(wo.tim)}</span>
        </div>
        <div className="wo-detail-item">
          <span className="wo-detail-label">Location</span>
          <span className="wo-detail-value">{LOKASI(wo.lokasi)}</span>
        </div>
        {wo.hourMeter !== null && (
          <div className="wo-detail-item">
            <span className="wo-detail-label">Hour Meter</span>
            <span className="wo-detail-value">{wo.hourMeter}</span>
          </div>
        )}
        {wo.kilometers !== null && (
          <div className="wo-detail-item">
            <span className="wo-detail-label">Kilometer</span>
            <span className="wo-detail-value">{wo.kilometers}</span>
          </div>
        )}
        {wo.partCategory && (
          <div className="wo-detail-item">
            <span className="wo-detail-label">Spare Part</span>
            <span className="wo-detail-value">{SPARE[wo.partCategory] ?? wo.partCategory}</span>
          </div>
        )}
        {wo.keterangan && (
          <div className="wo-detail-item lebar">
            <span className="wo-detail-label">📝 Keterangan</span>
            <span className="wo-detail-value">{wo.keterangan}</span>
          </div>
        )}
      </div>

      {/* Dua jalur terpisah, 1:1 dengan PWA. `stopPropagation` WAJIB — kartunya
          sendiri sudah clickable, tanpa itu menekan tombol juga ikut membuka
          modal di belakangnya (`:953-962`). */}
      {wo.statusGroup === 'assigned' && (
        wo.bolehKirim ? (
          <div className="wo-aksi">
            <button
              type="button" className="btn-secondary" disabled={sibuk}
              onClick={(e) => { e.stopPropagation(); onBuka(); }}
            >✍️ Isi Manual</button>
            <button
              type="button" className="btn-primary" disabled={sibuk}
              onClick={(e) => { e.stopPropagation(); onKirim(); }}
            >{sibuk ? 'Mengirim…' : '📮 Kirim'}</button>
          </div>
        ) : (
          /* Transfer sedang menunggu keputusan L1. Tombol Kirim di sini akan
             ditolak mesin transisi status — tombol yang pasti gagal lebih
             buruk daripada keterangan yang jujur. */
          <div className="wo-aksi-catatan">
            🔁 Menunggu keputusan transfer. Jam kerja sesi Anda dicatat saat
            transfernya disetujui.
          </div>
        )
      )}
    </div>
  );
}

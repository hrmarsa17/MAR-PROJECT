'use client';

import { useEffect, useMemo, useState } from 'react';
import { Portal } from '../Portal.js';
import type { BekalOverride } from '../../domain/kueriApproval.js';
import { durasiJam } from '../../lib/format.js';

/**
 * MODAL EDIT OVERRIDE — layar tempat approver mengubah angka yang jadi uang.
 *
 * Bentuknya dari `Approval.html:729-800`; kontraknya di
 * docs/SPEK-LAYAR/04-APPROVALS.md §3c.
 *
 * ── ATURAN YANG MENENTUKAN SELURUH BENTUKNYA ────────────────────────────────
 * HANYA yang berubah yang dikirim. Kotaknya diisi nilai EFEKTIF, jadi kalau
 * seluruh isian dikirim apa adanya, sekadar MEMBUKA modal lalu menekan Simpan
 * akan meninggalkan jejak "L2 mengubah base points" padahal ia tak menyentuh
 * apa pun. Setiap medan dibandingkan dulu dengan bekalnya.
 *
 * Judgment satu-satunya yang boleh dikirim KOSONG dengan sengaja: itulah cara
 * L2 menghapus catatan warisan L1. `undefined` berarti tak disentuh, string
 * kosong berarti "hapus".
 */

interface Props {
  woId: number;
  onTutup: () => void;
  onSimpan: () => void;
}

export function ModalOverride({ woId, onTutup, onSimpan }: Props) {
  const [bekal, setBekal] = useState<BekalOverride | null>(null);
  const [galatMuat, setGalatMuat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  // Keadaan formulir. Semuanya string supaya kotak kosong bisa dibedakan dari nol.
  const [base, setBase] = useState('');
  const [tJam, setTJam] = useState('');
  const [tMenit, setTMenit] = useState('');
  const [kondisi, setKondisi] = useState('');
  const [tim, setTim] = useState<number[]>([]);
  const [mulai, setMulai] = useState('');
  const [selesai, setSelesai] = useState('');
  const [judgment, setJudgment] = useState('');

  /* Halaman di belakang DIKUNCI selama modal terbuka.
     Tanpa ini, roda mouse yang kebetulan berada di luar kotak modal
     menggulir halaman approval di belakangnya — dan saat modalnya ditutup,
     layar sudah berada di tempat yang berbeda dari sebelum dibuka. Terbaca
     sebagai antarmuka yang berubah sendiri.

     Lebar scrollbar diganti padding supaya isi halaman tidak melompat
     mendatar sesaat kuncinya dipasang. */
  useEffect(() => {
    const b = document.body;
    const geser = window.innerWidth - document.documentElement.clientWidth;
    const overflowAsli = b.style.overflow;
    const padAsli = b.style.paddingRight;
    b.style.overflow = 'hidden';
    if (geser > 0) b.style.paddingRight = `${geser}px`;
    return () => { b.style.overflow = overflowAsli; b.style.paddingRight = padAsli; };
  }, []);

  useEffect(() => {
    let batal = false;
    fetch(`/api/data?jenis=override&wo_id=${woId}`)
      .then((r) => r.json())
      .then((j) => {
        if (batal) return;
        if (!j.ok) throw new Error(j.pesan ?? 'Gagal memuat data override');
        const b: BekalOverride = j.data;
        setBekal(b);
        setBase(String(b.efektif.basePoints));
        const total = Math.round(b.efektif.targetHours * 60);
        setTJam(String(Math.floor(total / 60)));
        setTMenit(String(total % 60));
        setKondisi(b.efektif.workCondition);
        setTim(b.efektif.team.length ? b.efektif.team : [0]);
        setMulai(keLokal(b.efektif.startTime));
        setSelesai(keLokal(b.efektif.endTime));
        setJudgment(b.judgment.teks);
      })
      .catch((e: Error) => { if (!batal) setGalatMuat(e.message); });
    return () => { batal = true; };
  }, [woId]);

  /* Durasi yang ditampilkan adalah SESI PICKER saja, bukan total.
     `partial_hours` ditambahkan sistem dan tidak bisa disunting; menampilkan
     jumlahnya di sini akan membuat approver mengira ia sedang mengedit total. */
  const sesiJam = useMemo(() => {
    if (!mulai || !selesai) return null;
    const a = new Date(mulai).getTime();
    const b = new Date(selesai).getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    return (b - a) / 3_600_000;
  }, [mulai, selesai]);

  if (galatMuat) {
    return (
      <Bingkai judul="✏️ Edit Override" onTutup={onTutup}>
        <div className="kabar kabar-salah">{galatMuat}</div>
      </Bingkai>
    );
  }
  if (!bekal) {
    return (
      <Bingkai judul="✏️ Edit Override" onTutup={onTutup}>
        <div className="kosong">Memuat…</div>
      </Bingkai>
    );
  }

  const timTerisi = tim.filter((x) => x > 0);
  const targetBaru = bulat2((Number(tJam) || 0) + (Number(tMenit) || 0) / 60);
  const waktuLengkap = !!mulai && !!selesai;
  const waktuSah = !waktuLengkap || (sesiJam !== null && sesiJam > 0);

  async function simpan() {
    if (!bekal) return;
    setGalat(null);

    if (timTerisi.length === 0) {
      setGalat('Tim tidak boleh kosong — WO wajib punya minimal satu mekanik.');
      return;
    }
    if (new Set(timTerisi).size !== timTerisi.length) {
      setGalat('Ada mekanik yang terpilih lebih dari sekali.');
      return;
    }
    if (waktuLengkap && !waktuSah) {
      setGalat('Jam selesai harus setelah jam mulai.');
      return;
    }
    if (!!mulai !== !!selesai) {
      setGalat('Jam mulai dan selesai harus diisi berpasangan.');
      return;
    }

    // Hanya yang BERGESER yang masuk muatan.
    const muatan: Record<string, unknown> = { woId: bekal.woId };
    const baseBaru = Number(base);
    if (Number.isFinite(baseBaru) && baseBaru !== bekal.efektif.basePoints) {
      muatan['basePoints'] = baseBaru;
    }
    if (targetBaru !== bulat2(bekal.efektif.targetHours)) {
      muatan['targetHours'] = targetBaru;
    }
    if (kondisi !== bekal.efektif.workCondition) muatan['workCondition'] = kondisi;

    const timUrut = [...timTerisi].sort((a, b) => a - b);
    if (JSON.stringify(timUrut) !== JSON.stringify(bekal.efektif.team)) {
      muatan['team'] = timUrut;
    }
    if (waktuLengkap
        && (keLokal(bekal.efektif.startTime) !== mulai
            || keLokal(bekal.efektif.endTime) !== selesai)) {
      muatan['waktu'] = {
        startTime: new Date(mulai).toISOString(),
        endTime: new Date(selesai).toISOString(),
      };
    }
    // Kosong DIKIRIM bila sebelumnya ada isinya — itu cara menghapusnya.
    if (judgment.trim() !== bekal.judgment.teks.trim()) muatan['judgment'] = judgment.trim();

    if (Object.keys(muatan).length === 1) {
      setGalat('Tidak ada yang berubah.');
      return;
    }

    setSibuk(true);
    try {
      const r = await fetch('/api/perintah', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aksi: 'save_override', op_id: crypto.randomUUID(), data: muatan,
        }),
      });
      const j = await r.json();
      setSibuk(false);
      if (!j.ok) { setGalat(j.pesan ?? 'Gagal menyimpan'); return; }
      onSimpan();
    } catch {
      setSibuk(false);
      setGalat('Sambungan terputus sebelum jawaban server sampai. Koreksi Anda '
             + 'MUNGKIN sudah tersimpan — tutup, muat ulang, dan lihat keadaannya '
             + 'sebelum mengulang.');
    }
  }

  return (
    <Bingkai
      judul={`✏️ Edit Override — ${bekal.woNumber}`}
      onTutup={onTutup}
      kaki={
        <>
          <button type="button" className="btn-secondary" onClick={onTutup}>Cancel</button>
          <button
            type="button" className="btn-primary"
            disabled={sibuk || !bekal.bolehDiubah}
            onClick={() => void simpan()}
          >
            {sibuk ? 'Menyimpan…' : '💾 Save Override'}
          </button>
        </>
      }
    >
      {!bekal.bolehDiubah && (
        <div className="kabar kabar-salah">
          WO ini berstatus <b>{bekal.status}</b> dan tidak bisa dikoreksi lagi —
          poinnya sudah terbit. Batalkan WO-nya bila memang salah.
        </div>
      )}

      {/* ── medan yang bisa diubah ─────────────────────────────────────── */}
      <div className="modal-bagian">
        <h4 className="modal-bagian-judul">📝 Editable Fields</h4>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Base Points</label>
            <input
              type="number" step="0.1" min="0" value={base}
              disabled={!bekal.bolehDiubah}
              onChange={(e) => setBase(e.target.value)}
            />
            <p className="form-hint">
              Original: {bekal.asal.basePoints ?? '—'}
            </p>
          </div>
          <div className="form-group">
            {/* Jam + menit terpisah, bukan desimal. "1,2 jam" harus dihitung di
                kepala sebelum bisa dinilai wajar; "1 jam 12 menit" tidak. */}
            <label className="form-label">Target Hours</label>
            <div className="kotak-jam-menit">
              <input
                type="number" min="0" step="1" placeholder="Jam" style={{ width: 90 }}
                value={tJam} disabled={!bekal.bolehDiubah}
                onChange={(e) => setTJam(e.target.value)}
              />
              <span style={{ fontWeight: 600 }}>jam</span>
              <input
                type="number" min="0" max="59" step="1" placeholder="Mnt" style={{ width: 90 }}
                value={tMenit} disabled={!bekal.bolehDiubah}
                onChange={(e) => setTMenit(e.target.value)}
              />
              <span style={{ fontWeight: 600 }}>menit</span>
            </div>
            <p className="form-hint">
              Original: {bekal.asal.targetHours === null ? '—' : durasiJam(bekal.asal.targetHours)}
            </p>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Kondisi Kerja</label>
          <select
            value={kondisi} disabled={!bekal.bolehDiubah}
            onChange={(e) => setKondisi(e.target.value)}
          >
            {bekal.kondisi.map((k) => (
              <option key={k.kunci} value={k.kunci}>{k.label} (×{k.faktor})</option>
            ))}
          </select>
          <p className="form-hint">
            Saat ini: {labelKondisi(bekal, bekal.efektif.workCondition)} —
            {' '}mengubahnya mengubah poin.
          </p>
        </div>

        <div className="form-group">
          <label className="form-label">Team Composition</label>
          <div className="team-members">
            {tim.map((idAnggota, i) => (
              <div className="team-member-row" key={i}>
                <select
                  className="mechanic-select"
                  value={idAnggota === 0 ? '' : String(idAnggota)}
                  disabled={!bekal.bolehDiubah}
                  onChange={(e) => {
                    const baru = [...tim];
                    baru[i] = Number(e.target.value || 0);
                    setTim(baru);
                  }}
                >
                  <option value="">-- Select Mechanic --</option>
                  {bekal.mekanik.map((m) => (
                    <option
                      key={m.id} value={m.id}
                      disabled={tim.includes(m.id) && tim[i] !== m.id}
                    >
                      {m.nama}{m.jabatan ? ` — ${m.jabatan}` : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button" className="btn-reject btn-ikon" title="Hapus anggota"
                  disabled={!bekal.bolehDiubah}
                  onClick={() => setTim(tim.filter((_, j) => j !== i))}
                >✕</button>
              </div>
            ))}
          </div>
          <button
            type="button" className="btn-tambah-anggota"
            disabled={!bekal.bolehDiubah}
            onClick={() => {
              // Sumber tidak pernah membuat baris kosong: ia langsung memilih
              // mekanik pertama. Baris kosong cuma menambah satu keadaan tak
              // sah yang harus dijaga validasinya.
              const bebas = bekal.mekanik.find((m) => !tim.includes(m.id));
              setTim([...tim, bebas ? bebas.id : 0]);
            }}
          >+ Add Member</button>
          {/* Tidak ada kolom persentase, dan itu disengaja: setiap anggota
              menerima poin PENUH. Menampilkan kotak persen mengundang orang
              mengetik 50 dan mengira ia sedang membagi. */}
          <p className="form-hint">Tiap anggota menerima poin penuh — tidak dibagi.</p>
        </div>
      </div>

      {/* ── jam kerja ──────────────────────────────────────────────────── */}
      <div className="modal-bagian">
        <h4 className="modal-bagian-judul">⏱️ Waktu Kerja (koreksi jam mekanik)</h4>
        <p className="form-hint" style={{ marginTop: 0 }}>
          Untuk mekanik yang lupa menekan stop, atau salah jam mulai.
        </p>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Mulai</label>
            <input
              type="datetime-local" value={mulai} disabled={!bekal.bolehDiubah}
              onChange={(e) => setMulai(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Selesai</label>
            <input
              type="datetime-local" value={selesai} disabled={!bekal.bolehDiubah}
              onChange={(e) => setSelesai(e.target.value)}
            />
          </div>
        </div>
        <div className={`kotak-durasi${waktuSah ? '' : ' salah'}`}>
          Durasi:{' '}
          {sesiJam === null ? '—'
            : sesiJam <= 0 ? '⚠️ Jam selesai harus setelah jam mulai'
            : `${durasiJam(sesiJam)} (${bulat2(sesiJam)} jam)`}
        </div>
        {bekal.partialHours > 0 && (
          <p className="form-hint">
            ⚠️ WO ini pernah <b>ditransfer</b>. Picker hanya mengoreksi sesi{' '}
            <b>terakhir</b>; {durasiJam(bekal.partialHours)} dari sesi sebelumnya
            tetap ditambahkan otomatis oleh sistem.
          </p>
        )}
      </div>

      {/* ── judgment ───────────────────────────────────────────────────── */}
      <div className="modal-bagian">
        <h4 className="modal-bagian-judul">🗒️ Judgment / Catatan Approver (opsional)</h4>
        <p className="form-hint" style={{ marginTop: 0 }}>
          Alasan pengerjaan lama atau menyimpang. Tampil di dashboard.
        </p>
        {bekal.judgment.sumber === 'supervisor'
          && bekal.status === 'pending_superintendent' && (
          <div className="kabar kabar-info" style={{ fontSize: '0.8125rem' }}>
            ↩️ Catatan ini ditulis L1. Anda boleh mengubahnya, atau kosongkan
            untuk menghapus.
          </div>
        )}
        <textarea
          rows={3} maxLength={500} value={judgment}
          disabled={!bekal.bolehDiubah}
          placeholder="contoh: menunggu part datang dari gudang pusat, unit harus dilangsir dulu…"
          onChange={(e) => setJudgment(e.target.value)}
          style={{ resize: 'vertical' }}
        />
        <p className="form-hint" style={{ textAlign: 'right' }}>{judgment.length}/500</p>
      </div>

      {/* ── riwayat ────────────────────────────────────────────────────── */}
      {bekal.riwayat.length > 0 && (
        <div className="modal-bagian">
          <h4 className="modal-bagian-judul">✏️ Riwayat Override</h4>
          {bekal.riwayat.map((r, i) => (
            <div className="riwayat-baris" key={i}>
              <span className={`badge ${r.level === 'superintendent' ? 'badge-purple' : 'badge-amber'}`}>
                {r.level === 'superintendent' ? 'L2' : 'L1'}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.8125rem' }}>
                  <b>{namaJenis(r.kind)}</b>:{' '}
                  {/* Nilai lama DICORET, lalu panah ke yang baru — bentuk sumber
                      (`Approval.html:1250-1252`). Tanpa yang lama, riwayat cuma
                      menyebut keadaan sekarang dan tak menjelaskan apa pun. */}
                  {r.lama !== undefined && r.lama !== null && (
                    <>
                      <span className="riwayat-lama">{ringkasNilai(r.kind, r.lama, bekal)}</span>
                      {' → '}
                    </>
                  )}
                  <span className="riwayat-baru">{ringkasNilai(r.kind, r.baru, bekal)}</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {r.oleh} · {new Date(r.set_at).toLocaleString('id-ID')}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── read-only ──────────────────────────────────────────────────── */}
      <div className="modal-bagian">
        <h4 className="modal-bagian-judul">🔒 Read-Only</h4>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Unit Factor</label>
          {/* Kelas `readonly` dari sumber (`Approval.html:784`). Ia HARUS
              terlihat berbeda dari kotak yang bisa diisi — kotak abu-abu yang
              tak menerima ketikan tanpa tanda apa pun terbaca sebagai rusak,
              bukan sebagai terkunci. */}
          <input
            className="readonly" readOnly tabIndex={-1}
            value={`${bekal.unit.factor}${bekal.unit.nama ? ` (${bekal.unit.nama})` : ''}`}
          />
          <p className="form-hint">
            Faktor unit ikut unitnya, bukan pendapat approver. Mengubahnya
            berarti mengganti unitnya.
          </p>
        </div>
      </div>

      {galat && <div className="kabar kabar-salah">{galat}</div>}
    </Bingkai>
  );
}

/**
 * Bingkai modal. Kaki DIPISAH dari badan, bukan ditaruh di dalamnya: badan yang
 * menggulir sementara kaki tetap terpaku berarti tombol Simpan selalu
 * terjangkau. Saat keduanya menyatu, modal sepanjang ini mendorong tombolnya
 * keluar layar dan orang mengira formulirnya belum selesai.
 */
function Bingkai({
  judul, onTutup, children, kaki,
}: {
  judul: string;
  onTutup: () => void;
  children: React.ReactNode;
  kaki?: React.ReactNode;
}) {
  /* KOREKSI ATAS CATATAN SAYA SEBELUMNYA.
     Saya pernah menulis di sini bahwa KMB V2 tak menutup modalnya saat tirai
     diklik. Itu SALAH: pencarian saya cuma mencari atribut `onclick` sebaris,
     sementara sumbernya memasangnya lewat addEventListener —
     `Approval.html:1339`:

         editModal.addEventListener('click', e => { if (e.target === this) closeEditModal(); });

     Jadi tirai memang menutup, dan perilaku itu dikembalikan supaya 1:1.
     Risikonya nyata — koreksi yang baru diketik hilang kalau kursor meleset —
     tapi mengubahnya adalah keputusan Gabriel, bukan keputusan porting, dan
     saya sudah sekali memutuskannya sendiri atas dasar yang keliru. */
  return (
    <Portal>
      <div
        className="modal-tirai"
        onClick={(e) => { if (e.target === e.currentTarget) onTutup(); }}
      >
        <div className="modal modal-lebar">
          <div className="modal-header">
            <h3>{judul}</h3>
            <button type="button" className="modal-tutup" title="Tutup" onClick={onTutup}>×</button>
          </div>
          <div className="modal-body">{children}</div>
          {kaki && <div className="modal-footer">{kaki}</div>}
        </div>
      </div>
    </Portal>
  );
}

/** ISO → nilai `datetime-local`, dalam zona waktu peramban. */
function keLokal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
       + `T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function bulat2(n: number): number {
  return Math.round(n * 100) / 100;
}

function labelKondisi(b: BekalOverride, kunci: string): string {
  return b.kondisi.find((k) => k.kunci === kunci)?.label ?? kunci;
}

function namaJenis(kind: string): string {
  return {
    base_points: 'Base Points', target_hours: 'Target Hours',
    work_condition: 'Kondisi Kerja', team: 'Team Composition',
    time: 'Waktu Kerja', judgment: 'Catatan Approver', unit: 'Unit',
  }[kind] ?? kind;
}

function ringkasNilai(kind: string, v: unknown, b: BekalOverride): string {
  if (kind === 'team' && Array.isArray(v)) {
    return (v as number[])
      .map((id) => b.mekanik.find((m) => m.id === id)?.nama ?? `#${id}`)
      .join(', ');
  }
  if (kind === 'time' && v && typeof v === 'object') {
    const t = v as { session_hours?: number };
    return t.session_hours === undefined ? '—' : durasiJam(t.session_hours);
  }
  if (kind === 'target_hours' && typeof v === 'number') return durasiJam(v);
  if (kind === 'judgment') return v === '' ? '(dikosongkan)' : String(v);
  return String(v);
}

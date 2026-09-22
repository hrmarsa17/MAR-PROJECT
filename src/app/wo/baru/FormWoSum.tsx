'use client';

import { useMemo, useRef, useState } from 'react';
import { kirimPerintah } from '../../../pwa/kirim.js';
import type { Katalog } from './jenis.js';

interface Props {
  kat: Katalog;
  bolehLihatPoin?: boolean;
}

export function FormWoSum({ kat, bolehLihatPoin = false }: Props) {
  const [kategori, setKategori] = useState('');
  const [jobId, setJobId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [kondisi, setKondisi] = useState('normal');
  const [lokasi, setLokasi] = useState<'workshop' | 'field'>('workshop');
  const [keterangan, setKeterangan] = useState('');
  const [tim, setTim] = useState<number[]>([0]);

  const [sibuk, setSibuk] = useState(false);
  const [pesanGalat, setPesanGalat] = useState<string | null>(null);
  const [pesanSukses, setPesanSukses] = useState<{ noWo: string; ringkasan: string } | null>(null);

  // Kategori Pekerjaan yang unik dari job_type
  const daftarKategori = useMemo(() => {
    const set = new Set<string>();
    for (const j of kat.jobs) {
      const t = (j.job_type || '').trim();
      if (t) set.add(t);
    }
    return Array.from(set).sort();
  }, [kat.jobs]);

  // Pekerjaan/Komponen yang cocok dengan kategori terpilih
  const daftarJob = useMemo(() => {
    if (!kategori) return [];
    return kat.jobs.filter((j) => (j.job_type || '').trim() === kategori);
  }, [kat.jobs, kategori]);

  // Unit SUM aktif dan bukan semu
  const daftarUnit = useMemo(() => {
    return kat.units.filter((u) => !u.is_virtual);
  }, [kat.units]);

  // Mekanik yang tersedia
  const daftarMekanik = useMemo(() => {
    return kat.mekanik;
  }, [kat.mekanik]);

  function ubahKategori(katBaru: string) {
    setKategori(katBaru);
    setJobId('');
  }

  function ubahMekanik(idx: number, id: number) {
    const baru = [...tim];
    baru[idx] = id;
    setTim(baru);
  }

  function tambahMekanik() {
    setTim([...tim, 0]);
  }

  function hapusMekanik(idx: number) {
    if (tim.length <= 1) {
      setTim([0]);
      return;
    }
    setTim(tim.filter((_, i) => i !== idx));
  }

  async function simpanDanBuatLagi(e: React.FormEvent) {
    e.preventDefault();
    setPesanGalat(null);
    setPesanSukses(null);

    if (!kategori) {
      setPesanGalat('Pilih Kategori Pekerjaan terlebih dahulu.');
      return;
    }
    if (!jobId) {
      setPesanGalat('Pilih Komponen / Pekerjaan terlebih dahulu.');
      return;
    }
    if (!unitId) {
      setPesanGalat('Pilih Unit terlebih dahulu.');
      return;
    }

    const timValid = tim.filter((id) => id > 0);
    if (timValid.length === 0) {
      setPesanGalat('Pilih minimal satu mekanik dalam Tim Mekanik.');
      return;
    }

    const jobDipilih = kat.jobs.find((j) => String(j.id) === jobId);
    const unitDipilih = kat.units.find((u) => String(u.id) === unitId);

    const opId = crypto.randomUUID();
    setSibuk(true);

    try {
      const res = await kirimPerintah(
        'buat_wo',
        {
          sectionCode: jobDipilih?.section || 'workshop',
          blok: [
            {
              jobId: Number(jobId),
              unitId: Number(unitId),
              workCondition: kondisi,
              location: lokasi === 'workshop' ? 'Bengkel' : 'Lapangan',
              keterangan: keterangan.trim() || undefined,
              teamMechanicIds: timValid,
            },
          ],
        },
        { opId, ringkas: `1 WO · ${jobDipilih?.job_description || 'SUM'}` },
      );

      setSibuk(false);

      if (res.keadaan === 'ditolak') {
        setPesanGalat(res.pesan ?? 'Gagal membuat Work Order');
        return;
      }

      if (res.keadaan === 'antre') {
        setPesanSukses({
          noWo: 'Antrean Offline',
          ringkasan: 'Tersimpan di HP! Akan terkirim otomatis saat terhubung sinyal.',
        });
        resetForm();
        return;
      }

      const isi = (res.hasil?.hasil ?? {}) as { dibuat?: { id: number; woNumber: string }[] };
      const dibuat = isi.dibuat ?? [];
      const noWo = dibuat[0]?.woNumber ?? 'WO-SUM';

      setPesanSukses({
        noWo,
        ringkasan: `${jobDipilih?.job_description || 'Pekerjaan'} untuk ${unitDipilih?.unit_name || 'Unit'}`,
      });

      // Reset form agar langsung siap input WO berikutnya ("Simpan & Buat Lagi")
      resetForm();
    } catch (err) {
      setSibuk(false);
      setPesanGalat((err as Error).message || 'Terjadi kesalahan sistem saat menyimpan.');
    }
  }

  function resetForm() {
    setKategori('');
    setJobId('');
    setKeterangan('');
    setTim([0]);
    // Biarkan unit, kondisi, dan lokasi tetap atau kembali ke default
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '12px 4px' }}>
      <div
        style={{
          background: '#ffffff',
          borderRadius: 16,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
          border: '1px solid #e2e8f0',
          padding: '24px 22px',
          fontFamily: 'inherit',
        }}
      >
        {/* Header dengan icon plus ungu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span style={{ color: '#7c3aed', fontSize: '1.4rem', fontWeight: 800, lineHeight: 1 }}>
            ✚
          </span>
          <h2
            style={{
              margin: 0,
              fontSize: '1.1875rem',
              fontWeight: 700,
              color: '#1e293b',
              letterSpacing: '-0.01em',
            }}
          >
            Buat Work Order
          </h2>
        </div>

        {/* Notifikasi Sukses */}
        {pesanSukses && (
          <div
            style={{
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
              color: '#065f46',
              padding: '12px 14px',
              borderRadius: 10,
              marginBottom: 18,
              fontSize: '0.875rem',
            }}
          >
            <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>✅</span>
              <span>Work Order {pesanSukses.noWo} berhasil disimpan!</span>
            </div>
            <div style={{ fontSize: '0.8125rem', color: '#047857', marginTop: 3 }}>
              {pesanSukses.ringkasan}
            </div>
            <div style={{ marginTop: 8 }}>
              <a
                href="/monitoring"
                style={{
                  color: '#047857',
                  fontWeight: 600,
                  textDecoration: 'underline',
                  fontSize: '0.8125rem',
                }}
              >
                Lihat di Monitoring →
              </a>
            </div>
          </div>
        )}

        {/* Notifikasi Galat */}
        {pesanGalat && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              padding: '12px 14px',
              borderRadius: 10,
              marginBottom: 18,
              fontSize: '0.875rem',
            }}
          >
            ⚠️ {pesanGalat}
          </div>
        )}

        <form onSubmit={simpanDanBuatLagi}>
          {/* 1. Kategori Pekerjaan * */}
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: '#475569',
                marginBottom: 6,
              }}
            >
              Kategori Pekerjaan <span style={{ color: '#94a3b8' }}>*</span>
            </label>
            <select
              value={kategori}
              onChange={(e) => ubahKategori(e.target.value)}
              style={{
                width: '100%',
                height: 44,
                padding: '8px 12px',
                fontSize: '0.875rem',
                border: '1px solid #d1d5db',
                borderRadius: 10,
                background: '#ffffff',
                color: kategori ? '#1e293b' : '#64748b',
                outline: 'none',
              }}
            >
              <option value="">-- Pilih Kategori Pekerjaan --</option>
              {daftarKategori.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Komponen / Pekerjaan * */}
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: '#475569',
                marginBottom: 6,
              }}
            >
              Komponen / Pekerjaan <span style={{ color: '#94a3b8' }}>*</span>
            </label>
            <select
              value={jobId}
              disabled={!kategori}
              onChange={(e) => setJobId(e.target.value)}
              style={{
                width: '100%',
                height: 44,
                padding: '8px 12px',
                fontSize: '0.875rem',
                border: '1px solid #d1d5db',
                borderRadius: 10,
                background: !kategori ? '#f8fafc' : '#ffffff',
                color: jobId ? '#1e293b' : '#64748b',
                outline: 'none',
              }}
            >
              {!kategori ? (
                <option value="">-- Pilih Kategori Dulu --</option>
              ) : (
                <>
                  <option value="">-- Pilih Komponen / Pekerjaan --</option>
                  {daftarJob.map((j) => {
                    const bersihkanLabel = j.job_description.replace(/\s*\[.*?\]\s*$/, '').trim();
                    return (
                      <option key={j.id} value={j.id}>
                        {bersihkanLabel || j.job_description}
                      </option>
                    );
                  })}
                </>
              )}
            </select>
          </div>

          {/* 3. Unit * */}
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: '#475569',
                marginBottom: 6,
              }}
            >
              Unit <span style={{ color: '#94a3b8' }}>*</span>
            </label>
            <select
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              style={{
                width: '100%',
                height: 44,
                padding: '8px 12px',
                fontSize: '0.875rem',
                border: '1px solid #d1d5db',
                borderRadius: 10,
                background: '#ffffff',
                color: unitId ? '#1e293b' : '#64748b',
                outline: 'none',
              }}
            >
              <option value="">-- Pilih Unit --</option>
              {daftarUnit.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unit_name}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Work Condition * */}
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: '#475569',
                marginBottom: 6,
              }}
            >
              Work Condition <span style={{ color: '#94a3b8' }}>*</span>
            </label>
            <select
              value={kondisi}
              onChange={(e) => setKondisi(e.target.value)}
              style={{
                width: '100%',
                height: 44,
                padding: '8px 12px',
                fontSize: '0.875rem',
                border: '1px solid #d1d5db',
                borderRadius: 10,
                background: '#ffffff',
                color: '#1e293b',
                outline: 'none',
              }}
            >
              {kat.kondisi && kat.kondisi.length > 0 ? (
                kat.kondisi.map((k) => (
                  <option key={k.kunci} value={k.kunci}>
                    {k.kunci.charAt(0).toUpperCase() + k.kunci.slice(1)}
                  </option>
                ))
              ) : (
                <>
                  <option value="normal">Normal</option>
                  <option value="difficult">Difficult</option>
                  <option value="extreme">Extreme</option>
                </>
              )}
            </select>
          </div>

          {/* 5. Lokasi * */}
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: '#475569',
                marginBottom: 6,
              }}
            >
              Lokasi <span style={{ color: '#94a3b8' }}>*</span>
            </label>
            <select
              value={lokasi}
              onChange={(e) => setLokasi(e.target.value as 'workshop' | 'field')}
              style={{
                width: '100%',
                height: 44,
                padding: '8px 12px',
                fontSize: '0.875rem',
                border: '1px solid #d1d5db',
                borderRadius: 10,
                background: '#ffffff',
                color: '#1e293b',
                outline: 'none',
              }}
            >
              <option value="workshop">🏭 Bengkel</option>
              <option value="field">🚜 Lapangan</option>
            </select>
          </div>

          {/* 6. Keterangan (opsional) */}
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: '#475569',
                marginBottom: 6,
              }}
            >
              Keterangan <span style={{ color: '#94a3b8', fontWeight: 400 }}>(opsional)</span>
            </label>
            <input
              type="text"
              placeholder="cth: unit di pit 3"
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              style={{
                width: '100%',
                height: 44,
                padding: '8px 12px',
                fontSize: '0.875rem',
                border: '1px solid #d1d5db',
                borderRadius: 10,
                background: '#ffffff',
                color: '#1e293b',
                outline: 'none',
              }}
            />
          </div>

          {/* 7. Tim Mekanik * */}
          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: '#475569',
                marginBottom: 8,
              }}
            >
              Tim Mekanik <span style={{ color: '#94a3b8' }}>*</span>
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tim.map((idMekanik, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={idMekanik === 0 ? '' : String(idMekanik)}
                    onChange={(e) => ubahMekanik(idx, Number(e.target.value || 0))}
                    style={{
                      flex: 1,
                      height: 44,
                      padding: '8px 12px',
                      fontSize: '0.875rem',
                      border: '1px solid #d1d5db',
                      borderRadius: 10,
                      background: '#ffffff',
                      color: idMekanik ? '#1e293b' : '#64748b',
                      outline: 'none',
                    }}
                  >
                    <option value="">-- Pilih Mekanik --</option>
                    {daftarMekanik.map((m) => (
                      <option
                        key={m.id}
                        value={m.id}
                        disabled={tim.includes(m.id) && idMekanik !== m.id}
                      >
                        {m.name}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => hapusMekanik(idx)}
                    title="Hapus Mekanik"
                    style={{
                      width: 44,
                      height: 44,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid #d1d5db',
                      borderRadius: 10,
                      background: '#ffffff',
                      color: '#64748b',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      transition: 'all 0.15s ease',
                      flexShrink: 0,
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={tambahMekanik}
              style={{
                marginTop: 10,
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                padding: '7px 14px',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>+</span> Tambah Mekanik
            </button>
          </div>

          {/* 8. Tombol Simpan & Buat Lagi */}
          <button
            type="submit"
            disabled={sibuk}
            style={{
              width: '100%',
              height: 48,
              background: sibuk ? '#93c5fd' : '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: 10,
              fontSize: '0.9375rem',
              fontWeight: 700,
              cursor: sibuk ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
              transition: 'background-color 0.15s ease',
            }}
          >
            <span>✚</span>
            <span>{sibuk ? 'Menyimpan Work Order…' : 'Simpan & Buat Lagi'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}

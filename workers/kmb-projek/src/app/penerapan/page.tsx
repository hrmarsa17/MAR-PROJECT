import { redirect } from 'next/navigation';
import { akuServer } from '../../lib/sesi.js';
import { komitSekarang, riwayatPenerapan } from '../../domain/penerapan.js';

export const dynamic = 'force-dynamic';

/**
 * RIWAYAT PENERAPAN.
 *
 * ── KENAPA SIAPA PUN YANG SUDAH MASUK BOLEH MELIHATNYA ──────────────────────
 * Layar teknis lain dijaga penanda per-orang (`may_view_technical`). Yang ini
 * sengaja tidak: gunanya justru untuk orang yang MENULIS kode tapi tidak punya
 * akun Vercel, dan orang seperti itu belum tentu berperan L1 atau L2. Pada
 * 17 Sep 2026 orang kedua di repo ini berperan `mechanic` — menjaga layar ini
 * dengan penanda teknis akan menutupnya justru dari satu-satunya orang yang
 * membutuhkannya.
 *
 * Isinya pun tidak sensitif: sidik commit, judul commit, nama penulis. Tidak
 * ada data orang, tidak ada rupiah, tidak ada token.
 *
 * Tetap menuntut masuk, karena judul commit adalah kabar internal dan tidak
 * perlu terbuka untuk seluruh internet seperti `/api/sehat`.
 */
export default async function Penerapan() {
  const aku = await akuServer();
  if (!aku) redirect('/masuk');

  const daftar = await riwayatPenerapan();
  const sekarang = komitSekarang();

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">🚀 Riwayat Penerapan</h1>
        <p className="page-subtitle">
          Yang benar-benar pernah tayang. Commit yang sudah di-push ke GitHub belum
          tentu ada di sini — ia bisa masih dibangun, atau gagal dibangun.
        </p>
      </div>

      {daftar.length === 0 ? (
        <p>
          Belum ada catatan. Baris pertama lahir saat penerapan berikutnya melayani
          permintaan pertamanya — buka <code>/api/sehat</code> untuk memicunya.
        </p>
      ) : (
        <table className="table tabel-admin">
          <thead>
            <tr>
              <th>Commit</th>
              <th>Perubahan</th>
              <th>Oleh</th>
              <th>Mulai tayang</th>
            </tr>
          </thead>
          <tbody>
            {daftar.map((d) => (
              <tr key={d.commit_sha}>
                <td>
                  <code>{d.commit_sha}</code>
                  {d.commit_sha === sekarang && (
                    <strong style={{ marginLeft: '0.5rem' }}>← sedang tayang</strong>
                  )}
                </td>
                <td>{d.pesan ?? '—'}</td>
                <td>{d.penulis ?? '—'}</td>
                <td>
                  {new Intl.DateTimeFormat('id-ID', {
                    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta',
                  }).format(d.tayang_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="page-subtitle" style={{ marginTop: '1rem' }}>
        &quot;Mulai tayang&quot; adalah saat penerapan itu melayani permintaan
        pertamanya — bukan saat commit dibuat, dan bukan saat Vercel selesai
        membangun.
      </p>
    </div>
  );
}

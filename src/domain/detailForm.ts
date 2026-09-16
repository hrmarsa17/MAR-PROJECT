import { aturanBisnis, tidakBerhak, tidakDitemukan } from '../lib/errors.js';
import { jalankanPerintah, type HasilPerintah } from './runCommand.js';

/**
 * SIMPAN DETAIL TEKNIS (ban) — perintah TERSENDIRI, dan itu inti rancangannya.
 *
 * Port dari `simpanDetailTyre` (`_DetailTyre.js:512`), tapi dengan satu
 * perbedaan yang disengaja dan penting.
 *
 * ── KENAPA BUKAN SATU PERINTAH DENGAN KIRIM KERJA ───────────────────────────
 * Jam kerja adalah uang; detail teknis adalah catatan. Kalau keduanya satu
 * transaksi, kegagalan menulis catatan akan MEMBATALKAN jam kerjanya — dan
 * yang terbaca mekanik adalah "Gagal Kirim" merah di atas pekerjaan yang
 * sungguh-sungguh ia lakukan. KMB V2 menutup ini dengan menyimpan jam lebih
 * dulu lalu menangkap kegagalan detail (`MechanicService.js:493-565`).
 *
 * Di sini pemisahannya lebih tegas: `kirim_kerja` sudah COMMITTED berikut
 * struknya sebelum perintah ini dimulai, dengan `op_id` sendiri. Kegagalan di
 * sini tidak bisa menyentuh jam yang sudah diakui, dan bisa dicoba ulang tanpa
 * mengirim jam lagi.
 *
 * ── DETAIL TERLAMBAT TETAP DITERIMA ─────────────────────────────────────────
 * Mekanik mengisi detail di lapangan tanpa sinyal; antrean HP-nya baru sampai
 * berjam-jam kemudian, sementara jam kerjanya sudah masuk lewat kiriman yang
 * lebih dulu tiba. Kalau perintah ini menolak WO yang sudah lewat tahap
 * mekanik, seluruh isian teknisnya lenyap tanpa satu pun galat
 * (`MechanicService.js:415-424`). Maka status TIDAK dijadikan pagar di sini.
 */

export interface MasukanSimpanDetail {
  opId: string;
  tenantId: number;
  actorId: number;
  woId: number;
  /** posisi → field_key → nilai. Form tanpa posisi memakai posisi 0. */
  nilai: Record<string, Record<string, string>>;
}

export interface HasilSimpanDetail {
  woId: number;
  formId: number;
  jenis: string;
  /** Jumlah medan yang benar-benar ditulis. */
  ditulis: number;
  /** Posisi yang seluruh medannya kosong — dilewati, bukan ditulis. */
  dilewati: number;
}

export async function simpanDetail(
  m: MasukanSimpanDetail,
): Promise<HasilPerintah<HasilSimpanDetail>> {
  return jalankanPerintah({
    opId: m.opId,
    tenantId: m.tenantId,
    actorId: m.actorId,
    action: 'simpan_detail',
    jalankan: async ({ tx }) => {
      const wo = (
        await tx<{
          id: number; form_id: number | null; kode: string | null;
          posisional: boolean | null; jumlah_pos: number | null; nyala: boolean | null;
        }[]>`
          SELECT w.id, f.id AS form_id, f.code::text AS kode,
                 f.is_positional AS posisional, f.position_count AS jumlah_pos,
                 f.is_enabled AS nyala
            FROM work_orders w
            LEFT JOIN jobs j             ON j.id = w.job_id
            LEFT JOIN job_detail_forms f ON f.id = j.detail_form_id
           WHERE w.id = ${m.woId} AND w.tenant_id = ${m.tenantId}
        `
      )[0];
      if (!wo) throw tidakDitemukan('Work order', m.woId);
      if (!wo.form_id) throw aturanBisnis('WO ini tidak punya form detail');
      /* Saklar berlaku di SERVER, untuk baca DAN tulis. Menyembunyikan form di
         layar tidak cukup: PWA versi lama masih bisa mengirim detail, dan baris
         yang masuk saat layarnya sudah tak terlihat adalah data yang tak
         seorang pun tahu ada (`_DetailTyre.js:513-518`). */
      if (!wo.nyala) throw aturanBisnis('Form detail untuk WO ini sedang dimatikan');

      // Anggota tim, atau approver. Sama dengan gerbang kirim kerja.
      const r = (
        await tx<{ peran: string; anggota: boolean }[]>`
          SELECT m.role::text AS peran,
                 EXISTS (SELECT 1 FROM work_order_team t
                          WHERE t.work_order_id = ${m.woId} AND t.mechanic_id = m.id) AS anggota
            FROM mechanics m WHERE m.id = ${m.actorId} AND m.is_active
        `
      )[0];
      if (!r) throw tidakDitemukan('Mekanik', m.actorId);
      if (r.peran === 'mechanic' && !r.anggota) {
        throw tidakBerhak('Anda tidak terdaftar di work order ini');
      }

      // Medan yang DIKENAL form ini. Payload yang menyebut field_key asing
      // ditolak, bukan disimpan diam-diam: satu form tidak boleh menerima
      // bentuk milik form lain hanya karena nama medannya terdengar benar.
      const medan = await tx<{ field_key: string; data_type: string }[]>`
        SELECT field_key::text AS field_key, data_type::text AS data_type
          FROM job_detail_fields WHERE form_id = ${wo.form_id}
      `;
      const dikenal = new Map(medan.map((f) => [f.field_key, f.data_type]));
      const maksPos = wo.posisional ? Number(wo.jumlah_pos ?? 0) : 0;

      let ditulis = 0;
      let dilewati = 0;

      for (const [posTeks, isi] of Object.entries(m.nilai)) {
        const pos = Number(posTeks);
        if (!Number.isInteger(pos) || pos < 0) {
          throw aturanBisnis(`Posisi tidak sah: ${posTeks}`);
        }
        if (wo.posisional && (pos < 1 || pos > maksPos)) {
          throw aturanBisnis(`Posisi ${pos} di luar 1–${maksPos}`);
        }
        if (!wo.posisional && pos !== 0) {
          throw aturanBisnis('Form ini tidak memakai posisi');
        }

        // Posisi yang seluruh medannya kosong DILEWATI, bukan ditulis. Mekanik
        // yang mengisi dua posisi dari sepuluh tidak boleh melahirkan delapan
        // baris hampa (`_DetailTyre.js:507-510`).
        const terisi = Object.entries(isi).filter(([, v]) => v !== '' && v !== null);
        if (terisi.length === 0) { dilewati++; continue; }

        for (const [kunci, nilai] of Object.entries(isi)) {
          const tipe = dikenal.get(kunci);
          if (tipe === undefined) {
            throw aturanBisnis(`Medan "${kunci}" bukan milik form ${wo.kode}`);
          }
          if (tipe === 'numeric' && nilai !== '' && !Number.isFinite(Number(nilai))) {
            throw aturanBisnis(`Medan "${kunci}" harus angka, bukan "${nilai}"`);
          }

          /* Menimpa baris yang SAMA, tidak pernah menghapus lalu menulis ulang.
             Penghapusan lewat nomor baris pernah menghilangkan empat WO milik
             orang lain di KMB V2, 6-7 Agu 2026 (`_DetailTyre.js:17-25`).

             Medan yang dikosongkan pada posisi yang MASIH dikirim memang
             ditimpa jadi kosong — itu koreksi yang disengaja. Posisi yang tidak
             disertakan sama sekali tidak disentuh. */
          await tx`
            INSERT INTO work_order_detail_values
              (work_order_id, form_id, position, field_key, value_after, recorded_by)
            VALUES (${m.woId}, ${wo.form_id}, ${pos}, ${kunci},
                    ${nilai === '' ? null : nilai}, ${m.actorId})
            ON CONFLICT (work_order_id, form_id, position, field_key)
            DO UPDATE SET value_after = EXCLUDED.value_after,
                          recorded_at = now(),
                          recorded_by = EXCLUDED.recorded_by
          `;
          ditulis++;
        }
      }

      await tx`
        INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, actor_id, details)
        VALUES (${m.tenantId}, 'simpan_detail', 'work_order', ${String(m.woId)}, ${m.actorId},
                ${tx.json({ form: wo.kode, ditulis, dilewati } as never)})
      `;

      return {
        woId: m.woId, formId: Number(wo.form_id), jenis: wo.kode ?? '',
        ditulis, dilewati,
      };
    },
  });
}

import type { Identitas } from '../../lib/auth.js';
import { buatWorkOrder } from '../../domain/workOrder.js';
import { simpanOverride } from '../../domain/override.js';
import { kirimKerja } from '../../domain/kirimKerja.js';
import { mintaTransfer, setujuiTransfer, tolakTransfer } from '../../domain/transfer.js';
import { simpanDetail } from '../../domain/detailForm.js';
import { gantiPanelMeter, koreksiMeterWo } from '../../domain/meter.js';
import {
  cabutToken, hapusJob, hapusUnit, simpanFaktor, simpanJob, simpanOrang,
  simpanSetelan, simpanTarif, simpanUnit, terbitkanToken,
} from '../../domain/admin.js';
import { terapkanImpor } from '../../domain/imporKatalog.js';
import { terapkanSurut } from '../../domain/terapkanSurut.js';
import { terapkanFaktorSurut } from '../../domain/surutFaktor.js';
import { terapkanTarifSurut } from '../../domain/surutTarif.js';
import {
  approveL1, approveL2, batalkanWo, kembalikanKeMekanik, tolakWo,
} from '../../domain/approval.js';

/**
 * Handler eksekusi mutasi data untuk PostgreSQL / Supabase backend.
 */
export async function handlePerintahSupabase(
  aksi: string,
  d: any,
  umum: { opId: string; tenantId: number; actorId: number },
  aku: Identitas,
  onTokenDiperbarui?: (newToken: string) => Promise<void>,
): Promise<any> {
  switch (aksi) {
    case 'buat_wo':
      return await buatWorkOrder({ ...umum, ...d });
    case 'approve_l1':
      return await approveL1({ ...umum, ...d });
    case 'approve_l2':
      return await approveL2({ ...umum, ...d });
    case 'batal_wo':
      return await batalkanWo({ ...umum, ...d });
    case 'reject':
      return await tolakWo({ ...umum, ...d });
    case 'kembalikan':
      return await kembalikanKeMekanik({ ...umum, ...d });
    case 'save_override':
      return await simpanOverride({ ...umum, ...d });
    case 'kirim_kerja':
      return await kirimKerja({ ...umum, ...d });
    case 'minta_transfer':
      return await mintaTransfer({ ...umum, ...d });
    case 'setujui_transfer':
      return await setujuiTransfer({ ...umum, ...d });
    case 'tolak_transfer':
      return await tolakTransfer({ ...umum, ...d });
    case 'simpan_detail':
      return await simpanDetail({ ...umum, ...d });
    case 'koreksi_meter':
      return await koreksiMeterWo({ ...umum, ...d });
    case 'ganti_panel_meter':
      return await gantiPanelMeter({ ...umum, ...d });
    case 'admin_orang':
      return await simpanOrang({ ...umum, ...d });
    case 'admin_token': {
      const h = await terbitkanToken({ ...umum, ...d });
      if (d.mechanicId === aku.mechanicId && onTokenDiperbarui) {
        await onTokenDiperbarui(h.hasil.token);
      }
      return h;
    }
    case 'admin_token_cabut':
      return await cabutToken({ ...umum, ...d });
    case 'admin_job':
      return await simpanJob({ ...umum, ...d });
    case 'admin_unit':
      return await simpanUnit({ ...umum, ...d });
    case 'admin_hapus_job':
      return await hapusJob({ ...umum, ...d });
    case 'admin_hapus_unit':
      return await hapusUnit({ ...umum, ...d });
    case 'admin_faktor':
      return await simpanFaktor({ ...umum, ...d });
    case 'admin_tarif':
      return await simpanTarif({ ...umum, ...d });
    case 'admin_setelan':
      return await simpanSetelan({ ...umum, ...d });
    case 'impor_katalog':
      return await terapkanImpor({
        ...umum, jenis: d.jenis, sectionCode: d.sectionCode,
        baris: d.baris as never,
      });
    case 'terapkan_surut':
      return await terapkanSurut({ ...umum, ...d });
    case 'terapkan_faktor_surut':
      return await terapkanFaktorSurut({ ...umum, ...d });
    case 'terapkan_tarif_surut':
      return await terapkanTarifSurut({ ...umum, ...d });
    default:
      throw new Error(`Aksi "${aksi}" belum didukung pada backend Supabase`);
  }
}

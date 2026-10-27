import { panggilAppsScript } from './client.js';

/**
 * Meneruskan eksekusi perintah (mutasi data) ke Google Apps Script Web App.
 */
export async function handlePerintahAppsScript(
  aksi: string,
  data: any,
  opId: string,
  token: string | null | undefined,
): Promise<any> {
  let targetAction = aksi;
  let targetData = data;

  if (aksi === 'koreksi_meter') {
    const isKm = String(data?.jenis || '').toUpperCase() === 'KM';
    targetAction = isKm ? 'koreksiKmWo' : 'koreksiHmWo';
    targetData = {
      wo_id: data?.woId,
      [isKm ? 'km_baru' : 'hm_baru']: data?.nilaiBaru,
      alasan: data?.alasan,
    };
  } else if (aksi === 'ganti_panel_meter') {
    const isKm = String(data?.jenis || '').toUpperCase() === 'KM';
    targetAction = isKm ? 'gantiPanelKm' : 'gantiPanelHm';
    targetData = {
      unit_id: data?.unitId,
      [isKm ? 'km_baru' : 'hm_baru']: data?.nilaiBaru,
      berlaku_at: data?.berlakuAt,
      alasan: data?.alasan,
    };
  } else if (aksi === 'kirim_kerja') {
    targetAction = 'submit_work';
    targetData = {
      wo_id: data?.woId || data?.wo_id,
      start_time: data?.startTime || data?.start_time,
      end_time: data?.endTime || data?.end_time,
      part_category: data?.partCategory || data?.part_category || '',
      hour_meter: data?.hourMeter != null ? data.hourMeter : data?.hour_meter,
      kilometers: data?.kilometers != null ? data.kilometers : null,
      detail_tyre: data?.detailTyre || data?.detail_tyre || null,
    };
  } else if (aksi === 'minta_transfer') {
    targetAction = 'request_transfer';
    targetData = {
      wo_id: data?.woId || data?.wo_id,
      session_start_time: data?.sessionStart || data?.session_start_time,
      transfer_note: data?.note || data?.transfer_note || '',
    };
  } else if (aksi === 'setujui_transfer') {
    targetAction = 'approve_transfer';
    targetData = {
      wo_id: data?.woId || data?.wo_id,
      target_mechanic_ids: data?.penerima || data?.target_mechanic_ids || [],
    };
  } else if (aksi === 'tolak_transfer') {
    targetAction = 'reject_transfer';
    targetData = {
      wo_id: data?.woId || data?.wo_id,
      reason: data?.alasan || data?.reason || '',
    };
  }

  const res = await panggilAppsScript(token, targetAction, targetData, opId);
  if (!res.success) {
    throw new Error(res.error || `Operasi "${aksi}" ditolak oleh Google Apps Script`);
  }
  return res.result ?? res.data ?? { ok: true };
}

import fs from 'fs';
import { renderWebPage } from '../workers/sum/src/web-templates.js';

const mockCtx = {
  baseUrl: '/web',
  token: 'test-token',
  backToken: '',
  activeFilter: 'assigned',
  user: {
    role: 'mechanic',
    name: 'Adi Setiawan',
    email: 'adi@sum.com',
    mechanic_name: 'Adi Setiawan',
    mechanic_id: 'MECH-01'
  },
  initialData: {
    wos: [
      {
        id: 'WO-20261111-0001',
        wo_number: 'WO-20261111-0001',
        status: 'assigned', // lowercase assigned
        status_group: 'assigned',
        status_label: 'Perlu Diisi Mekanik',
        component_name: 'Penambahan Angin/Oli',
        unit_name: 'XTN05',
        target_hours: 2,
        team_count: 1,
        team: [{ name: 'Adi Setiawan' }],
        location: 'workshop'
      }
    ],
    counts: { all: 1, assigned: 1, in_progress: 0, pending_approval: 0, done: 0 },
    activeFilter: 'assigned',
    viewing_as: null,
    mechanic: { name: 'Adi Setiawan' }
  }
};

const html = renderWebPage('mechanic', mockCtx);

console.log('HTML generated length:', html.length);
console.log('Contains "Perlu Diisi Mekanik":', html.includes('Perlu Diisi Mekanik'));
console.log('Contains "✍️ Isi Manual":', html.includes('✍️ Isi Manual'));
console.log('Contains "📮 Kirim":', html.includes('📮 Kirim'));
console.log('Contains "⏱️ LIVE TIMER REKAM WAKTU":', html.includes('⏱️ LIVE TIMER REKAM WAKTU'));
console.log('Contains "slotStartTime":', html.includes('slotStartTime'));
console.log('Contains "slotEndTime":', html.includes('slotEndTime'));
console.log('Contains "dtHtml":', html.includes('dtHtml'));
console.log('Contains "Catatan bila WO dioper ke shift berikutnya (opsional)":', html.includes('Catatan bila WO dioper ke shift berikutnya (opsional)'));
console.log('Contains "🔄 Transfer ke Shift Berikutnya":', html.includes('🔄 Transfer ke Shift Berikutnya'));
console.log('Contains "kirimLangsung":', html.includes('kirimLangsung'));
console.log('Contains "submitWork":', html.includes('submitWork'));


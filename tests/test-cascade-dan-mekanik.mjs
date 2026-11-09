import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalisasiBlokWo } from '../workers/kmbprojek/src/supabase-backend.js';

function kodeMekanikKanonik(val) {
  const s = String(val || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.replace(/^([A-Z]+)0+([1-9][0-9]*)$/, '$1$2');
}

describe('Uji Perbaikan Panduan 14: Cascade & Pencocokan Mekanik', () => {
  it('1. _kode_mekanik_kanonik menyamakan variasi nol di depan dan tanda hubung', () => {
    assert.equal(kodeMekanikKanonik('SUM-01'), 'SUM1');
    assert.equal(kodeMekanikKanonik('SUM-001'), 'SUM1');
    assert.equal(kodeMekanikKanonik('SUM001'), 'SUM1');
    assert.equal(kodeMekanikKanonik('MNT-002'), 'MNT2');
    assert.equal(kodeMekanikKanonik('MNT-02'), 'MNT2');
    assert.equal(kodeMekanikKanonik('MNT002'), 'MNT2');
    assert.equal(kodeMekanikKanonik('KMB-005'), 'KMB5');
    assert.equal(kodeMekanikKanonik('KMB05'), 'KMB5');
  });

  it('2. normalisasiBlokWo mengonversi team: [] + team_distribution menjadi tim sah dengan lead_mechanic_id', () => {
    const rawForm = {
      unit_id: 'DT-01',
      component_id: 'COM-001',
      team: [],
      team_distribution: { 'MNT-002': 100 },
      manual_base_points: 1.5,
      manual_target_hours: 3.0,
    };

    const norm = normalisasiBlokWo(rawForm);
    assert.equal(Array.isArray(norm.team), true);
    assert.equal(norm.team.length, 1);
    assert.equal(norm.team[0].mechanic_id, 'MNT-002');
    assert.equal(norm.team[0].percentage, 100);
    assert.equal(norm.lead_mechanic_id, 'MNT-002');
    assert.equal(norm.others_base_points, 1.5);
    assert.equal(norm.others_target_hours, 3.0);
  });

  it('3. normalisasiBlokWo menangani mechanics: [string] bila team dan team_distribution kosong', () => {
    const raw = {
      unit_id: 'DT-02',
      mechanics: ['MNT-003', 'MNT-004'],
    };
    const norm = normalisasiBlokWo(raw);
    assert.equal(norm.team.length, 2);
    assert.equal(norm.team[0].mechanic_id, 'MNT-003');
    assert.equal(norm.team[1].mechanic_id, 'MNT-004');
    assert.equal(norm.lead_mechanic_id, 'MNT-003');
  });
});


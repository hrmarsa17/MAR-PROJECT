#!/usr/bin/env node
/**
 * Uji logika tambalan "tutup GAS" (tools/kembar/tambal-tutup-gas.mjs) pada folder kode GAS yang sudah ditambal:
 * _TutupGas.js + _PenjagaRun.js dari folder itu, ditambah doGet/doPost mini yang disisipi baris tutup-gas oleh
 * alat yang sama, dijalankan dengan layanan Google tiruan (pintu, CacheService, Script Properties).
 * Yang diuji (14 pemeriksaan): posisi gas = semua normal dan pintu ditanya sekali per 30 detik; supabase, menutup,
 * membuka = doGet/doPost/fungsi publik tertutup dan posisi terakhir disimpan; pintu mati tanpa riwayat = tetap terbuka;
 * pintu mati dengan riwayat supabase = tetap tertutup; kembali ke gas = terbuka lagi sesudah 30 detik.
 *
 * Pemakaian: node tools/kembar/uji-tutup-gas.mjs <folder bertambalan>
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { tambalEntri } from './tambal-tutup-gas.mjs';

export function ujiTutupGas(folder, cetak = () => {}) {
  const tutup = fs.readFileSync(path.join(folder, '_TutupGas.js'), 'utf8');
  const penjaga = fs.readFileSync(path.join(folder, '_PenjagaRun.js'), 'utf8');
  const rumah = (tutup.match(/var TUTUP_GAS_RUMAH_ = "([^"]+)"/) || [])[1];
  let mini = `function doGet(e) { if (typeof masukSah_ === 'function') masukSah_();\n  return 'HALAMAN-NORMAL';\n}\n`
    + `function doPost(e) { if (typeof masukSah_ === 'function') masukSah_();\n  return 'API-NORMAL';\n}\n`
    + `function approveL1(arg) { if (typeof wajibMasukSah_ === 'function') wajibMasukSah_(arguments[0]);\n  return 'TULIS-JALAN';\n}\n`;
  mini = tambalEntri(mini, 'doGet', 'web').isi;
  mini = tambalEntri(mini, 'doPost', 'api').isi;

  let lulus = 0, gagal = 0;
  const cek = (nama, ok, info = '') => { if (ok) lulus++; else gagal++; cetak(`${ok ? 'LULUS' : 'GAGAL'} ${nama}${info ? ' — ' + info : ''}`); };
  // Satu "eksekusi GAS" = konteks baru, dengan Cache/Properties yang bertahan antar-eksekusi.
  function eksekusi(dunia, kerja) {
    const ctx = {
      console,
      UrlFetchApp: { fetch: () => { dunia.fetch++; if (dunia.pintu === 'mati') throw new Error('DNS'); return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ success: true, switches: { [rumah]: dunia.pintu, lain: 'gas' } }) }; } },
      CacheService: { getScriptCache: () => ({ get: (k) => (dunia.cache[k] && dunia.cache[k].sampai > dunia.jam ? dunia.cache[k].v : null), put: (k, v, s) => { dunia.cache[k] = { v, sampai: dunia.jam + s * 1000 }; } }) },
      PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => dunia.prop[k] || null, setProperty: (k, v) => { dunia.prop[k] = v; } }) },
      HtmlService: { createHtmlOutput: (h) => ({ jenis: 'html', h, setTitle(t) { this.judul = t; return this; } }) },
      ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ jenis: 'teks', t, setMimeType(m) { this.mime = m; return this; } }) },
      Session: { getActiveUser: () => ({ getEmail: () => '' }) },
      ScriptApp: { getProjectTriggers: () => [] },
    };
    vm.createContext(ctx);
    vm.runInContext(penjaga + '\n' + tutup + '\n' + mini, ctx);
    return kerja(ctx);
  }
  const dunia = (pintu) => ({ pintu, fetch: 0, cache: {}, prop: {}, jam: 0 });
  const lempar = (f) => { try { return { nilai: f() }; } catch (e) { return { galat: e.message }; } };

  {
    const d = dunia('gas');
    cek('gas: doGet normal', eksekusi(d, (g) => g.doGet({})) === 'HALAMAN-NORMAL');
    cek('gas: doPost normal', eksekusi(d, (g) => g.doPost({})) === 'API-NORMAL');
    const r = eksekusi(d, (g) => lempar(() => g.approveL1({ triggerUid: 'x' })));
    cek('gas: fungsi publik tidak ditolak tutup-gas', !r.galat || !/pindah ke abadiops/.test(r.galat), r.galat || 'jalan');
    cek('gas: cache dipakai (pintu ditanya sekali dalam 30 detik)', d.fetch === 1, `fetch=${d.fetch}`);
  }
  {
    const d = dunia('supabase');
    const w = eksekusi(d, (g) => g.doGet({}));
    cek('supabase: doGet = halaman pindah', w && w.jenis === 'html' && /pindah ke abadiops/.test(w.h) && /https:\/\/abadiops\.com/.test(w.h));
    const a = eksekusi(d, (g) => g.doPost({}));
    cek('supabase: doPost = JSON galat', a && a.jenis === 'teks' && a.mime === 'json' && JSON.parse(a.t).success === false);
    const r = eksekusi(d, (g) => lempar(() => g.approveL1({})));
    cek('supabase: fungsi publik ditolak', /pindah ke abadiops/.test(r.galat || ''), r.galat);
    cek('supabase: posisi terakhir disimpan', d.prop.TUTUP_GAS_POSISI === 'supabase');
  }
  for (const pos of ['menutup', 'membuka']) {
    const d = dunia(pos);
    cek(`${pos}: doGet tertutup`, eksekusi(d, (g) => g.doGet({})).jenis === 'html');
  }
  {
    const d = dunia('mati');
    cek('pintu mati, tanpa riwayat: doGet normal', eksekusi(d, (g) => g.doGet({})) === 'HALAMAN-NORMAL');
  }
  {
    const d = dunia('supabase');
    eksekusi(d, (g) => g.doGet({}));
    d.pintu = 'mati'; d.jam += 60 * 1000;
    cek('pintu mati, riwayat supabase: doGet tetap tertutup', eksekusi(d, (g) => g.doGet({})).jenis === 'html');
  }
  {
    const d = dunia('supabase');
    eksekusi(d, (g) => g.doGet({}));
    d.pintu = 'gas'; d.jam += 31 * 1000;
    cek('kembali ke gas: setelah 30 detik doGet normal lagi', eksekusi(d, (g) => g.doGet({})) === 'HALAMAN-NORMAL');
    cek('kembali ke gas: riwayat diperbarui', d.prop.TUTUP_GAS_POSISI === 'gas');
  }
  return { rumah, lulus, gagal };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const h = ujiTutupGas(process.argv[2], console.log);
  console.log(`HASIL ${h.rumah}: ${h.lulus} lulus, ${h.gagal} gagal`);
  if (h.gagal) process.exitCode = 1;
}

#!/usr/bin/env node
/**
 * Siapkan (dan bila diminta, kirim) tambalan "tutup GAS" satu rumah dengan aman (docs/SAKLAR.md, Tonggak 2):
 *   1. clone HEAD script rumah itu dan versi yang sedang ter-deploy (config/rumah.json <kamar>.gas.versi) ke folder
 *      sementara DI LUAR repo (repo publik), lalu pastikan keduanya IDENTIK — kalau HEAD berisi suntingan editor yang
 *      belum ter-deploy, alat berhenti supaya push tidak menimpanya;
 *   2. pasang tambalan (tools/kembar/tambal-tutup-gas.mjs) di salinan HEAD; perbedaannya harus persis _TutupGas.js baru
 *      + satu sisipan di doGet, doPost, dan wajibMasukSah_;
 *   3. uji logika (tools/kembar/uji-tutup-gas.mjs), harus 14/14;
 *   4. hanya dengan --push: `clasp push --force` dari salinan itu, lalu clone ulang HEAD dan pastikan isinya sama dengan
 *      yang dikirim. Push hanya mengubah HEAD (dipakai pemicu terjadwal); web app/API berubah sesudah Gabriel men-deploy
 *      versi baru dari editor (Manage deployments → pensil → Version: New version → Deploy). JANGAN `clasp deploy`.
 * Tambalan tidur selama saklar rumah itu `gas`.
 *
 * Pemakaian: node tools/kembar/siapkan-tutup-gas.mjs --kamar=kmbbupr [--push] [--folder=<folder kerja>]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tambalFolder } from './tambal-tutup-gas.mjs';
import { ujiTutupGas } from './uji-tutup-gas.mjs';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = Object.fromEntries(process.argv.slice(2).map((a) => {
  const i = a.indexOf('=');
  return i < 0 ? [a.replace(/^--/, ''), true] : [a.slice(2, i), a.slice(i + 1)];
}));
const URL_PINTU = 'https://abadiops.com';
if (!arg.kamar) throw new Error('--kamar wajib');
const profil = JSON.parse(fs.readFileSync(path.join(AKAR, 'config/rumah.json'), 'utf8'))[arg.kamar];
if (!profil || !profil.gas || !profil.gas.script || !profil.gas.versi) throw new Error(`config/rumah.json ${arg.kamar}.gas belum lengkap`);
const { script, versi } = profil.gas;

const clasp = (cwd, ...a) => {
  const r = spawnSync('clasp', a, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error(`clasp ${a.join(' ')} gagal (${r.status}): ${(r.stderr || r.stdout || '').slice(-300)}`);
  return r.stdout;
};
const daftar = (dir) => fs.readdirSync(dir).filter((f) => f !== '.clasp.json').sort();
const sama = (a, b) => daftar(a).join() === daftar(b).join() && daftar(a).every((f) => fs.readFileSync(path.join(a, f), 'utf8') === fs.readFileSync(path.join(b, f), 'utf8'));

const kerja = arg.folder || fs.mkdtempSync(path.join(os.tmpdir(), `tutup-gas-${arg.kamar}-`));
const kepala = path.join(kerja, 'head'), terpasang = path.join(kerja, `v${versi}`), tambal = path.join(kerja, 'tambal');
for (const d of [kepala, terpasang, tambal]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
clasp(kepala, 'clone', script);
clasp(terpasang, 'clone', script, String(versi));
if (!sama(kepala, terpasang)) throw new Error(`HEAD ${arg.kamar} BERBEDA dari versi ter-deploy @${versi}: ada suntingan editor yang belum ter-deploy. Berhenti.`);
console.log(`${arg.kamar}: HEAD identik dengan @${versi} (${daftar(kepala).length} berkas)`);

for (const f of fs.readdirSync(kepala)) fs.copyFileSync(path.join(kepala, f), path.join(tambal, f));
const laporan = tambalFolder(tambal, arg.kamar, URL_PINTU);
console.log(`tambalan: ${laporan.join('; ')}`);
const baru = daftar(tambal).filter((f) => !daftar(kepala).includes(f));
const berubah = daftar(kepala).filter((f) => fs.readFileSync(path.join(kepala, f), 'utf8') !== fs.readFileSync(path.join(tambal, f), 'utf8'));
if (baru.join() !== '_TutupGas.js' || berubah.some((f) => !['Router.js', '_PenjagaRun.js'].includes(f))) {
  throw new Error(`perbedaan tak terduga: baru [${baru}] berubah [${berubah}]`);
}
const u = ujiTutupGas(tambal);
console.log(`uji logika: ${u.lulus} lulus, ${u.gagal} gagal (rumah ${u.rumah})`);
if (u.gagal || u.rumah !== arg.kamar) throw new Error('uji logika tambalan gagal');

if (!arg.push) {
  console.log(`SIAP, belum dikirim. Folder bertambalan: ${tambal}\nKirim dengan --push (perlu persetujuan Gabriel), lalu Gabriel men-deploy versi baru dari editor.`);
} else {
  clasp(tambal, 'push', '--force');
  const cek = path.join(kerja, 'cek');
  fs.rmSync(cek, { recursive: true, force: true }); fs.mkdirSync(cek, { recursive: true });
  clasp(cek, 'clone', script);
  if (!sama(cek, tambal)) throw new Error('HEAD sesudah push tidak sama dengan yang dikirim — periksa di editor.');
  console.log(`TERKIRIM ke HEAD ${arg.kamar} dan diverifikasi lewat clone ulang. Langkah berikut (Gabriel): Deploy versi baru dari editor.`);
}

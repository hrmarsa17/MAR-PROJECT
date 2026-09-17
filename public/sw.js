/* eslint-disable */
/**
 * ════════════════════════════════════════════════════════════════════════════
 * SERVICE WORKER MAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ditulis tangan, mengikuti `mar-offline/sw.js` milik KMB V2 — yang sudah
 * sampai cache ke-88 di lapangan. Setiap pilihan aneh di bawah adalah
 * pelajaran yang dibayar di sana, bukan selera.
 *
 * ── SATU HAL YANG BERBEDA DARI V2 ───────────────────────────────────────────
 * V2 menyimpan token di IndexedDB karena GAS menaruh token di BADAN
 * permintaan. Di sini identitas dibawa cookie httpOnly, dan `fetch` ke origin
 * yang sama membawanya sendiri — termasuk dari dalam berkas ini. Jadi tidak
 * ada token di mana pun yang bisa dibaca skrip halaman.
 *
 * ── DAN SATU HAL YANG BERBEDA KARENA INI NEXT.JS ────────────────────────────
 * V2 adalah aplikasi statis, jadi ia bisa cache-first untuk semua GET. Di sini
 * halaman dirender server dan isinya milik ORANG TERTENTU. Cache-first akan
 * menyuguhkan halaman orang lain sesudah berganti akun di HP yang sama. Maka:
 * aset statis cache-first, navigasi network-first, dan cache dibuang saat
 * keluar.
 */

var CACHE = 'mar-v1';

/* Hanya yang benar-benar statis dan bukan milik siapa-siapa. Halaman TIDAK
   ikut: isinya bergantung siapa yang masuk. */
/* DUA manifest, karena ada dua pintu masuk: `/` (tampilan lengkap) dan
   `/lapangan` (aplikasi lapangan, ikon sendiri di layar depan HP). Keduanya
   harus ikut tersimpan — manifest yang gagal dimuat membuat aplikasi yang sudah
   terpasang kehilangan nama dan ikonnya. */
var ASET = [
  './manifest.json', './lapangan.webmanifest',
  './luring.html', './icon-192.png', './icon-512.png',
];

self.addEventListener('install', function (e) {
  /* cache:'reload' — WAJIB, dan ini pelajaran mahal dari V2: `addAll()` memakai
     cache HTTP biasa, jadi berkas bisa terambil versi basi sementara nama
     cache sudah versi baru. Akibatnya label versi mengaku baru padahal kode
     yang jalan lama, dan tidak ada satu pun cara menyadarinya dari layar. */
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(
        ASET.map(function (u) {
          return fetch(new Request(u, { cache: 'reload' }))
            .then(function (r) { return c.put(u, r); })
            .catch(function () { /* satu aset hilang tidak boleh menggagalkan pemasangan */ });
        }),
      );
    }),
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; })
          .map(function (k) { return caches.delete(k); }),
      );
    }),
  );
  self.clients.claim();
});

/* ── Antrean: dibaca langsung dari IndexedDB yang sama dengan halaman ──────
   Nama dan bentuknya harus tetap sejalan dengan src/pwa/simpanan.ts. */
function bukaDb() {
  return new Promise(function (res, rej) {
    var r = indexedDB.open('mar_v1', 1);
    r.onsuccess = function () { res(r.result); };
    r.onerror = function () { rej(r.error); };
  });
}

function minta(d, store, mode, fn) {
  return new Promise(function (res, rej) {
    var rq = fn(d.transaction(store, mode).objectStore(store));
    rq.onsuccess = function () { res(rq.result); };
    rq.onerror = function () { rej(rq.error); };
  });
}

/**
 * @param {string} isi teks notifikasi
 * @param {string=} tag penanda. Notifikasi ber-tag SAMA saling MENIMPA.
 *
 * Di V2 tag pernah selalu `'mar-' + isi.slice(0,16)`. Enam belas huruf pertama
 * pesan antrean approver dan pesan WO baru mekanik SELALU sama, jadi setiap
 * kabar menimpa kabar sebelumnya: dua WO datang berurutan, yang terlihat hanya
 * yang terakhir. Sejak itu tag disebut TERANG-TERANGAN di tiap pemanggil.
 */
function kabari(isi, tag) {
  try {
    if (self.Notification && Notification.permission === 'granted') {
      return self.registration.showNotification('MAR', {
        body: isi,
        icon: './icon-192.png',
        badge: './icon-192.png',
        tag: tag || ('mar-' + isi.replace(/\s+/g, ' ')),
      });
    }
  } catch (e) { /* notifikasi tidak diizinkan — bukan alasan gagal */ }
  return Promise.resolve();
}

function kosongkanAntrean() {
  var terkirim = 0;
  var adaRamai = false;
  return bukaDb().then(function (d) {
    /* SIAPA yang sedang masuk. Berkas ini mengosongkan antrean TANPA lewat
       src/pwa/kirim.ts, jadi penyaringan pemiliknya harus ada di sini juga.
       Kalau tidak, background sync mengirim antrean orang sebelumnya lewat
       cookie orang yang sekarang -- justru saat aplikasinya tertutup dan tak
       seorang pun melihat layarnya. */
    return minta(d, 'kv', 'readonly', function (s) { return s.get('aku'); })
      .then(function (aku) {
    var punyaku = (aku && aku.mechanicId) ? aku.mechanicId : null;
    return minta(d, 'outbox', 'readonly', function (s) { return s.getAll(); })
      .then(function (semua) {
        var antre = (semua || []).filter(function (i) {
          if (i.status !== 'antre') return false;
          // Tak bertuan ikut terkirim; milik orang lain tidak.
          // Lihat ItemOutbox.milik di src/pwa/simpanan.ts.
          if (punyaku === null || i.milik === undefined) return true;
          return i.milik === punyaku;
        });
        antre.sort(function (a, b) { return a.dibuat_at < b.dibuat_at ? -1 : 1; });

        var rantai = Promise.resolve();
        antre.forEach(function (it) {
          rantai = rantai.then(function () {
            return fetch('/api/perintah', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              /* Cookie httpOnly ikut sendiri untuk origin yang sama. Disebut
                 eksplisit supaya niatnya terbaca, bukan kebetulan. */
              credentials: 'same-origin',
              body: JSON.stringify({ aksi: it.aksi, op_id: it.op_id, data: it.data }),
            })
              .then(function (r) { return r.json(); })
              .then(function (j) {
                if (j.ok) {
                  it.status = 'terkirim';
                  it.hasil = j.data;
                  terkirim++;
                } else if (j.boleh_coba_lagi) {
                  /* Server sedang sibuk. Itu BUKAN penolakan — tetap antre. */
                  adaRamai = true;
                } else {
                  it.status = 'gagal';
                  it.galat = typeof j.pesan === 'string' ? j.pesan : 'Ditolak server';
                }
                it.percobaan = (it.percobaan || 0) + 1;
                return minta(d, 'outbox', 'readwrite', function (s) { return s.put(it); });
              });
            /* fetch gagal (masih luring) → promise reject → rantai putus →
               status tetap 'antre' → peramban menjadwalkan ulang sendiri. */
          });
        });

        return rantai
          .then(function () {
            if (terkirim > 0) return kabari('✅ ' + terkirim + ' operasi terkirim — tidak lagi antre');
          })
          /* Server ramai: galat SENGAJA dilempar supaya peramban menjadwalkan
             ulang background sync-nya. Tanpa ini event 'sync' dianggap sukses,
             tidak ada percobaan berikutnya, dan pekerjaannya menganggur sampai
             seseorang kebetulan membuka aplikasi. */
          .then(function () { if (adaRamai) throw new Error('server ramai — dicoba lagi'); })
          .catch(function (err) {
            var p = terkirim > 0
              ? kabari('✅ ' + terkirim + ' operasi terkirim — sisanya menunggu sinyal')
              : Promise.resolve();
            return p.then(function () { throw err; });
          });
      });
      });
  });
}

/**
 * Kabar perubahan WO, lewat diff terhadap potret terakhir (`kv.sw_snap`).
 * Jalan pertama menyimpan senyap, tanpa notifikasi — kalau tidak, orang yang
 * baru memasang aplikasi langsung dihujani kabar atas hal yang sudah lama ada.
 */
function periksaPerubahan() {
  return bukaDb().then(function (d) {
    return minta(d, 'kv', 'readonly', function (s) { return s.get('aku'); }).then(function (aku) {
      if (!aku) return 0;
      var approver = aku.peran !== 'mechanic';
      var jenis = approver ? 'antrean' : 'wo_saya';

      return fetch('/api/data?jenis=' + jenis, { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          /* `antreanApproval` dan `woSaya` sama-sama mengembalikan ARRAY polos
             (src/domain/kueri.ts:40,83), jadi `jawab()` membungkusnya jadi
             `{ok, data: [...]}` — bukan objek berisi daftar.

             Baris ini sempat berbunyi `j.data.kartu || j.data.antrean || []`
             untuk approver. Pada array, keduanya undefined, jadi hasilnya
             selalu daftar KOSONG: approver tidak akan pernah mendapat satu pun
             kabar, dan tidak ada galat yang muncul di mana pun karena daftar
             kosong adalah keadaan yang sah. Jalur mekanik kebetulan selamat
             karena cadangan terakhirnya memang `j.data`. */
          if (!j.ok || !Array.isArray(j.data)) return 0;
          var daftar = j.data;

          var kini = {};
          daftar.forEach(function (w) {
            kini[String(w.id)] = { s: String(w.status), n: String(w.woNumber || w.wo_number || w.id) };
          });

          return minta(d, 'kv', 'readonly', function (s) { return s.get('sw_snap'); })
            .then(function (dulu) {
              var simpan = function () {
                return minta(d, 'kv', 'readwrite', function (s) { return s.put(kini, 'sw_snap'); });
              };
              if (!dulu) return simpan().then(function () { return 0; });

              var pesan = [];
              for (var id in kini) {
                if (!dulu[id]) {
                  /* "masuk antrean", bukan "perlu Anda approve". Antreannya
                     dipegang bersama — kalimat perintah membuat approver merasa
                     ditugasi secara pribadi, lalu merasa gagal saat rekannya
                     lebih dulu menanganinya. */
                  if (approver) pesan.push('📋 WO masuk antrean: ' + kini[id].n);
                  else pesan.push('📝 WO baru: ' + kini[id].n);
                } else if (dulu[id].s !== kini[id].s) {
                  if (kini[id].s === 'approved') pesan.push('✅ ' + kini[id].n + ' disetujui');
                  else if (kini[id].s === 'rejected') pesan.push('❌ ' + kini[id].n + ' ditolak');
                }
              }

              var p = Promise.resolve();
              if (pesan.length) {
                var isi = pesan.slice(0, 3).join('\n')
                  + (pesan.length > 3 ? '\n+' + (pesan.length - 3) + ' lainnya' : '');
                /* Antrean approver: SATU kabar yang berdiri dan selalu
                   mutakhir, sengaja saling menimpa supaya tidak menumpuk.
                   Kabar lain berdiri sendiri-sendiri. */
                p = kabari(isi, approver ? 'mar-antrean' : undefined);
              }

              /* Menarik kembali kabar approver yang sudah basi.
                 Antrean approval dipegang beberapa orang sekaligus. Semua
                 dapat kabar bersamaan; begitu satu menanganinya, kabar di HP
                 yang lain jadi basi — dan orang itu membuka aplikasi, tidak
                 menemukan apa pun, lalu merasa lalai atas pekerjaan yang
                 sebenarnya sudah beres.

                 HANYA approver. Kabar "✅ disetujui" milik mekanik justru harus
                 bertahan: WO-nya memang sudah keluar dari daftar, dan itulah
                 kabar baik yang ingin ia lihat. */
              if (approver) {
                var masihAktif = {};
                for (var k in kini) masihAktif[kini[k].n] = true;
                p = p.then(function () {
                  return self.registration.getNotifications().then(function (daftarNotif) {
                    daftarNotif.forEach(function (n) {
                      var nomor = String(n.body || '').match(/WO-[0-9A-Za-z-]+/g);
                      if (!nomor) return;
                      var ada = nomor.some(function (x) { return masihAktif[x]; });
                      if (!ada) n.close();
                    });
                  }).catch(function () {});
                });
              }

              return p.then(simpan).then(function () { return pesan.length; });
            });
        });
    });
  }).catch(function () { return 0; });
}

/* Background Sync — HANYA ada di Chrome/Android. Di iOS tidak pernah menyala,
   dan di sana antrean bergerak karena halaman memanggilnya saat dibuka. */
self.addEventListener('sync', function (e) {
  if (e.tag === 'mar-outbox') e.waitUntil(kosongkanAntrean().then(periksaPerubahan));
});

self.addEventListener('periodicsync', function (e) {
  if (e.tag === 'mar-periksa') e.waitUntil(kosongkanAntrean().then(periksaPerubahan));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) if ('focus' in list[i]) return list[i].focus();
      if (clients.openWindow) return clients.openWindow('/');
    }),
  );
});

/* Halaman menyuruh membuang cache saat KELUAR. Tanpa ini, halaman hasil render
   milik orang sebelumnya masih tersimpan, dan orang berikutnya di HP yang sama
   bisa melihatnya saat luring. */
self.addEventListener('message', function (e) {
  if (e.data === 'buang-cache') {
    e.waitUntil(caches.keys().then(function (k) {
      return Promise.all(k.map(function (n) { return caches.delete(n); }));
    }));
  }
});

/**
 * Menahan cache aset supaya tidak tumbuh selamanya.
 *
 * `caches.keys()` mengembalikan permintaan menurut URUTAN MASUK, jadi yang
 * paling depan adalah yang paling lama tersimpan. Yang dibuang hanya aset
 * `/_next/static/` — halaman yang tersimpan TIDAK PERNAH disentuh, karena
 * justru itulah yang membuat layar bisa dibuka tanpa sinyal.
 *
 * 150 cukup untuk beberapa penerapan sekaligus; lebih dari itu berarti potongan
 * dari versi yang tak seorang pun pakai lagi.
 */
var BATAS_ASET = 150;
function pangkasAset(c) {
  return c.keys().then(function (semua) {
    var aset = semua.filter(function (r) {
      return new URL(r.url).pathname.indexOf('/_next/static/') === 0;
    });
    var lebih = aset.length - BATAS_ASET;
    if (lebih <= 0) return;
    return Promise.all(aset.slice(0, lebih).map(function (r) { return c.delete(r); }));
  }).catch(function () { /* pemangkasan gagal bukan alasan menggagalkan permintaan */ });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* API tidak pernah disimpan di sini. Data luring dipegang IndexedDB oleh
     lapisan aplikasi, yang tahu mana yang boleh basi dan mana yang tidak.
     Cache HTTP tidak tahu apa-apa soal itu dan akan menyuguhkan antrean
     approval basi seolah mutakhir. */
  if (url.pathname.indexOf('/api/') === 0) return;

  /* Berkas Next ber-hash isi: namanya berubah setiap isinya berubah, jadi yang
     tersimpan tidak pernah basi -- TAPI ia juga tidak pernah berhenti bertambah.
     Tiap penerapan baru melahirkan nama baru, dan yang lama tetap duduk di cache
     sampai nama CACHE-nya sendiri berganti.

     KMB V2 menghindarinya dengan menaikkan nomor tiap rilis (`mar-v88`), lalu
     `activate` membuang yang lama. Di sini nomornya TETAP, jadi tanpa
     pemangkasan potongan JS dari setiap versi yang pernah dibuka menumpuk
     selamanya.

     Itu bukan sekadar boros. Cache Storage dan IndexedDB berbagi kuota origin
     yang SAMA, dan saat peramban kehabisan ruang ia membuang seluruh penyimpanan
     origin itu -- termasuk OUTBOX. Jam kerja yang belum terkirim bisa hilang
     karena potongan JS dari sepuluh penerapan lalu tidak pernah dibuang. */
  if (url.pathname.indexOf('/_next/static/') === 0) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        return hit || fetch(req).then(function (r) {
          var salinan = r.clone();
          caches.open(CACHE).then(function (c) {
            return c.put(req, salinan).then(function () { return pangkasAset(c); });
          });
          return r;
        });
      }),
    );
    return;
  }

  /* Navigasi: JARINGAN DULU. Halaman dirender server dan isinya milik orang
     tertentu — menyuguhkan yang tersimpan lebih dulu berarti menampilkan
     keadaan yang sudah lewat kepada orang yang punya sinyal. Yang tersimpan
     hanya dipakai kalau jaringannya memang tidak ada. */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (r) {
        var salinan = r.clone();
        caches.open(CACHE).then(function (c) { c.put(req, salinan); });
        return r;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match('./luring.html');
        });
      }),
    );
  }
});

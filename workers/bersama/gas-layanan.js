/**
 * Layanan Google tiruan untuk menjalankan kode Google Apps Script ASLI sebuah rumah di luar Google:
 * di Worker Cloudflare (workers/<rumah>) dan di komputer kerja sebagai pembanding uji kembar
 * (tools/kembar/gas-lokal.mjs). Satu berkas untuk keduanya, supaya yang diuji di komputer kerja sama
 * dengan yang tayang.
 *
 * Datanya cermin Supabase (public.cermin_baca, db/bersama/cermin_baca.sql): satu sheet = header + baris
 * nilai, bentuknya sama dengan getDataRange().getValues(). Sel di kolom bertipe tanggal menjadi Date.
 *
 *   SpreadsheetApp     sheet dari cermin. Tulisan hanya ke memori dan dicatat di __CATAT.tulis.
 *                      Sheet yang tidak dicermin atau tidak dimuat tampil kosong, dan setiap pembacaannya
 *                      dicatat di __CATAT.baca_dilewati: jawaban yang memakainya tidak boleh dipercaya.
 *   Date               berzona skrip (appsscript.json timeZone). Di GAS, getHours(), getDate(),
 *                      new Date(th, bl, tg), dan parse waktu lokal memakai zona skrip; Worker selalu UTC.
 *   CacheService       kosong di awal setiap panggilan: jawaban = isi sheet, seperti GAS tanpa cache.
 *   PropertiesService  kosong. Lock selalu didapat. Utilities.formatDate memakai zona yang diminta.
 *   SpreadsheetApp.create  spreadsheet baru di MEMORI (payroll, PayrollService.gs): tidak dicermin, tidak ikut
 *                      __ekspor, dan hilang setelah panggilan. Isinya diambil sebagai XLSX lewat alamat ekspor
 *                      docs.google.com yang sama dengan di GAS (UrlFetchApp di bawah), disusun host.xlsx
 *                      (workers/bersama/xlsx.js) meniru ekspor Google. Teks yang ditulis diurai seperti Google
 *                      mengurai ketikan (spreadsheet baru berlokal en_US): "28 Sep 2026" dan "07:00" menjadi
 *                      tanggal/jam, "05 Okt 2026" tetap teks — sama dengan berkas payroll asli.
 *   UrlFetchApp        hanya ekspor XLSX spreadsheet baru di memori; alamat lain tidak tersedia.
 *   DriveApp           hanya berkas spreadsheet baru di memori (moveTo, addViewer: tanpa efek, tidak ada Drive)
 *                      dan getFoldersByName/createFolder tiruan; selebihnya tidak tersedia.
 *   GmailApp, HtmlService, Browser tidak tersedia: panggilannya dicatat dan dijawab galat. MailApp.sendEmail
 *                      dicatat tanpa mengirim.
 *
 * buatLayanan dan buatPermintaanPost harus berdiri sendiri (tidak merujuk apa pun di luar badannya),
 * karena gas-lokal menjalankannya di konteks vm lewat toString().
 */

/**
 * @param D    { zonaSkrip, zonaSheet, judul, dilewati: [nama sheet], sheets: { nama: { headers, tanggal, rows }
 *             | { tidak_dimuat: true } } }
 * @param host { uuid(), digest(alg, isiJson) → JSON byte bertanda, b64(isiJson, websafe) → string }
 * @returns    objek layanan yang dipasang sebagai variabel global kode GAS, ditambah __CATAT.
 */
export function buatLayanan(D, host) {
  var NativeDate = Date;
  // tidak_aman: operasi pada sheet jarang yang tidak bisa dijawab dari baris yang dimuat. Worker menolak.
  var CATAT = { tulis: [], tak_dikenal: [], baca_dilewati: [], tidak_aman: [], dibaca: [], layanan: [], log: [] };
  // Penanda baris sheet jarang yang tidak dikirim server (cermin_baca p_jarang).
  var TIDAK_DIMUAT = { tidakDimuat: true };
  var ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  var ZONA = D.zonaSkrip;

  function catatSekali(daftar, isi) { if (daftar.indexOf(isi) === -1) daftar.push(isi); }
  function catatLog(args) {
    if (CATAT.log.length >= 400) return;
    CATAT.log.push([].slice.call(args).map(function (x) {
      try { return typeof x === 'string' ? x : JSON.stringify(x); } catch (e) { return String(x); }
    }).join(' ').slice(0, 300));
  }
  // Metode yang tidak ditiru tetap bisa dipanggil (dan dirantai), tapi namanya dicatat untuk diperiksa.
  function tanpaDikenal(nama, obj) {
    return new Proxy(obj, {
      get: function (t, p) {
        if (p in t) return t[p];
        if (typeof p === 'symbol' || p === 'then' || p === 'toJSON') return undefined;
        return function () { catatSekali(CATAT.tak_dikenal, nama + '.' + String(p)); return this; };
      },
    });
  }
  function tidakTersedia(nama) {
    return new Proxy({}, {
      get: function (t, p) {
        if (typeof p === 'symbol' || p === 'then' || p === 'toJSON') return undefined;
        return function () { catatSekali(CATAT.layanan, nama + '.' + String(p)); throw new Error('GAS lokal: ' + nama + '.' + String(p) + ' tidak tersedia'); };
      },
    });
  }

  // ── Date berzona skrip ──
  var HARI = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var HARI_P = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var BLN_P = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function pad(x, n) { x = String(x); while (x.length < n) x = '0' + x; return x; }
  var fmtZona = {};
  function bagianZona(t, tz) {
    var m = String(tz || '').match(/^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/);
    if (m) {
      var off = (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3] || '0', 10));
      var u = new NativeDate(t + off * 60000);
      return { y: u.getUTCFullYear(), M: u.getUTCMonth() + 1, d: u.getUTCDate(), H: u.getUTCHours(), m: u.getUTCMinutes(), s: u.getUTCSeconds(), S: u.getUTCMilliseconds(), E: u.getUTCDay(), off: off };
    }
    var z = tz || ZONA;
    if (!fmtZona[z]) fmtZona[z] = new Intl.DateTimeFormat('en-US', { timeZone: z, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short' });
    var p = {};
    fmtZona[z].formatToParts(new NativeDate(t)).forEach(function (x) { p[x.type] = x.value; });
    var ms = ((t % 1000) + 1000) % 1000;
    var b = { y: +p.year, M: +p.month, d: +p.day, H: (+p.hour) % 24, m: +p.minute, s: +p.second, S: ms, E: HARI.indexOf(p.weekday) };
    b.off = Math.round((NativeDate.UTC(b.y, b.M - 1, b.d, b.H, b.m, b.s) - (t - ms)) / 60000);
    return b;
  }
  function offsetMs(t) { return bagianZona(t, ZONA).off * 60000; }
  // Jam dinding di zona skrip (dihitung seolah UTC) → waktu sebenarnya.
  function dariJamDinding(w) { var u = w - offsetMs(w); return w - offsetMs(u); }
  function lokal(d) { var t = NativeDate.prototype.getTime.call(d); return isNaN(t) ? null : bagianZona(t, ZONA); }
  function setLokal(d, ubah) {
    var b = lokal(d);
    if (!b) return NaN;
    var k = { y: b.y, M: b.M - 1, d: b.d, H: b.H, m: b.m, s: b.s, S: b.S };
    ubah(k);
    var t = dariJamDinding(NativeDate.UTC(k.y, k.M, k.d, k.H, k.m, k.s, k.S));
    return NativeDate.prototype.setTime.call(d, t);
  }
  var namaZona = null;
  function teksZona(t) {
    if (namaZona === null) {
      var p = new Intl.DateTimeFormat('en-US', { timeZone: ZONA, timeZoneName: 'long' }).formatToParts(new NativeDate(t));
      namaZona = (p.filter(function (x) { return x.type === 'timeZoneName'; })[0] || {}).value || ZONA;
    }
    var o = bagianZona(t, ZONA).off, a = Math.abs(o);
    return 'GMT' + (o < 0 ? '-' : '+') + pad(Math.floor(a / 60), 2) + pad(a % 60, 2) + ' (' + namaZona + ')';
  }
  class DateZona extends NativeDate {
    constructor() {
      var a = arguments;
      if (a.length === 0) { super(); return; }
      if (a.length === 1) {
        var x = a[0];
        if (x instanceof NativeDate) super(NativeDate.prototype.getTime.call(x));
        else if (typeof x === 'string') super(DateZona.parse(x));
        else super(x);
        return;
      }
      var w = NativeDate.UTC(a[0], a[1], a.length > 2 ? a[2] : 1, a[3] || 0, a[4] || 0, a[5] || 0, a[6] || 0);
      super(isNaN(w) ? NaN : dariJamDinding(w));
    }
    static now() { return NativeDate.now(); }
    static UTC() { return NativeDate.UTC.apply(NativeDate, arguments); }
    // Tanpa zona eksplisit, V8 membaca waktu sebagai waktu lokal (kecuali tanggal ISO polos, yang UTC).
    static parse(s) {
      s = String(s).trim();
      var t = NativeDate.parse(s);
      if (isNaN(t)) return t;
      if (/(?:[zZ]|[+-]\d{2}:?\d{2}|\b(?:GMT|UTC)\b.*)$/.test(s) || /^\d{4}-\d{2}-\d{2}$/.test(s)) return t;
      return dariJamDinding(t);
    }
    getFullYear() { var b = lokal(this); return b ? b.y : NaN; }
    getMonth() { var b = lokal(this); return b ? b.M - 1 : NaN; }
    getDate() { var b = lokal(this); return b ? b.d : NaN; }
    getDay() { var b = lokal(this); return b ? b.E : NaN; }
    getHours() { var b = lokal(this); return b ? b.H : NaN; }
    getMinutes() { var b = lokal(this); return b ? b.m : NaN; }
    getSeconds() { var b = lokal(this); return b ? b.s : NaN; }
    getYear() { var b = lokal(this); return b ? b.y - 1900 : NaN; }
    getTimezoneOffset() { var b = lokal(this); return b ? -b.off : NaN; }
    setFullYear(y, M, d) { var a = arguments; return setLokal(this, function (k) { k.y = y; if (a.length > 1) k.M = M; if (a.length > 2) k.d = d; }); }
    setMonth(M, d) { var a = arguments; return setLokal(this, function (k) { k.M = M; if (a.length > 1) k.d = d; }); }
    setDate(d) { return setLokal(this, function (k) { k.d = d; }); }
    setHours(H, m, s, S) { var a = arguments; return setLokal(this, function (k) { k.H = H; if (a.length > 1) k.m = m; if (a.length > 2) k.s = s; if (a.length > 3) k.S = S; }); }
    setMinutes(m, s, S) { var a = arguments; return setLokal(this, function (k) { k.m = m; if (a.length > 1) k.s = s; if (a.length > 2) k.S = S; }); }
    setSeconds(s, S) { var a = arguments; return setLokal(this, function (k) { k.s = s; if (a.length > 1) k.S = S; }); }
    toString() {
      var b = lokal(this);
      if (!b) return 'Invalid Date';
      return HARI[b.E] + ' ' + BLN[b.M - 1] + ' ' + pad(b.d, 2) + ' ' + pad(b.y, 4) + ' ' + pad(b.H, 2) + ':' + pad(b.m, 2) + ':' + pad(b.s, 2) + ' ' + teksZona(this.getTime());
    }
    toDateString() { var b = lokal(this); return b ? HARI[b.E] + ' ' + BLN[b.M - 1] + ' ' + pad(b.d, 2) + ' ' + pad(b.y, 4) : 'Invalid Date'; }
    toTimeString() { var b = lokal(this); return b ? pad(b.H, 2) + ':' + pad(b.m, 2) + ':' + pad(b.s, 2) + ' ' + teksZona(this.getTime()) : 'Invalid Date'; }
    toLocaleString(l, o) { return NativeDate.prototype.toLocaleString.call(this, l, Object.assign({ timeZone: ZONA }, o)); }
    toLocaleDateString(l, o) { return NativeDate.prototype.toLocaleDateString.call(this, l, Object.assign({ timeZone: ZONA }, o)); }
    toLocaleTimeString(l, o) { return NativeDate.prototype.toLocaleTimeString.call(this, l, Object.assign({ timeZone: ZONA }, o)); }
  }
  function salin(x) { return x === undefined || x === null ? '' : (x instanceof NativeDate ? new DateZona(x.getTime()) : x); }

  // ── Sheet dan range ──
  var LEMBAR = {}, DAFTAR = [], SS;
  // Semua properti dalam diisi di sini: Proxy tanpaDikenal menjawab properti yang belum ada dengan fungsi pencatat.
  function Lembar(nama, v, lebar, dilewati) {
    this._nama = nama; this._v = v; this._lebar = lebar; this._dilewati = !!dilewati; this._id = DAFTAR.length + 1;
    this._akhir = null; this._berubah = false; this._jarang = null;
  }
  function adaIsi(x) { return x !== undefined && x !== null && x !== ''; }
  Lembar.prototype = {
    _baca: function () { catatSekali(CATAT.dibaca, this._nama); if (this._dilewati) catatSekali(CATAT.baca_dilewati, this._nama); },
    _tulis: function (cara, baris, kolom, isi) {
      var teks; try { teks = JSON.stringify(isi); } catch (e) { teks = String(isi); }
      CATAT.tulis.push({ sheet: this._nama, cara: cara, baris: baris, kolom: kolom, isi: String(teks).slice(0, 300) });
      this._berubah = true;
      this._akhir = null;
    },
    _pastikan: function (baris, kolom) {
      while (this._v.length < baris) this._v.push([]);
      if (kolom > this._lebar) this._lebar = kolom;
    },
    // Seperti Sheets: baris dan kolom terakhir yang BERISI, bukan panjang larik. Baris yang dikosongkan di ujung
    // tidak dihitung, dan appendRow menulis tepat di bawah baris terakhir yang berisi.
    _ujung: function () {
      if (!this._akhir) {
        var nb = this._v.length, nk = 0;
        while (nb > 0 && this._v[nb - 1] !== TIDAK_DIMUAT && !(this._v[nb - 1] || []).some(adaIsi)) nb--;
        for (var i = 0; i < nb; i++) {
          var r = this._v[i];
          if (r === TIDAK_DIMUAT) continue;
          r = r || [];
          for (var j = r.length; j > nk; j--) if (adaIsi(r[j - 1])) { nk = j; break; }
        }
        this._akhir = { b: nb, k: nk };
      }
      return this._akhir;
    },
    // Sheet jarang: baris yang tidak dimuat tidak boleh digeser atau ditimpa.
    _jagaJarang: function (cara, dari, sampai) {
      if (!this._jarang) return;
      for (var i = dari; i <= sampai && i <= this._v.length; i++) {
        if (this._v[i - 1] === TIDAK_DIMUAT) { catatSekali(CATAT.tidak_aman, this._nama + '.' + cara + ' mengenai baris yang tidak dimuat'); return; }
      }
    },
    getName: function () { return this._nama; },
    getSheetName: function () { return this._nama; },
    getSheetId: function () { return this._id; },
    getIndex: function () { return this._id; },
    getParent: function () { return SS; },
    getLastRow: function () { this._baca(); return this._ujung().b; },
    getLastColumn: function () { this._baca(); return this._ujung().k; },
    getMaxRows: function () { return Math.max(this._v.length, 1000); },
    getMaxColumns: function () { return Math.max(this._lebar, 26); },
    getFrozenRows: function () { return 1; },
    getFrozenColumns: function () { return 0; },
    isSheetHidden: function () { return false; },
    getDataRange: function () { var u = this._ujung(); return rentang(this, 1, 1, Math.max(u.b, 1), Math.max(u.k, 1)); },
    getRange: function (a, b, c, d) {
      if (typeof a === 'string') return rentangA1(this, a);
      return rentang(this, a, b, c === undefined ? 1 : c, d === undefined ? 1 : d);
    },
    appendRow: function (arr) {
      var n = this._ujung().b;
      this._tulis('appendRow', n + 1, 1, arr);
      this._pastikan(n + 1, arr.length);
      this._v[n] = arr.map(salin);
      return this;
    },
    deleteRow: function (n) { this._jagaJarang('deleteRow', n, this._v.length); this._tulis('deleteRow', n, 1, null); this._v.splice(n - 1, 1); return this; },
    deleteRows: function (n, k) { this._jagaJarang('deleteRows', n, this._v.length); this._tulis('deleteRows', n, 1, k); this._v.splice(n - 1, k); return this; },
    insertRowAfter: function (n) { this._jagaJarang('insertRowAfter', n + 1, this._v.length); this._tulis('insertRowAfter', n, 1, null); this._v.splice(n, 0, []); return this; },
    insertRowsAfter: function (n, k) { this._jagaJarang('insertRowsAfter', n + 1, this._v.length); this._tulis('insertRowsAfter', n, 1, k); for (var i = 0; i < k; i++) this._v.splice(n, 0, []); return this; },
    insertRowBefore: function (n) { this._jagaJarang('insertRowBefore', n, this._v.length); this._tulis('insertRowBefore', n, 1, null); this._v.splice(n - 1, 0, []); return this; },
    insertColumnAfter: function (n) { this._tulis('insertColumnAfter', 1, n, null); this._lebar++; return this; },
    setFrozenRows: function (n) { this._tulis('setFrozenRows', 1, 1, n); return this; },
    // Pencarian teks satu sheet atau range: cukup untuk cara kode GAS ini memakainya (cari sel yang sama persis).
    createTextFinder: function (teks) { return pencari(this, 1, 1, Math.max(this._v.length, 1), Math.max(this._lebar, 1), teks); },
  };
  function Rentang(lembar, baris, kolom, nb, nk) { this._l = lembar; this._b = baris; this._k = kolom; this._nb = nb; this._nk = nk; }
  Rentang.prototype = {
    getValues: function () {
      this._l._baca();
      var out = [];
      for (var i = 0; i < this._nb; i++) {
        var r = this._l._v[this._b - 1 + i];
        if (r === TIDAK_DIMUAT) { catatSekali(CATAT.tidak_aman, this._l._nama + ' dibaca di baris yang tidak dimuat'); r = []; }
        r = r || [];
        var baris = [];
        for (var j = 0; j < this._nk; j++) baris.push(salin(r[this._k - 1 + j]));
        out.push(baris);
      }
      return out;
    },
    getValue: function () { return this.getValues()[0][0]; },
    // Cermin tidak menyimpan tampilan sel. Hasilnya perkiraan, dan pemakaiannya dicatat.
    getDisplayValues: function () {
      catatSekali(CATAT.layanan, 'Range.getDisplayValues (perkiraan)');
      return this.getValues().map(function (r) { return r.map(function (x) { return String(x); }); });
    },
    getDisplayValue: function () { return this.getDisplayValues()[0][0]; },
    setValues: function (m) {
      this._l._jagaJarang('setValues', this._b, this._b + m.length - 1);
      this._l._tulis('setValues', this._b, this._k, m);
      this._l._pastikan(this._b + m.length - 1, this._k + ((m[0] || []).length) - 1);
      for (var i = 0; i < m.length; i++) {
        var r = this._l._v[this._b - 1 + i];
        for (var j = 0; j < m[i].length; j++) r[this._k - 1 + j] = salin(m[i][j]);
      }
      return this;
    },
    setValue: function (x) { return this.setValues([[x]]); },
    clearContent: function () {
      var kosong = [];
      for (var i = 0; i < this._nb; i++) { kosong.push([]); for (var j = 0; j < this._nk; j++) kosong[i].push(''); }
      return this.setValues(kosong);
    },
    clear: function () { return this.clearContent(); },
    getRow: function () { return this._b; },
    getColumn: function () { return this._k; },
    getNumRows: function () { return this._nb; },
    getNumColumns: function () { return this._nk; },
    getLastRow: function () { return this._b + this._nb - 1; },
    getLastColumn: function () { return this._k + this._nk - 1; },
    getSheet: function () { return this._l; },
    getA1Notation: function () { return hurufKolom(this._k) + this._b + ':' + hurufKolom(this._k + this._nk - 1) + (this._b + this._nb - 1); },
    offset: function (b, k, nb, nk) { return rentang(this._l, this._b + b, this._k + k, nb === undefined ? this._nb : nb, nk === undefined ? this._nk : nk); },
    createTextFinder: function (teks) { return pencari(this._l, this._b, this._k, this._nb, this._nk, teks); },
  };
  function pencari(l, b, k, nb, nk, teks) {
    var opsi = { utuh: false, hurufSama: false, regex: false };
    var f = tanpaDikenal('TextFinder', {
      matchEntireCell: function (x) { opsi.utuh = !!x; return f; },
      matchCase: function (x) { opsi.hurufSama = !!x; return f; },
      useRegularExpression: function (x) { opsi.regex = !!x; return f; },
      findAll: function () {
        l._baca();
        var cocok;
        if (opsi.regex) {
          var re = new RegExp(opsi.utuh ? '^(?:' + String(teks) + ')$' : String(teks), opsi.hurufSama ? '' : 'i');
          cocok = function (s) { return re.test(s); };
        } else {
          var cari = opsi.hurufSama ? String(teks) : String(teks).toLowerCase();
          cocok = function (s) { s = opsi.hurufSama ? s : s.toLowerCase(); return opsi.utuh ? s === cari : s.indexOf(cari) !== -1; };
        }
        // Sheet jarang: baris yang tidak dimuat boleh dilewati HANYA bila pencariannya persis saringan server
        // (kolom yang sama, nilai yang sama, cocok utuh dan peka huruf): server sudah mengirim semua baris yang cocok.
        var bolehLewati = !!l._jarang && !opsi.regex && opsi.utuh && opsi.hurufSama && nk === 1
          && k - 1 === l._jarang.kolom && String(teks) === l._jarang.nilai;
        var hasil = [];
        for (var i = 0; i < nb; i++) {
          var r = l._v[b - 1 + i];
          if (r === TIDAK_DIMUAT) {
            if (!bolehLewati) catatSekali(CATAT.tidak_aman, l._nama + ' dicari di baris yang tidak dimuat');
            continue;
          }
          r = r || [];
          for (var j = 0; j < nk; j++) {
            var x = r[k - 1 + j]; if (!adaIsi(x)) continue;
            if (cocok(String(x))) hasil.push(rentang(l, b + i, k + j, 1, 1));
          }
        }
        return hasil;
      },
      findNext: function () { return f.findAll()[0] || null; },
    });
    return f;
  }
  function rentang(l, b, k, nb, nk) {
    if (!(b >= 1) || !(k >= 1) || !(nb >= 1) || !(nk >= 1)) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
    return tanpaDikenal('Range', new Rentang(l, b, k, nb, nk));
  }
  function hurufKolom(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function angkaKolom(h) { var n = 0; for (var i = 0; i < h.length; i++) n = n * 26 + (h.charCodeAt(i) - 64); return n; }
  function rentangA1(l, a1) {
    var t = String(a1).replace(/^.*!/, '').replace(/\$/g, '').toUpperCase();
    var sel = t.split(':').map(function (s) { var m = s.match(/^([A-Z]*)(\d*)$/); return { k: m[1] ? angkaKolom(m[1]) : null, b: m[2] ? parseInt(m[2], 10) : null }; });
    var awal = sel[0], akhir = sel[1] || sel[0];
    var b1 = awal.b || 1, k1 = awal.k || 1;
    var u = l._ujung();
    var b2 = akhir.b || Math.max(u.b, 1), k2 = akhir.k || Math.max(u.k, 1);
    return rentang(l, b1, k1, b2 - b1 + 1, k2 - k1 + 1);
  }
  function pasangLembar(nama, v, lebar, dilewati) {
    var l = tanpaDikenal('Sheet', new Lembar(nama, v, lebar, dilewati));
    LEMBAR[nama] = l; DAFTAR.push(l);
    return l;
  }

  function barisDariCermin(s, r) {
    var baris = [];
    for (var j = 0; j < s.headers.length; j++) {
      var x = r[j];
      baris.push(s.tanggal[j] && typeof x === 'string' && ISO.test(x) ? new DateZona(x) : (x === undefined || x === null ? '' : x));
    }
    return baris;
  }
  Object.keys(D.sheets).forEach(function (nama) {
    var s = D.sheets[nama];
    if (s.tidak_dimuat) { pasangLembar(nama, [], 0, true); return; }
    if (s.jarang) {
      var vj = [s.headers.slice()];
      for (var n = 0; n < s.jumlah_baris; n++) vj.push(TIDAK_DIMUAT);
      s.baris_dimuat.forEach(function (x) { vj[x.baris - 1] = barisDariCermin(s, x.nilai); });
      var lj = pasangLembar(nama, vj, s.headers.length, false);
      // lastIndexOf: pada nama kolom kembar, data->>kolom di server berisi kolom yang terakhir.
      lj._jarang = { kolom: s.headers.lastIndexOf(s.jarang.kolom), nilai: String(s.jarang.nilai) };
      return;
    }
    var v = s.headers.length ? [s.headers.slice()].concat(s.rows.map(function (r) { return barisDariCermin(s, r); })) : [];
    pasangLembar(nama, v, s.headers.length, false);
  });
  (D.dilewati || []).forEach(function (nama) { if (!LEMBAR[nama]) pasangLembar(nama, [], 0, true); });

  SS = tanpaDikenal('Spreadsheet', {
    getSheetByName: function (n) { return LEMBAR[n] || null; },
    getSheets: function () { return DAFTAR.slice(); },
    insertSheet: function (n) { CATAT.tulis.push({ sheet: String(n), cara: 'insertSheet' }); return pasangLembar(String(n), [], 0, false); },
    getId: function () { return 'gas-lokal'; },
    getName: function () { return D.judul; },
    getSpreadsheetTimeZone: function () { return D.zonaSheet || ZONA; },
    getUrl: function () { return ''; },
    getActiveSheet: function () { return DAFTAR[0] || null; },
    toast: function () { catatSekali(CATAT.layanan, 'Spreadsheet.toast'); },
  });

  // ── Utilities.formatDate: pola SimpleDateFormat, bahasa Inggris seperti GAS ──
  function potongPola(c, n, t) {
    switch (c) {
      case 'y': return n === 2 ? pad(t.y % 100, 2) : pad(t.y, n);
      case 'M': return n >= 4 ? BLN_P[t.M - 1] : (n === 3 ? BLN[t.M - 1] : pad(t.M, n));
      case 'd': return pad(t.d, n);
      case 'H': return pad(t.H, n);
      case 'h': return pad(t.H % 12 === 0 ? 12 : t.H % 12, n);
      case 'm': return pad(t.m, n);
      case 's': return pad(t.s, n);
      case 'S': return pad(t.S, n);
      case 'E': return n >= 4 ? HARI_P[t.E] : HARI[t.E];
      case 'u': return String(t.E === 0 ? 7 : t.E);
      case 'a': return t.H < 12 ? 'AM' : 'PM';
      case 'Z': { var o = Math.abs(t.off); return (t.off < 0 ? '-' : '+') + pad(Math.floor(o / 60), 2) + pad(o % 60, 2); }
      case 'X': {
        if (t.off === 0) return 'Z';
        var o2 = Math.abs(t.off);
        return (t.off < 0 ? '-' : '+') + pad(Math.floor(o2 / 60), 2) + (n === 1 ? '' : (n === 3 ? ':' : '') + pad(o2 % 60, 2));
      }
      default: catatSekali(CATAT.layanan, 'formatDate huruf pola ' + c); return '';
    }
  }
  function formatTanggal(tanggal, tz, pola) {
    var d = tanggal instanceof NativeDate ? tanggal : new NativeDate(tanggal);
    var waktu = NativeDate.prototype.getTime.call(d);
    if (isNaN(waktu)) throw new Error('Invalid argument: date');
    var t = bagianZona(waktu, tz), P = String(pola), out = '', i = 0;
    while (i < P.length) {
      var c = P[i];
      if (c === "'") {
        if (P[i + 1] === "'") { out += "'"; i += 2; continue; }
        var j = P.indexOf("'", i + 1); if (j < 0) j = P.length;
        out += P.slice(i + 1, j); i = j + 1; continue;
      }
      if (!/[A-Za-z]/.test(c)) { out += c; i++; continue; }
      var n = 1; while (P[i + n] === c) n++;
      out += potongPola(c, n, t); i += n;
    }
    return out;
  }
  function keBytes(x) { return typeof x === 'string' ? { s: x } : { b: [].slice.call(x) }; }
  var Utilities = tanpaDikenal('Utilities', {
    formatDate: formatTanggal,
    getUuid: function () { return host.uuid(); },
    sleep: function () {},
    computeDigest: function (alg, isi) { return JSON.parse(host.digest(String(alg), JSON.stringify(keBytes(isi)))); },
    // Byte dari Blob tiruan (XLSX payroll) membawa base64-nya sendiri: tidak perlu diubah bolak-balik.
    base64Encode: function (isi) {
      if (isi && typeof isi === 'object' && typeof isi.__b64 === 'string' && arguments.length < 2) return isi.__b64;
      return host.b64(JSON.stringify(keBytes(isi)), false);
    },
    base64EncodeWebSafe: function (isi) {
      if (isi && typeof isi === 'object' && typeof isi.__b64 === 'string' && arguments.length < 2) return isi.__b64.replace(/\+/g, '-').replace(/\//g, '_');
      return host.b64(JSON.stringify(keBytes(isi)), true);
    },
    formatString: function (f) { var a = [].slice.call(arguments, 1), i = 0; return String(f).replace(/%[sdif]/g, function () { return String(a[i++]); }); },
    DigestAlgorithm: { MD2: 'MD2', MD5: 'MD5', SHA_1: 'SHA_1', SHA_256: 'SHA_256', SHA_384: 'SHA_384', SHA_512: 'SHA_512' },
    Charset: { UTF_8: 'UTF_8', US_ASCII: 'US_ASCII' },
  });

  // ── Spreadsheet baru di memori (SpreadsheetApp.create) ──
  // Dipakai payroll: kode GAS membuat spreadsheet, mengisinya, lalu mengambil XLSX-nya dari alamat ekspor
  // docs.google.com. Model selnya meniru Google: nilai + format per sel (huruf, latar, garis, rata, format angka),
  // gabungan sel, lebar kolom, baris beku, dan kisi bawaan 1000 baris × 26 kolom. Acuannya berkas payroll asli
  // hasil GAS (ekspor Google); perilaku yang ditiru dicatat di tempatnya.
  var BUKU = {};
  var GAYA_GARIS = { SOLID: 'thin', SOLID_MEDIUM: 'medium', SOLID_THICK: 'thick', DOTTED: 'dotted', DASHED: 'dashed', DOUBLE: 'double' };
  var NAMA_WARNA = { white: 'FFFFFF', black: '000000', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', orange: 'FFA500',
    gray: '808080', grey: '808080', silver: 'C0C0C0', purple: '800080', maroon: '800000', navy: '000080', teal: '008080', lime: '00FF00',
    aqua: '00FFFF', cyan: '00FFFF', fuchsia: 'FF00FF', magenta: 'FF00FF', olive: '808000', pink: 'FFC0CB', brown: 'A52A2A' };
  // Google menerima warna dengan spasi di ujung ('#b45309 ' di PayrollService) dan menyimpannya tanpa spasi.
  function warnaHex(c) {
    if (c === null || c === undefined) return null;
    var s = String(c).trim().toLowerCase();
    if (!s) return null;
    if (NAMA_WARNA[s]) return NAMA_WARNA[s];
    var m = s.match(/^#?([0-9a-f]{6})$/);
    if (m) return m[1].toUpperCase();
    m = s.match(/^#?([0-9a-f])([0-9a-f])([0-9a-f])$/);
    if (m) return (m[1] + m[1] + m[2] + m[2] + m[3] + m[3]).toUpperCase();
    catatSekali(CATAT.tak_dikenal, 'warna ' + s);
    return null;
  }
  // Format sel disimpan sebagai nomor di daftar FMT (format yang sama dipakai bersama). Indeks 0 = bawaan.
  // Medan: ukuran, tebal, miring, warna, huruf (huruf), latar, rataH, rataV, bungkus, angka (format angka),
  // gA/gK/gB/gN (garis atas/kiri/bawah/kanan: "gaya RRGGBB").
  var MEDAN_FORMAT = ['ukuran', 'tebal', 'miring', 'warna', 'huruf', 'latar', 'rataH', 'rataV', 'bungkus', 'angka', 'gA', 'gK', 'gB', 'gN'];
  var FMT = [{}], FMT_KUNCI = {}, FMT_UBAH = {};
  function kunciFormat(f) {
    var s = '';
    for (var i = 0; i < MEDAN_FORMAT.length; i++) { var x = f[MEDAN_FORMAT[i]]; s += (x === undefined ? '' : typeof x + ':' + x) + '\u0001'; }
    return s;
  }
  FMT_KUNCI[kunciFormat({})] = 0;
  function ubahFormat(id, medan, nilai) {
    var k = id + '\u0002' + medan + '\u0002' + (nilai === null || nilai === undefined ? '\u0003' : typeof nilai + ':' + nilai);
    var t = FMT_UBAH[k];
    if (t !== undefined) return t;
    var lama = FMT[id], baru = {};
    for (var i = 0; i < MEDAN_FORMAT.length; i++) if (lama[MEDAN_FORMAT[i]] !== undefined) baru[MEDAN_FORMAT[i]] = lama[MEDAN_FORMAT[i]];
    if (nilai === null || nilai === undefined) delete baru[medan]; else baru[medan] = nilai;
    var kk = kunciFormat(baru), idBaru = FMT_KUNCI[kk];
    if (idBaru === undefined) { idBaru = FMT.length; FMT.push(baru); FMT_KUNCI[kk] = idBaru; }
    FMT_UBAH[k] = idBaru;
    return idBaru;
  }

  // Penguraian ketikan seperti Google Sheets untuk spreadsheet berlokal en_US (lokal spreadsheet baru payroll):
  // angka, persen, TRUE/FALSE, jam, dan tanggal dengan nama bulan INGGRIS. Format tampilan yang dipasang Google
  // ikut ditiru: "06 Jul 2026" → "dd mmm yyyy", "28 Sep 2026" → "d mmm yyyy", "06 Jul 2026 17:52" →
  // "dd mmm yyyy h:mm", "07:00" → "h:mm". Bulan Indonesia (Mei, Agu, Okt, Des) tidak dikenali: tetap teks.
  var BULAN_EN = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
  function serialTanggal(y, M, d, H, m, s) {
    var t = NativeDate.UTC(y, M - 1, d);
    var u = new NativeDate(t);
    if (u.getUTCFullYear() !== y || u.getUTCMonth() !== M - 1 || u.getUTCDate() !== d) return null;
    if (H > 23 || m > 59 || s >= 60) return null;
    return (t - NativeDate.UTC(1899, 11, 30)) / 86400000 + (H * 3600 + m * 60 + s) / 86400;
  }
  function jamTeks(m5, m6, m7) { return m5 === undefined ? '' : (m7 !== undefined ? ' h:mm:ss' : ' h:mm'); }
  function uraiMasukan(x, angkaSel) {
    if (x === null || x === undefined || x === '') return { v: null };
    if (typeof x === 'number' || typeof x === 'boolean') return { v: x };
    if (x instanceof NativeDate) {
      var t = NativeDate.prototype.getTime.call(x);
      if (isNaN(t)) return { v: null };
      var z = bagianZona(t, ZONA);   // GAS menulis Date sebagai jam dinding zona skrip (Asia/Jakarta di keempat rumah)
      return { v: serialTanggal(z.y, z.M, z.d, z.H, z.m, z.s + z.S / 1000), angka: 'm/d/yyyy h:mm:ss' };
    }
    var s = typeof x === 'string' ? x : String(x);
    if (angkaSel === '@') return { v: s };
    if (s.charAt(0) === "'") return { v: s.slice(1) };
    var u = s.trim(), m;
    if (u.charAt(0) === '=' && u.length > 1) { catatSekali(CATAT.tak_dikenal, 'SpreadsheetBaru.rumus (disimpan sebagai teks)'); return { v: s }; }
    if (/^(true|false)$/i.test(u)) return { v: u.toLowerCase() === 'true' };
    if ((m = u.match(/^([+-]?)(\d{1,3}(?:,\d{3})+|\d+)?(\.\d+)?(?:[eE]([+-]?\d+))?$/)) && (m[2] || m[3])) {
      var angka = Number((m[1] === '-' ? '-' : '') + (m[2] || '0').replace(/,/g, '') + (m[3] || '') + (m[4] !== undefined ? 'e' + m[4] : ''));
      if (isFinite(angka)) {
        var fa = m[2] && m[2].indexOf(',') !== -1 ? (m[3] ? '#,##0.00' : '#,##0') : (m[4] !== undefined ? '0.00E+00' : undefined);
        return { v: angka, angka: fa };
      }
    }
    if ((m = u.match(/^([+-]?\d+(?:\.\d+)?)%$/))) return { v: Number(m[1]) / 100, angka: m[1].indexOf('.') === -1 ? '0%' : '0.00%' };
    if ((m = u.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([AaPp])\.?[Mm]\.?)?$/))) {
      var H = +m[1];
      if (m[4]) { if (H < 1 || H > 12) return { v: s }; H = H % 12 + (/p/i.test(m[4]) ? 12 : 0); }
      if (H <= 23 && +m[2] <= 59 && (m[3] === undefined || +m[3] <= 59)) {
        return { v: (H * 3600 + +m[2] * 60 + (m[3] ? +m[3] : 0)) / 86400, angka: (m[3] ? 'h:mm:ss' : 'h:mm') + (m[4] ? ' am/pm' : '') };
      }
      return { v: s };
    }
    var sr;
    // d MMM yyyy [H:mm[:ss]] — bentuk yang ditulis PayrollService (_formatDateId/_formatDateTimeId)
    if ((m = u.match(/^(\d{1,2})([ \-\/])([A-Za-z]{3,9})\.?\2(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)) && BULAN_EN[m[3].toLowerCase()]) {
      sr = serialTanggal(+m[4], BULAN_EN[m[3].toLowerCase()], +m[1], m[5] ? +m[5] : 0, m[6] ? +m[6] : 0, m[7] ? +m[7] : 0);
      if (sr !== null) return { v: sr, angka: (m[1].length === 2 && m[1].charAt(0) === '0' ? 'dd' : 'd') + m[2] + (m[3].length > 3 ? 'mmmm' : 'mmm') + m[2] + 'yyyy' + jamTeks(m[5], m[6], m[7]) };
    }
    // MMM d, yyyy
    if ((m = u.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)) && BULAN_EN[m[1].toLowerCase()]) {
      sr = serialTanggal(+m[3], BULAN_EN[m[1].toLowerCase()], +m[2], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
      if (sr !== null) return { v: sr, angka: (m[1].length > 3 ? 'mmmm' : 'mmm') + ' d, yyyy' + jamTeks(m[4], m[5], m[6]) };
    }
    // yyyy-mm-dd [H:mm[:ss]]
    if ((m = u.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/))) {
      sr = serialTanggal(+m[1], +m[2], +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
      if (sr !== null) return { v: sr, angka: 'yyyy-mm-dd' + jamTeks(m[4], m[5], m[6]) };
    }
    // M/d/yyyy [H:mm[:ss]] (urutan en_US)
    if ((m = u.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/))) {
      sr = serialTanggal(+m[3], +m[1], +m[2], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
      if (sr !== null) return { v: sr, angka: 'm/d/yyyy' + jamTeks(m[4], m[5], m[6]) };
    }
    return { v: s };
  }

  function LembarBaru(buku, nama, maxB, maxK) {
    this._buku = buku; this._nama = String(nama); this._v = []; this._f = [];
    this._maxB = maxB; this._maxK = maxK; this._gabung = []; this._lebar = {}; this._tinggi = {};
    this._bekuB = 0; this._bekuK = 0; this._idLembar = buku._lembar.length ? Math.floor(Math.random() * 2e9) : 0;
  }
  LembarBaru.prototype = {
    _format: function (b, k) { var r = this._f[b - 1]; return r ? (r[k - 1] || 0) : 0; },
    _aturFormat: function (b, k, id) { var r = this._f[b - 1] || (this._f[b - 1] = []); r[k - 1] = id; },
    _gabungDi: function (b, k) {
      for (var i = 0; i < this._gabung.length; i++) {
        var g = this._gabung[i];
        if (b >= g.b && b < g.b + g.nb && k >= g.k && k < g.k + g.nk) return g;
      }
      return null;
    },
    // Sel di dalam gabungan tampil dengan format sel kiri-atasnya.
    _formatTampil: function (b, k) { var g = this._gabungDi(b, k); return g ? this._format(g.b, g.k) : this._format(b, k); },
    // Menulis nilai di luar kisi memperluas kisi. Kolom baru mewarisi format kolom terakhir (ekspor payroll SUM:
    // judul tergabung A1:Z1 ikut berwarna di AA1:AC1), baris baru mewarisi format baris terakhir.
    _perluas: function (b, k) {
      var r, c, f;
      if (k > this._maxK) {
        var lamaK = this._maxK;
        for (r = 1; r <= this._f.length; r++) {
          f = this._formatTampil(r, lamaK);
          if (f) for (c = lamaK + 1; c <= k; c++) this._aturFormat(r, c, f);
        }
        this._maxK = k;
      }
      if (b > this._maxB) {
        var lamaB = this._maxB;
        if (this._f[lamaB - 1]) {
          for (c = 1; c <= this._maxK; c++) {
            f = this._formatTampil(lamaB, c);
            if (f) for (r = lamaB + 1; r <= b; r++) this._aturFormat(r, c, f);
          }
        }
        this._maxB = b;
      }
    },
    _isi: function (b, k, x) {
      var fid = this._format(b, k), u = uraiMasukan(x, FMT[fid].angka);
      (this._v[b - 1] || (this._v[b - 1] = []))[k - 1] = u.v;
      if (u.angka && FMT[fid].angka === undefined) this._aturFormat(b, k, ubahFormat(fid, 'angka', u.angka));
    },
    _ujungIsi: function () {
      var nb = 0, nk = 0;
      for (var i = 0; i < this._v.length; i++) {
        var r = this._v[i] || [];
        for (var j = r.length; j > 0; j--) if (r[j - 1] !== null && r[j - 1] !== undefined && r[j - 1] !== '') { nb = i + 1; if (j > nk) nk = j; break; }
      }
      return { b: nb, k: nk };
    },
    getName: function () { return this._nama; },
    getSheetName: function () { return this._nama; },
    setName: function (n) { this._nama = String(n); return this; },
    getSheetId: function () { return this._idLembar; },
    getIndex: function () { for (var i = 0; i < this._buku._lembar.length; i++) if (this._buku._lembar[i].getName() === this._nama) return i + 1; return 0; },
    getParent: function () { return this._buku._proxy; },
    getMaxRows: function () { return this._maxB; },
    getMaxColumns: function () { return this._maxK; },
    getLastRow: function () { return this._ujungIsi().b; },
    getLastColumn: function () { return this._ujungIsi().k; },
    getFrozenRows: function () { return this._bekuB; },
    getFrozenColumns: function () { return this._bekuK; },
    setFrozenRows: function (n) { this._bekuB = Number(n) || 0; },
    setFrozenColumns: function (n) { this._bekuK = Number(n) || 0; },
    getColumnWidth: function (k) { return this._lebar[k] || 100; },
    setColumnWidth: function (k, px) { this._lebar[k] = Number(px); return this; },
    setColumnWidths: function (k, n, px) { for (var i = 0; i < n; i++) this._lebar[k + i] = Number(px); return this; },
    getRowHeight: function (b) { return this._tinggi[b] || 21; },
    setRowHeight: function (b, px) { this._tinggi[b] = Number(px); return this; },
    getRange: function (a, b, c, d) {
      if (typeof a === 'string') return rentangBaruA1(this, a);
      return rentangBaru(this, a, b, c === undefined ? 1 : c, d === undefined ? 1 : d);
    },
    getRangeList: function (daftar) { var l = this; return daftarRentang([].slice.call(daftar).map(function (a) { return rentangBaruA1(l, a); })); },
    getDataRange: function () { var u = this._ujungIsi(); return rentangBaru(this, 1, 1, Math.max(u.b, 1), Math.max(u.k, 1)); },
    appendRow: function (arr) { rentangBaru(this, this._ujungIsi().b + 1, 1, 1, arr.length).setValues([arr]); return this; },
    clear: function () { this._v = []; this._f = []; this._gabung = []; return this; },
    clearContents: function () { this._v = []; return this; },
    clearFormats: function () { this._f = []; return this; },
  };
  function RentangBaru(l, b, k, nb, nk) { this._l = l; this._b = b; this._k = k; this._nb = nb; this._nk = nk; }
  function cekUkuran(m, nb, nk) {
    if (!m || m.length !== nb) throw new Error('The number of rows in the data does not match the number of rows in the range. The data has ' + (m ? m.length : 0) + ' but the range has ' + nb + '.');
    for (var i = 0; i < m.length; i++) {
      if (!m[i] || m[i].length !== nk) throw new Error('The number of columns in the data does not match the number of columns in the range. The data has ' + (m[i] ? m[i].length : 0) + ' but the range has ' + nk + '.');
    }
  }
  RentangBaru.prototype = {
    // Format hanya mengenai sel di dalam kisi (gabungan A1:AA1 di kisi 26 kolom menjadi A1:Z1, seperti ekspor asli).
    _setiap: function (fn) {
      var bm = Math.min(this._b + this._nb - 1, this._l._maxB), km = Math.min(this._k + this._nk - 1, this._l._maxK);
      for (var b = this._b; b <= bm; b++) for (var k = this._k; k <= km; k++) fn(b, k, b - this._b, k - this._k);
    },
    _ubah: function (medan, nilai) {
      var l = this._l;
      this._setiap(function (b, k) { l._aturFormat(b, k, ubahFormat(l._format(b, k), medan, nilai)); });
      return this;
    },
    _ubahMatriks: function (m, medan, ubah) {
      cekUkuran(m, this._nb, this._nk);
      var l = this._l;
      this._setiap(function (b, k, i, j) { l._aturFormat(b, k, ubahFormat(l._format(b, k), medan, ubah(m[i][j]))); });
      return this;
    },
    getRow: function () { return this._b; },
    getColumn: function () { return this._k; },
    getNumRows: function () { return this._nb; },
    getNumColumns: function () { return this._nk; },
    getLastRow: function () { return this._b + this._nb - 1; },
    getLastColumn: function () { return this._k + this._nk - 1; },
    getSheet: function () { return this._l; },
    getA1Notation: function () {
      var awal = hurufKolom(this._k) + this._b;
      return this._nb === 1 && this._nk === 1 ? awal : awal + ':' + hurufKolom(this._k + this._nk - 1) + (this._b + this._nb - 1);
    },
    offset: function (b, k, nb, nk) { return rentangBaru(this._l, this._b + b, this._k + k, nb === undefined ? this._nb : nb, nk === undefined ? this._nk : nk); },
    getValues: function () {
      var out = [];
      for (var i = 0; i < this._nb; i++) {
        var r = this._l._v[this._b - 1 + i] || [], baris = [];
        for (var j = 0; j < this._nk; j++) { var x = r[this._k - 1 + j]; baris.push(x === null || x === undefined ? '' : x); }
        out.push(baris);
      }
      return out;
    },
    getValue: function () { return this.getValues()[0][0]; },
    setValues: function (m) {
      cekUkuran(m, this._nb, this._nk);
      this._l._perluas(this._b + this._nb - 1, this._k + this._nk - 1);
      for (var i = 0; i < this._nb; i++) for (var j = 0; j < this._nk; j++) this._l._isi(this._b + i, this._k + j, m[i][j]);
      return this;
    },
    // Seperti GAS: setValue pada rentang banyak sel mengisi SEMUA selnya dengan nilai itu.
    setValue: function (x) {
      this._l._perluas(this._b + this._nb - 1, this._k + this._nk - 1);
      for (var i = 0; i < this._nb; i++) for (var j = 0; j < this._nk; j++) this._l._isi(this._b + i, this._k + j, x);
      return this;
    },
    clearContent: function () { var l = this._l; this._setiap(function (b, k) { var r = l._v[b - 1]; if (r) r[k - 1] = null; }); return this; },
    clearFormat: function () { var l = this._l; this._setiap(function (b, k) { l._aturFormat(b, k, 0); }); return this; },
    clear: function () { this.clearContent(); return this.clearFormat(); },
    merge: function () {
      var b2 = Math.min(this._b + this._nb - 1, this._l._maxB), k2 = Math.min(this._k + this._nk - 1, this._l._maxK);
      if (b2 < this._b || k2 < this._k || (b2 === this._b && k2 === this._k)) return this;
      var g = { b: this._b, k: this._k, nb: b2 - this._b + 1, nk: k2 - this._k + 1 };
      this._l._gabung = this._l._gabung.filter(function (x) { return x.b + x.nb <= g.b || g.b + g.nb <= x.b || x.k + x.nk <= g.k || g.k + g.nk <= x.k; });
      this._l._gabung.push(g);
      // Sheets hanya menyimpan nilai sel kiri-atas gabungan.
      var l = this._l;
      this._setiap(function (b, k) { if ((b !== g.b || k !== g.k) && l._v[b - 1]) l._v[b - 1][k - 1] = null; });
      return this;
    },
    breakApart: function () { var t = this; this._l._gabung = this._l._gabung.filter(function (x) { return !(x.b >= t._b && x.k >= t._k && x.b + x.nb <= t._b + t._nb && x.k + x.nk <= t._k + t._nk); }); return this; },
    setFontSize: function (n) { return this._ubah('ukuran', n === null || n === undefined ? null : Number(n)); },
    setFontWeight: function (w) { return this._ubah('tebal', String(w).toLowerCase() === 'bold' ? true : null); },
    setFontWeights: function (m) { return this._ubahMatriks(m, 'tebal', function (w) { return String(w).toLowerCase() === 'bold' ? true : null; }); },
    setFontStyle: function (s) { return this._ubah('miring', String(s).toLowerCase() === 'italic' ? true : null); },
    setFontColor: function (c) { return this._ubah('warna', warnaHex(c)); },
    setFontColors: function (m) { return this._ubahMatriks(m, 'warna', warnaHex); },
    setFontFamily: function (f) { return this._ubah('huruf', f ? String(f) : null); },
    setBackground: function (c) { return this._ubah('latar', warnaHex(c)); },
    setBackgroundColor: function (c) { return this._ubah('latar', warnaHex(c)); },
    setBackgrounds: function (m) { return this._ubahMatriks(m, 'latar', warnaHex); },
    setHorizontalAlignment: function (a) { return this._ubah('rataH', { left: 'left', center: 'center', right: 'right' }[String(a).toLowerCase()] || null); },
    setVerticalAlignment: function (a) { return this._ubah('rataV', { top: 'top', middle: 'center', bottom: 'bottom' }[String(a).toLowerCase()] || null); },
    setWrap: function (w) { return this._ubah('bungkus', !!w); },
    setNumberFormat: function (f) { return this._ubah('angka', f === null || f === undefined ? null : String(f)); },
    setNumberFormats: function (m) { return this._ubahMatriks(m, 'angka', function (f) { return f === null || f === undefined ? null : String(f); }); },
    // setBorder(atas, kiri, bawah, kanan, tegak, datar[, warna, gaya]): true memasang, false menghapus, null tidak
    // mengubah. Disimpan per sel tanpa menyentuh sel tetangga di luar rentang (begitu ekspor Google menuliskannya).
    setBorder: function (atas, kiri, bawah, kanan, tegak, datar, warna, gaya) {
      var garis = (GAYA_GARIS[gaya] || 'thin') + ' ' + (warnaHex(warna) || '000000');
      var l = this._l, nb = this._nb, nk = this._nk;
      function pasang(id, medan, p) { return p === null || p === undefined ? id : ubahFormat(id, medan, p ? garis : null); }
      this._setiap(function (b, k, i, j) {
        var id = l._format(b, k);
        id = pasang(id, 'gA', i === 0 ? atas : datar);
        id = pasang(id, 'gB', i === nb - 1 ? bawah : datar);
        id = pasang(id, 'gK', j === 0 ? kiri : tegak);
        id = pasang(id, 'gN', j === nk - 1 ? kanan : tegak);
        l._aturFormat(b, k, id);
      });
      return this;
    },
  };
  function rentangBaru(l, b, k, nb, nk) {
    if (!(b >= 1) || !(k >= 1) || !(nb >= 1) || !(nk >= 1)) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
    return tanpaDikenal('Range', new RentangBaru(l, b, k, nb, nk));
  }
  function rentangBaruA1(l, a1) {
    var t = String(a1).replace(/^.*!/, '').replace(/\$/g, '').toUpperCase();
    var sel = t.split(':').map(function (s) { var m = s.match(/^([A-Z]*)(\d*)$/); if (!m) throw new Error('Range not found'); return { k: m[1] ? angkaKolom(m[1]) : null, b: m[2] ? parseInt(m[2], 10) : null }; });
    var awal = sel[0], akhir = sel[1] || sel[0];
    return rentangBaru(l, awal.b || 1, awal.k || 1, (akhir.b || l._maxB) - (awal.b || 1) + 1, (akhir.k || l._maxK) - (awal.k || 1) + 1);
  }
  function daftarRentang(arr) {
    var rl = tanpaDikenal('RangeList', { getRanges: function () { return arr.slice(); } });
    ['setBackground', 'setFontColor', 'setFontWeight', 'setFontStyle', 'setFontSize', 'setFontFamily', 'setNumberFormat', 'setHorizontalAlignment',
      'setVerticalAlignment', 'setWrap', 'setBorder', 'setValue', 'clear', 'clearContent', 'clearFormat'].forEach(function (nama) {
      rl[nama] = function () { var a = arguments; arr.forEach(function (r) { r[nama].apply(r, a); }); return rl; };
    });
    return rl;
  }
  function bukuBaru(nama, baris, kolom) {
    var id = 'abadiops-' + String(host.uuid()).replace(/-/g, '');
    var b = { _id: id, _nama: String(nama), _lembar: [], _aktif: null, _proxy: null, _b: baris > 0 ? Number(baris) : 1000, _k: kolom > 0 ? Number(kolom) : 26 };
    function tambah(n) { var l = tanpaDikenal('Sheet', new LembarBaru(b, n, b._b, b._k)); b._lembar.push(l); return l; }
    function cari(n) { for (var i = 0; i < b._lembar.length; i++) if (b._lembar[i].getName() === String(n)) return b._lembar[i]; return null; }
    b._proxy = tanpaDikenal('Spreadsheet', {
      getId: function () { return id; },
      getName: function () { return b._nama; },
      rename: function (n) { b._nama = String(n); },
      getUrl: function () { return 'https://docs.google.com/spreadsheets/d/' + id + '/edit'; },
      getActiveSheet: function () { return b._aktif; },
      setActiveSheet: function (l) { b._aktif = l; return l; },
      getSheets: function () { return b._lembar.slice(); },
      getNumSheets: function () { return b._lembar.length; },
      getSheetByName: function (n) { return cari(n); },
      insertSheet: function (n) {
        if (typeof n !== 'string') { n = 'Sheet' + (b._lembar.length + 1); }
        if (cari(n)) throw new Error('A sheet with the name "' + n + '" already exists. Please enter another name.');
        var l = tambah(n); b._aktif = l; return l;
      },
      deleteSheet: function (l) { b._lembar = b._lembar.filter(function (x) { return x !== l; }); if (b._aktif === l) b._aktif = b._lembar[0] || null; },
      getSpreadsheetTimeZone: function () { return ZONA; },
      getSpreadsheetLocale: function () { return 'en_US'; },
    });
    b._aktif = tambah('Sheet1');
    BUKU[id] = b;
    return b._proxy;
  }
  // Isi buku untuk host.xlsx: hanya larik, objek polos, teks, angka, dan boolean (aman lintas konteks vm).
  function modelBuku(b) {
    return {
      judul: b._nama,
      format: FMT,
      lembar: b._lembar.map(function (l) {
        return { nama: l._nama, nilai: l._v, format: l._f, gabung: l._gabung, lebar: l._lebar, tinggi: l._tinggi, bekuB: l._bekuB, bekuK: l._bekuK };
      }),
    };
  }
  var B64_INDEKS = (function () {
    var a = [], abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    for (var i = 0; i < 64; i++) a[abc.charCodeAt(i)] = i;
    return a;
  })();
  // Byte bertanda (-128..127) seperti Blob.getBytes() GAS. Base64-nya ikut dibawa (Utilities.base64Encode).
  function bytesDariB64(s) {
    var n = s.length, pad = s.charAt(n - 1) === '=' ? (s.charAt(n - 2) === '=' ? 2 : 1) : 0;
    var panjang = n / 4 * 3 - pad, out = new Array(panjang), j = 0;
    for (var i = 0; i < n; i += 4) {
      var x = (B64_INDEKS[s.charCodeAt(i)] << 18) | (B64_INDEKS[s.charCodeAt(i + 1)] << 12) | ((B64_INDEKS[s.charCodeAt(i + 2)] || 0) << 6) | (B64_INDEKS[s.charCodeAt(i + 3)] || 0);
      if (j < panjang) out[j++] = (x >> 16 & 255) << 24 >> 24;
      if (j < panjang) out[j++] = (x >> 8 & 255) << 24 >> 24;
      if (j < panjang) out[j++] = (x & 255) << 24 >> 24;
    }
    Object.defineProperty(out, '__b64', { value: s });
    return out;
  }
  function jawabanBerkas(b64, nama, jenis) {
    var blob = tanpaDikenal('Blob', {
      getBytes: function () { return bytesDariB64(b64); },
      getContentType: function () { return jenis; },
      getName: function () { return nama; },
      setName: function (n) { nama = String(n); return blob; },
    });
    return tanpaDikenal('HTTPResponse', {
      getResponseCode: function () { return 200; },
      getBlob: function () { return blob; },
      getContent: function () { return blob.getBytes(); },
      getHeaders: function () { return { 'Content-Type': jenis }; },
      getAllHeaders: function () { return { 'Content-Type': jenis }; },
    });
  }
  function berkasDrive(b) {
    var f = tanpaDikenal('File', {
      getId: function () { return b._id; },
      getName: function () { return b._nama; },
      getUrl: function () { return b._proxy.getUrl(); },
      getMimeType: function () { return 'application/vnd.google-apps.spreadsheet'; },
      moveTo: function () { return f; },
      addViewer: function () { return f; },
      addViewers: function () { return f; },
      addEditor: function () { return f; },
      setSharing: function () { return f; },
    });
    return f;
  }
  function folderTiruan(nama) {
    return tanpaDikenal('Folder', { getId: function () { return 'abadiops-folder'; }, getName: function () { return String(nama); }, getUrl: function () { return ''; } });
  }
  function sebagian(nama, ada) {
    var sisa = tidakTersedia(nama);
    return new Proxy(ada, { get: function (t, p) { return Object.prototype.hasOwnProperty.call(t, p) ? t[p] : sisa[p]; } });
  }
  var UrlFetchApp = sebagian('UrlFetchApp', {
    // Hanya ekspor XLSX spreadsheet baru di memori (generatePayrollReport). Alamat lain tetap tidak tersedia.
    fetch: function (url) {
      var m = String(url).match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([^\/?#]+)\/export\?(.*)$/);
      var b = m && Object.prototype.hasOwnProperty.call(BUKU, m[1]) ? BUKU[m[1]] : null;
      if (!b || !/(?:^|&)format=xlsx(?:&|$)/.test(m[2])) {
        catatSekali(CATAT.layanan, 'UrlFetchApp.fetch');
        throw new Error('GAS lokal: UrlFetchApp.fetch tidak tersedia');
      }
      catatSekali(CATAT.layanan, 'UrlFetchApp.fetch (ekspor XLSX spreadsheet baru di memori)');
      return jawabanBerkas(host.xlsx(modelBuku(b)), b._nama + '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    },
  });
  var DriveApp = sebagian('DriveApp', {
    getFileById: function (id) {
      var b = Object.prototype.hasOwnProperty.call(BUKU, String(id)) ? BUKU[String(id)] : null;
      if (!b) { catatSekali(CATAT.layanan, 'DriveApp.getFileById'); throw new Error('GAS lokal: DriveApp.getFileById tidak tersedia'); }
      catatSekali(CATAT.layanan, 'DriveApp.getFileById (spreadsheet baru di memori, tanpa Drive)');
      return berkasDrive(b);
    },
    // Folder arsip payroll: di GAS folder itu sudah ada sejak ekspor pertama, jadi ditiru "ada".
    getFoldersByName: function (nama) {
      catatSekali(CATAT.layanan, 'DriveApp.getFoldersByName (tiruan, tanpa Drive)');
      var habis = false;
      return { hasNext: function () { return !habis; }, next: function () { if (habis) throw new Error('No more items'); habis = true; return folderTiruan(nama); } };
    },
    createFolder: function (nama) { catatSekali(CATAT.layanan, 'DriveApp.createFolder (tiruan, tanpa Drive)'); return folderTiruan(nama); },
  });

  // Eksekusi PWA berjalan sebagai deployer dengan pengguna anonim; identitas selalu dari token.
  var Session = tanpaDikenal('Session', {
    getScriptTimeZone: function () { return ZONA; },
    // Pemanggil PWA/web anonim: email kosong. D.penggunaAktif hanya untuk uji (meniru editor atau menu).
    getActiveUser: function () { catatSekali(CATAT.layanan, 'Session.getActiveUser'); return { getEmail: function () { return D.penggunaAktif || ''; } }; },
    getEffectiveUser: function () { catatSekali(CATAT.layanan, 'Session.getEffectiveUser'); return { getEmail: function () { return ''; } }; },
    getTemporaryActiveUserKey: function () { return ''; },
  });
  var kunci = { tryLock: function () { return true; }, waitLock: function () {}, releaseLock: function () {}, hasLock: function () { return true; } };
  function simpanan() {
    var isi = {};
    return {
      get: function (k) { return Object.prototype.hasOwnProperty.call(isi, k) ? isi[k] : null; },
      getAll: function (ks) { var o = {}; ks.forEach(function (k) { if (Object.prototype.hasOwnProperty.call(isi, k)) o[k] = isi[k]; }); return o; },
      put: function (k, v) { isi[k] = String(v); },
      putAll: function (o) { Object.keys(o).forEach(function (k) { isi[k] = String(o[k]); }); },
      remove: function (k) { delete isi[k]; },
      removeAll: function (ks) { ks.forEach(function (k) { delete isi[k]; }); },
    };
  }
  var cache = { script: simpanan(), user: simpanan(), document: simpanan() };
  function properti(nama) {
    var isi = {};
    return {
      getProperty: function (k) { return Object.prototype.hasOwnProperty.call(isi, k) ? isi[k] : null; },
      getProperties: function () { var o = {}; Object.keys(isi).forEach(function (k) { o[k] = isi[k]; }); return o; },
      getKeys: function () { return Object.keys(isi); },
      setProperty: function (k, v) { CATAT.tulis.push({ sheet: '(' + nama + ')', cara: 'setProperty', isi: String(k) }); isi[k] = String(v); return this; },
      setProperties: function (o) { var self = this; Object.keys(o).forEach(function (k) { self.setProperty(k, o[k]); }); return this; },
      deleteProperty: function (k) { CATAT.tulis.push({ sheet: '(' + nama + ')', cara: 'deleteProperty', isi: String(k) }); delete isi[k]; return this; },
      deleteAllProperties: function () { isi = {}; return this; },
    };
  }
  var prop = { script: properti('ScriptProperties'), user: properti('UserProperties'), document: properti('DocumentProperties') };

  function Keluaran(isi) { this._isi = String(isi); this._mime = 'TEXT'; }
  Keluaran.prototype = {
    setMimeType: function (m) { this._mime = m; return this; },
    getMimeType: function () { return this._mime; },
    getContent: function () { return this._isi; },
    setContent: function (x) { this._isi = String(x); return this; },
    append: function (x) { this._isi += String(x); return this; },
  };
  var Logger = { log: function () { catatLog(arguments); return Logger; }, getLog: function () { return CATAT.log.join('\n'); }, clear: function () {} };

  // ── HtmlService: template hasil kompilasi tools/kembar/templat-gas.mjs, dipasang lewat __pasangTemplat ──
  var TEMPLAT = {}, CARI_GLOBAL = function () { return undefined; };
  function teksCetak(v) { return v === null || v === undefined ? '' : String(v); }
  function escHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&#34;').replace(/'/g, '&#39;'); }
  function escJsString(s) {
    return s.replace(/[\\'"<>&=`\u2028\u2029\x00-\x1f]/g, function (c) {
      var h = c.charCodeAt(0).toString(16);
      return h.length <= 2 ? '\\x' + ('0' + h).slice(-2) : '\\u' + ('000' + h).slice(-4);
    });
  }
  // Pencetak <?= ?> per konteks (lihat templat-gas.mjs). <?!= ?> mencetak apa adanya.
  var PENCETAK = {
    html: function (v) { return escHtml(teksCetak(v)); },
    attr: function (v) { return escHtml(teksCetak(v)); },
    'url-awal': function (v) {
      var s = teksCetak(v);
      if (/^\s*(javascript|vbscript|data):/i.test(s)) return '#zSoyz';
      return escHtml(s.replace(/[\s"'<>\\`]/g, function (c) { return encodeURIComponent(c); }));
    },
    'url-tengah': function (v) { return escHtml(encodeURIComponent(teksCetak(v))); },
    onevent: function (v) { return escHtml(escJsString(teksCetak(v))); },
    js: function (v) { return escJsString(teksCetak(v)); },
    jskode: function (v) { var j = JSON.stringify(v === undefined ? null : v); return escJsString(String(j)).replace(/\\x22/g, '"'); },
    css: function (v) { return teksCetak(v).replace(/[<>"'\\]/g, ''); },
    komentar: function (v) { return teksCetak(v).replace(/\*\//g, '* /'); },
    mentah: function (v) { return teksCetak(v); },
  };
  // Properti internal tidak boleh terlihat sebagai properti template (scriptlet membaca properti sendiri).
  function Templat(nama) { Object.defineProperty(this, '__namaTemplat', { value: nama, enumerable: false }); }
  Templat.prototype.evaluate = function () {
    var f = TEMPLAT[this.__namaTemplat];
    if (!f) throw new Error('GAS lokal: template ' + this.__namaTemplat + ' tidak dikompilasi');
    return keluaranHtml(f(this, CARI_GLOBAL, PENCETAK));
  };
  Templat.prototype.getRawContent = function () { return (D.html || {})[this.__namaTemplat] || ''; };
  function KeluaranHtml(isi) { this._isi = isi; this._judul = ''; this._meta = []; this._favicon = ''; this._xframe = ''; }
  KeluaranHtml.prototype = {
    getContent: function () { return this._isi; },
    setContent: function (x) { this._isi = teksCetak(x); return this; },
    append: function (x) { this._isi += teksCetak(x); return this; },
    appendUntrusted: function (x) { this._isi += escHtml(teksCetak(x)); return this; },
    clear: function () { this._isi = ''; return this; },
    getTitle: function () { return this._judul; },
    setTitle: function (x) { this._judul = teksCetak(x); return this; },
    addMetaTag: function (nama, isi) { this._meta.push({ nama: teksCetak(nama), isi: teksCetak(isi) }); return this; },
    getMetaTags: function () { return this._meta.slice(); },
    setFaviconUrl: function (x) { this._favicon = teksCetak(x); return this; },
    getFaviconUrl: function () { return this._favicon; },
    setXFrameOptionsMode: function (x) { this._xframe = x; return this; },
    setSandboxMode: function () { return this; },
    setWidth: function () { return this; },
    setHeight: function () { return this; },
    getAs: function () { catatSekali(CATAT.tak_dikenal, 'HtmlOutput.getAs'); return null; },
  };
  function keluaranHtml(isi) { return tanpaDikenal('HtmlOutput', new KeluaranHtml(teksCetak(isi))); }
  var HtmlService = tanpaDikenal('HtmlService', {
    createTemplateFromFile: function (nama) { return new Templat(String(nama)); },
    createHtmlOutputFromFile: function (nama) {
      var isi = (D.html || {})[String(nama)];
      if (isi === undefined) throw new Error('No HTML file named ' + nama + ' was found.');
      return keluaranHtml(isi);
    },
    createHtmlOutput: function (x) { return keluaranHtml(x && typeof x.getContent === 'function' ? x.getContent() : x); },
    createTemplate: function () { catatSekali(CATAT.layanan, 'HtmlService.createTemplate'); throw new Error('GAS lokal: createTemplate dari teks tidak didukung (template dikompilasi saat bundel)'); },
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL', DEFAULT: 'DEFAULT' },
    SandboxMode: { IFRAME: 'IFRAME', NATIVE: 'NATIVE', EMULATED: 'EMULATED' },
  });

  // Isi baru setiap sheet yang ditulis, dalam bentuk cermin (tools/cermin/sinkron.mjs): header, baris nilai
  // (Date → ISO), dan tipe per kolom dihitung dari baris data. Baris dan kolom kosong di ujung dipotong,
  // sama dengan getDataRange(). Sheet yang dibuat insertSheet ditandai baru.
  function jenisSel(x) { return x instanceof NativeDate ? 'tanggal' : typeof x === 'number' ? 'angka' : typeof x === 'boolean' ? 'boolean' : 'teks'; }
  function teksTipe(set) {
    var t = Object.keys(set).sort();
    return t.length === 0 ? 'kosong' : t.length === 1 ? t[0] : 'campur:' + t.join('+');
  }
  function ekspor() {
    var hasil = {};
    DAFTAR.forEach(function (l) {
      if (!l._berubah) return;
      var u = l._ujung(), headers = [], rows = [], tipeKolom = [];
      var sel = function (i, j) {
        var x = (l._v[i] || [])[j];
        if (x instanceof NativeDate) { var t = NativeDate.prototype.getTime.call(x); return isNaN(t) ? '' : new NativeDate(t).toISOString(); }
        return x === undefined || x === null ? '' : x;
      };
      // Sheet jarang: hanya baris yang dimuat atau baru yang bisa dibandingkan. Tipe kolom digabung dengan tipe
      // lama dari cermin, karena baris lain tidak terlihat.
      if (l._jarang) {
        var asal = D.sheets[l._nama], lama = {}, tipeSet = {};
        asal.baris_dimuat.forEach(function (x) { lama[x.baris] = JSON.stringify(x.nilai); });
        asal.headers.forEach(function (h) {
          tipeSet[h] = {};
          String((asal.tipe || {})[h] || 'kosong').replace(/^campur:/, '').split('+').forEach(function (x) { if (x && x !== 'kosong') tipeSet[h][x] = true; });
        });
        if (u.k > asal.headers.length) catatSekali(CATAT.tidak_aman, l._nama + ' mendapat kolom baru pada sheet jarang');
        var berubah = [];
        for (var bi = 1; bi < u.b; bi++) {
          if (l._v[bi] === TIDAK_DIMUAT) continue;
          var rj = [];
          for (var kj = 0; kj < asal.headers.length; kj++) rj.push(sel(bi, kj));
          if (lama[bi + 1] === JSON.stringify(rj)) continue;
          for (var kt = 0; kt < asal.headers.length; kt++) {
            var asliJ = (l._v[bi] || [])[kt];
            if (adaIsi(asliJ)) tipeSet[asal.headers[kt]][jenisSel(asliJ)] = true;
          }
          berubah.push({ baris: bi + 1, nilai: rj });
        }
        var tipeJ = {};
        asal.headers.forEach(function (h) { tipeJ[h] = teksTipe(tipeSet[h]); });
        hasil[l._nama] = { jarang: true, headers: asal.headers.slice(), tipe: tipeJ, jumlah_baris: u.b - 1, baris_berubah: berubah, baru: false };
        return;
      }
      for (var j = 0; j < u.k; j++) { headers.push(u.b ? String(sel(0, j)) : ''); tipeKolom.push({}); }
      for (var i = 1; i < u.b; i++) {
        var r = [];
        for (var k = 0; k < u.k; k++) {
          var asli = (l._v[i] || [])[k], x = sel(i, k);
          if (adaIsi(asli)) tipeKolom[k][jenisSel(asli)] = true;
          r.push(x);
        }
        rows.push(r);
      }
      var tipe = {};
      headers.forEach(function (h, k) { tipe[h] = teksTipe(tipeKolom[k]); });
      hasil[l._nama] = { headers: headers, rows: rows, tipe: tipe, baru: !D.sheets[l._nama] };
    });
    return hasil;
  }

  return {
    __CATAT: CATAT,
    __ekspor: ekspor,
    __pasangTemplat: function (t, g) { TEMPLAT = t || {}; CARI_GLOBAL = g || CARI_GLOBAL; },
    Date: DateZona,
    SpreadsheetApp: tanpaDikenal('SpreadsheetApp', {
      getActiveSpreadsheet: function () { return SS; },
      getActive: function () { return SS; },
      flush: function () {},
      openById: function () { catatSekali(CATAT.layanan, 'SpreadsheetApp.openById'); throw new Error('GAS lokal: openById tidak tersedia'); },
      openByUrl: function () { catatSekali(CATAT.layanan, 'SpreadsheetApp.openByUrl'); throw new Error('GAS lokal: openByUrl tidak tersedia'); },
      getUi: function () { catatSekali(CATAT.layanan, 'SpreadsheetApp.getUi'); throw new Error('GAS lokal: getUi tidak tersedia'); },
      create: function (nama, baris, kolom) { catatSekali(CATAT.layanan, 'SpreadsheetApp.create (di memori)'); return bukuBaru(nama, baris, kolom); },
      BorderStyle: { DOTTED: 'DOTTED', DASHED: 'DASHED', SOLID: 'SOLID', SOLID_MEDIUM: 'SOLID_MEDIUM', SOLID_THICK: 'SOLID_THICK', DOUBLE: 'DOUBLE' },
    }),
    Utilities: Utilities,
    Session: Session,
    LockService: { getScriptLock: function () { return kunci; }, getDocumentLock: function () { return kunci; }, getUserLock: function () { return kunci; } },
    CacheService: { getScriptCache: function () { return cache.script; }, getUserCache: function () { return cache.user; }, getDocumentCache: function () { return cache.document; } },
    PropertiesService: { getScriptProperties: function () { return prop.script; }, getUserProperties: function () { return prop.user; }, getDocumentProperties: function () { return prop.document; } },
    ContentService: {
      createTextOutput: function (x) { return new Keluaran(x === undefined ? '' : x); },
      MimeType: { JSON: 'JSON', TEXT: 'TEXT', JAVASCRIPT: 'JAVASCRIPT', CSV: 'CSV', XML: 'XML', ICAL: 'ICAL', RSS: 'RSS', ATOM: 'ATOM', VCARD: 'VCARD' },
    },
    ScriptApp: tanpaDikenal('ScriptApp', {
      // Alamat web app = alamat web Worker yang sedang melayani (D.urlWeb), supaya tautan antarhalaman tetap di sini.
      getService: function () { return { getUrl: function () { return D.urlWeb || 'https://script.google.com/macros/s/GAS-LOKAL/exec'; } }; },
      // D.pemicu hanya untuk uji: [{ uid, fungsi }] meniru pemicu terpasang.
      getProjectTriggers: function () {
        return (D.pemicu || []).map(function (p) {
          return { getUniqueId: function () { return String(p.uid); }, getHandlerFunction: function () { return p.fungsi; }, getEventType: function () { return 'CLOCK'; } };
        });
      },
      newTrigger: function () { catatSekali(CATAT.layanan, 'ScriptApp.newTrigger'); return tanpaDikenal('TriggerBuilder', {}); },
      deleteTrigger: function () { catatSekali(CATAT.layanan, 'ScriptApp.deleteTrigger'); },
      // Hanya dipakai payroll untuk mengambil ekspor XLSX, yang dilayani UrlFetchApp tiruan di memori. Bukan token sungguhan.
      getOAuthToken: function () { catatSekali(CATAT.layanan, 'ScriptApp.getOAuthToken (tiruan)'); return 'gas-lokal-tanpa-token'; },
      AuthMode: { FULL: 'FULL', LIMITED: 'LIMITED', NONE: 'NONE' },
    }),
    MailApp: {
      sendEmail: function () { catatSekali(CATAT.layanan, 'MailApp.sendEmail (tidak dikirim)'); },
      getRemainingDailyQuota: function () { return 0; },
    },
    UrlFetchApp: UrlFetchApp,
    GmailApp: tidakTersedia('GmailApp'),
    DriveApp: DriveApp,
    HtmlService: HtmlService,
    Browser: tidakTersedia('Browser'),
    Logger: Logger,
    console: { log: function () { catatLog(arguments); }, info: function () { catatLog(arguments); }, warn: function () { catatLog(arguments); }, error: function () { catatLog(arguments); }, time: function () {}, timeEnd: function () {} },
  };
}

// Nama layanan yang dipasang sebagai variabel global kode GAS (urutannya tidak penting).
export const NAMA_LAYANAN = ['Date', 'SpreadsheetApp', 'Utilities', 'Session', 'LockService', 'CacheService', 'PropertiesService',
  'ContentService', 'ScriptApp', 'MailApp', 'UrlFetchApp', 'GmailApp', 'DriveApp', 'HtmlService', 'Browser', 'Logger', 'console'];

// Satu permintaan PWA: POST text/plain berisi {token, action, op_id, data}, seperti yang diterima doPost di produksi.
export function buatPermintaanPost(isiJson) {
  return { postData: { contents: isiJson, type: 'text/plain', length: isiJson.length, name: 'postData' }, parameter: {}, parameters: {}, contextPath: '', contentLength: isiJson.length, queryString: '' };
}

// Objek e untuk doGet dari query string, seperti di GAS: parameter berisi nilai pertama, parameters semua nilai.
export function buatPermintaanGet(queryString) {
  var qs = String(queryString || '').replace(/^\?/, ''), parameter = {}, parameters = {};
  qs.split('&').forEach(function (p) {
    if (!p) return;
    var i = p.indexOf('=');
    var k = decodeURIComponent((i < 0 ? p : p.slice(0, i)).replace(/\+/g, ' '));
    var v = i < 0 ? '' : decodeURIComponent(p.slice(i + 1).replace(/\+/g, ' '));
    if (!Object.prototype.hasOwnProperty.call(parameter, k)) parameter[k] = v;
    (parameters[k] = parameters[k] || []).push(v);
  });
  return { parameter: parameter, parameters: parameters, queryString: qs, contextPath: '', contentLength: -1, pathInfo: '' };
}

// Nilai balik fungsi server untuk google.script.run: hanya primitif, larik, dan objek polos yang sah. Jawaban yang
// memuat Date (atau jenis lain yang tidak sah) diterima peramban sebagai null, karena itulah kode GAS sendiri
// membungkus sebagian jawabannya dengan JSON.parse(JSON.stringify(...)).
export function hasilRun(v) {
  var sah = true;
  (function periksa(x) {
    if (!sah || x === null || x === undefined) return;
    var t = typeof x;
    if (t === 'number' || t === 'string' || t === 'boolean') return;
    if (t === 'function' || t === 'symbol' || t === 'bigint' || x instanceof Date) { sah = false; return; }
    if (Array.isArray(x)) { x.forEach(periksa); return; }
    var p = Object.getPrototypeOf(x);
    if (p !== Object.prototype && p !== null) { sah = false; return; }
    Object.keys(x).forEach(function (k) { periksa(x[k]); });
  })(v);
  return sah ? (v === undefined ? null : JSON.parse(JSON.stringify(v))) : null;
}

// Hasil public.cermin_baca → data untuk buatLayanan.
export function dataDariCermin(cermin, zonaSkrip) {
  const meta = cermin.meta || {};
  return {
    zonaSkrip,
    zonaSheet: meta.zona_waktu || null,
    judul: meta.judul || '',
    dilewati: String(meta.sheet_dilewati || '').split(',').map((s) => s.trim()).filter(Boolean),
    sinkron: meta.sinkron_terakhir || null,
    sheets: cermin.sheets || {},
  };
}

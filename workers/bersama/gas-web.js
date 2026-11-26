// Halaman web GAS asli yang disajikan Worker (MAR Web): pengganti pustaka google.script di peramban, dan
// penyisipannya ke HTML hasil doGet. Di GAS, halaman berjalan di iframe Google yang sudah membawa google.script;
// di sini halaman disajikan langsung, jadi google.script disisipkan sebelum skrip halaman mana pun.

// google.script.run.withSuccessHandler(f).withFailureHandler(g).withUserObject(o).namaFungsi(...args)
// dikirim ke POST <urlRun> sebagai {fn, args}; jawabannya {ok, hasil} atau {ok: false, error}.
export function skripGoogleScript(urlRun, labelSite = '') {
  return `<script>
(function () {
  var URL_RUN = ${JSON.stringify(urlRun)};
  function pelari(sukses, gagal, objek) {
    return new Proxy({}, { get: function (_, nama) {
      if (typeof nama !== 'string') return undefined;
      if (nama === 'withSuccessHandler') return function (f) { return pelari(f, gagal, objek); };
      if (nama === 'withFailureHandler') return function (g) { return pelari(sukses, g, objek); };
      if (nama === 'withUserObject') return function (o) { return pelari(sukses, gagal, o); };
      return function () {
        var args = Array.prototype.slice.call(arguments);
        fetch(URL_RUN, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn: nama, args: args }) })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (j && j.ok) { if (sukses) sukses(j.hasil, objek); }
            else { var e = new Error((j && j.error) || 'Gagal memanggil server'); e.name = 'ScriptError'; if (gagal) gagal(e, objek); }
          })
          .catch(function (err) { if (gagal) gagal(err, objek); });
      };
    } });
  }
  window.google = window.google || {};
  google.script = google.script || {};
  google.script.run = pelari(null, null, undefined);
  google.script.host = { origin: location.origin, close: function () {}, setHeight: function () {}, setWidth: function () {}, editor: { focus: function () {} } };
  google.script.url = { getLocation: function (cb) {
    var p = {}, ps = {};
    new URLSearchParams(location.search).forEach(function (v, k) { if (!(k in p)) p[k] = v; (ps[k] = ps[k] || []).push(v); });
    cb({ hash: location.hash.replace(/^#/, ''), parameter: p, parameters: ps });
  } };
  google.script.history = { push: function () {}, replace: function () {}, setChangeHandler: function () {} };

  // ── Penanda Nama Site di Nav Brand ──
  var SITE_LABEL = ${JSON.stringify(labelSite || '')};
  if (SITE_LABEL) {
    function pasangLabelSite() {
      var nb = document.querySelector('.nav-brand');
      if (nb && !nb.querySelector('.site-label-badge') && nb.textContent.indexOf(SITE_LABEL) === -1) {
        var sp = document.createElement('span');
        sp.className = 'site-label-badge';
        sp.style.cssText = 'margin-left: 8px; padding: 2px 8px; font-size: 0.75em; font-weight: 700; border-radius: 6px; background: rgba(0,0,0,0.07); border: 1px solid rgba(0,0,0,0.08); vertical-align: middle; display: inline-block; letter-spacing: 0.4px; color: inherit;';
        sp.textContent = SITE_LABEL;
        nb.appendChild(sp);
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', pasangLabelSite);
    } else {
      pasangLabelSite();
    }
  }

  // ── Penjaga Tautan Menu MAR Web ──
  // Di GAS asli, template menu memakai a[href*="/macros/s/"] untuk menempelkan token ke URL tujuan.
  // Di Worker, alamatnya adalah /web, sehingga selector /macros/s/ tidak menangkap tautan menu.
  // Skrip ini memastikan setiap navigasi /web atau ?page= tetap membawa token aktif.
  function ambilTokenAktif() {
    try {
      var sp = new URLSearchParams(location.search);
      var t = sp.get('token');
      if (t) return t;
      var pasangan = (document.cookie || '').split(';');
      for (var i = 0; i < pasangan.length; i++) {
        var p = pasangan[i].trim();
        if (p.indexOf('abadiops_token=') === 0) return decodeURIComponent(p.substring(15));
      }
      if (typeof PAGE_TOKEN !== 'undefined' && PAGE_TOKEN) return PAGE_TOKEN;
    } catch (_) {}
    return '';
  }
  function pasangTokenTautan() {
    var tok = ambilTokenAktif();
    if (!tok) return;
    var links = document.querySelectorAll('a[href*="/web"], a[href^="?"], a[href*="?page="]');
    for (var i = 0; i < links.length; i++) {
      var h = links[i].getAttribute('href') || '';
      if (!h || /token(=|%3d)/i.test(h) || h === '#' || h.indexOf('javascript:') === 0) continue;
      links[i].setAttribute('href', h + (h.indexOf('?') !== -1 ? '&' : '?') + 'token=' + encodeURIComponent(tok));
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', pasangTokenTautan);
  } else {
    pasangTokenTautan();
  }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a') : null;
    if (!a) return;
    var h = a.getAttribute('href') || '';
    if (!h || /token(=|%3d)/i.test(h) || h === '#' || h.indexOf('javascript:') === 0) return;
    if (h.indexOf('?page=') !== -1 || h.indexOf('/web') !== -1 || h.charAt(0) === '?') {
      var tok = ambilTokenAktif();
      if (tok) a.setAttribute('href', h + (h.indexOf('?') !== -1 ? '&' : '?') + 'token=' + encodeURIComponent(tok));
    }
  }, true);
})();
</script>`;
}

function escAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

// Sisipkan judul, meta, ikon, dan google.script ke awal <head> (atau awal dokumen bila tanpa <head>), seperti
// halaman luar yang dibuat GAS dari setTitle/addMetaTag/setFaviconUrl.
export function sisipkanKeHtml(html, { judul = '', meta = [], favicon = '', skrip = '', labelSite = '' } = {}) {
  let konten = html;
  if (labelSite) {
    const badge = ` <span class="site-label-badge" style="margin-left: 8px; padding: 2px 8px; font-size: 0.75em; font-weight: 700; border-radius: 6px; background: rgba(0,0,0,0.07); border: 1px solid rgba(0,0,0,0.08); vertical-align: middle; display: inline-block; letter-spacing: 0.4px; color: inherit;">${escAttr(labelSite)}</span>`;
    konten = konten.replace(/(class=["'][^"']*nav-brand[^"']*["'][^>]*>[\s\S]*?)(<\/div>)/gi, (match, p1, p2) => {
      if (p1.includes('site-label-badge') || p1.includes(labelSite)) return match;
      return p1 + badge + p2;
    });
  }
  const kepala = [
    judul ? `<title>${escAttr(judul)}</title>` : '',
    ...meta.map((m) => `<meta name="${escAttr(m.nama)}" content="${escAttr(m.isi)}">`),
    favicon ? `<link rel="icon" href="${escAttr(favicon)}">` : '',
    skrip,
  ].filter(Boolean).join('\n');
  const m = /<head[^>]*>/i.exec(konten);
  if (m) return konten.slice(0, m.index + m[0].length) + '\n' + kepala + '\n' + konten.slice(m.index + m[0].length);
  const d = /<!doctype[^>]*>/i.exec(konten);
  if (d) return konten.slice(0, d.index + d[0].length) + '\n' + kepala + '\n' + konten.slice(d.index + d[0].length);
  return kepala + '\n' + konten;
}

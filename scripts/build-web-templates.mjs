/**
 * scripts/build-web-templates.mjs
 *
 * Mengompilasi template HTML Google Apps Script (GAS) di folder `workers/<rumah>/web/`
 * menjadi modul JavaScript `src/web-templates.js` di masing-masing worker rumah.
 *
 * Sesuai koridor AGENTS.md §0a & docs/KEPUTUSAN.md (Langkah 6):
 * - Zero-eval saat runtime (kompatibel penuh dengan Cloudflare Workers V8 Sandbox).
 * - Salinan 1:1 tanpa mengubah template HTML sumber.
 * - Menyertakan client shim `window.google.script.run` yang meneruskan panggilan ke `/api/web`.
 */

import fs from 'fs';
import path from 'path';

const THEME_CSS = `<style id="ds-theme">
:root{
  --bg:#F8FAFC;--bg-secondary:#F3F4F6;--card:#FFFFFF;--border:#E5E7EB;--divider:#E5E7EB;
  --text:#111827;--text-secondary:#6B7280;--text-disabled:#9CA3AF;
  --primary:#4F633F;--primary-hover:#384B2B;--primary-active:#223215;--primary-soft:#F1F4EE;--primary-soft-border:#D2E9BB;
  --tertiary-10:#0B1407;--tertiary-20:#223215;--tertiary-30:#384B2B;--tertiary-40:#4F633F;--tertiary-50:#687D56;--tertiary-60:#81956F;--tertiary-70:#9BB288;--tertiary-80:#B6CDA1;--tertiary-90:#D2E9BB;--tertiary-95:#DEF7C7;--tertiary-98:#EEFEDA;
  --success:#10B981;--warning:#F59E0B;--error:#EF4444;--info:#0EA5E9;
  --radius:16px;--radius-sm:10px;--input-border:#D1D5DB;
  --shadow:0 4px 12px rgba(0,0,0,.05);--shadow-hover:0 8px 24px rgba(0,0,0,.08);
  --focus-ring:0 0 0 3px rgba(79,99,63,.25);
}
body{background:var(--bg)!important;color:var(--text)!important;}
a{color:var(--primary);}
.navbar{background:var(--card)!important;border-bottom:1px solid var(--border)!important;box-shadow:0 1px 2px rgba(0,0,0,.04)!important;}
.nav-brand{color:var(--text)!important;}
.nav-link{color:var(--text-secondary)!important;border-radius:var(--radius-sm)!important;}
.nav-link:hover{background:var(--bg-secondary)!important;color:var(--text)!important;}
.nav-link.active{background:var(--primary-soft)!important;color:var(--primary)!important;box-shadow:inset 0 -2px 0 var(--primary)!important;border-color:var(--primary)!important;}
.user-email{color:var(--text-secondary)!important;}
.btn-primary,.btn-create,.btn-edit,.btn-save,.btn-download,.btn-submit,.btn-export,.btn-approve,.btn-utama{
  background:var(--primary)!important;color:#fff!important;border:1px solid var(--primary)!important;border-radius:var(--radius-sm)!important;}
.btn-primary:hover,.btn-create:hover,.btn-edit:hover,.btn-save:hover,.btn-download:hover,.btn-submit:hover,.btn-export:hover,.btn-approve:hover,.btn-utama:hover{
  background:var(--primary-hover)!important;border-color:var(--primary-hover)!important;}
.btn-secondary,.btn-cancel,.btn-back,.btn-back-to-self{
  background:var(--card)!important;color:var(--text)!important;border:1px solid var(--border)!important;border-radius:var(--radius-sm)!important;}
.btn-secondary:hover,.btn-cancel:hover,.btn-back:hover,.btn-back-to-self:hover{background:var(--bg-secondary)!important;}
.btn-danger,.btn-reject{background:var(--error)!important;color:#fff!important;border:1px solid var(--error)!important;border-radius:var(--radius-sm)!important;}
.btn-danger:hover,.btn-reject:hover{background:#DC2626!important;}
.btn-success{background:var(--success)!important;color:#fff!important;border:1px solid var(--success)!important;border-radius:var(--radius-sm)!important;}
.card,.stat-card,.form-container,.wo-card{background:var(--card)!important;border:1px solid var(--border)!important;border-radius:var(--radius)!important;box-shadow:var(--shadow)!important;}
.card:hover,.stat-card:hover,.wo-card:hover{box-shadow:var(--shadow-hover)!important;}
</style>`;

const CLIENT_SHIM = `<script id="abadi-gas-shim">
(function() {
  if (window.google && window.google.script && window.google.script.run) return;
  function getQueryToken() {
    try {
      var p = new URLSearchParams(window.location.search);
      return p.get('token') || '';
    } catch (_) { return ''; }
  }
  function createRunner(successHandler, failureHandler, userObj) {
    return new Proxy({}, {
      get: function(target, prop) {
        if (prop === 'withSuccessHandler') {
          return function(fn) { return createRunner(fn, failureHandler, userObj); };
        }
        if (prop === 'withFailureHandler') {
          return function(fn) { return createRunner(successHandler, fn, userObj); };
        }
        if (prop === 'withUserObject') {
          return function(obj) { return createRunner(successHandler, failureHandler, obj); };
        }
        return function() {
          var args = Array.prototype.slice.call(arguments);
          var tok = window.__PAGE_TOKEN__ || (typeof PAGE_TOKEN !== 'undefined' ? PAGE_TOKEN : '') || getQueryToken();
          var payload = {
            token: tok,
            action: prop,
            data: args[0] !== undefined ? args[0] : null,
            args: args
          };
          fetch('/api/web', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
          .then(function(res) {
            return res.text().then(function(text) {
              var json = null;
              try { json = JSON.parse(text); } catch(_) {}
              if (!res.ok) {
                var errMsg = (json && json.error && (json.error.message || json.error)) || ('HTTP ' + res.status + ': ' + text);
                var err = new Error(errMsg);
                if (failureHandler) failureHandler(err, userObj);
                else alert('Galat server: ' + errMsg);
                return;
              }
              if (json) {
                if (successHandler) successHandler(json, userObj);
              } else {
                if (successHandler) successHandler(text, userObj);
              }
            });
          })
          .catch(function(err) {
            if (failureHandler) failureHandler(err, userObj);
            else alert('Sambungan terputus: ' + (err.message || err));
          });
        };
      }
    });
  }
  window.google = { script: { run: createRunner(null, null, null) } };
  // Event delegation untuk menjaga ?token= pada semua navigasi internal /web
  document.addEventListener('click', function(e) {
    var a = e.target && e.target.closest('a');
    if (a && a.href && a.origin === window.location.origin && a.pathname.startsWith('/web')) {
      var u = new URL(a.href);
      var tok = window.__PAGE_TOKEN__ || (typeof PAGE_TOKEN !== 'undefined' ? PAGE_TOKEN : '') || getQueryToken();
      if (tok && !u.searchParams.has('token')) {
        u.searchParams.set('token', tok);
        a.href = u.toString();
      }
    }
  }, true);
})();
</script>`;

function compileGasTemplateToFunction(rawHtml, dir) {
  // Pre-load includes
  const includes = {};
  const allFiles = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
  for (const f of allFiles) {
    const base = path.basename(f, '.html');
    includes[base] = fs.readFileSync(path.join(dir, f), 'utf8');
  }

  // 1. Resolve includes
  let html = rawHtml.replace(/<\?!=\s*include\(['"]([^'"]+)['"]\)\s*\?>/g, (match, incName) => {
    return includes[incName] || '';
  });

  // 2. Resolve getThemeCSS()
  html = html.replace(/<\?!=\s*getThemeCSS\(\)\s*\?>/g, THEME_CSS);

  // 3. Inject Client Shim right before </head> or at beginning
  if (html.includes('</head>')) {
    html = html.replace('</head>', CLIENT_SHIM + '\n</head>');
  } else {
    html = CLIENT_SHIM + '\n' + html;
  }

  // 4. Tokenize
  const tokens = [];
  let lastIdx = 0;
  const regex = /<\?(=|!=)?([\s\S]*?)\?>/g;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const textBefore = html.slice(lastIdx, match.index);
    if (textBefore.length > 0) {
      tokens.push({ type: 'text', val: textBefore });
    }
    const mode = match[1];
    const code = match[2];
    if (mode === '=') {
      tokens.push({ type: 'escaped_expr', val: code.trim() });
    } else if (mode === '!=') {
      tokens.push({ type: 'raw_expr', val: code.trim() });
    } else {
      tokens.push({ type: 'code', val: code });
    }
    lastIdx = regex.lastIndex;
  }
  const remaining = html.slice(lastIdx);
  if (remaining.length > 0) {
    tokens.push({ type: 'text', val: remaining });
  }

  // 5. Generate function body
  let js = `
    ctx = ctx || {};
    var baseUrl = ctx.baseUrl || '/web';
    var token = ctx.token || '';
    var user = ctx.user || { email: '', role: 'supervisor', mechanic_name: '' };
    var userScope = ctx.userScope || null;
    var currentView = ctx.currentView || 'pending';
    var activeFilter = ctx.activeFilter || 'all';
    var PAYROLL_CUTOFF_TANGGAL = ctx.PAYROLL_CUTOFF_TANGGAL || 25;
    var viewAsMechanicId = ctx.viewAsMechanicId || '';
    var backToken = ctx.backToken || token;
    var tampilkanMeter = ctx.tampilkanMeter !== false;
    var hmTerakhir = ctx.hmTerakhir || {};
    var kmTerakhir = ctx.kmTerakhir || {};
    var units = ctx.units || [];
    var components = ctx.components || [];
    var mechanics = ctx.mechanics || [];
    var workConditions = ctx.workConditions || [];
    var pendingApprovals = ctx.pendingApprovals || [];
    var allMechanics = ctx.allMechanics || [];
    var pendingTransfers = ctx.pendingTransfers || [];
    var activeWos = ctx.activeWos || [];
    var approvedWos = ctx.approvedWos || [];
    var rejectedWos = ctx.rejectedWos || [];
    var initialData = ctx.initialData || { wos: [], counts: { all:0, assigned:0, in_progress:0, pending_approval:0, done:0 } };
    var monitoringData = ctx.monitoringData || [];
    var mons = ctx.mons || [];
    var dashboardData = ctx.dashboardData || { stats: {}, recentWOs: [], charts: {} };

    var ScriptApp = { getService: function() { return { getUrl: function() { return baseUrl; } }; } };
    function getScriptUrl() { return baseUrl; }
    function getScriptTimeZone() { return 'Asia/Jakarta'; }
    function namaOrang(s) { return s || ''; }
    function safeParse(d, fb) { try { return typeof d === 'string' ? JSON.parse(d) : (d || fb); } catch(_) { return fb; } }
    function include(name) { return ${JSON.stringify(includes)}[name] || ''; }

    function canAccessDashboard(r) { r = String(r || '').toLowerCase(); return r === 'supervisor' || r === 'superintendent' || r === 'admin'; }
    function canAccessCreateWO(r) { r = String(r || '').toLowerCase(); return r !== 'mechanic'; }
    function canAccessApprovals(r) { r = String(r || '').toLowerCase(); return r === 'supervisor' || r === 'superintendent' || r === 'foreman_approver' || r === 'admin'; }
    function canAccessReports(r) { r = String(r || '').toLowerCase(); return r === 'supervisor' || r === 'superintendent' || r === 'admin'; }
    function bolehMenuCancelWo(r) { r = String(r || '').toLowerCase(); return r === 'supervisor' || r === 'superintendent' || r === 'admin'; }
    function bolehBukaExpired(r) { return true; }
    function bolehCancelWo(r) { return true; }

    var _out = '';
    var _esc = function(s) { return s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); };
    var _raw = function(s) { return s == null ? '' : String(s); };
  `;

  for (const t of tokens) {
    if (t.type === 'text') {
      js += `_out += ${JSON.stringify(t.val)};\n`;
    } else if (t.type === 'escaped_expr') {
      js += `_out += _esc(${t.val});\n`;
    } else if (t.type === 'raw_expr') {
      js += `_out += _raw(${t.val});\n`;
    } else if (t.type === 'code') {
      js += `${t.val}\n`;
    }
  }

  js += `return _out;\n`;
  return js;
}

export function buildHouseTemplates(rumahFolder) {
  const webDir = path.join(rumahFolder, 'web');
  const targetFile = path.join(rumahFolder, 'src', 'web-templates.js');
  if (!fs.existsSync(webDir)) {
    console.error(`Folder web tidak ditemukan: ${webDir}`);
    return;
  }

  const files = fs.readdirSync(webDir).filter(f => f.endsWith('.html'));
  const pageMap = {};

  let fileContent = `/**
 * Generated by scripts/build-web-templates.mjs
 * JANGAN SUNTING LANGSUNG. Sumber ada di workers/<rumah>/web/
 */

`;

  for (const f of files) {
    const baseName = path.basename(f, '.html');
    if (['DateTime24', 'Styles', 'PANDUAN'].includes(baseName)) continue;
    const fnName = 'render_' + baseName.toLowerCase();
    pageMap[baseName.toLowerCase()] = fnName;

    const rawHtml = fs.readFileSync(path.join(webDir, f), 'utf8');
    const fnBody = compileGasTemplateToFunction(rawHtml, webDir);
    fileContent += `function ${fnName}(ctx) {\n${fnBody}\n}\n\n`;
  }

  fileContent += `const PAGE_RENDERERS = {\n`;
  for (const [page, fn] of Object.entries(pageMap)) {
    fileContent += `  '${page}': ${fn},\n`;
  }
  // Alias rute standar GAS (Router.gs)
  if (pageMap['main']) fileContent += `  'dashboard': ${pageMap['main']},\n`;
  if (pageMap['workorder']) fileContent += `  'create': ${pageMap['workorder']},\n`;
  if (pageMap['mechanicdashboard']) {
    fileContent += `  'mechanic': ${pageMap['mechanicdashboard']},\n`;
    fileContent += `  'monitoring': ${pageMap['mechanicdashboard']},\n`;
  }
  if (pageMap['approval']) fileContent += `  'approvals': ${pageMap['approval']},\n`;
  if (pageMap['cancelwo']) fileContent += `  'cancel': ${pageMap['cancelwo']},\n`;
  fileContent += `};\n\n`;

  fileContent += `export function renderWebPage(pageName, ctx) {
  const norm = String(pageName || '').toLowerCase().trim();
  const renderer = PAGE_RENDERERS[norm];
  if (!renderer) {
    // Default fallback
    const fallback = PAGE_RENDERERS['main'] || PAGE_RENDERERS['dashboard'] || Object.values(PAGE_RENDERERS)[0];
    if (fallback) return fallback(ctx);
    return '<!DOCTYPE html><html><body><h1>Halaman tidak ditemukan: ' + norm + '</h1></body></html>';
  }
  return renderer(ctx);
}
`;

  fs.writeFileSync(targetFile, fileContent, 'utf8');
  console.log(`[SUKSES] Kompilasi ${rumahFolder} -> ${targetFile} (${files.length} template)`);
}

// Jalankan untuk ketiga rumah
const houses = ['workers/kmbprojek', 'workers/sum', 'workers/kmb'];
for (const h of houses) {
  buildHouseTemplates(h);
}

import fs from 'fs';

let workerCode = fs.readFileSync('worker.js', 'utf8');

// 1. Update Dual-Engine Router in worker.js
const oldHandlerStart = "    if (pathname === 'api/gas' && request.method === 'POST') {";
const oldHandlerEnd = "        return new Response(gasJson, {\n          status: gasRes.status,\n          headers: {\n            'Content-Type': 'application/json; charset=utf-8',\n            'Cache-Control': 'no-cache, no-store, must-revalidate',\n            'Access-Control-Allow-Origin': '*',\n            'X-Target-System': targetSystem\n          }\n        });";

const newRouterCode = `    if (pathname === 'api/gas' && request.method === 'POST') {
      try {
        const bodyText = await request.text();
        const contentType = request.headers.get('Content-Type') || 'text/plain;charset=utf-8';

        let targetSystem = 'KMB';
        let action = '';
        let tok = '';
        let parsedData = {};

        const sysHeader = request.headers.get('x-mar-system') || request.headers.get('x-mar-tenant');
        const sysQuery = url.searchParams.get('system') || url.searchParams.get('tenant');
        if (sysHeader?.toUpperCase() === 'SUM' || sysQuery?.toUpperCase() === 'SUM') {
          targetSystem = 'SUM';
        }

        try {
          if (contentType.includes('application/x-www-form-urlencoded')) {
            const params = new URLSearchParams(bodyText);
            action = params.get('action') || '';
            const sys = (params.get('system') || '').toUpperCase();
            if (sys === 'SUM') targetSystem = 'SUM';
            const raw = params.get('data');
            if (raw) parsedData = JSON.parse(raw);
            tok = parsedData.token || '';
          } else {
            const peek = JSON.parse(bodyText);
            action = peek.action || '';
            tok = String(peek.token || '');
            const sys = (peek.system || peek.tenant || '').toUpperCase();
            if (sys === 'SUM') targetSystem = 'SUM';
            parsedData = peek.data || {};
          }
        } catch (_) {}

        if (tok.toLowerCase().startsWith('sum-') || tok.toLowerCase().startsWith('sum_') || tok.toLowerCase() === 'sum') {
          targetSystem = 'SUM';
        }

        const supabaseUrl = env?.SUPABASE_URL || 'https://sptgqsjgszwbreikxdph.supabase.co';
        const supabaseKey = env?.SUPABASE_ANON_KEY || 'sb_publishable_PoWC64yv25bZizBrTL79vw_CuNQwhp3';

        // =========================================================================
        // SUPABASE DUAL-ENGINE READ ROUTER (KMB Project)
        // Sub-50ms reads from live Supabase Singapore
        // =========================================================================
        if (targetSystem === 'KMB' && supabaseUrl && supabaseKey) {
          const supaHeaders = {
            'apikey': supabaseKey,
            'Authorization': 'Bearer ' + supabaseKey,
            'Content-Type': 'application/json'
          };

          if (action === 'ping' && tok) {
            try {
              const r = await fetch(supabaseUrl + '/rest/v1/rpc/kmb_ping', {
                method: 'POST',
                headers: supaHeaders,
                body: JSON.stringify({ p_token: tok })
              });
              const d = await r.json();
              if (d && d.success) {
                return new Response(JSON.stringify(d), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'X-Active-Engine': 'SUPABASE' }
                });
              }
            } catch (_) {}
          }

          if (action === 'pull_create_refs') {
            try {
              const r = await fetch(supabaseUrl + '/rest/v1/rpc/kmb_create_refs', {
                method: 'POST',
                headers: supaHeaders,
                body: JSON.stringify({})
              });
              const d = await r.json();
              if (d && d.success) {
                return new Response(JSON.stringify(d), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'X-Active-Engine': 'SUPABASE' }
                });
              }
            } catch (_) {}
          }

          if (action === 'pull_monitoring') {
            try {
              const r = await fetch(supabaseUrl + '/rest/v1/rpc/kmb_monitoring', {
                method: 'POST',
                headers: supaHeaders,
                body: JSON.stringify({})
              });
              const d = await r.json();
              if (d && d.success) {
                return new Response(JSON.stringify(d), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'X-Active-Engine': 'SUPABASE' }
                });
              }
            } catch (_) {}
          }

          if (action === 'pull_my_wos') {
            try {
              const mechId = parsedData?.mechanic_id || tok;
              const r = await fetch(supabaseUrl + '/rest/v1/rpc/kmb_my_wos', {
                method: 'POST',
                headers: supaHeaders,
                body: JSON.stringify({ p_mechanic_id: mechId })
              });
              const d = await r.json();
              if (d && d.success && Array.isArray(d.result?.wos) && d.result.wos.length > 0) {
                return new Response(JSON.stringify(d), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'X-Active-Engine': 'SUPABASE' }
                });
              }
            } catch (_) {}
          }
        }

        const targetGasUrl = targetSystem === 'SUM'
          ? (env?.APPSCRIPT_URL_SUM || GAS_URLS.SUM)
          : (env?.APPSCRIPT_URL_KMB || env?.APPSCRIPT_URL || GAS_URLS.KMB);

        const gasRes = await fetch(targetGasUrl, {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body: bodyText,
          redirect: 'follow'
        });
        const gasJson = await gasRes.text();
        return new Response(gasJson, {
          status: gasRes.status,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Access-Control-Allow-Origin': '*',
            'X-Active-Engine': 'GAS',
            'X-Target-System': targetSystem
          }
        });`;

// Normalize line endings to LF for replacement
const normalizedWorker = workerCode.replace(/\r\n/g, '\n');
const startIdx = normalizedWorker.indexOf("    if (pathname === 'api/gas' && request.method === 'POST') {");
const endTarget = "        return new Response(gasJson, {\n          status: gasRes.status,\n          headers: {\n            'Content-Type': 'application/json; charset=utf-8',\n            'Cache-Control': 'no-cache, no-store, must-revalidate',\n            'Access-Control-Allow-Origin': '*',\n            'X-Target-System': targetSystem\n          }\n        });";
const endIdx = normalizedWorker.indexOf(endTarget);

if (startIdx >= 0 && endIdx >= 0) {
  const before = normalizedWorker.slice(0, startIdx);
  const after = normalizedWorker.slice(endIdx + endTarget.length);
  workerCode = before + newRouterCode + after;
  console.log('✅ Successfully replaced /api/gas handler with Supabase Dual-Engine Router!');
} else {
  console.error('❌ Could not locate /api/gas block:', { startIdx, endIdx });
}

// 2. Pack assets from built-index.html, built-style.css, patched-app.js
const html = fs.readFileSync('scripts/built-index.html', 'utf8');
const css = fs.readFileSync('scripts/built-style.css', 'utf8');
const app = fs.readFileSync('scripts/patched-app.js', 'utf8');

console.log('Assets size -> HTML:', html.length, 'CSS:', css.length, 'APP:', app.length);

const jsonHtml = JSON.stringify(html);
const jsonCss = JSON.stringify(css);
const jsonApp = JSON.stringify(app);

workerCode = workerCode.replace(/'index\.html':\s*"[\s\S]*?",\s*'style\.css'/, `'index.html': ${jsonHtml},\n  'style.css'`);
workerCode = workerCode.replace(/'style\.css':\s*"[\s\S]*?",\s*'app\.js'/, `'style.css': ${jsonCss},\n  'app.js'`);
workerCode = workerCode.replace(/'app\.js':\s*"[\s\S]*?",\s*'data\.js'/, `'app.js': ${jsonApp},\n  'data.js'`);

fs.writeFileSync('worker.js', workerCode, 'utf8');
console.log('🎉 Successfully created and packed final worker.js with Supabase Engine!');

#!/usr/bin/env node
/**
 * H-IMPL — Aplicación de migraciones a Supabase LIVE (Management API).
 * Patrón del repo (REM/E-SEC): SQL directo por la API de gestión.
 * Uso: node scripts/h-impl/apply-migration.cjs supabase/migrations/<file>.sql
 */
const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..', '..');
const env = {};
for (const line of fs.readFileSync(path.join(REPO, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const REF = env.NEXT_PUBLIC_SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)[1];

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch { j = { raw: text }; }
  return { status: r.status, body: j };
}

(async () => {
  const file = process.argv[2];
  if (!file) { console.error('uso: apply-migration.cjs <ruta relativa del .sql>'); process.exit(2); }
  const full = path.join(REPO, file);
  const sql = fs.readFileSync(full, 'utf8');
  console.log(`▶ aplicando ${file} (${sql.length} chars)…`);
  const t0 = Date.now();
  const r = await q(sql);
  const ok2xx = r.status >= 200 && r.status < 300;
  const bodyStr = JSON.stringify(r.body);
  // error real: HTTP no-2xx, o cuerpo con error/exception explícito
  const hasError = !ok2xx || /"error"|ERROR:|does not exist|syntax error|ROLLBACK/i.test(bodyStr);
  if (hasError) {
    console.error(`❌ HTTP ${r.status}: ${bodyStr.slice(0, 800)}`);
    process.exit(1);
  }
  console.log(`✅ aplicado en ${Date.now() - t0}ms (HTTP ${r.status})`);
  if (Array.isArray(r.body) && r.body.length && r.body[0] && (r.body[0].error || r.body[0].message)) {
    console.log('   notas:', bodyStr.slice(0, 300));
  }
})().catch(e => { console.error('❌', e.message); process.exit(1); });

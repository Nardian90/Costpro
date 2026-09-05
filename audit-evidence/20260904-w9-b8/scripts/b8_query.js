#!/usr/bin/env node
/**
 * W9.5-B8 — Runner genérico de SQL contra la base LIVE de Supabase
 * vía Management API (misma vía usada por B-2 / H5-B3 / OBS-1).
 *
 * Uso: node /home/z/my-project/scripts/b8_query.js <archivo.sql> [archivo_salida]
 * - Lee SUPABASE_ACCESS_TOKEN y NEXT_PUBLIC_SUPABASE_URL desde
 *   /home/z/my-project/Costpro/.env (no imprime secretos).
 * - Cada invocación = 1 sesión; un bloque BEGIN...ROLLBACK dentro del
 *   archivo revierte TODOS sus efectos al finalizar (verificado en B-2).
 */
const fs = require('fs');

function loadEnv(p) {
  const txt = fs.readFileSync(p, 'utf8');
  const out = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = loadEnv('/home/z/my-project/Costpro/.env');
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || '';
const ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN || '';
if (!SUPABASE_URL || !ACCESS_TOKEN) {
  console.error('Faltan credenciales en .env');
  process.exit(1);
}
const PROJECT_REF = SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)[1];

const sqlPath = process.argv[2];
const outPath = process.argv[3];
if (!sqlPath) { console.error('Uso: node b8_query.js <archivo.sql> [salida]'); process.exit(1); }
const sql = fs.readFileSync(sqlPath, 'utf8');

(async () => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  let pretty = body;
  try { pretty = JSON.stringify(JSON.parse(body), null, 2); } catch {}
  if (outPath) {
    fs.writeFileSync(outPath, pretty);
    console.log(`OK HTTP ${res.status} → ${outPath} (${pretty.length} bytes)`);
  } else {
    console.log(`HTTP ${res.status}`);
    console.log(pretty.length > 60000 ? pretty.slice(0, 60000) + '\n...[truncado]' : pretty);
  }
  if (!res.ok) process.exit(2);
})().catch(e => { console.error('ERROR:', e.message); process.exit(3); });

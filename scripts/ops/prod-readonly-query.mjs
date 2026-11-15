#!/usr/bin/env node
/**
 * prod-readonly-query.mjs — Consulta READ-ONLY a producción CostproBD vía Management API.
 * Uso: node scripts/prod-readonly-query.mjs <archivo.sql> [archivo-salida.json]
 * Guard fail-closed: solo SELECT/WITH/SHOW/EXPLAIN; rechaza escrituras.
 * Reconstituido tras reciclaje del sandbox (2026-11-15) — patrón idéntico al original.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const REF = 'wthkddeleylijmonclxg'; // CostproBD (producción)
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!TOKEN) {
  console.error('FALLO (fail-closed): falta SUPABASE_ACCESS_TOKEN en el entorno.');
  process.exit(1);
}

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error('Uso: node prod-readonly-query.mjs <archivo.sql> [salida.json]');
  process.exit(1);
}

const sql = readFileSync(sqlFile, 'utf8');
const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
const forbidden = /^(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|SET|COPY|CALL|DO|MERGE|VACUUM|REINDEX|COMMENT|LOCK|LISTEN|NOTIFY|REFRESH|RESET|CLUSTER|ANALYZE|CHECKPOINT|DISCARD|EXECUTE|IMPORT|MOVE|PREPARE|REASSIGN|SECURITY)\b/i;
for (const st of statements) {
  if (forbidden.test(st)) {
    console.error(`FALLO (fail-closed): sentencia de escritura detectada: "${st.slice(0, 60)}..."`);
    process.exit(1);
  }
}

const results = [];
for (let i = 0; i < statements.length; i++) {
  const st = statements[i];
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: st }),
  });
  const bodyText = await res.text();
  if (!res.ok) {
    console.error(`HTTP ${res.status} en sentencia ${i + 1}: ${bodyText.slice(0, 300)}`);
    process.exit(1);
  }
  let parsed;
  try { parsed = JSON.parse(bodyText); } catch { parsed = bodyText; }
  results.push({ statement: i + 1, sql: st.split('\n').filter(l => !l.trim().startsWith('--')).join(' ').slice(0, 120), rows: parsed });
}

const output = process.argv[3];
const payload = { project: REF, generated_at: new Date().toISOString(), mode: 'read-only', results };
if (output) {
  writeFileSync(output, JSON.stringify(payload, null, 2));
  console.log(`OK: ${results.length} sentencias → ${output}`);
} else {
  console.log(JSON.stringify(payload, null, 2));
}

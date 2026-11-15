#!/usr/bin/env node
/**
 * val004-apply-e2e.mjs — Aplica una migración (archivo .sql) a la BD E2E AISLADA
 * vía Management API. Guard de aislamiento fail-closed (réplica del contrato
 * e2e/fixtures/assert-isolated-db.ts): el ref destino DEBE ser el ref E2E
 * conocido — el script NO puede apuntar a producción por construcción.
 * Uso: node scripts/val004-apply-e2e.mjs <migracion.sql> [--json salida.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const E2E_REF = 'lguovmvrozxgssupkwpf';
const PROD_REF = 'wthkddeleylijmonclxg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('FALLO: falta SUPABASE_ACCESS_TOKEN'); process.exit(1); }

const file = process.argv[2];
if (!file) { console.error('Uso: node scripts/val004-apply-e2e.mjs <migracion.sql>'); process.exit(1); }
const name = file.split('/').pop();
if (!/^\d{14}_.*\.sql$/.test(name)) { console.error(`FALLO: nombre de migración inválido: ${name}`); process.exit(1); }
if (name.includes(PROD_REF)) { console.error('FALLO: nombre sospechoso'); process.exit(1); }

// Guard de aislamiento (CP-INFRA-019): el único destino permitido es E2E.
const url = `https://api.supabase.com/v1/projects/${E2E_REF}/database/query`;
if (url.includes(PROD_REF)) { console.error('FALLO: url contendría ref de producción'); process.exit(1); }

const sql = readFileSync(file, 'utf8');
const res = await fetch(url, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const bodyText = await res.text();
let parsed;
try { parsed = JSON.parse(bodyText); } catch { parsed = bodyText; }
if (!res.ok) {
  console.error(`FALLO HTTP ${res.status} al aplicar ${name} en E2E (${E2E_REF}): ${bodyText.slice(0, 500)}`);
  process.exit(1);
}

const salida = { migracion: name, destino: E2E_REF, aplicada: true, resultado: parsed };
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(salida, null, 2));
console.log(`OK: ${name} aplicada a E2E (${E2E_REF})`);
process.exit(0);

#!/usr/bin/env node
/**
 * cpfin002-e2e-debug.mjs — Descompone el desequilibrio de la tienda del run E2E (solo lectura, BD aislada).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REF = 'lguovmvrozxgssupkwpf';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');

// Guard de aislamiento (fail-closed): este script SOLO opera contra la BD aislada.
const { assertIsolatedDb } = await import(join(REPO, 'e2e', 'fixtures', 'assert-isolated-db.cjs'));
await assertIsolatedDb();

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 500)}`);
  return JSON.parse(body);
}

// La tienda del último run E2E-20261119-* (el spec crea 'CPFIN-002' store)
const stores = await runSql(`SELECT id, name FROM stores WHERE name LIKE '%CPFIN%' ORDER BY created_at DESC LIMIT 5`);
console.log('stores:', JSON.stringify(stores));
const storeId = stores[0].id;

const bal = await runSql(`
WITH b AS (
  SELECT
    coalesce(round(sum(CASE WHEN c.clase = 'activo' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 2), 0) AS activo,
    coalesce(round(sum(CASE WHEN c.clase IN ('pasivo','patrimonio') THEN CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 2), 0) AS pas_pat,
    coalesce(round(sum(CASE WHEN c.clase = 'ingreso' THEN CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 2), 0) AS ingreso,
    coalesce(round(sum(CASE WHEN c.clase = 'gasto' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 2), 0) AS gasto
  FROM fin_movements m
  JOIN fin_entries e ON e.id = m.entry_id
  JOIN fin_categories c ON c.code = m.category_code
  WHERE m.store_id = '${storeId}'
)
SELECT activo, pas_pat, ingreso, gasto,
       activo - pas_pat - ingreso - gasto AS deseq FROM b`);
console.log('balance:', JSON.stringify(bal));

const entries = await runSql(`
SELECT e.id, e.document_type, e.event, e.status,
       round(sum(CASE WHEN m.sense='debito' THEN m.amount_cup ELSE 0 END),2) AS deb,
       round(sum(CASE WHEN m.sense='credito' THEN m.amount_cup ELSE 0 END),2) AS cre
FROM fin_entries e LEFT JOIN fin_movements m ON m.entry_id = e.id
WHERE e.store_id = '${storeId}'
GROUP BY e.id, e.document_type, e.event, e.status
HAVING abs(coalesce(sum(CASE WHEN m.sense='debito' THEN m.amount_cup ELSE 0 END),0) - coalesce(sum(CASE WHEN m.sense='credito' THEN m.amount_cup ELSE 0 END),0)) > 0.01`);
console.log('asientos desequilibrados:', JSON.stringify(entries));

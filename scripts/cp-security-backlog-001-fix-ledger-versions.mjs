#!/usr/bin/env node
/**
 * Corrección de las 6 filas de regularización del libro cuya `version` quedó
 * truncada a 13 caracteres (slice(0,13) en vez de 14 — hallazgo post-aplicación
 * del 2026-11-14). El libro es SOLO-ADICIÓN: no se tocan las filas 33-38; se
 * insertan las versiones CORRECTAS (14 caracteres, deducibles del nombre de
 * archivo) con nota que documenta la supersición. Canal: Management API con
 * guard CP-INFRA-019 doble flag.
 */
import { readFileSync } from 'fs';
import { createHash } from 'node:crypto';
import { resolve } from 'path';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
assertNotProduction({ mode: 'write', url: SUPABASE_URL, context: 'cp-security-backlog-001-fix-ledger-versions.mjs' });
if (ref !== 'wthkddeleylijmonclxg') { console.error('FALLO DE GUARD: no es producción'); process.exit(2); }

async function mgmt(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

const ROWS = [
  ['20261108141000', 'supabase/migrations/20261108141000_sales_dashboard_analytics.sql'],
  ['20261108150000', 'supabase/migrations/20261108150000_cp_operational_classification.sql'],
  ['20261108200000', 'supabase/migrations/20261108200000_cp_doc_sc006_store_code.sql'],
  ['20261108201000', 'supabase/migrations/20261108201000_cp_doc_sc006_receipt_document_number.sql'],
  ['20261108220000', 'supabase/migrations/20261108220000_sales_dashboard_stores_comparison.sql'],
  ['20261110120000', 'supabase/migrations/20261110120000_cp_plantillas_privadas_propietario.sql'],
];

for (const [version, file] of ROWS) {
  const sha = createHash('sha256').update(readFileSync(resolve(process.cwd(), file), 'utf8')).digest('hex');
  const nota = `CORRECCIÓN de la fila con version truncada a 13 chars (id con version ${version.slice(0, 13)}, mismo archivo/SHA — error tipográfico del aplicador, documentado en el expediente). ${''}`;
  const r = await mgmt(`INSERT INTO public.production_migration_ledger
    (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
  SELECT '${version}', '${file}', '${sha}', '2026-11-14', 'management_api',
         'audit-evidence/CP-SECURITY-BACKLOG-001/EXPEDIENTE.md', 'agent', 'applied',
         'CORRECCIÓN (CP-SECURITY-BACKLOG-001): fila con version truncada de 13 caracteres insertada por el mismo aplicador (mismo archivo/SHA-256, efectos verificados [MEDIDO 2026-11-14]). Esta fila porta la version CANÓNICA de 14 caracteres para que las verificaciones repo↔libro coincidan; la anterior queda como historial documentado del error tipográfico.'
  WHERE NOT EXISTS (SELECT 1 FROM public.production_migration_ledger WHERE version='${version}')
  RETURNING id, version`);
  console.log(`  ${version}: ${r.ok ? (JSON.parse(r.text)[0]?.id ?? 'ya existía (0 filas)') : 'ERROR ' + r.text.slice(0, 150)}`);
}

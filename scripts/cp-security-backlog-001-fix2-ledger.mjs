#!/usr/bin/env node
/**
 * Regularización ADICIONAL del libro (fase 2 del hallazgo del ledger-sync-check):
 * 3 migraciones post-baseline con efectos verificados en producción [MEDIDO
 * 2026-11-14] y sin fila (20261106100000, 20261107120000, 20261108120000).
 * La 20261106120000 NO se registra: es no-op en producción POR DISEÑO (SEC-005
 * cierre de sobrecargas — solo CostproE2E, documentado).
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
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ref = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
assertNotProduction({ mode: 'write', url: SUPABASE_URL, context: 'cp-security-backlog-001-fix2-ledger.mjs' });
if (ref !== 'wthkddeleylijmonclxg') { console.error('FALLO DE GUARD'); process.exit(2); }

async function mgmt(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return { ok: res.ok, text: await res.text() };
}

const ROWS = [
  ['20261106100000', 'supabase/migrations/20261106100000_cp_contract_surface_reconcile.sql',
   'REGULARIZACIÓN (CP-SECURITY-BACKLOG-001, sonda del ledger-sync-check): efecto verificado [MEDIDO 2026-11-14] — ACL EXECUTE de create_sale_v2 a authenticated presente. Aplicación original sin registro.'],
  ['20261107120000', 'supabase/migrations/20261107120000_cp_catalogo_maestro_sync_register_reception.sql',
   'REGULARIZACIÓN (CP-SECURITY-BACKLOG-001, sonda): efecto verificado [MEDIDO 2026-11-14] — register_reception con firma extendida (p_supplier_code…) presente. Aplicación original sin registro.'],
  ['20261108120000', 'supabase/migrations/20261108120000_cp_catalogo_reconciliacion_datos_compartidos.sql',
   'REGULARIZACIÓN (CP-SECURITY-BACKLOG-001, sonda): efecto verificado [MEDIDO 2026-11-14] — reconcile_store_catalog_shared_data presente. Aplicación original sin registro.'],
];

for (const [version, file, nota] of ROWS) {
  const sha = createHash('sha256').update(readFileSync(resolve(process.cwd(), file), 'utf8')).digest('hex');
  const r = await mgmt(`INSERT INTO public.production_migration_ledger
    (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
  SELECT '${version}', '${file}', '${sha}', '2026-11-14', 'management_api',
         'audit-evidence/CP-SECURITY-BACKLOG-001/EXPEDIENTE.md', 'agent', 'applied', '${nota}'
  WHERE NOT EXISTS (SELECT 1 FROM public.production_migration_ledger WHERE version='${version}')
  RETURNING id, version`);
  console.log(`  ${version}: ${r.ok ? (JSON.parse(r.text)[0]?.id ?? 'ya existía') : 'ERROR ' + r.text.slice(0, 150)}`);
}

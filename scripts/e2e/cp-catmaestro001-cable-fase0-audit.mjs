#!/usr/bin/env node
/**
 * CP-RECEPCIONES-CATALOGO-MAESTRO-001 (continuación) — FASE 0-C (READ-ONLY, producción)
 * ============================================================================
 * Dos objetivos:
 *   1. Estado REAL de los 3 hallazgos del SQL Security Gate en producción
 *      (secdef_no_auth: cp_catmaestro001_renumber_auto_masters;
 *       secdef_public_grant: add_reception_items + save_pending_reception_changes).
 *   2. Auditoría del «Cable para Ecoflow» de ENT-000003-2026: maestro AUTO-*,
 *      fila local, locales en otras tiendas, consecutivo actual, integridad de
 *      ítems/movimientos/kardex de esa recepción.
 *
 * Patrón canónico CP-INFRA-019 (Management API + guard fail-closed + bloqueador
 * estático de escrituras). Uso:
 *   ALLOW_PROD=read-only node scripts/e2e/cp-catmaestro001-cable-fase0-audit.mjs
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { assertNotProduction } from '/home/z/my-project/Costpro/scripts/lib/assert-not-production.mjs';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
assertNotProduction({ mode: 'read-only', url: SUPABASE_URL, context: 'cp-catmaestro001-cable-fase0-audit' });
if (ref !== 'wthkddeleylijmonclxg') {
  console.error('FALLO DE GUARD: destino no es producción');
  process.exit(2);
}

async function mgmt(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL HTTP ${res.status}: ${text.slice(0, 600)}`);
  try {
    const rows = JSON.parse(text);
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}

// ── Bloqueador estático de escrituras (fail-closed) ─────────────────────────
function assertReadOnly(query) {
  const normalized = query.replace(/\s+/g, ' ').trim().toLowerCase();
  const forbidden = /\b(insert|update|delete|drop|alter|truncate|grant|revoke|set|call|copy|vacuum|analyze|notify|merge)\b/;
  if (!normalized.startsWith('select') && !normalized.startsWith('with')) {
    throw new Error('READ-ONLY GUARD: la consulta no empieza por SELECT/WITH');
  }
  if (forbidden.test(normalized.slice(6))) {
    throw new Error('READ-ONLY GUARD: palabra de escritura detectada en la consulta');
  }
  return query;
}

(async () => {
  console.log(`=== FASE 0-C · Cable para Ecoflow + estado del gate (producción ${ref}) ===\n`);

  // ── 1. Estado REAL de los 3 hallazgos del gate ──────────────────────────
  console.log('[1] Hallazgos del SQL Security Gate (estado vivo):');
  const secdef = await mgmt(assertReadOnly(`
    SELECT p.proname, pg_get_function_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
      AND pg_get_functiondef(p.oid) NOT LIKE '%auth.uid%'
      AND pg_get_functiondef(p.oid) NOT LIKE '%ERR_PERMISSION_DENIED%'
      AND p.proname IN ('cp_catmaestro001_renumber_auto_masters')`));
  for (const r of secdef) console.log(`    secdef_no_auth → ${r.proname}(${(r.args || '').slice(0, 60)}...)`);

  const grants = await mgmt(assertReadOnly(`
    SELECT p.proname, p.proacl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('add_reception_items', 'save_pending_reception_changes', 'cp_catmaestro001_renumber_auto_masters')
    ORDER BY p.proname`));
  for (const r of grants) console.log(`    proacl → ${r.proname}: ${r.proacl || '(ACL nulo = defaults: PUBLIC tiene EXECUTE)'}`);

  // ── 2. Recepción ENT-000003-2026 ──────────────────────────────────────────
  console.log('\n[2] Recepción ENT-000003-2026:');
  const receipt = await mgmt(assertReadOnly(`
    SELECT r.id, r.document_number, r.store_id, r.tenant_id, r.status, r.total_cost, r.created_at,
           s.name AS store_name
      FROM public.receipts r JOIN public.stores s ON s.id = r.store_id
     WHERE r.document_number = 'ENT-000003-2026'`));
  if (!receipt.length) { console.error('    NO ENCONTRADA'); process.exit(1); }
  const R = receipt[0];
  console.log(`    id=${R.id} tienda=${R.store_name} (${R.store_id}) status=${R.status} total=${R.total_cost} creada=${R.created_at}`);
  console.log(`    tenant=${R.tenant_id}`);

  // ── 3. Ítems de la recepción + Cable para Ecoflow ─────────────────────────
  console.log('\n[3] Ítems de la recepción:');
  const items = await mgmt(assertReadOnly(`
    SELECT ri.id, ri.quantity, ri.unit_cost, p.id AS product_id, p.sku AS local_sku, p.name AS product_name,
           mp.id AS master_id, mp.sku AS master_sku, mp.name AS master_name
      FROM public.receipt_items ri
      LEFT JOIN public.products p ON p.id = ri.product_id
      LEFT JOIN public.master_products mp ON mp.id = p.master_product_id
     WHERE ri.receipt_id = '${R.id}'::uuid ORDER BY ri.id`));
  console.log(`    total ítems = ${items.length}`);
  const cable = items.filter(i => (i.product_name || '').toLowerCase().includes('ecoflow') || (i.master_name || '').toLowerCase().includes('ecoflow'));
  for (const c of cable) {
    console.log(`    >> CABLE: item=${c.id} qty=${c.quantity} costo=${c.unit_cost}`);
    console.log(`       local: id=${c.product_id} sku=${c.local_sku} nombre="${c.product_name}"`);
    console.log(`       maestro: id=${c.master_id} sku=${c.master_sku} nombre="${c.master_name}"`);
  }
  if (!cable.length) console.log('    (ningún ítem Ecoflow — BUSCAR de otra forma)');

  // ── 4. Todos los maestros AUTO-* restantes ────────────────────────────────
  console.log('\n[4] Maestros AUTO-* restantes en el tenant:');
  const autos = await mgmt(assertReadOnly(`
    SELECT mp.id, mp.sku, mp.name, mp.created_at, mp.tenant_id
      FROM public.master_products mp
     WHERE mp.sku LIKE 'AUTO-%'`));
  for (const a of autos) console.log(`    ${a.id}  ${a.sku}  "${a.name}"  tenant=${a.tenant_id} creado=${a.created_at}`);

  // ── 5. Consecutivo oficial actual ────────────────────────────────────────
  console.log('\n[5] Consecutivo del Catálogo Maestro (tenant):');
  const maxnum = await mgmt(assertReadOnly(`
    SELECT COUNT(*) AS n_num, MIN(sku) AS min_num, MAX(sku) AS max_num
      FROM public.master_products
     WHERE tenant_id = '5364ccf8-e6cd-4c38-aea8-b167b3b5576f'::uuid AND sku ~ '^[0-9]{1,9}$'`));
  console.log(`    numéricos=${maxnum[0].n_num} min=${maxnum[0].min_num} max=${maxnum[0].max_num}`);
  const gaps = await mgmt(assertReadOnly(`
    SELECT gs.n AS hueco FROM generate_series(1, 300) AS gs(n)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.master_products mp
        WHERE mp.tenant_id = '5364ccf8-e6cd-4c38-aea8-b167b3b5576f'::uuid AND mp.sku ~ '^[0-9]{1,9}$' AND (mp.sku)::bigint = gs.n)`));
  console.log(`    huecos en 1..300: ${gaps.map(g => g.hueco).join(', ') || '(ninguno)'}`);
  const outliers = await mgmt(assertReadOnly(`
    SELECT sku FROM public.master_products
     WHERE tenant_id = '5364ccf8-e6cd-4c38-aea8-b167b3b5576f'::uuid AND sku ~ '^[0-9]{1,9}$' AND (sku)::bigint NOT BETWEEN 1 AND 272`));
  console.log(`    outliers (>272): ${outliers.map(o => o.sku).join(', ') || '(ninguno)'}`);

  // ── 6. Locales del maestro del Cable (tiendas) ───────────────────────────
  if (cable.length) {
    const mid = cable[0].master_id;
    console.log(`\n[6] Filas locales del maestro ${mid}:`);
    const locals = await mgmt(assertReadOnly(`
      SELECT pl.id, pl.store_id, s.name AS store_name, pl.sku, pl.is_active, pl.stock_current
        FROM public.products pl JOIN public.stores s ON s.id = pl.store_id
       WHERE pl.master_product_id = '${mid}'::uuid`));
    for (const l of locals) console.log(`    local=${l.id} tienda=${l.store_name} (${l.store_id}) sku=${l.sku} activo=${l.is_active} stock=${l.stock_current}`);
  }

  // ── 7. Integridad de la recepción (línea base para post-verificación) ─────
  console.log('\n[7] Línea base de integridad de ENT-000003-2026:');
  const counts = await mgmt(assertReadOnly(`
    SELECT
      (SELECT COUNT(*) FROM public.receipt_items WHERE receipt_id = '${R.id}'::uuid) AS items,
      (SELECT COUNT(*) FROM public.stock_movements WHERE notes = '${R.id}'::text) AS movs,
      (SELECT COUNT(*) FROM public.kardex_entries ke
         WHERE ke.product_id IN (
           SELECT product_id FROM public.receipt_items WHERE receipt_id = '${R.id}'::uuid)) AS kardex`));
  console.log(`    receipt_items=${counts[0].items} stock_movements=${counts[0].movs} kardex(asociados)=${counts[0].kardex}`);
  console.log('\n=== FIN FASE 0-C (read-only) ===');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });

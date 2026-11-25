#!/usr/bin/env node
/**
 * CP-RECEPCIONES-CATALOGO-MAESTRO-001 — FASE 0 (READ-ONLY, producción)
 * Auditoría con datos reales: recepciones recientes de ENERVIDA, productos
 * AUTO-*, doble identificador, consecutivo del Catálogo Maestro, generador
 * oficial. Patrón canónico CP-INFRA-019 (Management API + guard fail-closed).
 *
 * Uso: ALLOW_PROD=read-only node scripts/cp-catmaestro-fase0-audit.mjs
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
assertNotProduction({ mode: 'read-only', url: SUPABASE_URL, context: 'cp-catmaestro-fase0-audit' });
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
  return { ok: res.ok, status: res.status, text };
}

// ── Bloqueador estático de escrituras (fail-closed) ─────────────────────────
function assertReadOnly(query) {
  const normalized = query.replace(/\s+/g, ' ').trim().toLowerCase();
  const forbidden = /\b(insert|update|delete|drop|alter|truncate|grant|revoke|set|call|copy|vacuum|analyze|notify|merge)\b/;
  if (!normalized.startsWith('select') && !normalized.startsWith('with')) {
    throw new Error('READ-ONLY GUARD: la consulta no empieza por SELECT/WITH');
  }
  if (forbidden.test(normalized)) {
    throw new Error('READ-ONLY GUARD: sentencia contiene comando prohibido: ' + normalized.slice(0, 120));
  }
  return query;
}

async function q(name, sql) {
  console.log(`\n========== ${name} ==========`);
  try {
    const safe = assertReadOnly(sql);
    const { ok, status, text } = await mgmt(safe);
    if (!ok) { console.log(`ERROR ${status}: ${text.substring(0, 600)}`); return; }
    try { console.log(JSON.stringify(JSON.parse(text), null, 1).substring(0, 12000)); }
    catch { console.log(text.substring(0, 4000)); }
  } catch (e) { console.log(`GUARD/BLOCK: ${e.message}`); }
}

const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const TENANT = '5364ccf8-e6cd-4c38-aea8-b167b3b5576f';

(async () => {
  await q('1_recepciones_recientes', `SELECT id, folio, status, supplier, total, created_at, updated_at, created_by
    FROM public.receipts WHERE store_id = '${STORE}'
    ORDER BY created_at DESC LIMIT 8;`);

  await q('2_conteo_items_por_recepcion', `SELECT r.id, r.folio, r.status, r.total, r.created_at,
    (SELECT COUNT(*) FROM public.receipt_items ri WHERE ri.receipt_id = r.id) AS n_items
    FROM public.receipts r WHERE r.store_id = '${STORE}'
    ORDER BY r.created_at DESC LIMIT 10;`);

  await q('3_items_ultimas_3_recepciones', `SELECT ri.receipt_id, r.folio, r.status AS rcpt_status, ri.id AS item_id,
    ri.product_id, ri.quantity, ri.unit_cost, ri.total,
    p.sku AS local_sku, p.name AS local_name, p.master_product_id,
    mp.sku AS master_sku, mp.name AS master_name
    FROM public.receipt_items ri
    JOIN public.receipts r ON r.id = ri.receipt_id
    LEFT JOIN public.products p ON p.id = ri.product_id
    LEFT JOIN public.master_products mp ON mp.id = p.master_product_id
    WHERE r.store_id = '${STORE}'
    ORDER BY r.created_at DESC, ri.position NULLS LAST
    LIMIT 80;`);

  await q('4_maestros_auto_tenant', `SELECT id, sku, name, unit_of_measure, status, is_active, created_at
    FROM public.master_products WHERE tenant_id = '${TENANT}' AND sku ILIKE 'AUTO-%'
    ORDER BY created_at;`);

  await q('5_locales_auto_enervida', `SELECT p.id, p.sku, p.name, p.master_product_id, mp.sku AS master_sku,
    p.is_active, p.created_at
    FROM public.products p
    LEFT JOIN public.master_products mp ON mp.id = p.master_product_id
    WHERE p.store_id = '${STORE}'
      AND (p.sku ILIKE 'AUTO-%' OR mp.sku ILIKE 'AUTO-%')
    ORDER BY p.created_at;`);

  await q('6_consecutivo_maestro', `SELECT
    (SELECT COUNT(*) FROM public.master_products WHERE tenant_id='${TENANT}') AS total_maestros,
    (SELECT COUNT(*) FROM public.master_products WHERE tenant_id='${TENANT}' AND sku ~ '^[0-9]+$') AS numericos,
    (SELECT MAX(sku::bigint) FROM public.master_products WHERE tenant_id='${TENANT}' AND sku ~ '^[0-9]+$') AS max_numerico,
    (SELECT COUNT(*) FROM public.master_products WHERE tenant_id='${TENANT}' AND sku !~ '^[0-9]+$') AS no_numericos;`);

  await q('7_skus_no_numericos_recientes', `SELECT id, sku, name, status, created_at
    FROM public.master_products
    WHERE tenant_id='${TENANT}' AND sku !~ '^[0-9]+$'
    ORDER BY created_at DESC LIMIT 45;`);

  await q('8_funciones_clave', `SELECT routine_name, routine_type FROM information_schema.routines
    WHERE routine_schema='public' AND routine_name IN
    ('next_master_catalog_sku','assign_next_catalog_sku','resolve_reception_import_rows',
     'register_reception','fn_classify_reception_import_row','confirm_pending_reception',
     'update_pending_reception','update_reception')
    ORDER BY routine_name;`);

  await q('9_indices_unicos_products', `SELECT indexname, indexdef FROM pg_indexes
    WHERE tablename IN ('products','master_products','receipt_items','receipts') AND indexdef ILIKE '%unique%'
    ORDER BY tablename, indexname;`);

  await q('10_estructura_receipts', `SELECT column_name, data_type, is_nullable FROM information_schema.columns
    WHERE table_schema='public' AND table_name='receipts' ORDER BY ordinal_position;`);
})();

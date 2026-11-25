#!/usr/bin/env node
/**
 * CP-RECEPCIONES-CATALOGO-MAESTRO-001 — FASE 0c (READ-ONLY, producción)
 * Recepción 47380573: ítems completos, movimientos, vínculos maestro-local,
 * triggers de SKU e inmutabilidad, generador oficial.
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
assertNotProduction({ mode: 'read-only', url: SUPABASE_URL, context: 'cp-catmaestro-fase0c-audit' });

async function mgmt(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

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
    try { console.log(JSON.stringify(JSON.parse(text), null, 1).substring(0, 20000)); }
    catch { console.log(text.substring(0, 4000)); }
  } catch (e) { console.log(`GUARD/BLOCK: ${e.message}`); }
}

const RCPT = '47380573-a546-4286-80fb-8d5ba374551e';

(async () => {
  await q('A_items_recepcion_47380573', `SELECT ri.id AS item_id, ri.product_id, ri.quantity, ri.unit_cost, ri.total,
    p.sku AS local_sku, p.name, p.master_product_id, mp.sku AS master_sku, mp.status AS master_status
    FROM public.receipt_items ri
    LEFT JOIN public.products p ON p.id = ri.product_id
    LEFT JOIN public.master_products mp ON mp.id = p.master_product_id
    WHERE ri.receipt_id = '${RCPT}'
    ORDER BY p.created_at;`);

  await q('B_movimientos_recepcion', `SELECT id, product_id, movement_type, quantity, unit_cost, reference_doc, notes, created_at
    FROM public.stock_movements
    WHERE notes = '${RCPT}' OR (reference_doc = 'Confirmacion recepcion' AND created_at >= '2026-11-24 18:40:00')
    ORDER BY created_at LIMIT 40;`);

  await q('C_triggers_products', `SELECT trigger_name, event_manipulation, action_statement
    FROM information_schema.triggers
    WHERE trigger_schema='public' AND event_object_table IN ('products','master_products')
    ORDER BY event_object_table, trigger_name;`);

  await q('D_fn_next_master_catalog_sku_def', `SELECT pg_get_functiondef(oid) AS def
    FROM pg_proc WHERE proname = 'next_master_catalog_sku';`);

  await q('E_fn_assign_next_sku_def', `SELECT pg_get_functiondef(oid) AS def
    FROM pg_proc WHERE proname = 'assign_next_catalog_sku';`);

  await q('F_columnas_products', `SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='products' ORDER BY ordinal_position;`);

  await q('G_otras_tiendas_locales_vinculo_auto', `SELECT p.id, p.sku, p.name, p.store_id, s.name AS store_name, p.master_product_id
    FROM public.products p
    LEFT JOIN public.master_products mp ON mp.id = p.master_product_id
    LEFT JOIN public.stores s ON s.id = p.store_id
    WHERE mp.sku ILIKE 'AUTO-%' AND p.store_id <> '5e6fe821-5465-48b1-b3f1-3aa3182edc38';`);

  await q('H_existencias_locales_auto', `SELECT p.id, p.sku, p.name, p.stock, p.cost_price, p.price, p.unit_of_measure,
    p.master_product_id, p.is_active
    FROM public.products p
    JOIN public.master_products mp ON mp.id = p.master_product_id
    WHERE mp.sku ILIKE 'AUTO-%' AND p.store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'
    ORDER BY p.sku;`);

  await q('I_audit_logs_recientes_recepcion', `SELECT id, action, entity_type, entity_id, created_at
    FROM public.audit_logs
    WHERE entity_type IN ('receipt','master_product','product') AND created_at >= '2026-11-24 18:40:00'
    ORDER BY created_at LIMIT 40;`);
})();

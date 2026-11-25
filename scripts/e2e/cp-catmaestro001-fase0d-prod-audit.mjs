#!/usr/bin/env node
/**
 * CP-RECEPCIONES-CATALOGO-MAESTRO-001 — FASE 0d (READ-ONLY, producción)
 * Verificación final del modelo: triggers sobre master_products, índices
 * únicos, audit_logs/master_change_log, stock_movements, colisiones de
 * candidatos 257..272, ítems exactos de la recepción 47380573.
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
assertNotProduction({ mode: 'read-only', url: SUPABASE_URL, context: 'cp-catmaestro-fase0d-audit' });

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
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

(async () => {
  await q('A_triggers_fisicos_master_products', `SELECT t.tgname AS trigger_name, pg_get_triggerdef(t.oid) AS def
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'master_products' AND NOT t.tgisinternal;`);

  await q('B_indices_master_products', `SELECT indexname, indexdef FROM pg_indexes WHERE tablename='master_products' ORDER BY indexname;`);

  await q('C_items_recepcion_47380573_v2', `SELECT ri.id AS item_id, ri.product_id, ri.quantity, ri.unit_cost,
    p.sku AS local_sku, p.name, p.master_product_id, mp.sku AS master_sku
    FROM public.receipt_items ri
    LEFT JOIN public.products p ON p.id = ri.product_id
    LEFT JOIN public.master_products mp ON mp.id = p.master_product_id
    WHERE ri.receipt_id = '${RCPT}'
    ORDER BY p.created_at;`);

  await q('D_columnas_stock_movements', `SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='stock_movements' ORDER BY ordinal_position;`);

  await q('E_movimientos_de_la_recepcion', `SELECT id, product_id, movement_type, quantity_change, unit_cost, reference_doc, notes, created_at
    FROM public.stock_movements WHERE notes = '${RCPT}'
    ORDER BY product_id;`);

  await q('F_columnas_audit_logs', `SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='audit_logs' ORDER BY ordinal_position;`);

  await q('G_tabla_master_change_log', `SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='master_change_log' ORDER BY ordinal_position;`);

  await q('H_colisiones_257_272_maestro', `SELECT sku, name FROM public.master_products
    WHERE tenant_id = '5364ccf8-e6cd-4c38-aea8-b167b3b5576f'
      AND sku ~ '^[0-9]+$' AND sku::bigint BETWEEN 257 AND 273;`);

  await q('I_locales_enervida_sku_257_273', `SELECT id, sku, name FROM public.products
    WHERE store_id = '${STORE}' AND sku ~ '^[0-9]+$' AND sku::bigint BETWEEN 257 AND 273;`);

  await q('J_locales_enervida_numericos_resumen', `SELECT COUNT(*) AS locales_numericos,
    MIN(sku::bigint) AS min_num, MAX(sku::bigint) AS max_num
    FROM public.products WHERE store_id='${STORE}' AND sku ~ '^[0-9]+$';`);

  await q('K_catalog_store_links_enervida', `SELECT * FROM public.catalog_store_links
    WHERE store_id = '${STORE}';`);

  await q('L_kardex_producto_auto', `SELECT ke.product_id, COUNT(*) AS entradas
    FROM public.kardex_entries ke
    JOIN public.products p ON p.id = ke.product_id
    WHERE p.store_id='${STORE}' AND p.sku ILIKE 'AUTO-%'
    GROUP BY ke.product_id ORDER BY entradas DESC LIMIT 20;`);

  await q('M_uniques_products', `SELECT indexname, indexdef FROM pg_indexes
    WHERE tablename='products' AND indexdef ILIKE '%unique%' ORDER BY indexname;`);

  await q('N_ejecucion_next_sku_test_dry', `SELECT 'consecutivo esperado (dry): primer hueco' AS nota,
    (SELECT MIN(gs.n) FROM generate_series(1, 500) gs(n)
      WHERE NOT EXISTS (SELECT 1 FROM public.master_products mp
        WHERE mp.tenant_id='5364ccf8-e6cd-4c38-aea8-b167b3b5576f'
          AND mp.sku ~ '^[0-9]+$' AND mp.sku::bigint = gs.n)) AS primer_hueco;`);
})();

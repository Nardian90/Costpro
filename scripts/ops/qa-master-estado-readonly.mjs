#!/usr/bin/env node
/**
 * Verificación READ-ONLY del maestro de pruebas QA (QA-CM-20261030-01).
 *
 * Uso:
 *   node scripts/ops/qa-master-estado-readonly.mjs
 *
 * Solo SELECTs vía Management API contra el proyecto resuelto de .env
 * (NEXT_PUBLIC_SUPABASE_URL). No escribe nada. Imprime sin secretos.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envText = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
for (const l of envText.split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2];
}

const PROD_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!PROD_URL || !TOKEN) { console.error('Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_ACCESS_TOKEN'); process.exit(1); }
const ref = PROD_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
// Identidad del proyecto (proceso OPERATIONS): producción esperada = CostproBD wthkddeleylijmonclxg
console.log('proyecto:', ref, ref === 'wthkddeleylijmonclxg' ? '(OK = CostproBD producción)' : '(⚠ INESPERADO)');

async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return res.json();
}

const SKU = 'QA-CM-20261030-01';

const maestro = await q(`SELECT id, tenant_id, sku, name, status, image_path, unit_of_measure, is_service, created_at, updated_at
  FROM public.master_products WHERE sku = '${SKU}'`);
console.log('\n=== master_products ===');
console.log(JSON.stringify(maestro, null, 1));

const ids = maestro.map(r => `'${r.id}'`).join(',');
if (!ids) { console.log('\nSin maestro con ese SKU. FIN.'); process.exit(0); }

const locales = await q(`SELECT p.id, p.sku, p.name, p.status, p.is_active, p.store_id, s.name AS store_name
  FROM public.products p LEFT JOIN public.stores s ON s.id = p.store_id
  WHERE p.master_product_id IN (${ids})`);
console.log('\n=== products (filas locales vinculadas) ===');
console.log(JSON.stringify(locales, null, 1));

const tenantId = maestro[0].tenant_id;
const links = await q(`SELECT l.store_id, s.name AS store_name, l.status, l.connected_at, l.disconnected_at
  FROM public.catalog_store_links l LEFT JOIN public.stores s ON s.id = l.store_id
  WHERE l.tenant_id = '${tenantId}'`);
console.log('\n=== catalog_store_links (conexión del tenant, nivel tienda↔catálogo) ===');
console.log(JSON.stringify(links, null, 1));

const log = await q(`SELECT field, old_value, new_value, origin_store_id, created_at
  FROM public.master_change_log WHERE master_product_id IN (${ids}) ORDER BY created_at DESC LIMIT 10`);
console.log('\n=== master_change_log (últimos 10) ===');
console.log(JSON.stringify(log, null, 1));

const auditoria = await q(`SELECT action, created_at FROM public.audit_logs
  WHERE record_id::text IN (${ids}) OR (action LIKE '%MASTER%' AND metadata::text LIKE '%${SKU}%')
  ORDER BY created_at DESC LIMIT 10`);
console.log('\n=== audit_logs relacionados (últimos 10) ===');
console.log(JSON.stringify(auditoria, null, 1));

// Referencias operativas que impedirían archivar sin riesgo
const refs = await q(`SELECT
  (SELECT count(*) FROM public.inventory i JOIN public.products p ON p.id = i.product_id
     WHERE p.master_product_id IN (${ids})) AS inventory,
  (SELECT count(*) FROM public.transaction_items ti JOIN public.products p ON p.id = ti.product_id
     WHERE p.master_product_id IN (${ids})) AS transaction_items,
  (SELECT count(*) FROM public.receipt_items ri JOIN public.products p ON p.id = ri.product_id
     WHERE p.master_product_id IN (${ids})) AS receipt_items`);
console.log('\n=== referencias operativas (inventory/transactions/receipts) ===');
console.log(JSON.stringify(refs, null, 1));

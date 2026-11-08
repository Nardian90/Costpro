#!/usr/bin/env node
/**
 * CP-DOC-SC-DATA-MAPPING-006 — Recepción REAL en el proyecto AISLADO E2E
 * vía el RPC productivo register_reception (flujo transaccional completo:
 * receipt + receipt_items + stock_movements). La recepción queda persistida
 * (no se limpia) para que la evidencia PDF se genere desde datos reales.
 *
 * Guard CP-INFRA-019 fail-closed + registro en writers.manifest.json
 * (isolationProtected). Resultado: /home/z/my-project/sc006-recepcion-real.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { assertNotProduction } from './lib/assert-not-production.mjs';
// Guard de aislamiento CP-INFRA-011 (fail-closed): E2E_TARGET_KIND +
// E2E_ALLOWED_REMOTE_REF exacto != producción + centinela e2e_is_isolated_db().
import { assertIsolatedDb } from '../e2e/fixtures/assert-isolated-db.cjs';

const envText = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
for (const l of envText.split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].trim();
}
const URL = (process.env.E2E_SUPABASE_URL || '').trim().replace(/\/$/, '');
const SRK = (process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || '').trim();
assertNotProduction({ mode: 'write', url: URL, context: 'scripts/sc006-real-reception-evidence.mjs' });
// Guard CP-INFRA-011: el destino debe ser el proyecto AISLADO E2E (centinela incluido).
await assertIsolatedDb({ env: process.env });

const sb = createClient(URL, SRK, { auth: { persistSession: false } });

// Tienda canónica del E2E + sus productos reales + usuario de membresía real
const { data: store } = await sb
  .from('stores')
  .select('id, name, store_code, tenant_id')
  .eq('name', 'Tienda QA Correcciones')
  .single();
if (!store) { console.error('No se encontró la tienda base del E2E'); process.exit(1); }

const { data: products } = await sb
  .from('products')
  .select('id, name, sku, unit_of_measure')
  .eq('store_id', store.id)
  .eq('is_active', true)
  .limit(2);
if (!products || products.length < 2) { console.error('La tienda no tiene 2 productos activos'); process.exit(1); }

const { data: miembro } = await sb
  .from('user_store_memberships')
  .select('user_id')
  .eq('store_id', store.id)
  .limit(1);
const userId = miembro?.[0]?.user_id ?? null;

// ── Recepción REAL (datos de prueba CONTROLADOS en el flujo productivo) ──
const items = products.map((p, i) => ({
  product_id: p.id,
  quantity: i === 0 ? 50 : 12,
  unit_cost: i === 0 ? 140 : 26.5,
  moneda_recepcion: 'CUP',
}));
const { data: receiptId, error } = await sb.rpc('register_reception', {
  p_store_id: store.id,
  p_supplier: 'Almacen Lari',
  p_reception_date: new Date().toISOString(),
  p_invoice_number: 'Factura 4523-A',
  p_items: items,
  p_user_id: userId,
  p_supplier_tax_id: 'J-31015873-2', // snapshot de ficha (flujo FASE 4)
});
if (error || !receiptId) {
  console.error('register_reception falló:', error?.message ?? 'sin id');
  process.exit(1);
}

// ── Lectura del documento real generado ──
const { data: receipt } = await sb
  .from('receipts')
  .select('id, document_number, reference_doc, supplier, supplier_tax_id, supplier_code, status, reception_date, store_id, total_cost')
  .eq('id', receiptId)
  .single();
const { data: receiptItems } = await sb
  .from('receipt_items')
  .select('id, product_id, quantity, unit_cost, moneda_recepcion, products(name, sku, unit_of_measure)')
  .eq('receipt_id', receiptId)
  .order('created_at', { ascending: true });

const salida = {
  mision: 'CP-DOC-SC-DATA-MAPPING-006',
  destino: URL,
  fecha: new Date().toISOString(),
  store: { id: store.id, name: store.name, store_code: store.store_code },
  receipt,
  items: receiptItems,
};
writeFileSync('/home/z/my-project/sc006-recepcion-real.json', JSON.stringify(salida, null, 2));
console.log('Recepción REAL creada en E2E:');
console.log(JSON.stringify(salida, null, 2));

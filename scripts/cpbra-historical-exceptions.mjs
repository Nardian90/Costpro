#!/usr/bin/env node
/**
 * cpbra-historical-exceptions.mjs — CP-BRA-FINAL-VERIFICATION (FASE 7)
 * SOLO LECTURA: excepciones históricas (misiones previas).
 *   · recepciones sin proveedor (valor agregado informado: 19,435)
 *   · pistas de identidad (NIT/factura/contacto/referencias)
 *   · duplicados potenciales
 *   · otras excepciones similares
 * NO modifica nada.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROD_REF = 'wthkddeleylijmonclxg';
if (!process.env.SUPABASE_ACCESS_TOKEN) {
  try {
    const env = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '.env'), 'utf8');
    const m = env.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/m);
    if (m) process.env.SUPABASE_ACCESS_TOKEN = m[1].trim();
  } catch { /* noop */ }
}
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('FALLO: token'); process.exit(2); }

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}
const fmt = (n) => Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s ?? '').replace(/'/g, "''").slice(0, 60);

console.log('FASE 7 — EXCEPCIONES HISTÓRICAS (solo lectura) — ' + new Date().toISOString());

/* 1. Recepciones sin proveedor (NULL, vacío o placeholder «—») */
console.log('\n══ 1. Recepciones SIN proveedor real (NULL / vacío / «—» / placeholder) ══');
const noSup = await runSql(`
  SELECT r.id, r.document_number, r.status, r.reception_date, r.total_cost, r.reference_doc,
         s.name AS store_name, r.supplier, r.supplier_code, r.supplier_tax_id, r.supplier_phone,
         r.notes, r.created_at,
         (SELECT count(*) FROM receipt_items ri WHERE ri.receipt_id = r.id) AS n_items,
         (SELECT count(*) FROM payment_transactions pt WHERE pt.ref_type='receipt' AND pt.ref_id = r.id) AS n_pagos
  FROM receipts r LEFT JOIN stores s ON s.id = r.store_id
  WHERE r.supplier IS NULL OR btrim(r.supplier) = '' OR r.supplier IN ('—','-','N/A','n/a','ND','s/s','sin proveedor')
  ORDER BY r.reception_date`);
let sumNoSup = 0;
for (const r of noSup) {
  sumNoSup += Number(r.total_cost ?? 0);
  console.log(`  · ${r.document_number ?? r.id.slice(0,8)} [${r.status}] ${String(r.reception_date).slice(0,10)} tienda=${r.store_name} total=${fmt(r.total_cost)} items=${r.n_items} pagos=${r.n_pagos} ref=${JSON.stringify(r.reference_doc)}`);
  console.log(`      NIT=${JSON.stringify(r.supplier_tax_id)} tel=${JSON.stringify(r.supplier_phone)} code=${JSON.stringify(r.supplier_code)} notas=${JSON.stringify(String(r.notes ?? '').slice(0,120))}`);
  const kx = await runSql(`SELECT count(*) AS n, COALESCE(SUM(CASE WHEN movement_type='in' THEN quantity ELSE 0 END),0) AS q_in FROM kardex_entries WHERE reference_type='receipt' AND reference_id='${r.id}'`);
  const rev = await runSql(`SELECT count(*) AS n FROM receipts rx WHERE rx.original_receipt_id = '${r.id}'`);
  console.log(`      kardex=${kx[0]?.n ?? 0} movs (q_in=${kx[0]?.q_in ?? 0}) · recepciones vinculadas (rectif/devolución)=${rev[0]?.n ?? 0}`);
}
console.log(`  → TOTAL recepciones sin proveedor: ${noSup.length} · valor=${fmt(sumNoSup)} (informado misión previa: 19,435)`);

/* 2. Otras excepciones similares */
console.log('\n══ 2. Otras excepciones similares ══');
const servNoSup = await runSql(`SELECT count(*) AS n FROM received_services WHERE supplier IS NULL OR btrim(COALESCE(supplier,''))=''`);
console.log(`  servicios recibidos sin proveedor: ${servNoSup[0]?.n ?? 0}`);
const zeroPrice = await runSql(`
  SELECT t.id, t.created_at, ti.product_id, p.name AS producto, p.price AS precio_actual, p.price AS precio_item
  FROM transactions t
  JOIN transaction_items ti ON ti.transaction_id = t.id
  LEFT JOIN products p ON p.id = ti.product_id
  WHERE t.status='completed' AND t.total_amount = 0 AND t.payment_incidents IS NOT NULL`);
for (const z of zeroPrice) {
  console.log(`  venta ${z.id.slice(0,8)} (${String(z.created_at).slice(0,10)}) total=0 · producto=${z.producto} · precio ítem=${z.precio_item} · precio ACTUAL catálogo=${z.precio_actual}`);
}
console.log('\nFIN — nada fue modificado.');

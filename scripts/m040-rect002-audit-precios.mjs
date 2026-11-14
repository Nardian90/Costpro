// ============================================================================
// CP-FIN-VALUATION-CORRECTION-002 — FASE A2: auditoría de cambios de precio
// SKU 111/112 (read-only) + verificación de movimiento purchase de la FVC.
// ============================================================================
import fs from 'node:fs';

const BASE = 'https://wthkddeleylijmonclxg.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || (() => { throw new Error('FALTA SUPABASE_SERVICE_ROLE_KEY (leer de .env local — NUNCA commitear)'); })();
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };
const SKU111_ID = '4afef9a7-28b7-4a5e-b134-13a9e0ffea16';
const SKU112_ID = '14aeb370-7e00-4889-b29b-ef2bc778f4c4';
const OUT = '/home/z/my-project/scripts/out/rect002-faseA2-audit-precios.json';

async function get(path, label) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, { headers: H });
  const txt = await res.text();
  let body;
  try { body = JSON.parse(txt); } catch { body = txt; }
  if (!res.ok) { console.error(`[WARN] ${label} → ${txt.slice(0, 150)}`); return { _error: txt.slice(0, 300) }; }
  console.log(`[OK] ${label} → ${Array.isArray(body) ? body.length : 1}`);
  return body;
}

const out = { mision: 'CP-FIN-VALUATION-CORRECTION-002', fase: 'A2', fecha: new Date().toISOString() };

// auditoría de cambios sobre ambos productos (cualquier tabla)
out.audit_products_111_112 = await get(
  `audit_logs?record_id=in.(${SKU111_ID},${SKU112_ID})&select=*&order=created_at&limit=100`,
  'audit_logs productos 111/112');

// auditoría sobre las líneas de recepción de ambos SKU
out.audit_receipt_items = await get(
  `audit_logs?record_id=in.(80a1767b-8902-48c6-833b-abf713bdc7b0,9c9e6010-b848-4d0f-b667-304282f7584b)&select=*&order=created_at&limit=50`,
  'audit_logs líneas FVC 111/112');

// ¿hubo ediciones de products (price) en ENERVIDA con old_data/new_data visibles?
const pr = (out.audit_products_111_112 || []);
out.cambios_precio = pr.filter(a => JSON.stringify(a).match(/price/i)).map(a => ({
  at: a.created_at, accion: a.action, old: a.old_data, new: a.new_data, tabla: a.table_name }));

fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('Eventos auditoría productos:', pr.length);
console.log('Cambios de precio detectados:', out.cambios_precio.length);
for (const c of out.cambios_precio.slice(0, 10)) console.log(' ', JSON.stringify(c).slice(0, 220));
console.log('Guardado', OUT);

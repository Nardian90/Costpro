/**
 * MISIÓN RECEPCIONES — F2b: Investigación SOLO LECTURA del caso SKU 186 / borrador fallido
 * en la tienda ENERVIDA-VITALLCONS.
 * 1. Resolver tienda por nombre
 * 2. Productos SKU 139 / 186 (activos e históricos)
 * 3. Recepciones recientes (todos los estados) + líneas asociadas a SKU 186/139
 * 4. Borradores (pending) recientes con dueño/fecha/contenido
 * 5. ¿Producto duplicado/huérfano creado por el intento fallido?
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const env = readFileSync(resolve(__dirname, '../.env'), 'utf8');
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; });

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN!;
const ref = URL_.match(/https:\/\/(.*?)\.supabase\.co/)![1];

async function q(sql: string): Promise<any> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 500)}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function main() {
  // 1. Resolver tiendas ENERVIDA y Puerto Padre
  const stores = await q(`select id, name, tenant_id, is_active from stores where name ilike '%ENERVIDA%' or name ilike '%Puerto Padre%' order by name;`);
  console.log('== Tiendas ==');
  for (const s of stores) console.log(` - ${s.name} | id=${s.id} | tenant=${s.tenant_id} | activa=${s.is_active}`);

  const enervida = stores.find((s: any) => /ENERVIDA/i.test(s.name));
  if (!enervida) throw new Error('ENERVIDA no encontrada');
  const eva = enervida.id;

  // 2. Productos SKU 139 / 186 en ENERVIDA
  const prods = await q(`select id, sku, name, is_active, is_complete, unit_of_measure, cost_price, price, stock_current, created_at, updated_at
from products where store_id='${eva}' and sku in ('139','186') order by sku, created_at;`);
  console.log('\n== Productos SKU 139/186 en ENERVIDA ==');
  for (const p of prods) console.log(` - SKU ${p.sku} | ${p.name} | id=${p.id} | activo=${p.is_active} completo=${p.is_complete} um=${p.unit_of_measure} | costo=${p.cost_price} precio=${p.price} stock=${p.stock_current} | creado=${p.created_at}`);

  // 2b. ¿Duplicados soft-deleted u variantes de nombre con sku similar?
  const prodsFuzzy = await q(`select id, sku, name, is_active, stock_current, created_at from products where store_id='${eva}' and (sku ilike '%186%' or sku ilike '%139%') order by sku;`);
  console.log('\n== SKU fuzzy 186/139 en ENERVIDA (incl. inactivos) ==');
  for (const p of prodsFuzzy) console.log(` - SKU "${p.sku}" | ${p.name} | activo=${p.is_active} | stock=${p.stock_current} | creado=${p.created_at}`);

  // 3. Recepciones recientes de ENERVIDA (todas)
  const recs = await q(`select id, status, supplier, reference_doc, reception_date, total_cost, user_id, created_at, updated_at, confirmed_at, notes, payment_status
from receipts where store_id='${eva}' order by created_at desc limit 15;`);
  console.log('\n== Recepciones recientes ENERVIDA (15) ==');
  for (const r of recs) {
    const owner = await q(`select email from auth.users where id='${r.user_id}'`).catch(() => null);
    console.log(` - ${r.created_at} | ${r.status} | ref="${r.reference_doc}" | prov="${r.supplier}" | fecha=${r.reception_date} | total=${r.total_cost} | usuario=${owner?.[0]?.email || r.user_id} | id=${r.id}`);
  }

  // 4. Líneas de las recepciones recientes
  const items = await q(`select ri.receipt_id, r.status as receipt_status, ri.product_id, p.sku, p.name, ri.quantity, ri.unit_cost, ri.moneda_recepcion, ri.tasa_cambio_recepcion, ri.created_at
from receipt_items ri join receipts r on r.id=ri.receipt_id left join products p on p.id=ri.product_id
where r.store_id='${eva}' and r.created_at > now() - interval '10 days' order by ri.created_at desc limit 40;`);
  console.log('\n== Líneas de recepciones ENERVIDA (últimos 10 días) ==');
  for (const i of items) console.log(` - [${i.receipt_status}] ${i.created_at} | SKU=${i.sku} "${i.name}" | cant=${i.quantity} costo=${i.unit_cost} ${i.moneda_recepcion} tasa=${i.tasa_cambio_recepcion} | receipt=${i.receipt_id}`);

  // 5. Movimientos de stock recientes que tocan SKU 186/139
  const movs = await q(`select sm.id, sm.movement_type, sm.quantity, sm.created_at, p.sku, sm.product_id, sm.reference_type, sm.reference_id
from stock_movements sm join products p on p.id=sm.product_id
where p.store_id='${eva}' and p.sku in ('139','186') and sm.created_at > now() - interval '30 days' order by sm.created_at desc limit 20;`).catch(async () => {
    // fallback: sin columnas reference_*
    return q(`select sm.id, sm.movement_type, sm.quantity, sm.created_at, p.sku
from stock_movements sm join products p on p.id=sm.product_id
where p.store_id='${eva}' and p.sku in ('139','186') and sm.created_at > now() - interval '30 days' order by sm.created_at desc limit 20;`);
  });
  console.log('\n== Movimientos de stock SKU 139/186 (30 días) ==');
  for (const m of (movs as any[])) console.log(` - ${m.created_at} | ${m.movement_type} | ${m.quantity} | SKU=${m.sku} | id=${m.id}`);

  // 6. Membresías de la tienda (roles disponibles)
  const membs = await q(`select m.user_id, u.email, m.role, m.status from user_store_memberships m join auth.users u on u.id=m.user_id where m.store_id='${eva}' and m.status='active' order by m.role;`);
  console.log('\n== Membresías activas ENERVIDA ==');
  for (const m of membs) console.log(` - ${m.email} | ${m.role}`);

  console.log('\nOK F2b-readonly');
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });

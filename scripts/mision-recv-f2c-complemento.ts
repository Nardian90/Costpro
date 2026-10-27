/**
 * MISIÓN RECEPCIONES — F2c: investigación complementaria SOLO LECTURA.
 * 1. ¿Existen recepciones pending/voided en ENERVIDA (histórico completo)?
 * 2. stock_movements: esquema real + movimientos de SKU 139/186
 * 3. register_reception RPC: código fuente (¿cómo maneja reference_doc duplicado?)
 * 4. kardex de SKU 186/139
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const env = readFileSync(resolve(__dirname, '../.env'), 'utf8');
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; });

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN!;
const ref = URL_.match(/https:\/\/(.*?)\.supabase\.co/)![1];
const EVA = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

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
  // 1. Pending/voided históricos en ENERVIDA
  const pend = await q(`select id, status, reference_doc, supplier, created_at, user_id from receipts where store_id='${EVA}' and status in ('pending','voided','reversed') order by created_at desc;`);
  console.log('== Recepciones pending/voided/reversed ENERVIDA (histórico) ==');
  console.log(pend.length === 0 ? ' (ninguna)' : '');
  for (const r of pend) console.log(` - ${r.status} | ${r.created_at} | ref="${r.reference_doc}" | id=${r.id}`);

  // 2. stock_movements esquema
  const smcols = await q(`select column_name, data_type from information_schema.columns where table_schema='public' and table_name='stock_movements' order by ordinal_position;`);
  console.log('\n== stock_movements columnas ==');
  console.log(smcols.map((c: any) => c.column_name).join(', '));

  // 3. Movimientos de SKU 139/186 (esquema dinámico)
  try {
    const movs = await q(`select sm.*, p.sku from stock_movements sm join products p on p.id=sm.product_id
where p.store_id='${EVA}' and p.sku in ('139','186') order by sm.created_at desc limit 20;`);
    console.log('\n== stock_movements SKU 139/186 ==');
    console.log(movs.length === 0 ? ' (ninguno)' : '');
    for (const m of movs) console.log(` - ${m.created_at} | ${m.movement_type || m.type} | qty=${m.quantity_change ?? m.quantity ?? m.qty} | SKU=${m.sku} | ${JSON.stringify(Object.keys(m).slice(0, 8))}`);
  } catch (e: any) {
    console.log('\nstock_movements query error:', String(e).slice(0, 200));
  }

  // 4. register_reception: ¿de dónde viene? (definición)
  const src = await q(`select pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='register_reception';`);
  const def = src[0]?.def || '';
  console.log('\n== register_reception (fragmentos clave) ==');
  // Extraer fragmentos con reference_doc / duplicate / 23505 / EXCEPTION
  const lines = def.split('\n');
  let inInteresting = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/reference_doc|duplicate|23505|unique|EXCEPTION|RAISE|ERR_/.test(l)) {
      console.log(` L${i + 1}: ${l.trim().slice(0, 160)}`);
    }
  }
  console.log(` (total líneas: ${lines.length})`);

  // 5. Productos creados hoy en ENERVIDA (para ver si el intento fallido creó algo más)
  const today = await q(`select id, sku, name, is_active, is_complete, cost_price, price, stock_current, created_at from products where store_id='${EVA}' and created_at > '2026-10-26' order by created_at desc limit 20;`);
  console.log('\n== Productos creados desde 2026-10-26 en ENERVIDA ==');
  for (const p of today) console.log(` - ${p.created_at} | SKU ${p.sku} | ${p.name} | activo=${p.is_active} | stock=${p.stock_current}`);

  // 6. Kardex entries de 186/139
  try {
    const kar = await q(`select k.*, p.sku from kardex_entries k join products p on p.id=k.product_id
where p.store_id='${EVA}' and p.sku in ('139','186') order by k.created_at desc limit 10;`);
    console.log('\n== kardex_entries SKU 139/186 ==');
    console.log(kar.length === 0 ? ' (ninguno)' : '');
    for (const k of kar) console.log(` - ${k.created_at} | ${k.movement_type || k.doc_type} | ${JSON.stringify(k).slice(0, 140)}`);
  } catch (e: any) {
    console.log('kardex error:', String(e).slice(0, 160));
  }

  console.log('\nOK F2c');
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });

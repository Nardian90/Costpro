#!/usr/bin/env node
/**
 * CP-RECEPCIONES-CATALOGO-MAESTRO-001 — FASE 0b (READ-ONLY, producción)
 * Esquema real + recepción exacta + lista completa de no-numéricos + huecos
 * del consecutivo. Patrón CP-INFRA-019.
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
assertNotProduction({ mode: 'read-only', url: SUPABASE_URL, context: 'cp-catmaestro-fase0b-audit' });

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
    try { console.log(JSON.stringify(JSON.parse(text), null, 1).substring(0, 16000)); }
    catch { console.log(text.substring(0, 4000)); }
  } catch (e) { console.log(`GUARD/BLOCK: ${e.message}`); }
}

const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const TENANT = '5364ccf8-e6cd-4c38-aea8-b167b3b5576f';

(async () => {
  await q('A_columnas_receipts', `SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='receipts' ORDER BY ordinal_position;`);

  await q('B_columnas_receipt_items', `SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='receipt_items' ORDER BY ordinal_position;`);

  await q('C_columnas_master_products', `SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='master_products' ORDER BY ordinal_position;`);

  await q('D_no_numericos_completo', `SELECT id, sku, name, status, created_at
    FROM public.master_products
    WHERE tenant_id='${TENANT}' AND sku !~ '^[0-9]+$'
    ORDER BY created_at;`);

  await q('E_recepciones_recientes_v2', `SELECT * FROM public.receipts
    WHERE store_id = '${STORE}'
    ORDER BY created_at DESC LIMIT 5;`);

  await q('F_numericos_huecos', `WITH n AS (
    SELECT sku::bigint AS num FROM public.master_products
    WHERE tenant_id='${TENANT}' AND sku ~ '^[0-9]+$'
  ), gaps AS (
    SELECT num, lag(num) OVER (ORDER BY num) AS prev FROM n
  )
  SELECT * FROM gaps WHERE prev IS NOT NULL AND num > prev + 1 ORDER BY num;`);

  await q('G_numericos_maximos', `SELECT sku FROM public.master_products
    WHERE tenant_id='${TENANT}' AND sku ~ '^[0-9]+$'
    ORDER BY sku::bigint DESC LIMIT 5;`);

  await q('H_numericos_minimos', `SELECT sku FROM public.master_products
    WHERE tenant_id='${TENANT}' AND sku ~ '^[0-9]+$'
    ORDER BY sku::bigint ASC LIMIT 5;`);

  // ¿Qué productos locales tienen sku numérico? Muestra el patrón de vínculo
  await q('I_locales_sku_no_numerico', `SELECT p.id, p.sku, p.name, p.master_product_id, p.created_at
    FROM public.products p
    WHERE p.store_id='${STORE}' AND p.sku !~ '^[0-9]+$'
    ORDER BY p.created_at DESC LIMIT 25;`);
})();

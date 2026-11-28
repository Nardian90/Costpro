#!/usr/bin/env node
/**
 * csmv-transfer-identity-battery-e2e.mjs — MISIÓN COSTPRO-SALES-MODAL-INPUT-
 * AND-TRANSFER-VALIDATION-001 (§11g). Batería funcional de la puerta
 * ERR_TRANSFER_IDENTITY_REQUIRED sobre el RPC REAL de la BD AISLADA
 * CostproE2E (tras aplicar 20261128120000).
 *
 * Cada sonda corre dentro de BEGIN … ROLLBACK (la venta, el ledger, los
 * movimientos de stock, la auditoría y el idempotency_registry quedan
 * revertidos — cero residuos). El resultado de cada sonda se captura en una
 * tabla TEMP con handler de excepción.
 *
 * Sondas:
 *  B1 transferencia canónica sin identidad        → ERR_TRANSFER_IDENTITY_REQUIRED
 *  B2 espacios como único contenido               → ERR_TRANSFER_IDENTITY_REQUIRED
 *  B3 los 4 datos completos (nombre/CI/tel/ref)   → success + persistencia de
 *     customer_phone/name/ci verificada en la MISMA transacción
 *  B4 efectivo puro sin identidad                 → success (no se exige nada)
 *  B5 pools sin filas ni componentes (legado Catálogo) → success (puerta no aplica)
 *  B6 fila de transferencia sin N.º de operación  → ERR_ITEM_PAYMENTS_INVALID (§5.1 intacto)
 *  B7 componentes de transferencia sin identidad  → ERR_TRANSFER_IDENTITY_REQUIRED
 *  B8 solo falta teléfono                         → ERR (cada campo individualmente)
 *
 * Uso: node scripts/e2e/csmv-transfer-identity-battery-e2e.mjs
 */
const E2E_REF = 'lguovmvrozxgssupkwpf';
const SUPA_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');

if (!SUPA_TOKEN) {
  console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido.');
  process.exit(2);
}
const { assertIsolatedDb } = await import(join(REPO, 'e2e', 'fixtures', 'assert-isolated-db.cjs'));
await assertIsolatedDb();

const STORE = 'c8048857-6d44-4d17-bec2-3e0c0cb1ae89';
const SELLER = 'd81d17f7-debd-4cc2-a0bb-0e85c8c58587';
const PRODUCT = '0a0d9c03-6ae5-4fea-bae1-ddf9554fc8f1';
const CLAIMS = `{"role":"service_role","sub":"${SELLER}"}`;

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${E2E_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

function itemJson({ method = 'transfer', amount = 100, reference = 'TR-BATERIA', withPayments = true }) {
  const base = {
    product_id: PRODUCT, variant_id: null, quantity: 1,
    price_at_sale: amount, cost_at_sale: 50,
    cash_paid: method === 'cash' ? amount : 0,
    transfer_paid: method === 'transfer' ? amount : 0,
    external_transfer_paid: 0, zelle_paid: 0,
    currency: 'CUP', exchange_rate: 1,
    cash_currency: 'CUP', transfer_currency: 'CUP', zelle_currency: 'USD',
    cash_discount_type: null, cash_discount_value: 0, cash_discount_currency: 'CUP',
    transfer_discount_type: null, transfer_discount_value: 0, transfer_discount_currency: 'CUP',
    zelle_discount_type: null, zelle_discount_value: 0, zelle_discount_currency: 'USD',
  };
  if (withPayments) {
    base.payments = [{ method, currency: 'CUP', amount, reference }];
  }
  return JSON.stringify([base]);
}

function saleCall({ items, method = 'transfer', transferAmount = 100, cashAmount = 0, name = null, ci = null, phone = null, idem, components = null, intoVar = null }) {
  const prefix = intoVar ? `SELECT public.create_sale_v2(` : `PERFORM public.create_sale_v2(`;
  const suffix = intoVar ? ` INTO ${intoVar}` : '';
  return `${prefix}
    p_store_id => '${STORE}'::uuid,
    p_seller_id => '${SELLER}'::uuid,
    p_items => '${items}'::jsonb,
    p_payment_method => '${method}',
    p_discount_type => 'fixed',
    p_discount_value => 0,
    p_applied_taxes => '[]'::jsonb,
    p_tax_amount => 0,
    p_total_amount => 100,
    p_subtotal => 100,
    p_cash_amount => ${cashAmount},
    p_transfer_amount => ${transferAmount},
    p_zelle_amount => 0,
    p_sale_currency => 'CUP',
    p_sale_exchange_rate => 1,
    p_customer_id => NULL,
    p_customer_name => ${name === null ? 'NULL' : `'${name}'`}::text,
    p_supervisor_user_id => NULL,
    p_idempotency_key => '${idem}',
    p_operation_date => NULL,
    p_user_id => '${SELLER}'::uuid,
    p_supervisor_token_jti => NULL,
    p_supervisor_scope => NULL,
    p_discount_reason => NULL,
    p_notes => NULL,
    p_payment_incidents => NULL,
    p_cash_received_cup => NULL,
    p_cash_received_usd => NULL,
    p_change_given_cup => NULL,
    p_change_given_usd => NULL,
    p_change_currency => NULL,
    p_payment_components => ${components ? `'${components}'::jsonb` : 'NULL'},
    p_customer_code => NULL,
    p_customer_address => NULL,
    p_customer_ci => ${ci === null ? 'NULL' : `'${ci}'`}::text,
    p_customer_phone => ${phone === null ? 'NULL' : `'${phone}'`}::text
  )${suffix}`;
}

function probe(id, callSql, extra = '', declareClause = '') {
  return `BEGIN;
SET LOCAL request.jwt.claims = '${CLAIMS}';
CREATE TEMP TABLE csmv_probe(id text, ok boolean, detail text) ON COMMIT DROP;
DO $probe$
${declareClause}
BEGIN
  ${callSql};
  ${extra || `INSERT INTO csmv_probe VALUES ('${id}', true, 'success');`}
EXCEPTION WHEN OTHERS THEN
  INSERT INTO csmv_probe VALUES ('${id}', false, left(SQLERRM, 200));
END $probe$;
SELECT * FROM csmv_probe;
ROLLBACK;`;
}

const probes = [
  { id: 'B1', expectErr: true, expectTag: 'ERR_TRANSFER_IDENTITY_REQUIRED', sql: probe('B1', saleCall({
      items: itemJson({}), idem: 'csmv-B1-' + Date.now(),
    })) },
  { id: 'B2', expectErr: true, expectTag: 'ERR_TRANSFER_IDENTITY_REQUIRED', sql: probe('B2', saleCall({
      items: itemJson({}), name: '   ', ci: '  ', phone: ' ', idem: 'csmv-B2-' + Date.now(),
    })) },
  { id: 'B3', expectErr: false, persistence: true, sql: probe('B3', saleCall({
      items: itemJson({}), name: 'Ana Pérez Rodríguez', ci: '92031112345', phone: '+53 51234567', idem: 'csmv-B3-' + Date.now(), intoVar: 'v_res',
    }), `INSERT INTO csmv_probe SELECT 'B3-persistencia', (customer_phone = '+53 51234567' AND customer_name = 'Ana Pérez Rodríguez' AND customer_ci = '92031112345'), 'tx=' || id::text FROM public.transactions WHERE id = (v_res->>'transaction_id')::uuid;
INSERT INTO csmv_probe VALUES ('B3', true, 'success');`, 'DECLARE v_res jsonb;') },
  { id: 'B4', expectErr: false, sql: probe('B4', saleCall({
      items: itemJson({ method: 'cash', amount: 100 }), method: 'cash', transferAmount: 0, cashAmount: 100, idem: 'csmv-B4-' + Date.now(),
    })) },
  { id: 'B5', expectErr: false, sql: probe('B5', saleCall({
      items: itemJson({ method: 'transfer', amount: 100, withPayments: false }), transferAmount: 100, idem: 'csmv-B5-' + Date.now(),
    })) },
  { id: 'B6', expectErr: true, expectTag: 'ERR_ITEM_PAYMENTS_INVALID', sql: probe('B6', saleCall({
      items: itemJson({ reference: null }), name: 'Ana Pérez', ci: '92031112345', phone: '+53 51234567', idem: 'csmv-B6-' + Date.now(),
    })) },
  { id: 'B7', expectErr: true, expectTag: 'ERR_TRANSFER_IDENTITY_REQUIRED', sql: probe('B7', saleCall({
      items: itemJson({ method: 'cash', amount: 100 }), method: 'mixed', transferAmount: 0, cashAmount: 100,
      components: JSON.stringify([{ method: 'transfer', currency: 'CUP', amount: 50 }]), idem: 'csmv-B7-' + Date.now(),
    })) },
  { id: 'B8', expectErr: true, expectTag: 'ERR_TRANSFER_IDENTITY_REQUIRED', sql: probe('B8', saleCall({
      items: itemJson({}), name: 'Ana Pérez', ci: '92031112345', phone: null, idem: 'csmv-B8-' + Date.now(),
    })) },
];

let failures = 0;
for (const p of probes) {
  const r = await runSql(p.sql);
  if (!r.ok) {
    console.log(`${p.id} — HTTP ${r.status}: ${r.text.slice(0, 300)}`);
    failures++;
    continue;
  }
  const rows = JSON.parse(r.text || '[]');
  const row = rows.find((x) => x.id === p.id) ?? {};
  let verdict;
  if (p.expectErr) {
    verdict = row.ok === false && (p.expectTag ? row.detail?.includes(p.expectTag) : true);
  } else {
    verdict = row.ok === true && row.detail === 'success';
  }
  if (p.persistence) {
    const persistRow = rows.find((x) => x.id === 'B3-persistencia');
    verdict = verdict && persistRow?.ok === true;
  }
  console.log(`${verdict ? 'PASS' : 'FAIL'} — ${p.id}: ${String(row.detail).slice(0, 140)}`);
  if (!verdict) failures++;
}

console.log(failures === 0 ? '\nBATERÍA CSMV: 8/8 PASS (transacciones revertidas — cero residuos)' : `\nBATERÍA CSMV: ${failures} fallo(s)`);
process.exit(failures === 0 ? 0 : 1);

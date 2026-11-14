#!/usr/bin/env node
/**
 * VALIDACIÓN EN BD E2E AISLADA — fix/semantica-ventas-usd-20261114
 * Semántica VENTA: total_amount YA es CUP-equivalente (el motor no debe
 * multiplicarlo otra vez por la tasa).
 *
 * Ejecuta contra la BD E2E AISLADA (lguovmvrozxgssupkwpf — JAMÁS producción):
 *   FASE A (función ORIGINAL): crea ventas/devolución reales de prueba y las
 *   completa → el motor intenta contabilizar (trigger). Se registra el
 *   comportamiento ANTES del fix (doble conversión → ERR_UNBALANCED).
 *   FASE B (aplica la migración de la rama): re-publica los mismos documentos
 *   → se verifica el comportamiento DESPUÉS del fix.
 *   CASOS: C1 venta CUP·pago CUP · C2 venta USD·pago USD(zelle) completo ·
 *   C3 venta USD·pago CUP completo · C4 venta USD·pago mixto USD+CUP ·
 *   C5 venta USD·pago PARCIAL (ERR por diseño; CXC = política pendiente) ·
 *   C6 venta CUP·pago mixto CUP+USD · C7 devolución USD (informativo) ·
 *   C8 venta CUP sin pagos (las 165; ERR por diseño) · C9 venta CUP con costo
 *   (COGS completo).
 *   RESTAURACIÓN: se re-instala la función ORIGINAL y se eliminan TODOS los
 *   documentos de prueba → NET DELTA 0 (conteos idénticos).
 *
 * Uso: ALLOW_PROD=read-only node scripts/validar-semantica-ventas-usd.mjs
 * (ALLOW_PROD=read-only solo es necesario para importar el módulo del dry-run
 *  cuyo guard se evalúa en la carga; este script NO escribe producción.)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const REF = 'lguovmvrozxgssupkwpf'; // BD E2E aislada — verificada por el guard
assertNotProduction({ mode: 'write', projectRef: REF, context: 'validar-semantica-ventas-usd.mjs' });

const E = process.env;
if (!E.SUPABASE_ACCESS_TOKEN) {
  const envFile = readFileSync(`${REPO}/.env`, 'utf8');
  for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !E[m[1]]) E[m[1]] = m[2].trim();
  }
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${E.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 2500)); return sql(query); }
  const text = await res.text();
  if (!res.ok) throw new Error(`(HTTP ${res.status}) ${text.slice(0, 800)}`);
  return JSON.parse(text || '[]');
}

const N = v => Number(v ?? 0);
const r2 = v => Math.round(N(v) * 100) / 100;
let FALLAS = 0;
const chk = (nombre, ok, detalle = '') => { if (!ok) FALLAS++; console.log(`  ${ok ? 'PASS' : 'FAIL'} · ${nombre}${detalle ? ' — ' + detalle : ''}`); };

console.log('════ VALIDACIÓN SEMÁNTICA VENTAS USD · BD AISLADA ' + REF + ' ════');
console.log('Hora:', new Date().toISOString());

// ── 0. contexto + snapshot + función original ────────────────────────────────
const store = (await sql(`SELECT id, name FROM public.stores ORDER BY created_at LIMIT 1`))[0];
const seller = (await sql(`SELECT id FROM public.profiles WHERE is_active ORDER BY created_at LIMIT 1`))[0];
if (!store || !seller) { console.error('FATAL: sin tienda/usuario en la BD aislada'); process.exit(1); }
console.log('Tienda de prueba:', store.name, '| vendedor:', seller.id);

// pre-limpieza idempotente de residuos de ejecuciones interrumpidas
await sql(`BEGIN;
  DELETE FROM public.fin_movements WHERE entry_id IN
    (SELECT id FROM public.fin_entries WHERE document_id IN
       (SELECT id FROM public.transactions WHERE invoice_number LIKE 'TEST-SEMUSD-%')
       OR document_id IN (SELECT id FROM public.devolutions WHERE devolution_number LIKE 'TEST-SEMUSD-%'));
  DELETE FROM public.fin_entries WHERE document_id IN
       (SELECT id FROM public.transactions WHERE invoice_number LIKE 'TEST-SEMUSD-%')
    OR document_id IN (SELECT id FROM public.devolutions WHERE devolution_number LIKE 'TEST-SEMUSD-%');
  DELETE FROM public.fin_posting_errors WHERE document_id IN
       (SELECT id FROM public.transactions WHERE invoice_number LIKE 'TEST-SEMUSD-%')
    OR document_id IN (SELECT id FROM public.devolutions WHERE devolution_number LIKE 'TEST-SEMUSD-%');
  ALTER TABLE public.payment_transactions DISABLE TRIGGER trg_validate_payment_invariants;
  DELETE FROM public.payment_transactions WHERE reference = 'validacion-semantica-usd';
  ALTER TABLE public.payment_transactions ENABLE TRIGGER trg_validate_payment_invariants;
  DELETE FROM public.transaction_items WHERE transaction_id IN
    (SELECT id FROM public.transactions WHERE invoice_number LIKE 'TEST-SEMUSD-%');
  DELETE FROM public.transactions WHERE invoice_number LIKE 'TEST-SEMUSD-%';
  DELETE FROM public.devolutions WHERE devolution_number LIKE 'TEST-SEMUSD-%';
  COMMIT;`);

// snapshot del estado LIMPIO (tras la pre-limpieza) + función original
const SNAP_SQL = `SELECT
  (SELECT count(*)::int FROM public.transactions WHERE invoice_number LIKE 'TEST-SEMUSD-%') AS ventas,
  (SELECT count(*)::int FROM public.transaction_items) AS items,
  (SELECT count(*)::int FROM public.payment_transactions WHERE reference='validacion-semantica-usd') AS pagos,
  (SELECT count(*)::int FROM public.devolutions WHERE devolution_number LIKE 'TEST-SEMUSD-%') AS devoluciones,
  (SELECT count(*)::int FROM public.fin_entries) AS entries,
  (SELECT count(*)::int FROM public.fin_movements) AS movements,
  (SELECT count(*)::int FROM public.fin_posting_errors) AS errors`;
const snap0 = (await sql(SNAP_SQL))[0];
const fnOriginal = (await sql(`SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fin_compute_metrics'`))[0].def;
const sha = s => createHash('sha256').update(s).digest('hex').slice(0, 16);
console.log('Snapshot ANTES (estado limpio):', JSON.stringify(snap0), '| fin_compute_metrics:', sha(fnOriginal));

// ── helpers de fixtures ───────────────────────────────────────────────────────
const TS = () => Date.now();
let nDoc = 0;
async function crearVenta({ num, cur, rate, total, items, pagos, sinPagos = false }) {
  const inv = `TEST-SEMUSD-${num}-${TS()}`;
  const t = (await sql(`INSERT INTO public.transactions
    (store_id, seller_id, total_amount, status, sale_currency, sale_exchange_rate, idempotency_key, invoice_number, notes, payment_method)
    VALUES ('${store.id}', '${seller.id}', ${total}, 'pending', '${cur}', ${rate}, 'semusd-${num}-${TS()}', '${inv}',
      'VALIDACIÓN fix/semantica-ventas-usd-20261114 — se elimina al final', 'cash')
    RETURNING id`))[0].id;
  for (const it of items) {
    await sql(`INSERT INTO public.transaction_items
      (transaction_id, product_id, quantity, price_at_sale, price_currency, price_at_sale_cup, cost_at_sale)
      VALUES ('${t}', NULL, ${it.qty}, ${it.price}, '${it.priceCur ?? cur}', ${it.priceCup}, ${it.cost ?? 0})`);
  }
  if (!sinPagos) {
    for (const p of pagos) {
      await sql(`INSERT INTO public.payment_transactions
        (store_id, ref_type, ref_id, transaction_id, amount, payment_method, currency, exchange_rate, direction, payment_date, reference)
        VALUES ('${store.id}', 'sale', '${t}', '${t}', ${p.amount}, '${p.method}', '${p.cur}', ${p.rate}, 'in', now(), 'validacion-semantica-usd')`);
    }
  }
  return { id: t, inv };
}
async function completarVenta(id) {
  await sql(`UPDATE public.transactions SET status='completed', completed_at=now() WHERE id='${id}'`);
}
const entryDe = async id => (await sql(`SELECT id, event FROM public.fin_entries e
  WHERE e.document_type='VENTA' AND e.document_id='${id}' AND e.event='reconocimiento' ORDER BY posted_at DESC LIMIT 1`))[0];
const movsDe = async entryId => (await sql(`SELECT category_code, sense, amount, currency, currency_origin FROM public.fin_movements m WHERE m.entry_id='${entryId}'`))
  .map(m => ({ cat: m.category_code, s: m.sense, amt: N(m.amount), cur: m.currency, curO: m.currency_origin }));
const errorDe = async id => (await sql(`SELECT error_code, error_detail FROM public.fin_posting_errors
  WHERE document_type='VENTA' AND document_id='${id}' AND event='reconocimiento' ORDER BY created_at DESC LIMIT 1`))[0];
const debCred = movs => ({
  d: r2(movs.filter(m => m.s === 'debito').reduce((s, m) => s + m.amt, 0)),
  c: r2(movs.filter(m => m.s === 'credito').reduce((s, m) => s + m.amt, 0)),
});
const tiene = (movs, cat, s, amt, curO) => movs.some(m => m.cat === cat && m.s === s && Math.abs(m.amt - amt) <= 0.01 && (curO ? m.curO === curO : true));

async function republicar(id) {
  await sql(`DELETE FROM public.fin_posting_errors WHERE document_type='VENTA' AND document_id='${id}'`);
  await sql(`SELECT public.fin_post_document_safe('VENTA', '${id}', 'reconocimiento')`);
}

// ══ FASE A — función ORIGINAL (comportamiento ANTES del fix) ═════════════════
console.log('\n── FASE A: función ORIGINAL (antes del fix) ──');
const rate = 680;

const c1 = await crearVenta({ num: 1, cur: 'CUP', rate: 1, total: 1000,
  items: [{ qty: 1, price: 1000, priceCur: 'CUP', priceCup: 1000 }],
  pagos: [{ amount: 1000, method: 'cash', cur: 'CUP', rate: 1 }] });
await completarVenta(c1.id);
let e = await entryDe(c1.id); let mv = e ? await movsDe(e.id) : [];
chk('C1 venta CUP·pago CUP: contabiliza (regresión)', !!e);
chk('C1: D ACT_EFECTIVO_CUP 1000 / C ING_VENTAS 1000', tiene(mv, 'ACT_EFECTIVO_CUP', 'debito', 1000) && tiene(mv, 'ING_VENTAS', 'credito', 1000), JSON.stringify(mv));

const c2 = await crearVenta({ num: 2, cur: 'USD', rate, total: 374000,
  items: [{ qty: 1, price: 550, priceCur: 'USD', priceCup: 374000 }],
  pagos: [{ amount: 550, method: 'zelle', cur: 'USD', rate }] });
await completarVenta(c2.id);
e = await entryDe(c2.id);
let err = await errorDe(c2.id);
chk('C2 venta USD·pago zelle USD completo: ANTES → ERR_UNBALANCED (doble conversión 374000×680≠374000)', !e && !!err && /ERR_UNBALANCED/.test(err.error_code || ''), err ? (err.error_code || '').slice(0, 60) : 'sin error');

const c3 = await crearVenta({ num: 3, cur: 'USD', rate, total: 374000,
  items: [{ qty: 1, price: 550, priceCur: 'USD', priceCup: 374000 }],
  pagos: [{ amount: 374000, method: 'cash', cur: 'CUP', rate: 1 }] });
await completarVenta(c3.id);
e = await entryDe(c3.id); err = await errorDe(c3.id);
chk('C3 venta USD·pago cash CUP completo: ANTES → ERR_UNBALANCED', !e && !!err && /ERR_UNBALANCED/.test(err.error_code || ''));

const c4 = await crearVenta({ num: 4, cur: 'USD', rate, total: 500000,
  items: [{ qty: 1, price: 735.29, priceCur: 'USD', priceCup: 500000 }],
  pagos: [{ amount: 500, method: 'zelle', cur: 'USD', rate }, { amount: 160000, method: 'cash', cur: 'CUP', rate: 1 }] });
await completarVenta(c4.id);
e = await entryDe(c4.id); err = await errorDe(c4.id);
chk('C4 venta USD·pago mixto zelle USD + cash CUP: ANTES → ERR_UNBALANCED', !e && !!err && /ERR_UNBALANCED/.test(err.error_code || ''));

const c5 = await crearVenta({ num: 5, cur: 'USD', rate, total: 374000,
  items: [{ qty: 1, price: 550, priceCur: 'USD', priceCup: 374000 }],
  pagos: [{ amount: 100, method: 'zelle', cur: 'USD', rate }] });
await completarVenta(c5.id);
e = await entryDe(c5.id); err = await errorDe(c5.id);
chk('C5 venta USD·pago PARCIAL (100 de 550 USD): ERR por diseño (CXC = política pendiente)', !e && !!err && /ERR_UNBALANCED/.test(err.error_code || ''));

const c6 = await crearVenta({ num: 6, cur: 'CUP', rate: 1, total: 100000,
  items: [{ qty: 1, price: 100000, priceCur: 'CUP', priceCup: 100000 }],
  pagos: [{ amount: 100, method: 'zelle', cur: 'USD', rate }, { amount: 32000, method: 'cash', cur: 'CUP', rate: 1 }] });
await completarVenta(c6.id);
e = await entryDe(c6.id); mv = e ? await movsDe(e.id) : [];
chk('C6 venta CUP·pago mixto CUP+USD: contabiliza (regresión; doc CUP sin conversión)', !!e);
chk('C6: D ACT_BANCOS 68000 (zelle) + D ACT_EFECTIVO_CUP 32000 / C ING_VENTAS 100000',
  tiene(mv, 'ACT_BANCOS', 'debito', 68000) && tiene(mv, 'ACT_EFECTIVO_CUP', 'debito', 32000) && tiene(mv, 'ING_VENTAS', 'credito', 100000));

const c8 = await crearVenta({ num: 8, cur: 'CUP', rate: 1, total: 5000, sinPagos: true,
  items: [{ qty: 1, price: 5000, priceCur: 'CUP', priceCup: 5000 }], pagos: [] });
await completarVenta(c8.id);
e = await entryDe(c8.id); err = await errorDe(c8.id);
chk('C8 venta CUP SIN pagos (caso de las 165): ERR por diseño', !e && !!err && /ERR_UNBALANCED/.test(err.error_code || ''));

const c9 = await crearVenta({ num: 9, cur: 'CUP', rate: 1, total: 1000,
  items: [{ qty: 1, price: 1000, priceCur: 'CUP', priceCup: 1000, cost: 400 }],
  pagos: [{ amount: 1000, method: 'cash', cur: 'CUP', rate: 1 }] });
await completarVenta(c9.id);
e = await entryDe(c9.id); mv = e ? await movsDe(e.id) : [];
chk('C9 venta CUP con costo 400: COGS completo (regresión)',
  tiene(mv, 'GAS_COSTO_VENTAS', 'debito', 400) && tiene(mv, 'ACT_INVENTARIO', 'credito', 400) && tiene(mv, 'ING_VENTAS', 'credito', 1000));

// C7 devolución USD (informativo — semántica de devoluciones FUERA del alcance del fix)
const dev = (await sql(`INSERT INTO public.devolutions
  (store_id, original_transaction_id, devolution_number, reason, total_amount, currency, exchange_rate, payment_method, status, notes)
  VALUES ('${store.id}', '${c2.id}', 'TEST-SEMUSD-7-${TS()}', 'Validación semántica USD', 37400, 'USD', ${rate}, 'cash', 'pending',
   'VALIDACIÓN fix/semantica-ventas-usd-20261114 — se elimina al final')
  RETURNING id, devolution_number`))[0];
await sql(`INSERT INTO public.payment_transactions
  (store_id, ref_type, ref_id, transaction_id, amount, payment_method, currency, exchange_rate, direction, payment_date, reference)
  VALUES ('${store.id}', 'devolution', '${dev.id}', '${c2.id}', 55, 'cash', 'USD', ${rate}, 'refund', now(), 'validacion-semantica-usd')`);
await sql(`UPDATE public.devolutions SET status='completed', processed_at=now() WHERE id='${dev.id}'`);
const eDev = (await sql(`SELECT id FROM public.fin_entries WHERE document_type='DEVOLUCION_VENTA' AND document_id='${dev.id}' LIMIT 1`))[0];
const errDev = (await sql(`SELECT error_code FROM public.fin_posting_errors WHERE document_type='DEVOLUCION_VENTA' AND document_id='${dev.id}' ORDER BY created_at DESC LIMIT 1`))[0];
chk('C7 devolución USD (informativo): ERR_UNBALANCED — semántica de devoluciones NO cambiada por este fix (documentado)', !eDev && !!errDev && /ERR_UNBALANCED/.test(errDev.error_code || ''));

// ══ FASE B — aplicar migración de la rama y RE-PUBLICAR ══════════════════════
console.log('\n── FASE B: aplica migración de la rama (BD aislada) y re-publica ──');
const migracion = readFileSync(join(REPO, 'supabase/migrations/20261114120000_cp_fin_semantica_total_amount_cup.sql'), 'utf8');
await sql(migracion);
console.log('  migración 20261114120000 aplicada a la BD aislada');

// C2: re-publicar → debe contabilizar
await republicar(c2.id);
e = await entryDe(c2.id); mv = e ? await movsDe(e.id) : [];
chk('C2 DESPUÉS: contabiliza (total_cup = total_amount, sin ×tasa)', !!e);
chk('C2: D ACT_BANCOS 374000 (zelle_usd) / C ING_VENTAS 374000', tiene(mv, 'ACT_BANCOS', 'debito', 374000) && tiene(mv, 'ING_VENTAS', 'credito', 374000), JSON.stringify(mv));
chk('C2: movimientos en CUP con currency_origin=USD (traza de divisa)', mv.every(m => m.cur === 'CUP') && mv.some(m => m.curO === 'USD'));
chk('C2: D=C (equilibrado)', Math.abs(debCred(mv).d - debCred(mv).c) <= 0.01, JSON.stringify(debCred(mv)));

await republicar(c3.id);
e = await entryDe(c3.id); mv = e ? await movsDe(e.id) : [];
chk('C3 DESPUÉS: contabiliza · D ACT_EFECTIVO_CUP 374000 / C ING_VENTAS 374000', !!e && tiene(mv, 'ACT_EFECTIVO_CUP', 'debito', 374000) && tiene(mv, 'ING_VENTAS', 'credito', 374000));

await republicar(c4.id);
e = await entryDe(c4.id); mv = e ? await movsDe(e.id) : [];
chk('C4 DESPUÉS: mixto · D ACT_BANCOS 340000 + D ACT_EFECTIVO_CUP 160000 / C ING_VENTAS 500000',
  !!e && tiene(mv, 'ACT_BANCOS', 'debito', 340000) && tiene(mv, 'ACT_EFECTIVO_CUP', 'debito', 160000) && tiene(mv, 'ING_VENTAS', 'credito', 500000));

await republicar(c5.id);
e = await entryDe(c5.id); err = await errorDe(c5.id);
chk('C5 DESPUÉS: sigue ERR_UNBALANCED (pago parcial; política CXC pendiente — decisión del propietario)', !e && !!err && /ERR_UNBALANCED/.test(err.error_code || ''));

await republicar(c8.id);
e = await entryDe(c8.id); err = await errorDe(c8.id);
chk('C8 DESPUÉS: sigue ERR_UNBALANCED (sin pagos; migración de legacy/CXC pendiente)', !e && !!err && /ERR_UNBALANCED/.test(err.error_code || ''));

// idempotencia del motor en C1 (ya contabilizada: NO duplica)
const antes1 = (await sql(`SELECT count(*)::int n FROM public.fin_entries WHERE document_type='VENTA' AND document_id='${c1.id}'`))[0].n;
await sql(`SELECT public.fin_post_document_safe('VENTA', '${c1.id}', 'reconocimiento')`);
const despues1 = (await sql(`SELECT count(*)::int n FROM public.fin_entries WHERE document_type='VENTA' AND document_id='${c1.id}'`))[0].n;
chk('Idempotencia: re-publicar C1 no duplica asientos', antes1 === despues1, `${antes1}→${despues1}`);

// ── restaurar la función ORIGINAL y limpieza total (net delta 0) ──────────────
console.log('\n── Restauración y limpieza ──');
await sql(fnOriginal);
const fnTras = (await sql(`SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fin_compute_metrics'`))[0].def;
chk('fin_compute_metrics RESTAURADA (hash idéntico al original)', sha(fnTras) === sha(fnOriginal), `antes=${sha(fnOriginal)} tras=${sha(fnTras)}`);

await sql(`BEGIN;
  DELETE FROM public.fin_movements WHERE entry_id IN
    (SELECT id FROM public.fin_entries WHERE document_id IN
       (SELECT id FROM public.transactions WHERE invoice_number LIKE 'TEST-SEMUSD-%')
       OR document_id IN (SELECT id FROM public.devolutions WHERE devolution_number LIKE 'TEST-SEMUSD-%'));
  DELETE FROM public.fin_entries WHERE document_id IN
       (SELECT id FROM public.transactions WHERE invoice_number LIKE 'TEST-SEMUSD-%')
    OR document_id IN (SELECT id FROM public.devolutions WHERE devolution_number LIKE 'TEST-SEMUSD-%');
  DELETE FROM public.fin_posting_errors WHERE document_id IN
       (SELECT id FROM public.transactions WHERE invoice_number LIKE 'TEST-SEMUSD-%')
    OR document_id IN (SELECT id FROM public.devolutions WHERE devolution_number LIKE 'TEST-SEMUSD-%');
  ALTER TABLE public.payment_transactions DISABLE TRIGGER trg_validate_payment_invariants;
  DELETE FROM public.payment_transactions WHERE reference = 'validacion-semantica-usd';
  ALTER TABLE public.payment_transactions ENABLE TRIGGER trg_validate_payment_invariants;
  DELETE FROM public.transaction_items WHERE transaction_id IN
    (SELECT id FROM public.transactions WHERE invoice_number LIKE 'TEST-SEMUSD-%');
  DELETE FROM public.transactions WHERE invoice_number LIKE 'TEST-SEMUSD-%';
  DELETE FROM public.devolutions WHERE devolution_number LIKE 'TEST-SEMUSD-%';
  COMMIT;`);

const snap1 = (await sql(SNAP_SQL))[0];
const net0 = JSON.stringify(snap0) === JSON.stringify(snap1);
chk('NET DELTA 0 (limpieza total; función restaurada)', net0, 'antes=' + JSON.stringify(snap0) + ' después=' + JSON.stringify(snap1));

console.log('\n════ RESULTADO: ' + (FALLAS === 0 && net0 ? 'PASS TOTAL (semántica USD validada: antes ERR_UNBALANCED → después asientos correctos y equilibrados)' : 'FAIL: ' + FALLAS + ' comprobaciones') + ' ════');
process.exit(FALLAS === 0 && net0 ? 0 : 1);

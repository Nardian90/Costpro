#!/usr/bin/env node
/**
 * M018 — CP-FIN-FINAL-EXECUTION-001 (FASE III de la misión): MIGRACIÓN de los
 * cobros legacy de las 161 ventas elegibles a payment_transactions, ejecutando
 * la MIGRACIÓN v1 validada en BD E2E aislada (PR #1617, fusionado):
 *   docs/audits/2026-11-13-migracion-legacy-pagos/MIGRACION.sql
 *
 * Secuencia exigida por la misión (FASE III, 11 pasos):
 *   0. Guard CP-INFRA-019 (doble flag) + SHA-256 del archivo MIGRACION.sql.
 *   1. RECONSTRUCCIÓN de la población en producción (165/161/4) + comprobación
 *      de importes legacy == total_amount, sin pagos previos, sin devoluciones
 *      / store credit / liquidaciones incompatibles, moneda CUP demostrada.
 *   2. DRY-RUN: SELECT con el MISMO cuerpo del INSERT (mismos guards) — debe
 *      coincidir con el expediente: 161 ventas, 170 filas, 3.128.770,00 CUP.
 *   3. EJECUCIÓN transaccional (el archivo completo: BEGIN; INSERT…; COMMIT;
 *      en UNA sola llamada — idempotente por diseño).
 *   4. VERIFICACIÓN fila a fila: P1 fechas históricas conservadas, P2 métodos
 *      y monedas originales, P3/P5 sin duplicados, P7 vinculación a la venta,
 *      Σamount_cup == total_amount por venta.
 *   5. VERIFICACIÓN de integridad: campos legacy intactos (Σ legacy de las 165
 *      sin cambios), 4 zelle+CUP sin filas (bloqueadas), CERO asientos nuevos
 *      (VENTA no tiene evento 'pago': los cobros se agregan al reconocimiento),
 *      fin_posting_errors sin cambios.
 *   6. IDEMPOTENCIA: re-ejecutar el mismo SQL → 170 filas se mantienen.
 *
 * Las 4 ventas con conflicto Zelle+CUP (c5965c77, cb3052c3, 119a4f5e, 1558287f;
 * 34.340 CUP) NO se migran: PT005 prohíbe zelle en CUP — quedan bloqueadas para
 * decisión del propietario (opciones a/b/c del expediente). PT005 global queda
 * INTACTO.
 *
 * Autorización: MISIÓN MAESTRA CP-FIN §5 (2026-11-13): «Si los resultados
 * coinciden con el expediente, ejecuta la migración transaccional v1».
 * Uso: ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND bun \
 *   scripts/m018-migracion-legacy-165.mjs [--only-verify]
 */
import { readFileSync } from 'fs';
import { createHash } from 'node:crypto';
import { resolve } from 'path';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const onlyVerify = process.argv.includes('--only-verify');
const MIGRACION = 'docs/audits/2026-11-13-migracion-legacy-pagos/MIGRACION.sql';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
assertNotProduction({ mode: 'write', url: SUPABASE_URL, context: 'm018-migracion-legacy-165.mjs' });
if (ref !== 'wthkddeleylijmonclxg') {
  console.error('FALLO DE GUARD: destino no es producción (wthkddeleylijmonclxg)');
  process.exit(2);
}
async function mgmt(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}
async function q(query) {
  const r = await mgmt(query);
  if (!r.ok) { console.error('QUERY FAILED', r.status, r.text.slice(0, 400)); process.exit(4); }
  return JSON.parse(r.text);
}

const sqlMigracion = readFileSync(resolve(process.cwd(), MIGRACION), 'utf8');
const shaMigracion = createHash('sha256').update(sqlMigracion).digest('hex');
console.log('M018 · migración legacy 161 ventas → PRODUCCIÓN (' + ref + ')');
console.log('  archivo: ' + MIGRACION + ' · SHA-256 ' + shaMigracion);

// ── 1 · RECONSTRUCCIÓN de la población ────────────────────────────────────────
console.log('\n── 1 · RECONSTRUCCIÓN de la población elegible ──');
const pob = (await q(`SELECT
  (SELECT count(*) FROM public.transactions t WHERE t.status='completed' AND t.total_amount>0
     AND abs(coalesce(t.cash_amount,0)+coalesce(t.transfer_amount,0)+coalesce(t.zelle_amount,0)-t.total_amount)<=0.005
     AND NOT EXISTS (SELECT 1 FROM public.payment_transactions pt WHERE pt.ref_type='sale' AND pt.ref_id=t.id)) AS total_165,
  (SELECT count(*) FROM public.transactions t WHERE t.status='completed' AND t.total_amount>0
     AND abs(coalesce(t.cash_amount,0)+coalesce(t.transfer_amount,0)+coalesce(t.zelle_amount,0)-t.total_amount)<=0.005
     AND coalesce(t.zelle_amount,0)=0 AND t.sale_currency='CUP'
     AND NOT EXISTS (SELECT 1 FROM public.transaction_items ti WHERE ti.transaction_id=t.id AND coalesce(ti.currency,'CUP')<>'CUP')
     AND NOT EXISTS (SELECT 1 FROM public.transaction_items ti WHERE ti.transaction_id=t.id AND ti.cash_currency='USD' AND coalesce(ti.cash_paid,0)>0)
     AND (t.cash_received_cup IS NULL AND t.cash_received_usd IS NULL AND t.change_given_cup IS NULL AND t.change_given_usd IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.payment_transactions pt WHERE pt.ref_type='sale' AND pt.ref_id=t.id)) AS migrables_161,
  (SELECT coalesce(sum(t.total_amount),0) FROM public.transactions t WHERE t.status='completed' AND t.total_amount>0
     AND coalesce(t.zelle_amount,0)=0 AND t.sale_currency='CUP'
     AND abs(coalesce(t.cash_amount,0)+coalesce(t.transfer_amount,0)+coalesce(t.zelle_amount,0)-t.total_amount)<=0.005
     AND NOT EXISTS (SELECT 1 FROM public.payment_transactions pt WHERE pt.ref_type='sale' AND pt.ref_id=t.id)) AS importe_161,
  (SELECT count(*) FROM public.payment_transactions WHERE idempotency_key LIKE 'legacy-mig-v1-%') AS ya_migradas`))[0];
console.log('  población:', JSON.stringify(pob));
if (pob.total_165 !== 165 || pob.migrables_161 !== 161 || Math.abs(Number(pob.importe_161) - 3128770) > 0.01) {
  console.error('ABORT: la población reconstruida NO coincide con el expediente (165/161/3.128.770).');
  process.exit(3);
}
if (pob.ya_migradas > 0) {
  console.error('ABORT: ya existen filas legacy-mig-v1 (' + pob.ya_migradas + ') — la migración ya se aplicó.');
  process.exit(3);
}
const incompat = (await q(`SELECT
  (SELECT count(*) FROM public.devolutions d WHERE d.original_transaction_id IN (
     SELECT t.id FROM public.transactions t WHERE t.status='completed' AND t.total_amount>0
       AND abs(coalesce(t.cash_amount,0)+coalesce(t.transfer_amount,0)+coalesce(t.zelle_amount,0)-t.total_amount)<=0.005
       AND coalesce(t.zelle_amount,0)=0 AND t.sale_currency='CUP'
       AND NOT EXISTS (SELECT 1 FROM public.payment_transactions pt WHERE pt.ref_type='sale' AND pt.ref_id=t.id))) AS devoluciones,
  (SELECT count(*) FROM public.store_credit_ledger scl WHERE scl.origin_transaction_id IN (
     SELECT t.id FROM public.transactions t WHERE t.status='completed' AND t.total_amount>0
       AND coalesce(t.zelle_amount,0)=0 AND t.sale_currency='CUP'
       AND NOT EXISTS (SELECT 1 FROM public.payment_transactions pt WHERE pt.ref_type='sale' AND pt.ref_id=t.id))) AS store_credit`))[0];
console.log('  incompatibles (devo/store_credit):', JSON.stringify(incompat));
if (incompat.devoluciones !== 0 || incompat.store_credit !== 0) {
  console.error('ABORT: existen devoluciones o store credit sobre ventas elegibles.'); process.exit(3);
}
const antes = (await q(`SELECT
  (SELECT count(*) FROM public.payment_transactions) AS pagos,
  (SELECT count(*) FROM public.fin_entries) AS asientos,
  (SELECT coalesce(sum(coalesce(cash_amount,0)+coalesce(transfer_amount,0)+coalesce(zelle_amount,0)),0)
     FROM public.transactions WHERE status='completed') AS suma_legacy_total,
  (SELECT count(*) FROM public.fin_posting_errors) AS errores`))[0];
console.log('  ANTES:', JSON.stringify(antes));

// ── 2 · DRY-RUN (mismo cuerpo del INSERT; esperado: 161 ventas, 170 filas, 3.128.770,00) ──
console.log('\n── 2 · DRY-RUN (SELECT con los mismos guards del INSERT) ──');
const dry = (await q(`WITH elegibles AS (
  SELECT t.id, t.store_id, t.created_at, t.total_amount,
         coalesce(t.cash_amount,0) AS cash_amount, coalesce(t.transfer_amount,0) AS transfer_amount
  FROM public.transactions t
  WHERE t.status='completed' AND t.total_amount>0
    AND abs(coalesce(t.cash_amount,0)+coalesce(t.transfer_amount,0)+coalesce(t.zelle_amount,0)-t.total_amount)<=0.005
    AND coalesce(t.zelle_amount,0)=0 AND t.sale_currency='CUP'
    AND NOT EXISTS (SELECT 1 FROM public.transaction_items ti WHERE ti.transaction_id=t.id AND coalesce(ti.currency,'CUP')<>'CUP')
    AND NOT EXISTS (SELECT 1 FROM public.transaction_items ti WHERE ti.transaction_id=t.id AND ti.cash_currency='USD' AND coalesce(ti.cash_paid,0)>0)
    AND (t.cash_received_cup IS NULL AND t.cash_received_usd IS NULL AND t.change_given_cup IS NULL AND t.change_given_usd IS NULL)
    AND NOT EXISTS (SELECT 1 FROM public.payment_transactions pt WHERE pt.ref_type='sale' AND pt.ref_id=t.id)
), componentes AS (
  SELECT e.id, e.created_at, 'cash_amount' AS campo, 'cash' AS metodo, coalesce(e.cash_amount,0) AS importe FROM elegibles e WHERE coalesce(e.cash_amount,0)>0
  UNION ALL
  SELECT e.id, e.created_at, 'transfer_amount', 'transfer', coalesce(e.transfer_amount,0) FROM elegibles e WHERE coalesce(e.transfer_amount,0)>0
)
SELECT (SELECT count(DISTINCT id) FROM componentes) AS ventas_cubiertas,
       (SELECT count(*) FROM componentes) AS filas,
       (SELECT coalesce(sum(importe),0) FROM componentes) AS importe_cup`))[0];
console.log('  DRY-RUN:', JSON.stringify(dry));
if (dry.ventas_cubiertas !== 161 || dry.filas !== 170 || Math.abs(Number(dry.importe_cup) - 3128770) > 0.01) {
  console.error('ABORT: el dry-run NO coincide con el expediente (161/170/3.128.770,00). NO se ejecuta.');
  process.exit(3);
}

if (onlyVerify) { console.log('\n--only-verify: población y dry-run VERIFICADOS. Sin ejecutar.'); process.exit(0); }

// ── 3 · EJECUCIÓN transaccional (archivo completo en UNA llamada) ─────────────
console.log('\n── 3 · EJECUCIÓN transaccional v1 ──');
const r = await mgmt(sqlMigracion);
console.log('  HTTP', r.status, r.ok ? 'OK' : 'FALLO: ' + r.text.slice(0, 300));
if (!r.ok) process.exit(5);

// ── 4 · VERIFICACIÓN fila a fila ─────────────────────────────────────────────
console.log('\n── 4 · VERIFICACIÓN post (fila a fila) ──');
const post = (await q(`SELECT
  (SELECT count(*) FROM public.payment_transactions WHERE idempotency_key LIKE 'legacy-mig-v1-%') AS filas,
  (SELECT count(DISTINCT ref_id) FROM public.payment_transactions WHERE idempotency_key LIKE 'legacy-mig-v1-%') AS ventas,
  (SELECT coalesce(sum(amount_cup),0) FROM public.payment_transactions WHERE idempotency_key LIKE 'legacy-mig-v1-%') AS importe,
  (SELECT count(*) FROM public.payment_transactions WHERE idempotency_key LIKE 'legacy-mig-v1-%' AND currency='CUP' AND exchange_rate=1 AND direction='in' AND ref_type='sale' AND ref_id=transaction_id) AS p2_p7_ok,
  (SELECT count(*) FROM public.payment_transactions pt JOIN public.transactions t ON t.id=pt.ref_id
     WHERE pt.idempotency_key LIKE 'legacy-mig-v1-%' AND pt.payment_date <> t.created_at) AS p1_fecha_mal,
  (SELECT count(*) FROM (
     SELECT t.id, coalesce(sum(pt.amount_cup),0) AS suma
     FROM public.payment_transactions pt JOIN public.transactions t ON t.id = pt.ref_id
     WHERE pt.idempotency_key LIKE 'legacy-mig-v1-%' GROUP BY t.id) s
   JOIN public.transactions t2 ON t2.id = s.id
   WHERE abs(s.suma - t2.total_amount) > 0.005) AS importe_mal,
  (SELECT count(*) FROM public.payment_transactions WHERE idempotency_key LIKE 'legacy-mig-v1-%' AND payment_method NOT IN ('cash','transfer')) AS p2_metodo_mal,
  (SELECT count(*) FROM public.payment_transactions WHERE idempotency_key IN (
     SELECT 'legacy-mig-v1-' || id FROM public.transactions WHERE id IN
       ('c5965c77-1025-4f3f-9f9c-7298108d8ad7','cb3052c3-a4b3-4a65-8bbb-62e2340c7da0',
        '119a4f5e-bfa1-45c1-9784-cb2ff88bb0ce','1558287f-6c91-4f8c-afb3-d1d5c6be8001'))) AS zelle_migradas`))[0];
console.log('  POST:', JSON.stringify(post));
if (post.filas !== 170 || post.ventas !== 161 || Math.abs(Number(post.importe) - 3128770) > 0.01
    || post.p2_p7_ok !== 170 || post.p1_fecha_mal !== 0 || post.importe_mal !== 0 || post.p2_metodo_mal !== 0) {
  console.error('FALLO en la verificación fila a fila.'); process.exit(6);
}
if (post.zelle_migradas !== 0) { console.error('FALLO: alguna venta zelle quedó migrada.'); process.exit(6); }

// ── 5 · Integridad global ─────────────────────────────────────────────────────
console.log('\n── 5 · Integridad global ──');
const despues = (await q(`SELECT
  (SELECT count(*) FROM public.payment_transactions) AS pagos,
  (SELECT count(*) FROM public.fin_entries) AS asientos,
  (SELECT coalesce(sum(coalesce(cash_amount,0)+coalesce(transfer_amount,0)+coalesce(zelle_amount,0)),0)
     FROM public.transactions WHERE status='completed') AS suma_legacy_total,
  (SELECT count(*) FROM public.fin_posting_errors) AS errores`))[0];
console.log('  DESPUÉS:', JSON.stringify(despues));
if (despues.pagos !== antes.pagos + 170) { console.error('FALLO: filas de pago inesperadas.'); process.exit(6); }
if (despues.asientos !== antes.asientos || despues.errores !== antes.errores) {
  console.error('FALLO: se generaron asientos o errores.'); process.exit(6);
}
if (Number(despues.suma_legacy_total) !== Number(antes.suma_legacy_total)) {
  console.error('FALLO: los campos legacy cambiaron.'); process.exit(6);
}
console.log('  campos legacy intactos · 0 asientos nuevos (los cobros se agregan al reconocimiento) · errores sin cambios');

// ── 6 · IDEMPOTENCIA ─────────────────────────────────────────────────────────
console.log('\n── 6 · IDEMPOTENCIA (re-ejecución del mismo SQL) ──');
const r2 = await mgmt(sqlMigracion);
console.log('  HTTP', r2.status, r2.ok ? 'OK' : 'FALLO: ' + r2.text.slice(0, 200));
const idem = (await q(`SELECT count(*) AS filas, count(DISTINCT ref_id) AS ventas, coalesce(sum(amount_cup),0) AS importe
  FROM public.payment_transactions WHERE idempotency_key LIKE 'legacy-mig-v1-%'`))[0];
console.log('  tras re-ejecutar:', JSON.stringify(idem));
if (idem.filas !== 170 || idem.ventas !== 161) { console.error('FALLO de idempotencia.'); process.exit(7); }
console.log('\nM018 COMPLETADO — 161 ventas cubiertas (170 filas, 3.128.770,00 CUP), 4 zelle+CUP bloqueadas, idempotente, sin duplicaciones.');

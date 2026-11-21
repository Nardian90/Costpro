#!/usr/bin/env node
/**
 * m111-prod-recovery-check.mjs — CP-FIN-110-POSTREVIEW-HARDENING-111 §2.
 * Recuperación read-only del estado real de producción (ENERVIDA-VITALLCONS):
 *   1) superficie de la migración 20261122120000 (funciones/raíles v2) presente;
 *   2) generaciones: GEN-3 activa, GEN-2 superseded disponible;
 *   3) RECT-110-A: exactamente 1 asiento + 2 movimientos equilibrados;
 *   4) sin segunda rectificación equivalente (document_number RECT-110-A%);
 *   5) órdenes de trabajo por estado (completed/closed/voided + evidencia de
 *      finalización) y monedas de presupuesto — insumo P0-1/P0-2/impacto global;
 *   6) respaldo verificable en OUT antes de cualquier modificación.
 * Solo lectura: guard CP-INFRA-019 con mode=read. Uso:
 *   ALLOW_PROD=read-only SUPABASE_ACCESS_TOKEN=... node scripts/m111-prod-recovery-check.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const PROD_REF = 'wthkddeleylijmonclxg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const OUT = '/home/z/my-project/scripts/out/m111-audit';
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'; // ENERVIDA-VITALLCONS
mkdirSync(OUT, { recursive: true });
if (!TOKEN) { console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido'); process.exit(2); }

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 800)}`);
  return JSON.parse(text);
}

const findings = {};
function check(name, ok, detail) {
  findings[name] = { ok, detail };
  console.log(`${ok ? 'OK  ' : 'WARN'} ${name}: ${detail}`);
}

async function main() {
  assertNotProduction({ mode: 'read', projectRef: PROD_REF, context: 'm111-prod-recovery-check.mjs' });

  // 1) Superficie v2 de la migración 110 presente en producción
  const surface = await runSql(`
    SELECT proname FROM pg_proc WHERE proname IN
      ('fin_compute_metrics','fin_generation_build','fin_get_reconciliation',
       'fin_generation_create','fin_generation_validate','fin_generation_activate',
       'fin_active_generation') ORDER BY 1;`);
  check('surface_migracion_110', surface.length >= 7, `funciones presentes: ${surface.map(r => r.proname).join(', ')}`);

  // 2) Generaciones de ENERVIDA
  const gens = await runSql(`
    SELECT id, code, status, created_at
    FROM public.fin_posting_generations WHERE store_id = '${STORE}' ORDER BY created_at;`);
  check('generaciones', gens.length >= 2, gens.map(g => `${g.code}:${g.status}`).join(' | '));
  const gen3 = gens.find(g => g.status === 'active');
  const gen2 = gens.find(g => g.code === 'GEN-2');
  check('gen3_activa', !!gen3 && gen3.code === 'GEN-3', gen3 ? `${gen3.code} activa` : 'NO hay generación activa GEN-3');
  check('gen2_superseded', !!gen2 && gen2.status === 'superseded', gen2 ? `${gen2.code}:${gen2.status}` : 'GEN-2 no encontrada');
  findings._gen_ids = { gen3: gen3?.id, gen2: gen2?.id, all: gens };

  // 3) RECT-110-A: exactamente 1 asiento por generación activa (la copia GEN-2
  //    es el original insertado; el pase 4 copia ajustes a la nueva generación).
  const rect = await runSql(`
    SELECT e.id, e.document_number, e.generation_id, e.economic_date, e.status, g.code AS gen_code,
           (SELECT count(*)::int FROM public.fin_movements m WHERE m.entry_id = e.id) AS n_mov,
           (SELECT round(sum(CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END),2)
              FROM public.fin_movements m WHERE m.entry_id = e.id) AS saldo
    FROM public.fin_entries e
    LEFT JOIN public.fin_posting_generations g ON g.id = e.generation_id
    WHERE e.store_id = '${STORE}' AND e.document_number = 'RECT-110-A-SOBRECOSTE-COGS'
    ORDER BY g.created_at;`);
  const byGen = new Map(rect.map(r => [r.gen_code, r]));
  const okRect = byGen.size === rect.length
    && byGen.get('GEN-2')?.n_mov === 2 && Number(byGen.get('GEN-2')?.saldo) === 0
    && byGen.get('GEN-3')?.n_mov === 2 && Number(byGen.get('GEN-3')?.saldo) === 0;
  check('rect110a_unica_por_generacion_y_equilibrada', okRect,
    rect.length === 0 ? 'AUSENTE' : rect.map(r => `${r.gen_code}:${r.id.slice(0,8)} mov=${r.n_mov} saldo=${r.saldo} est=${r.status}`).join(' | '));

  // 4) Sin segunda rectificación equivalente
  const rectLike = await runSql(`
    SELECT e.id, e.document_number, e.posted_at
    FROM public.fin_entries e
    WHERE e.store_id = '${STORE}' AND e.document_number ILIKE 'RECT-110%'
    ORDER BY e.posted_at;`);
  check('sin_rect_duplicada_misma_generacion', rectLike.length === 2, `${rectLike.length} asientos RECT-110% (1 original GEN-2 + 1 copia pase 4 en GEN-3)`);

  // 5) Órdenes de trabajo por estado y moneda (insumo P0-1/P0-2/impacto global)
  const orders = await runSql(`
    SELECT status, budget_currency AS currency, count(*)::int AS n,
           round(sum(budget_total),2) AS presupuesto,
           round(sum(paid_amount),2) AS pagado_cup
    FROM public.production_orders WHERE store_id = '${STORE}'
    GROUP BY status, budget_currency ORDER BY status, budget_currency;`);
  console.log('Órdenes ENERVIDA por estado/moneda:', JSON.stringify(orders));

  // 5b) Detalle de órdenes closed (evidencia de finalización)
  const closed = await runSql(`
    SELECT id, order_number, order_type, status, budget_currency, budget_total, paid_amount,
           payment_status, completion_date, closed_at, budget_exchange_rate,
           updated_at, created_at
    FROM public.production_orders
    WHERE store_id = '${STORE}' AND status = 'closed' LIMIT 50;`);
  console.log(`Órdenes closed ENERVIDA: ${closed.length}`);
  findings._closed_sample = closed;

  // 6) Respaldo verificable antes de cualquier modificación
  const backup = {
    taken_at: new Date().toISOString(),
    store: STORE,
    generations: gens,
    rect_110a: rect,
    rect_like: rectLike,
    orders_by_status: orders,
    closed_orders: closed,
  };
  const counts = await runSql(`
    SELECT
      (SELECT count(*)::int FROM public.fin_entries WHERE store_id='${STORE}' AND generation_id='${gen3?.id ?? ''}') AS entradas_gen3,
      (SELECT count(*)::int FROM public.fin_movements m JOIN public.fin_entries e ON e.id=m.entry_id
         WHERE e.store_id='${STORE}' AND e.generation_id='${gen3?.id ?? ''}') AS movimientos_gen3,
      (SELECT count(*)::int FROM public.production_orders WHERE store_id='${STORE}') AS ordenes_total,
      (SELECT count(*)::int FROM public.payment_transactions WHERE store_id='${STORE}') AS pagos_total;`);
  backup.counts = counts[0];
  writeFileSync(`${OUT}/m111-pre-backup.json`, JSON.stringify(backup, null, 1));
  console.log('Respaldado en', `${OUT}/m111-pre-backup.json`, '— counts:', JSON.stringify(counts[0]));

  const allOk = Object.entries(findings)
    .filter(([k]) => !k.startsWith('_'))
    .every(([, v]) => v.ok);
  writeFileSync(`${OUT}/m111-recovery-findings.json`, JSON.stringify(findings, null, 1));
  console.log(allOk ? 'RECUPERACIÓN OK — estado 110 intacto' : 'RECUPERACIÓN CON ADVERTENCIAS — revisar antes de actuar');
}

main().catch(e => { console.error('FALLO:', e.message); process.exit(1); });

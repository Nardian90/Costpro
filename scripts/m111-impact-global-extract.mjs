#!/usr/bin/env node
/**
 * m111-impact-global-extract.mjs — CP-FIN-110-POSTREVIEW-HARDENING-111 §8.
 * Auditoría de impacto GLOBAL por tienda (SOLO LECTURA — guard CP-INFRA-019).
 * Identifica por tienda: órdenes completed / closed-con-evidencia / voided /
 * reversed, moneda del presupuesto, tasa histórica, anticipos registrados,
 * paid_amount, CxC operacional calculada (fórmula corregida: presupuesto
 * convertido ANTES de restar pagos), anticipos no reconocidos, ingresos ya
 * reconocidos en el mayor, generación activa y diferencias con el mayor.
 * Clasifica: (1) sin órdenes afectadas (2) correctamente contabilizadas
 * (3) órdenes closed faltantes en generaciones (4) diferencias de CxC por
 * moneda (5) generaciones que necesitarían reconstrucción.
 * Re-ejecutable (read-only). NO escribe NADA. Uso:
 *   ALLOW_PROD=read-only SUPABASE_ACCESS_TOKEN=... node scripts/m111-impact-global-extract.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const PROD_REF = 'wthkddeleylijmonclxg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const OUT = '/home/z/my-project/scripts/out/m111-audit';
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

// Predicado canónico P0-1: orden RECONOCIBLE (completada, o cerrada con
// evidencia documental de finalización real — completion_date del RPC de cierre).
const RECOGIBLE = `(o.status = 'completed' OR (o.status = 'closed' AND o.completion_date IS NOT NULL))`;

async function main() {
  assertNotProduction({ mode: 'read', projectRef: PROD_REF, context: 'm111-impact-global-extract.mjs' });

  const stores = await runSql(`SELECT id, name FROM public.stores ORDER BY name`);
  console.log(`Tiendas en producción: ${stores.length}`);

  // ── Órdenes por tienda/estado/moneda (todas las tiendas) ──
  const orders = await runSql(`
    SELECT s.name AS tienda, o.order_type, o.status, o.budget_currency,
           count(*)::int AS n,
           round(sum(o.budget_total),2) AS presupuesto,
           round(sum(o.paid_amount),2) AS pagado_cup,
           count(*) FILTER (WHERE o.completion_date IS NOT NULL)::int AS con_completion_date,
           count(*) FILTER (WHERE o.status='closed' AND o.completion_date IS NULL)::int AS closed_sin_evidencia,
           count(*) FILTER (WHERE o.reversed_at IS NOT NULL)::int AS reversadas
    FROM public.production_orders o JOIN public.stores s ON s.id = o.store_id
    GROUP BY s.name, o.order_type, o.status, o.budget_currency
    ORDER BY s.name, o.status;`);
  console.table ? null : null;
  console.log('=== Órdenes por tienda/estado/moneda ===');
  for (const r of orders) console.log(JSON.stringify(r));

  // ── Órdenes en moneda NO CUP (exposición P0-2: mezcla de unidades) ──
  const foreign = await runSql(`
    SELECT s.name AS tienda, o.order_number, o.order_type, o.status,
           o.budget_currency, o.budget_total, coalesce(o.budget_exchange_rate,1) AS tasa,
           o.paid_amount,
           round(greatest(o.budget_total * coalesce(o.budget_exchange_rate,1) - o.paid_amount, 0),2)
             AS cxc_correcta_cup,
           round(greatest(o.budget_total - o.paid_amount, 0),2) AS cxc_bug_cup
    FROM public.production_orders o JOIN public.stores s ON s.id = o.store_id
    WHERE coalesce(o.budget_currency,'CUP') <> 'CUP'
    ORDER BY s.name, o.order_number;`);
  console.log(`=== Órdenes en moneda extranjera: ${foreign.length} ===`);
  for (const r of foreign) console.log(JSON.stringify(r));

  // ── Por tienda: reconocibles según predicado corregido vs asientos de reconocimiento en el mayor ──
  const perStore = await runSql(`
    WITH ord AS (
      SELECT o.store_id, s.name AS tienda,
             count(*) FILTER (WHERE o.order_type IN ('service','work'))::int AS ordenes_sw_total,
             count(*) FILTER (WHERE o.order_type IN ('service','work') AND ${RECOGIBLE})::int AS reconocibles_predicado,
             count(*) FILTER (WHERE o.order_type IN ('service','work') AND o.status='completed')::int AS completed_puro,
             count(*) FILTER (WHERE o.order_type IN ('service','work') AND o.status='closed' AND o.completion_date IS NOT NULL)::int AS closed_con_evidencia,
             count(*) FILTER (WHERE o.order_type IN ('service','work') AND o.status='closed' AND o.completion_date IS NULL)::int AS closed_sin_evidencia,
             count(*) FILTER (WHERE o.order_type IN ('service','work') AND o.status='voided')::int AS voided,
             count(*) FILTER (WHERE o.order_type IN ('service','work') AND o.status='reversed')::int AS reversed
      FROM public.production_orders o JOIN public.stores s ON s.id=o.store_id
      GROUP BY o.store_id, s.name
    ),
    rec AS (
      SELECT e.store_id, count(DISTINCT e.document_id)::int AS reconocidas_mayor
      FROM public.fin_entries e
      WHERE e.document_type='ORDEN_TRABAJO' AND e.event='reconocimiento'
        AND e.generation_id IS NOT DISTINCT FROM public.fin_active_generation(e.store_id)
      GROUP BY e.store_id
    ),
    pag AS (
      SELECT e.store_id,
             round(sum(m.amount_cup) FILTER (WHERE m.category_code='PAS_ANTICIPOS_CLI' AND m.sense='credito'),2) AS pasivo_reconocido,
             round(sum(m.amount_cup) FILTER (WHERE m.category_code='PAS_ANTICIPOS_CLI' AND m.sense='debito'),2) AS pasivo_consumido,
             round(sum(m.amount_cup) FILTER (WHERE m.category_code='ING_SERVICIOS_PREST' AND m.sense='credito'),2) AS ingreso_reconocido,
             round(sum(m.amount_cup) FILTER (WHERE m.category_code='ACT_CXC' AND m.sense='debito'),2) AS cxc_mayor
      FROM public.fin_entries e JOIN public.fin_movements m ON m.entry_id=e.id
      WHERE e.document_type='ORDEN_TRABAJO'
        AND e.generation_id IS NOT DISTINCT FROM public.fin_active_generation(e.store_id)
      GROUP BY e.store_id
    ),
    op AS (
      SELECT o.store_id,
             -- CxC operacional correcta (presupuesto convertido ANTES de restar pagos)
             round(coalesce(sum(greatest(o.budget_total * CASE WHEN coalesce(o.budget_currency,'CUP')='CUP' OR coalesce(o.budget_exchange_rate,0)<=0 THEN 1 ELSE o.budget_exchange_rate END
                        - o.paid_amount, 0)) FILTER (WHERE ${RECOGIBLE}),0),2) AS cxc_op_correcta,
             -- CxC con el BUG (mezcla de unidades) para medir la diferencia
             round(coalesce(sum(greatest(o.budget_total - o.paid_amount,0) * CASE WHEN coalesce(o.budget_currency,'CUP')='CUP' OR coalesce(o.budget_exchange_rate,0)<=0 THEN 1 ELSE o.budget_exchange_rate END) FILTER (WHERE ${RECOGIBLE}),0),2) AS cxc_op_bug,
             -- Ingreso reconocible operacional (presupuesto convertido)
             round(coalesce(sum(o.budget_total * CASE WHEN coalesce(o.budget_currency,'CUP')='CUP' OR coalesce(o.budget_exchange_rate,0)<=0 THEN 1 ELSE o.budget_exchange_rate END) FILTER (WHERE ${RECOGIBLE}),0),2) AS ingreso_op,
             -- Anticipos de órdenes NO reconocibles (pasivo que debe permanecer)
             round(coalesce(sum(o.paid_amount) FILTER (WHERE o.order_type IN ('service','work') AND NOT ${RECOGIBLE}),0),2) AS anticipos_no_reconocibles
      FROM public.production_orders o
      WHERE o.order_type IN ('service','work')
      GROUP BY o.store_id
    )
    SELECT s.id, s.name AS tienda,
           public.fin_active_generation(s.id) AS gen_activa,
           coalesce(ord.ordenes_sw_total,0) AS ordenes_sw,
           coalesce(ord.completed_puro,0) AS completed,
           coalesce(ord.closed_con_evidencia,0) AS closed_con_evidencia,
           coalesce(ord.closed_sin_evidencia,0) AS closed_sin_evidencia,
           coalesce(ord.voided,0) AS voided,
           coalesce(ord.reversed,0) AS reversed,
           coalesce(rec.reconocidas_mayor,0) AS reconocidas_mayor,
           coalesce(op.ingreso_op,0) AS ingreso_op,
           coalesce(pag.ingreso_reconocido,0) AS ingreso_mayor,
           coalesce(op.cxc_op_correcta,0) AS cxc_op_correcta,
           coalesce(op.cxc_op_bug,0) AS cxc_op_bug,
           coalesce(pag.cxc_mayor,0) AS cxc_mayor,
           coalesce(op.anticipos_no_reconocibles,0) AS anticipos_no_reconocibles,
           coalesce(pag.pasivo_reconocido,0) AS pasivo_reconocido,
           coalesce(pag.pasivo_consumido,0) AS pasivo_consumido
    FROM public.stores s
    LEFT JOIN ord ON ord.store_id = s.id
    LEFT JOIN rec ON rec.store_id = s.id
    LEFT JOIN pag ON pag.store_id = s.id
    LEFT JOIN op ON op.store_id = s.id
    ORDER BY s.name;`);;

  console.log('=== Impacto por tienda (read-only) ===');
  const classified = [];
  for (const r of perStore) {
    const n = (v) => Number(v || 0);
    const faltanClosed = n(r.closed_con_evidencia) > 0 && n(r.reconocidas_mayor) < (n(r.completed_puro) + n(r.closed_con_evidencia));
    const difCxcMoneda = n(r.cxc_op_correcta) !== n(r.cxc_op_bug);
    const difMayorIngreso = Math.abs(n(r.ingreso_op) - n(r.ingreso_mayor)) > 0.01;
    const difMayorCxc = Math.abs(n(r.cxc_op_correcta) - n(r.cxc_mayor)) > 0.01;
    let clase;
    if (n(r.ordenes_sw) === 0) clase = '1-sin_ordenes_afectadas';
    else if (faltanClosed) clase = '3-ordenes_closed_faltantes_en_generaciones';
    else if (difMayorIngreso || difMayorCxc) clase = '5-generacion_necesitaria_reconstruccion';
    else if (difCxcMoneda) clase = '4-diferencias_cxc_por_moneda';
    else clase = '2-ordenes_correctamente_contabilizadas';
    classified.push({ ...r, clase });
    console.log(`${r.tienda}: clase=${clase} sw=${r.ordenes_sw} completed=${r.completed} closedEvid=${r.closed_con_evidencia} closedSinEvid=${r.closed_sin_evidencia} voided=${r.voided} rev=${r.reversed} recMayor=${r.reconocidas_mayor} ingOp=${r.ingreso_op} ingMayor=${r.ingreso_mayor} cxcOp=${r.cxc_op_correcta} cxcBug=${r.cxc_op_bug} cxcMayor=${r.cxc_mayor}`);
  }

  // Anticipos de órdenes NO reconocibles presentes en el pasivo (coherencia PAS_ANTICIPOS_CLI)
  const pasivoCheck = await runSql(`
    SELECT s.name AS tienda,
           round(coalesce(sum(pt.amount_cup),0),2) AS anticipos_pt_no_reconocibles
    FROM public.payment_transactions pt
    JOIN public.production_orders o ON o.id = pt.ref_id
    JOIN public.stores s ON s.id = pt.store_id
    WHERE pt.ref_type IN ('production_order','work') AND o.order_type IN ('service','work')
      AND coalesce(pt.direction,'in')='in'
      AND NOT (o.status = 'completed' OR (o.status='closed' AND o.completion_date IS NOT NULL))
    GROUP BY s.name ORDER BY s.name;`);
  console.log('=== Anticipos PT de órdenes NO reconocibles (pasivo esperado) ===');
  for (const r of pasivoCheck) console.log(JSON.stringify(r));

  writeFileSync(`${OUT}/m111-impact-global.json`, JSON.stringify(
    { taken_at: new Date().toISOString(), orders, foreign, perStore: classified, pasivoCheck }, null, 1));
  console.log('Extraído:', `${OUT}/m111-impact-global.json`);
}

main().catch(e => { console.error('FALLO:', e.message); process.exit(1); });

#!/usr/bin/env node
/**
 * M024 — CP-RECEIPT-INTEGRITY-001 (CIERRE): TRAZABILIDAD DE LOS 105 MOVIMIENTOS
 * HISTÓRICOS DE COMPRA VINCULADOS A FAC-VITALLCONS-001 (misión §8). READ-ONLY.
 *
 * Los movimientos de compra del caso tienen reference_id NULL y reference_doc
 * textual («Confirmacion recepcion» 101 + «Recepción de mercancía» 4) → la
 * conciliación por referencia es imposible; la auditoría los reconstruyó por
 * producto+fecha. Este análisis determina si cada movimiento puede asociarse
 * de forma ÚNICA y DEMOSTRABLE a su línea de recepción mediante:
 *   producto (product_id) + cantidad (quantity_change = quantity) +
 *   importe (unit_cost_mov = unit_cost_línea × tasa_línea) + fecha.
 *
 * Salida por movimiento: línea candidata(s), unicidad, veredicto.
 * Regla del propietario: si hay ambigüedad → conservar como está + excepción.
 * Uso: node scripts/m024-trazabilidad-105-movimientos.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
if (ref !== 'wthkddeleylijmonclxg') { console.error('FALLO DE GUARD: no es producción'); process.exit(2); }

async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`(HTTP ${res.status}) ${text.slice(0, 300)}`);
  return JSON.parse(text || '[]');
}

const FVC = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
const ENER = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

// ── 1. Líneas de FAC-VITALLCONS-001 (con costo CUP-equivalente por línea) ────
const lineas = await q(`SELECT ri.id::text, ri.product_id::text, ri.quantity::float8,
    ri.unit_cost::float8, ri.moneda_recepcion, ri.tasa_cambio_recepcion::float8,
    (ri.unit_cost * coalesce(NULLIF(ri.tasa_cambio_recepcion,0),1))::float8 AS unit_cost_cup_eq
  FROM public.receipt_items ri WHERE ri.receipt_id='${FVC}' ORDER BY ri.created_at, ri.id`);
console.log(`líneas FVC: ${lineas.length}`);

// ── 2. Movimientos candidatos (huella forense: ENERVIDA purchase en las fechas del caso) ──
const movs = await q(`SELECT sm.id::text, sm.product_id::text, sm.quantity_change::float8,
    sm.unit_cost::float8, sm.movement_date::text, sm.reference_doc, sm.reference_id::text,
    sm.created_at::text
  FROM public.stock_movements sm
  WHERE sm.store_id='${ENER}' AND sm.movement_type='purchase'
    AND sm.reference_id IS NULL
    AND (sm.movement_date::date IN ('2026-07-01','2026-08-10'))
  ORDER BY sm.movement_date, sm.id`);
console.log(`movimientos candidatos (reference_id NULL, fechas del caso): ${movs.length}`);

// ── 3. Contexto: otras recepciones de ENERVIDA cuyas líneas también podrían
//       explicar movimientos de 2026-08-10 (descartar falsos atributos a FVC)
const otras = await q(`SELECT rc.id::text, rc.document_number, rc.reference_doc, rc.reception_date::text, rc.created_at::text,
    (SELECT count(*)::int FROM public.receipt_items ri WHERE ri.receipt_id=rc.id) AS n_lineas
  FROM public.receipts rc
  WHERE rc.store_id='${ENER}' AND rc.id <> '${FVC}'
    AND (rc.reception_date::date IN ('2026-07-01','2026-08-10','2026-08-11')
         OR rc.created_at::date IN ('2026-08-10','2026-08-11'))
  ORDER BY rc.reception_date`);
console.log(`otras recepciones ENERVIDA del entorno de fechas: ${otras.length}`);
const otrasLineas = await q(`SELECT ri.receipt_id::text, ri.product_id::text, ri.quantity::float8,
    ri.unit_cost::float8, ri.tasa_cambio_recepcion::float8
  FROM public.receipt_items ri
  WHERE ri.receipt_id IN (SELECT rc.id FROM public.receipts rc
    WHERE rc.store_id='${ENER}' AND rc.id <> '${FVC}'
      AND (rc.reception_date::date IN ('2026-07-01','2026-08-10','2026-08-11')
           OR rc.created_at::date IN ('2026-08-10','2026-08-11')))`);
console.log(`líneas de esas otras recepciones: ${otrasLineas.length}`);

// ── 4. Emparejamiento ─────────────────────────────────────────────────────────
// Candidatos por movimiento: líneas (FVC + otras) que empatan
// product_id + |quantity − quantity_change| ≤ 1e-6 + |costo CUP − unit_cost| ≤ 0.005
const TOL_Q = 1e-6;
const TOL_C = 0.005;
const pareo = movs.map((m) => {
  const candidatasFvc = lineas.filter((l) =>
    l.product_id === m.product_id &&
    Math.abs(l.quantity - Math.abs(m.quantity_change)) <= TOL_Q &&
    Math.abs(l.unit_cost_cup_eq - m.unit_cost) <= TOL_C);
  const candidatasOtras = otrasLineas.filter((l) =>
    l.product_id === m.product_id &&
    Math.abs(l.quantity - Math.abs(m.quantity_change)) <= TOL_Q &&
    Math.abs(l.unit_cost * (l.tasa_cambio_recepcion || 1) - m.unit_cost) <= TOL_C);
  const enFvc = candidatasFvc.length > 0;
  const enOtras = candidatasOtras.length > 0;
  let veredicto;
  if (enFvc && enOtras) veredicto = 'AMBIGUO跨TIENDAS_FECHAS';
  else if (!enFvc && enOtras) veredicto = 'PERTENECE_A_OTRA_RECEPCION';
  else if (enFvc && candidatasFvc.length === 1) veredicto = 'UNIVOCO';
  else if (enFvc && candidatasFvc.length > 1) veredicto = 'AMBIGUO_DENTRO_FVC';
  else veredicto = 'SIN_CANDIDATO';
  return {
    mov_id: m.id, producto: m.product_id, cantidad: m.quantity_change, unit_cost: m.unit_cost,
    fecha: m.movement_date.slice(0, 10), reference_doc: m.reference_doc,
    lineas_fvc_candidatas: candidatasFvc.map((l) => l.id),
    lineas_otras_candidatas: candidatasOtras.map((l) => l.receipt_id),
    veredicto,
  };
});

const conteo = {};
for (const p of pareo) conteo[p.veredicto] = (conteo[p.veredicto] || 0) + 1;
console.log('\nveredictos:', JSON.stringify(conteo, null, 1));

// ¿Las líneas FVC quedan cubiertas 1:1 por los UNIVOCOS?
const univocos = pareo.filter((p) => p.veredicto === 'UNIVOCO');
const cobertura = new Map();
for (const p of univocos) cobertura.set(p.lineas_fvc_candidatas[0], (cobertura.get(p.lineas_fvc_candidatas[0]) || 0) + 1);
const lineasCubiertas1a1 = lineas.filter((l) => cobertura.get(l.id) === 1).length;
const lineasSinMov = lineas.filter((l) => !cobertura.has(l.id)).length;
const lineasDuplicadas = lineas.filter((l) => (cobertura.get(l.id) || 0) > 1).length;
console.log(`líneas FVC: ${lineas.length} | cubiertas 1:1 por movimiento unívoco: ${lineasCubiertas1a1} | sin movimiento: ${lineasSinMov} | con ≥2 movs: ${lineasDuplicadas}`);

// Detalle de excepciones
for (const p of pareo.filter((x) => x.veredicto.startsWith('AMBIGUO'))) {
  console.log(`  AMBIGUO: mov ${p.mov_id.slice(0, 8)} prod=${p.product_id.slice(0, 8)} cant=${p.cantidad} uc=${p.unit_cost} → FVC:${p.lineas_fvc_candidatas.length} otras:${p.lineas_otras_candidatas.length}`);
}
for (const p of pareo.filter((x) => x.veredicto === 'SIN_CANDIDATO')) {
  console.log(`  SIN_CANDIDATO: mov ${p.mov_id.slice(0, 8)} prod=${p.product_id.slice(0, 8)} cant=${p.cantidad} uc=${p.unit_cost} fecha=${p.fecha}`);
}

// ── Evidencia ─────────────────────────────────────────────────────────────────
const ev = {
  generado: new Date().toISOString(),
  fvc: FVC,
  lineas_fvc: lineas.length,
  movimientos_candidatos: movs.length,
  otras_recepciones_contexto: otras,
  veredictos: conteo,
  pareo,
  resumen_lineas: { cubiertas_1a1: lineasCubiertas1a1, sin_movimiento: lineasSinMov, con_multiples: lineasDuplicadas },
  conclusion: {
    trazabilidad_reparable: conteo.UNIVOCO === lineas.length && lineasSinMov === 0 && lineasDuplicadas === 0 && (conteo.AMBIGUO || 0) === 0,
    nota: 'Cada movimiento unívoco aporta la línea FVC exacta (producto+cantidad+costo CUP convertido). La corrección consistiría en backfill de reference_id SOLO para los UNIVOCOS con auditoría dual, idempotente (WHERE reference_id IS NULL) y reversible (restaurar NULL).',
  },
};
writeFileSync(resolve('docs/audits/receipt-integrity-20261114/m024-trazabilidad-105-movimientos.json'), JSON.stringify(ev, null, 2));
console.log('\nevidencia → docs/audits/receipt-integrity-20261114/m024-trazabilidad-105-movimientos.json');

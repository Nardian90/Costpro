#!/usr/bin/env node
/**
 * M025 — CP-RECEIPT-INTEGRITY-001 (CIERRE): CORRECCIÓN TRAZABLE DE LA
 * TRAZABILIDAD DE LOS MOVIMIENTOS HISTÓRICOS DE FAC-VITALLCONS-001 (misión §8).
 *
 * Autorización expresa (§10): «Correcciones de trazabilidad de los 105
 * movimientos solamente cuando la relación sea inequívoca y verificable».
 *
 * El análisis M024 demostró con datos: 101 movimientos de compra se asocian de
 * forma ÚNICA y 1:1 a las 101 líneas de la recepción (producto + cantidad +
 * costo CUP convertido empatan exactamente; 0 ambiguos, 0 líneas sin movimiento,
 * 0 líneas duplicadas). Los otros 9 candidatos de las fechas del caso pertenecen
 * a líneas de OTRAS 3 recepciones de ENERVIDA → FUERA de alcance (excepción
 * documentada; el conteo forense previo «105» incluía 4 de ellos por
 * atribución conservadora por fecha).
 *
 * Corrección (idempotente y reversible):
 *   UPDATE stock_movements SET reference_id = <FVC> WHERE id IN (101 ids)
 *     AND reference_id IS NULL      ← guard de idempotencia
 *   Solo se AÑADE reference_id: cantidades, fechas económicas, monedas y costos
 *   SE CONSERVAN (restricción expresa de la misión). Triggers de la tabla son
 *   INSERT-only → el UPDATE no dispara recalculos.
 *   Auditoría: 1 fila por movimiento en audit_logs (usuario, fecha, motivo,
 *   old_data/new_data) + registro del procedimiento reversible.
 *
 * Uso: ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND bun \
 *   scripts/m025-corrige-trazabilidad-movimientos.mjs [--solo-verificar]
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const soloVerificar = process.argv.includes('--solo-verificar');

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
assertNotProduction({ mode: 'write', url: env.NEXT_PUBLIC_SUPABASE_URL, context: 'm025-corrige-trazabilidad-movimientos.mjs' });
if (ref !== 'wthkddeleylijmonclxg') { console.error('FALLO DE GUARD: no es producción'); process.exit(2); }

const FVC = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
const ENER = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const ACTOR = 'a1111111-1111-1111-1111-111111111111';
const MOTIVO = 'CP-RECEIPT-INTEGRITY-001 (§8): backfill trazable de reference_id — asociación unívoca demostrada (producto+cantidad+costo CUP) M024; solo se añade la referencia, valores económicos intactos';

async function mgmt(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}
async function q(sql) {
  const r = await mgmt(sql);
  if (!r.ok) throw new Error(`(HTTP ${r.status}) ${r.text.slice(0, 400)}`);
  return JSON.parse(r.text || '[]');
}

// ── 1. Re-derivar el emparejamiento (determinista, igual que M024) ────────────
const lineas = await q(`SELECT ri.id::text, ri.product_id::text, ri.quantity::float8,
    (ri.unit_cost * coalesce(NULLIF(ri.tasa_cambio_recepcion,0),1))::float8 AS uc_cup
  FROM public.receipt_items ri WHERE ri.receipt_id='${FVC}' ORDER BY ri.created_at, ri.id`);
const movs = await q(`SELECT sm.id::text, sm.product_id::text, sm.quantity_change::float8,
    sm.unit_cost::float8, sm.movement_date::text, sm.reference_id::text
  FROM public.stock_movements sm
  WHERE sm.store_id='${ENER}' AND sm.movement_type='purchase' AND sm.reference_id IS NULL
    AND sm.movement_date::date IN ('2026-07-01','2026-08-10')
  ORDER BY sm.movement_date, sm.id`);

const otrasLineas = await q(`SELECT ri.receipt_id::text, ri.product_id::text, ri.quantity::float8,
    ri.unit_cost::float8, ri.tasa_cambio_recepcion::float8
  FROM public.receipt_items ri
  WHERE ri.receipt_id IN (SELECT rc.id FROM public.receipts rc
    WHERE rc.store_id='${ENER}' AND rc.id <> '${FVC}'
      AND (rc.reception_date::date IN ('2026-07-01','2026-08-10','2026-08-11')
           OR rc.created_at::date IN ('2026-08-10','2026-08-11')))`);

const pareo = [];
for (const m of movs) {
  const cand = lineas.filter((l) => l.product_id === m.product_id
    && Math.abs(l.quantity - Math.abs(m.quantity_change)) <= 1e-6
    && Math.abs(l.uc_cup - m.unit_cost) <= 0.005);
  const otras = otrasLineas.filter((l) => l.product_id === m.product_id
    && Math.abs(l.quantity - Math.abs(m.quantity_change)) <= 1e-6
    && Math.abs(l.unit_cost * (l.tasa_cambio_recepcion || 1) - m.unit_cost) <= 0.005);
  if (cand.length === 1 && otras.length === 0) pareo.push({ mov: m.id, linea: cand[0].id });
}
console.log(`pareo unívoco re-derivado: ${pareo.length} (esperado 101)`);
if (pareo.length !== 101) {
  console.error('ABORT: el pareo determinista no reproduce 101 pares — revisar M024.');
  process.exit(3);
}

// Estado previo (snapshot íntegro de los 101 para verificación de conservación)
const ids = pareo.map((p) => `'${p.mov}'`).join(',');
const antes = await q(`SELECT id::text, quantity_change::float8, unit_cost::float8,
    movement_date::text, reference_doc, reference_id::text, notes
  FROM public.stock_movements WHERE id IN (${ids}) ORDER BY id`);

// ── 2. Verificación de conservación (valores económicos NO cambian) ──────────
if (soloVerificar) {
  const conRef = antes.filter((x) => x.reference_id).length;
  const pendientes = antes.length - conRef;
  console.log(`--solo-verificar: ${pendientes}/101 movimientos aún sin reference_id (${conRef} ya corregidos).`);
  process.exit(0);
}

// ── 3. EJECUCIÓN: backfill idempotente por lote ──────────────────────────────
console.log('\n── EJECUCIÓN (backfill idempotente reference_id + auditoría) ──');
const upd = await mgmt(`UPDATE public.stock_movements
  SET reference_id='${FVC}'
  WHERE id IN (${ids}) AND reference_id IS NULL`);
if (!upd.ok) { console.error('FALLO UPDATE:', upd.text.slice(0, 300)); process.exit(5); }
const nUpd = JSON.parse(upd.text);
console.log(`  UPDATE → ${Array.isArray(nUpd) ? nUpd[0] && nUpd[0].count : upd.text.slice(0, 60)} filas`);

// Auditoría por movimiento (usuario, fecha, motivo, old/new)
let auditOk = 0;
for (const p of pareo) {
  const ins = await mgmt(`INSERT INTO public.audit_logs
    (user_id, table_name, record_id, action, old_data, new_data, metadata, store_id)
  VALUES ('${ACTOR}', 'stock_movements', '${p.mov}', 'TRACEABILITY_BACKFILL',
    '{"reference_id": null}'::jsonb,
    '{"reference_id": "${FVC}"}'::jsonb,
    '{"motivo": "${MOTIVO}", "linea_recepcion": "${p.linea}", "recepcion": "${FVC}", "mision": "CP-RECEIPT-INTEGRITY-001", "reversible": "UPDATE stock_movements SET reference_id=NULL WHERE id=\\''${p.mov}\\'' AND reference_id=\\''${FVC}\\''"}'::jsonb,
    '${ENER}')`);
  if (ins.ok) auditOk++;
}
console.log(`  auditoría: ${auditOk}/101 filas TRACEABILITY_BACKFILL en audit_logs`);

// ── 4. VERIFICACIÓN POST (fail-closed) ───────────────────────────────────────
console.log('\n── VERIFICACIÓN POST ──');
const despues = await q(`SELECT id::text, quantity_change::float8, unit_cost::float8,
    movement_date::text, reference_doc, reference_id::text, notes
  FROM public.stock_movements WHERE id IN (${ids}) ORDER BY id`);
const conRef = despues.filter((x) => x.reference_id === FVC).length;
console.log(`  movimientos con reference_id=FVC: ${conRef}/101`);

// Conservación exacta de valores económicos
let economicosIntactos = true;
const mapAntes = new Map(antes.map((x) => [x.id, x]));
for (const d of despues) {
  const a = mapAntes.get(d.id);
  if (a.quantity_change !== d.quantity_change || a.unit_cost !== d.unit_cost
    || a.movement_date !== d.movement_date || a.reference_doc !== d.reference_doc
    || (a.notes || null) !== (d.notes || null)) {
    economicosIntactos = false;
    console.log(`    CAMBIÓ algo más que reference_id en ${d.id}: `, { a, d });
  }
}
console.log(`  valores económicos conservados (cant/costo/fecha/ref_doc/notes): ${economicosIntactos ? 'SÍ' : 'NO — FALLO'}`);

// Idempotencia: re-ejecución del UPDATE → 0 filas
const upd2 = await mgmt(`UPDATE public.stock_movements SET reference_id='${FVC}'
  WHERE id IN (${ids}) AND reference_id IS NULL`);
const nUpd2 = upd2.ok ? JSON.parse(upd2.text) : null;
const idempotente = Array.isArray(nUpd2) && (!nUpd2[0] || (nUpd2[0].count ?? 0) === 0);
console.log(`  re-ejecución (idempotencia): ${idempotente ? '0 filas (OK)' : 'FALLO: ' + upd2.text.slice(0, 100)}`);

// Los 9 movimientos de OTRAS recepciones permanecen NULL (fuera de alcance)
const otros9 = await q(`SELECT count(*)::int AS n FROM public.stock_movements sm
  WHERE sm.store_id='${ENER}' AND sm.movement_type='purchase' AND sm.reference_id IS NULL
    AND sm.movement_date::date IN ('2026-07-01','2026-08-10')`);
console.log(`  movimientos de otras recepciones (fuera de alcance) intactos sin referencia: ${otros9[0].n} (esperado 9)`);

// FAC-VITALLCONS-001 intacto
const fvc = await q(`SELECT total_cost::float8 AS t, status FROM public.receipts WHERE id='${FVC}'`);
const fvcAsientos = await q(`SELECT count(*)::int AS n FROM public.fin_entries
  WHERE document_type='RECEPCION' AND document_id='${FVC}'`);
console.log(`  FAC-VITALLCONS-001: total=${fvc[0].t} status=${fvc[0].status} asientos=${fvcAsientos[0].n} (esperado 192039436/active/1)`);

const ok = conRef === 101 && economicosIntactos && idempotente && otros9[0].n === 9
  && fvc[0].t === 192039436 && fvc[0].status === 'active' && fvcAsientos[0].n === 1;
console.log(`\nRESULTADO: ${ok ? 'OK — trazabilidad corregida y verificada' : 'FALLO'}`);

const evidencia = {
  generado: new Date().toISOString(), motivo: MOTIVO, actor: ACTOR,
  pares_mov_linea: pareo.length, filas_audit: auditOk,
  verificaciones: { con_reference: conRef, economicos_intactos: economicosIntactos,
    idempotente, otros9_intactos: otros9[0].n, fvc_intacta: fvc[0].t === 192039436 },
  inversion_reversible: `UPDATE public.stock_movements SET reference_id=NULL WHERE id IN (${ids.slice(0, 200)}...) AND reference_id='${FVC}' — documentada en audit_logs.metadata.reversible por movimiento`,
  resultado_ok: ok,
};
writeFileSync(resolve('docs/audits/receipt-integrity-20261114/m025-corrige-trazabilidad.json'), JSON.stringify(evidencia, null, 2));
console.log('evidencia → docs/audits/receipt-integrity-20261114/m025-corrige-trazabilidad.json');
if (!ok) process.exit(9);

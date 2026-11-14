#!/usr/bin/env node
/**
 * M028 — CP-INVENTORY-TRACEABILITY-RECONCILIATION-001 FASE II:
 * CORRECCIÓN CONTROLADA DE TRAZABILIDAD DE LOS 208 MOVIMIENTOS (patrón M025).
 *
 * Autorización (misión §5/§11): actualizar EXCLUSIVAMENTE reference_id de los
 * movimientos de compra del conjunto de 208 con correspondencia única
 * demostrada (Fase I: 208/208 MATCH_UNICO — producto+cantidad+costo exacto
 * +fecha económica+fecha creación+tienda+1:1 global; 8 desambiguados por
 * fecha exacta).
 *
 * Condiciones obligatorias (misión §5) — todas implementadas:
 *  · preflight completo (re-derivación determinista del pareo en vivo)
 *  · JSON con valores anteriores y propuestos
 *  · copia de seguridad lógica de las filas afectadas (todas las columnas)
 *  · UPDATE atómico (sentencia única PostgreSQL) con controles de identidad
 *  · únicamente filas con reference_id IS NULL
 *  · registro por movimiento en audit_logs (id, recepción, línea, actor,
 *    fecha, motivo) con inserción idempotente
 *  · procedimiento reversible (m028-restore.sql + reversibles por fila)
 *  · segunda pasada → 0 cambios (demostrada)
 *
 * NO modifica: cantidades, fechas, unit_cost, monedas, tasas, WAC, notas,
 * existencias, asientos financieros (verificación byte a byte incluida).
 *
 * Uso: ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND \
 *      node scripts/m028-fase2-corrige-208.mjs [--solo-verificar]
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
assertNotProduction({ mode: 'write', url: env.NEXT_PUBLIC_SUPABASE_URL, context: 'm028-fase2-corrige-208.mjs' });
const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
if (ref !== 'wthkddeleylijmonclxg') { console.error('FALLO DE GUARD: no es producción'); process.exit(2); }

const FVC = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
const ACTOR = 'a1111111-1111-1111-1111-111111111111';
const MISION = 'CP-INVENTORY-TRACEABILITY-RECONCILIATION-001';
const MOTIVO = `${MISION} (Fase II §5): backfill trazable de reference_id — correspondencia única demostrada en Fase I (producto+cantidad+costo CUP exacto+fecha económica+fecha creación+tienda+1:1 global; 8 casos desambiguados por fecha exacta); solo se añade la referencia, valores económicos intactos`;

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

const TOL_Q = 1e-6;
const TOL_C = 0.005;

// ═══ 1. PREFLIGHT: re-derivación determinista en vivo (no confiar en M027) ═══
console.log('════ M028 FASE II — CORRECCIÓN CONTROLADA DE TRAZABILIDAD (208) ════\n── 1. PREFLIGHT (re-derivación determinista) ──');
const receipts = await q(`SELECT r.id::text, r.store_id::text, r.status, r.reception_date::text, r.created_at::text
  FROM public.receipts r`);
const lineasNoFvc = await q(`SELECT ri.id::text, ri.receipt_id::text, ri.product_id::text,
    ri.quantity::float8, (ri.unit_cost * coalesce(NULLIF(ri.tasa_cambio_recepcion,0),1))::float8 AS uc_cup
  FROM public.receipt_items ri WHERE ri.receipt_id <> '${FVC}'`);
const movs = await q(`SELECT sm.id::text, sm.store_id::text, sm.product_id::text,
    sm.quantity_change::float8, sm.unit_cost::float8, sm.movement_date::text, sm.created_at::text
  FROM public.stock_movements sm
  WHERE sm.movement_type='purchase' AND sm.reference_id IS NULL
  ORDER BY sm.store_id, sm.movement_date, sm.id`);
console.log(`  movimientos purchase sin referencia AHORA: ${movs.length} (esperado 208)`);
if (movs.length !== 208) { console.error('ABORT: el estado cambió — re-evaluar Fase I antes de continuar.'); process.exit(3); }

const recById = new Map(receipts.map(r => [r.id, r]));
// Pareo determinista (idéntico a Fase I / M027, incluida desambiguación temporal)
const pareo = [];
for (const m of movs) {
  let cand = lineasNoFvc.filter(l => {
    const rec = recById.get(l.receipt_id);
    return rec && rec.store_id === m.store_id && l.product_id === m.product_id
      && Math.abs(Math.abs(l.quantity) - Math.abs(m.quantity_change)) <= TOL_Q
      && Math.abs(l.uc_cup - m.unit_cost) <= TOL_C;
  });
  if (cand.length > 1) {
    const porFecha = cand.filter(l => {
      const rec = recById.get(l.receipt_id);
      return m.movement_date.slice(0, 10) === rec.reception_date.slice(0, 10)
        && m.created_at.slice(0, 10) === rec.created_at.slice(0, 10);
    });
    if (porFecha.length === 1) cand = porFecha;
  }
  if (cand.length === 1) pareo.push({ mov: m, linea: cand[0] });
}
console.log(`  pareo unívoco re-derivado: ${pareo.length} (esperado 208)`);

// Cobertura 1:1 global (cada línea reclamada exactamente 1 vez)
const claims = new Map();
for (const p of pareo) claims.set(p.linea.id, (claims.get(p.linea.id) || 0) + 1);
const duplicadas = [...claims.entries()].filter(([, n]) => n > 1).length;
const lineasCubiertas = claims.size;
console.log(`  cobertura 1:1: líneas cubiertas=${lineasCubiertas}/208, reclamadas >1 vez=${duplicadas}`);
if (pareo.length !== 208 || duplicadas !== 0 || lineasCubiertas !== 208) {
  console.error('ABORT: pareo no reproduce 208 pares 1:1 — NO ejecutar (misión §5).');
  process.exit(4);
}

// FVC intacta antes de tocar nada
const fvcPre = await q(`SELECT total_cost::float8 AS t, status FROM public.receipts WHERE id='${FVC}'`);
const fvcRefsPre = await q(`SELECT count(*)::int AS n FROM public.stock_movements WHERE reference_id='${FVC}'`);
const countsPre = await q(`SELECT (SELECT count(*) FROM public.stock_movements)::int AS sm,
  (SELECT count(*) FROM public.fin_entries)::int AS fe, (SELECT count(*) FROM public.fin_movements)::int AS fm,
  (SELECT count(*) FROM public.fin_posting_errors)::int AS fpe`);
console.log(`  FVC pre: total=${fvcPre[0].t} status=${fvcPre[0].status} refs=${fvcRefsPre[0].n} | conteos pre: ${JSON.stringify(countsPre[0])}`);
if (fvcPre[0].t !== 192039436 || fvcPre[0].status !== 'active' || fvcRefsPre[0].n !== 101) {
  console.error('ABORT: FVC no está intacta — revisar antes de cualquier escritura.'); process.exit(5);
}

// ═══ 2. COPIA DE SEGURIDAD LÓGICA + JSON valores anteriores/propuestos ═════
console.log('\n── 2. BACKUP LÓGICO + JSON anterior/propuesto ──');
const ids = pareo.map(p => `'${p.mov.id}'`).join(',');
const backup = await q(`SELECT id::text, store_id::text, product_id::text, variant_id::text,
    quantity_change::float8, movement_type, reference_id, reference_doc, movement_date::text,
    created_by::text, created_at::text, unit_cost::float8, unit_price::float8,
    cost_value_change::float8, balance_after::float8, notes, tenant_id::text,
    unit_cost_derived::float8, unit_cost_derived_source, unit_cost_derived_evidence_id::text,
    unit_cost_derived_at::text, cogs_derivation_status
  FROM public.stock_movements WHERE id IN (${ids}) ORDER BY id`);
console.log(`  filas respaldadas (todas las columnas): ${backup.length}`);
if (backup.length !== 208) { console.error('ABORT: backup incompleto.'); process.exit(6); }
const backupPath = resolve('docs/audits/inventory-traceability-20261115/m028-backup-logico-208-filas.json');
writeFileSync(backupPath, JSON.stringify({ generado: new Date().toISOString(), mision: MISION, filas: backup }, null, 2));

const propuestas = pareo.map(p => ({
  movimiento: p.mov.id, tienda: p.mov.store_id, producto: p.mov.product_id,
  cantidad: p.mov.quantity_change, unit_cost: p.mov.unit_cost,
  reference_id_anterior: null, reference_id_propuesto: p.linea.receipt_id,
  linea_recepcion: p.linea.id,
}));

// Script de reversión (procedimiento reversible)
const restoreSql = `-- M028 ${MISION} FASE II — REVERSIÓN de la reparación de trazabilidad de los 208
-- Ejecutar SOLO si el propietario decide revertir. Idempotente: si ya está NULL no hace nada.
-- Generado: ${new Date().toISOString()}
BEGIN;\n`
  + pareo.map(p => `UPDATE public.stock_movements SET reference_id = NULL WHERE id = '${p.mov.id}' AND reference_id = '${p.linea.receipt_id}';`).join('\n')
  + `\nCOMMIT;\n`;
writeFileSync(resolve('docs/audits/inventory-traceability-20261115/m028-restore.sql'), restoreSql);
console.log('  backup → m028-backup-logico-208-filas.json | reversión → m028-restore.sql');

if (soloVerificar) {
  const pendientes = backup.filter(b => !b.reference_id).length;
  console.log(`\n--solo-verificar: ${pendientes}/208 aún sin reference_id (${208 - pendientes} ya corregidos).`);
  process.exit(0);
}

// ═══ 3. EJECUCIÓN: UPDATE atómico con controles de identidad por fila ═══════
console.log('\n── 3. EJECUCIÓN: UPDATE atómico (reference_id solo en filas NULL) ──');
const values = pareo.map(p => `('${p.mov.id}','${p.linea.receipt_id}','${p.mov.product_id}',${p.mov.quantity_change},${p.mov.unit_cost})`).join(',');
const upd = await mgmt(`UPDATE public.stock_movements sm
  SET reference_id = v.rec
  FROM (VALUES ${values}) AS v(mov, rec, prod, qty, uc)
  WHERE sm.id = v.mov::uuid
    AND sm.reference_id IS NULL
    AND sm.product_id = v.prod::uuid
    AND abs(sm.quantity_change - v.qty) <= 1e-6
    AND abs(sm.unit_cost - v.uc) <= 0.005`);
if (!upd.ok) { console.error('FALLO UPDATE:', upd.text.slice(0, 400)); process.exit(7); }
console.log(`  UPDATE → ${upd.text.trim()} (estado HTTP ${upd.status})`);

// ═══ 4. AUDITORÍA por movimiento (idempotente) ═══════════════════════════════
console.log('\n── 4. AUDITORÍA (audit_logs, 1 fila por movimiento) ──');
let auditOk = 0, auditYa = 0;
for (const p of pareo) {
  const ins = await mgmt(`INSERT INTO public.audit_logs
    (user_id, table_name, record_id, action, old_data, new_data, metadata, store_id)
  SELECT '${ACTOR}', 'stock_movements', '${p.mov.id}', 'TRACEABILITY_BACKFILL',
    jsonb_build_object('reference_id', NULL),
    jsonb_build_object('reference_id', '${p.linea.receipt_id}'),
    jsonb_build_object(
      'motivo', '${MOTIVO.replace(/'/g, "''")}',
      'linea_recepcion', '${p.linea.id}',
      'recepcion', '${p.linea.receipt_id}',
      'mision', '${MISION}',
      'fase', 'II',
      'evidencias', jsonb_build_array('producto','cantidad','costo_cup_exacto','fecha_economica','fecha_creacion','tienda','correspondencia_1a1'),
      'reversible', 'UPDATE stock_movements SET reference_id=NULL WHERE id=${p.mov.id} AND reference_id=${p.linea.receipt_id} — ver m028-restore.sql'),
    '${p.mov.store_id}'
  WHERE NOT EXISTS (SELECT 1 FROM public.audit_logs a
    WHERE a.table_name='stock_movements' AND a.record_id='${p.mov.id}' AND a.action='TRACEABILITY_BACKFILL')`);
  if (ins.ok) auditOk++; else {
    const ya = /duplicate|unique/i.test(ins.text);
    if (ya) auditYa++; else console.error('  FALLO AUDIT', p.mov.id.slice(0, 8), ins.text.slice(0, 120));
  }
}
console.log(`  auditoría insertada: ${auditOk}/208 (ya existentes: ${auditYa})`);

// ═══ 5. VERIFICACIÓN POST (fail-closed) ══════════════════════════════════════
console.log('\n── 5. VERIFICACIÓN POST ──');
const despues = await q(`SELECT id::text, store_id::text, product_id::text, variant_id::text,
    quantity_change::float8, movement_type, reference_id, reference_doc, movement_date::text,
    created_by::text, created_at::text, unit_cost::float8, unit_price::float8,
    cost_value_change::float8, balance_after::float8, notes, tenant_id::text,
    unit_cost_derived::float8, unit_cost_derived_source, unit_cost_derived_evidence_id::text,
    unit_cost_derived_at::text, cogs_derivation_status
  FROM public.stock_movements WHERE id IN (${ids}) ORDER BY id`);
const mapAntes = new Map(backup.map(b => [b.id, b]));
const mapPareo = new Map(pareo.map(p => [p.mov.id, p.linea.receipt_id]));
let refsCorrectos = 0, economicosIntactos = true;
const colsEco = ['store_id','product_id','variant_id','quantity_change','movement_type','reference_doc','movement_date','created_by','created_at','unit_cost','unit_price','cost_value_change','balance_after','notes','tenant_id','unit_cost_derived','unit_cost_derived_source','unit_cost_derived_evidence_id','unit_cost_derived_at','cogs_derivation_status'];
for (const d of despues) {
  if (d.reference_id === mapPareo.get(d.id)) refsCorrectos++;
  const a = mapAntes.get(d.id);
  for (const c of colsEco) {
    const va = a[c] === null ? null : (typeof a[c] === 'number' ? +a[c] : a[c]);
    const vd = d[c] === null ? null : (typeof d[c] === 'number' ? +d[c] : d[c]);
    if (va !== vd) { economicosIntactos = false; console.log(`    CAMBIÓ ${c} en ${d.id}: ${JSON.stringify(va)} → ${JSON.stringify(vd)}`); }
  }
}
console.log(`  reference_id correcto (por fila, vs pareo): ${refsCorrectos}/208`);
console.log(`  valores económicos conservados (20 columnas byte a byte): ${economicosIntactos ? 'SÍ' : 'NO — FALLO'}`);

// Idempotencia: re-ejecución del UPDATE → 0 filas afectadas
// Idempotencia: la Management API no reporta rowcount de UPDATE → se demuestra
// con SELECT del MISMO predicado (filas que una segunda pasada tocaría) y en
// m028b con la re-ejecución íntegra del proceso.
const pend = await q(`SELECT count(*)::int AS n FROM public.stock_movements sm
  JOIN (VALUES ${values}) AS v(mov, rec, prod, qty, uc) ON sm.id = v.mov::uuid
  WHERE sm.reference_id IS NULL AND sm.product_id = v.prod::uuid
    AND abs(sm.quantity_change - v.qty) <= 1e-6 AND abs(sm.unit_cost - v.uc) <= 0.005`);
const idempotente = pend[0].n === 0;
console.log(`  re-ejecución UPDATE (idempotencia, SELECT mismo predicado): ${pend[0].n} filas tocaría → ${idempotente ? '0 filas (OK)' : 'FALLO'}`);

// Estado global posterior
const sinRefDespues = await q(`SELECT count(*)::int AS n FROM public.stock_movements
  WHERE movement_type='purchase' AND reference_id IS NULL`);
const countsPost = await q(`SELECT (SELECT count(*) FROM public.stock_movements)::int AS sm,
  (SELECT count(*) FROM public.fin_entries)::int AS fe, (SELECT count(*) FROM public.fin_movements)::int AS fm,
  (SELECT count(*) FROM public.fin_posting_errors)::int AS fpe`);
const fvcRefsPost = await q(`SELECT count(*)::int AS n FROM public.stock_movements WHERE reference_id='${FVC}'`);
const fvcPost = await q(`SELECT total_cost::float8 AS t, status FROM public.receipts WHERE id='${FVC}'`);
const auditTotal = await q(`SELECT count(*)::int AS n FROM public.audit_logs WHERE action='TRACEABILITY_BACKFILL'`);
console.log(`  purchase sin referencia: ${sinRefDespues[0].n} (esperado 0) | refs FVC: ${fvcRefsPost[0].n} (101)`);
console.log(`  conteos post: ${JSON.stringify(countsPost[0])} (pre: ${JSON.stringify(countsPre[0])})`);
console.log(`  FVC post: total=${fvcPost[0].t} status=${fvcPost[0].status}`);
console.log(`  filas TRACEABILITY_BACKFILL totales: ${auditTotal[0].n} (101 de M025 + 208 de M028 = 309 esperado)`);

const ok = refsCorrectos === 208 && economicosIntactos && idempotente && sinRefDespues[0].n === 0
  && countsPost[0].sm === countsPre[0].sm && countsPost[0].fe === countsPre[0].fe
  && countsPost[0].fm === countsPre[0].fm && countsPost[0].fpe === 0
  && fvcRefsPost[0].n === 101 && fvcPost[0].t === 192039436 && fvcPost[0].status === 'active'
  && auditTotal[0].n === 309;
console.log(`\nRESULTADO M028: ${ok ? 'OK — trazabilidad de los 208 corregida y verificada' : 'FALLO'}`);

// ═══ 6. Evidencia ════════════════════════════════════════════════════════════
const evidencia = {
  generado: new Date().toISOString(), mision: MISION, fase: 'II — corrección controlada',
  actor: ACTOR, motivo: MOTIVO,
  preflight: { movimientos_sin_ref: movs.length, pareo_univoco: pareo.length,
    cobertura_1a1: { lineas_cubiertas: lineasCubiertas, reclamadas_multiples: duplicadas },
    fvc_pre: { total: fvcPre[0].t, status: fvcPre[0].status, refs: fvcRefsPre[0].n },
    conteos_pre: countsPre[0] },
  ejecucion: { tipo: 'UPDATE atómico de sentencia única con identidad por fila (id+NULL+producto+cantidad+costo)',
    filas: pareo.length },
  auditoria: { insertadas: auditOk, ya_existentes: auditYa, action: 'TRACEABILITY_BACKFILL' },
  verificacion_post: { reference_correcto_por_fila: refsCorrectos,
    valores_economicos_conservados: economicosIntactos, idempotencia_segunda_pasada: idempotente,
    purchase_sin_ref_post: sinRefDespues[0].n, conteos_post: countsPost[0],
    fvc_post: { total: fvcPost[0].t, status: fvcPost[0].status, refs: fvcRefsPost[0].n },
    audit_traceability_total: auditTotal[0].n },
  backup_logico: 'm028-backup-logico-208-filas.json (23 columnas × 208 filas, estado previo)',
  reversibilidad: 'm028-restore.sql (BEGIN/COMMIT, por fila idempotente) + audit_logs.metadata.reversible por movimiento',
  propuestas,
  resultado_ok: ok,
};
writeFileSync(resolve('docs/audits/inventory-traceability-20261115/m028-fase2-corrige-208.json'), JSON.stringify(evidencia, null, 2));
console.log('evidencia → m028-fase2-corrige-208.json');
if (!ok) process.exit(9);

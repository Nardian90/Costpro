#!/usr/bin/env node
// ============================================================================
// M052 — CP-FIN-FINAL-CLOSE-005 · §5 MISIÓN: PRUEBAS DE REGRESIÓN DE LA
// SALVAGUARDA T12 (reversión parcial vs anulación automática).
// ============================================================================
// Objetivo: demostrar sobre la BD E2E AISLADA (motor REAL + migración
// 20261115100000_cp_fin_t12_partial_reversal_guard.sql aplicada) que:
//
//   P2  ANULACIÓN ORDINARIA INTACTA: una recepción sin reversión se anula
//       normalmente (asiento compensatorio completo, original 'reversed').
//   P3  REVERSIÓN PARCIAL (patrón RECT-1) sobre otra recepción activa.
//   P4  BLOQUEO DE NEGOCIO (trigger BEFORE receipts): UPDATE status→voided
//       con residual pendiente → ERR_PARTIAL_REVERSAL_PENDING; la recepción
//       QUEDA 'active'; sin asiento de anulación.
//   P5  BLOQUEO DE MOTOR + AUDITORÍA: fin_post_annulment_safe devuelve 0 y
//       registra el intento en fin_posting_errors (código
//       ERR_PARTIAL_REVERSAL_PENDING); sin compensatorio; residual intacto.
//   P6  REVERSIÓN COMPLETA ORDINARIA INTACTA: con una reversión completa
//       enlazada, la anulación se respeta como «ya revertido» (skip, sin
//       error, sin segunda compensación).
//   P7  REGULARIZACIÓN EXPLÍCITA: completar el residual (segunda reversión
//       parcial documentada) → residual 0 → la anulación vuelve a funcionar
//       por el cauce ordinario (trigger pasa; motor respeta cobertura total).
//   P8  NET DELTA 0: cero residuos en las tablas tocadas.
//
// REGLA: producción INTACTA; toda escritura ocurre en
// lguovmvrozxgssupkwpf (E2E aislada). Guard de aislamiento: réplica del
// contrato e2e/fixtures/assert-isolated-db.ts — sentinela
// e2e_is_isolated_db() verificada por REST y SQL, fail-closed — más guard
// canónico CP-INFRA-020 (assert-not-production).
// Uso: node scripts/m052-t12-guard-regression.mjs
// ============================================================================
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import pg from 'pg';
import { assertNotProduction } from './lib/assert-not-production.mjs';

// Guard CP-INFRA-020: este script escribe SOLO en la BD E2E aislada.
const BASE = 'https://lguovmvrozxgssupkwpf.supabase.co';
assertNotProduction({ mode: 'write', url: BASE, context: 'm052-t12-guard-regression' });

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !m[1].startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const KEY = env.E2E_SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) throw new Error('FALTA E2E_SUPABASE_SERVICE_ROLE_KEY');
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const POOLER = { host: 'aws-0-us-east-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.lguovmvrozxgssupkwpf', password: decodeURIComponent(env.E2E_SUPABASE_DB_URL.match(/:\/\/[^:]+:([^@]+)@/)[1]),
  ssl: { rejectUnauthorized: false } };

// IDs deterministas (segmento 0005 para no colisionar con runs previos)
const S = '7ec70005-0000-4000-8000-000000000002';
const P = '7ec70005-0000-4000-8000-000000000101';
const RA = '7ec70005-0000-4000-8000-000000000a01';
const RB = '7ec70005-0000-4000-8000-000000000b02';
const RC = '7ec70005-0000-4000-8000-000000000c03';
const PARCIAL_RB = '7ec70005-0000-4000-8000-000000000b12';
const COMPLETA_RC = '7ec70005-0000-4000-8000-000000000c13';
const REGULARIZA_RB = '7ec70005-0000-4000-8000-000000000b23';

const OUT = '/home/z/my-project/scripts/out/t12-guard-regression.json';
const EV = { mision: 'CP-FIN-FINAL-CLOSE-005', script: 'm052-t12-guard-regression.mjs',
  fecha: new Date().toISOString(), base: BASE, pasos: {}, preguntas: {} };
const log = (...a) => console.log(...a);
const sha256 = (o) => createHash('sha256').update(JSON.stringify(o)).digest('hex');

const db = new pg.Client(POOLER);
const sql = (text, params) => db.query(text, params);

async function paso(nombre, fn) {
  try {
    const r = await fn();
    EV.pasos[nombre] = { estado: 'PASS', ...(r || {}) };
    log(`✓ ${nombre}${r && r.resumen ? ' — ' + r.resumen : ''}`);
  } catch (e) {
    EV.pasos[nombre] = { estado: 'FAIL', error: String(e.message).slice(0, 500) };
    log(`✗ ${nombre}: ${e.message}`);
    throw e;
  }
}
async function entriesDe(doc) {
  const r = await sql(`SELECT id, event, status, reversal_of::text, posted_at FROM fin_entries
    WHERE document_id=$1 ORDER BY posted_at, id`, [doc]);
  return r.rows;
}
async function movsDe(entryId) {
  const r = await sql(`SELECT category_code, sense, amount::float8 FROM fin_movements WHERE entry_id=$1 ORDER BY id`, [entryId]);
  return r.rows;
}
// patrón RECT-1 (m050d): ajuste_manual enlazado con reversal_of, D=C.
// manualSinDoc=true: asiento MANUAL (document_id NULL, enlazado solo por reversal_of)
// — necesario para regularizaciones sucesivas: uq_fin_entries_doc_event solo
// admite UN ajuste_manual por (doctype, document_id, event) con igual payment_ref.
async function insertarReversión(entryId, docId, monto, uuidReversión, descr, manualSinDoc = false) {
  await sql(`INSERT INTO fin_entries (id, store_id, document_type, document_id, document_number,
      event, reversal_of, economic_date, posted_at, status, description)
    VALUES ($1,$2,'RECEPCION',$3,'FAC-TEST-T12','ajuste_manual',$4,'2026-07-02',now(),'posted',$5)
    ON CONFLICT (id) DO NOTHING`,
    [uuidReversión, S, manualSinDoc ? null : docId, entryId, descr]);
  await sql(`INSERT INTO fin_movements (id, entry_id, store_id, category_code, sense, amount,
      currency, exchange_rate, economic_date, description)
    VALUES (gen_random_uuid(),$1,$2,'PAS_CXP_PROV','debito',$3,'CUP',1,'2026-07-02',$4),
           (gen_random_uuid(),$1,$2,'ACT_INVENTARIO','credito',$3,'CUP',1,'2026-07-02',$4)`,
    [uuidReversión, S, monto, descr]);
}
// Ejecuta fn esperando que lance ERR_PARTIAL_REVERSAL_PENDING (transacción deshecha)
async function esperaBloqueoT12(fn, etiqueta) {
  let msg = '';
  try {
    await sql('BEGIN');
    await fn();
    msg = '(sin excepción)';
  } catch (e) {
    msg = String(e.message);
    if (!/ERR_PARTIAL_REVERSAL_PENDING/.test(msg)) {
      await sql('ROLLBACK').catch(() => {});
      throw new Error(`${etiqueta}: excepción inesperada: ${msg.slice(0, 300)}`);
    }
  } finally { await sql('ROLLBACK').catch(() => {}); }
  if (msg === '(sin excepción)') throw new Error(`${etiqueta}: el motor NO bloqueó la operación (trampa T12 sigue viva)`);
  return msg;
}

// ═══ 0. PREFLIGHT ════════════════════════════════════════════════════════════
await paso('P0_preflight', async () => {
  const r = await fetch(`${BASE}/rest/v1/rpc/e2e_is_isolated_db`, { method: 'POST', headers: H, body: '{}' });
  if ((await r.text()).trim() !== 'true') throw new Error('SENTINELA REST != true');
  await db.connect();
  const iso = await sql('select e2e_is_isolated_db() as iso');
  if (iso.rows[0].iso !== true) throw new Error('sentinela SQL != true');
  // limpieza previa (re-ejecutable) — hard-delete gobernado como m050d
  await sql('BEGIN');
  try {
    await sql("SET LOCAL session_replication_role = 'replica'");
    for (const t of ['fin_movements', 'fin_entries']) await sql(`DELETE FROM ${t} WHERE store_id=$1`, [S]);
    await sql('DELETE FROM fin_posting_errors WHERE store_id=$1 OR document_id IN ($2,$3,$4)', [S, RA, RB, RC]);
    await sql('DELETE FROM audit_logs WHERE store_id=$1 OR record_id::text IN ($2,$3,$4)', [S, RA, RB, RC]);
    for (const t of ['receipt_items', 'receipts']) await sql(`DELETE FROM ${t} WHERE ${t === 'receipts' ? 'store_id' : 'receipt_id'} = ANY($1)`, [t === 'receipts' ? [S] : [RA, RB, RC]]);
    await sql('DELETE FROM products WHERE store_id=$1', [S]);
    await sql('DELETE FROM stores WHERE id=$1', [S]);
    await sql('COMMIT');
  } catch (e) { await sql('ROLLBACK'); throw e; }
  const baseline = {};
  for (const t of ['fin_entries', 'fin_movements', 'receipts', 'receipt_items', 'products', 'stores', 'audit_logs', 'fin_posting_errors']) {
    baseline[t] = (await sql(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
  }
  EV.baseline_conteos = baseline;
  return { resumen: 'sentinela=true (REST+SQL); residuos previos eliminados; baseline capturada' };
});

// ═══ 1. SEMILLAS ════════════════════════════════════════════════════════════
await paso('P1_seed', async () => {
  await sql(`INSERT INTO stores (id, name, slug, is_active, created_at, backup_restore_protected)
    VALUES ($1,'T12-GUARD','t12-guard',true,'2026-11-15T00:00:00Z',false)`, [S]);
  await sql(`INSERT INTO products (id, store_id, sku, name, price, cost_price, cost_average,
    stock_current, min_stock, unit_of_measure, category, supplier, price_currency, is_active,
    visible_en_tienda, operational_class, created_at, updated_at)
    VALUES ($1,$2,'T998','Producto test T12',100,10,10,0,1,'unidad','Test','ProvTest','CUP',true,true,'venta','2026-11-15T00:00:00Z','2026-11-15T00:00:00Z')`, [P, S]);
  for (const [rid, total, ref] of [[RA, 1000, 'FAC-T12-A'], [RB, 5000, 'FAC-T12-B'], [RC, 2000, 'FAC-T12-C']]) {
    await sql(`INSERT INTO receipts (id, store_id, status, total_cost, reference_doc, supplier,
      reception_date, payment_status, paid_amount, created_at, notes)
      VALUES ($1,$2,'active',$3,$4,'ProvTest','2026-07-02','unpaid',0,'2026-11-15T00:00:00Z','T12 guard test')`, [rid, S, total, ref]);
  }
  const IA = '7ec70005-0000-4000-8000-000000000a1f';
  const IB = '7ec70005-0000-4000-8000-000000000b1f';
  const IC = '7ec70005-0000-4000-8000-000000000c1f';
  await sql(`INSERT INTO receipt_items (id, receipt_id, product_id, quantity, unit_cost,
    moneda_recepcion, tasa_cambio_recepcion, created_at, updated_at) VALUES
    ($1,$2,$3,100,10,'CUP',1,now(),now()), ($4,$5,$6,100,50,'CUP',1,now(),now()), ($7,$8,$9,100,20,'CUP',1,now(),now())`,
    [IA, RA, P, IB, RB, P, IC, RC, P]);
  const ids = {};
  for (const rid of [RA, RB, RC]) {
    const e = await sql(`SELECT public.fin_post_document('RECEPCION',$1,'reconocimiento') AS id`, [rid]);
    ids[rid === RA ? 'A' : rid === RB ? 'B' : 'C'] = e.rows[0].id;
  }
  EV.asientos = ids;
  return { resumen: `3 recepciones contabilizadas por el MOTOR real (A/B/C)` };
});

// ═══ P2: ANULACIÓN ORDINARIA INTACTA ═════════════════════════════════════════
await paso('P2_anulacion_ordinaria_intacta', async () => {
  await sql(`UPDATE receipts SET status='voided' WHERE id=$1`, [RA]);
  const es = await entriesDe(RA);
  const orig = es.find((e) => e.event === 'reconocimiento');
  const anul = es.find((e) => e.event === 'anulacion');
  if (!anul) throw new Error('no se creó el asiento de anulación ordinaria');
  if (anul.reversal_of !== orig.id) throw new Error('reversal_of no apunta al original');
  if (orig.status !== 'reversed') throw new Error(`original quedó ${orig.status}, esperado reversed`);
  const mO = await movsDe(orig.id), mA = await movsDe(anul.id);
  const dO = mO.reduce((a, m) => a + (m.sense === 'debito' ? m.amount : 0), 0);
  const dA = mA.reduce((a, m) => a + (m.sense === 'debito' ? m.amount : 0), 0);
  if (dO !== dA) throw new Error(`importes difieren: orig=${dO} anul=${dA}`);
  EV.preguntas.P2 = { pregunta: '¿la anulación ordinaria (sin reversión previa) sigue intacta?',
    evidencia: `A: asiento anulacion ${anul.id.slice(0, 8)} enlazado, sentidos invertidos, débitos ${dA}=${dO}, original 'reversed'`, resultado: 'SÍ — sin regresión' };
  return { resumen: `A: compensatorio completo ${dA} CUP; original reversed` };
});

// ═══ P3: REVERSIÓN PARCIAL (PATRÓN RECT-1) sobre B ═══════════════════════════
await paso('P3_reversión_parcial_RECT1', async () => {
  await insertarReversión(EV.asientos.B, RB, 3000, PARCIAL_RB, 'T12 parcial 3000 de 5000 (patrón RECT-1)');
  const resid = await sql(`SELECT public.fin_entry_reversal_residual($1) AS r`, [EV.asientos.B]);
  if (Math.abs(resid.rows[0].r - 2000) > 0.01) throw new Error(`residual=${resid.rows[0].r}, esperado 2000`);
  EV.residual_B = resid.rows[0].r;
  return { resumen: `B: parcial 3000 enlazado → residual ${resid.rows[0].r} CUP` };
});

// ═══ P4: BLOQUEO DE NEGOCIO (trigger BEFORE) ═════════════════════════════════
await paso('P4_bloqueo_negocio_trigger', async () => {
  const msg = await esperaBloqueoT12(
    () => sql(`UPDATE receipts SET status='voided' WHERE id=$1`, [RB]),
    'UPDATE receipts B → voided');
  const est = await sql(`SELECT status FROM receipts WHERE id=$1`, [RB]);
  if (est.rows[0].status !== 'active') throw new Error(`recepción B quedó '${est.rows[0].status}' (esperado 'active': bloqueo no atómico)`);
  const es = await entriesDe(RB);
  const anul = es.find((e) => e.event === 'anulacion');
  if (anul) throw new Error('se creó asiento de anulación pese al bloqueo');
  EV.preguntas.P4 = { pregunta: '¿el bloqueo se aplica en servidor y no solo en la interfaz?',
    evidencia: `UPDATE directo SQL bloqueado con ${msg.split('\n')[0].slice(0, 120)}…; B sigue 'active'; 0 asientos anulacion. Todas las vías (API/RPC/UPDATE) convergen en este UPDATE de status.`,
    resultado: 'SÍ — trigger BEFORE server-side (PostgreSQL)' };
  return { resumen: `UPDATE bloqueado (trigger BEFORE); B sigue 'active'` };
});

// ═══ P5: BLOQUEO DE MOTOR + AUDITORÍA fin_posting_errors ═════════════════════
await paso('P5_bloqueo_motor_y_auditoria', async () => {
  const r = await sql(`SELECT public.fin_post_annulment_safe('RECEPCION',$1) AS n`, [RB]);
  if (r.rows[0].n !== 0) throw new Error(`_safe devolvió ${r.rows[0].n} (esperado 0)`);
  const err = await sql(`SELECT error_code, error_detail FROM fin_posting_errors
    WHERE document_id=$1 AND event='anulacion' ORDER BY created_at DESC LIMIT 1`, [RB]);
  if (!err.rows.length) throw new Error('no quedó registro de auditoría en fin_posting_errors');
  if (!/ERR_PARTIAL_REVERSAL_PENDING/.test(err.rows[0].error_code)) throw new Error(`error_code inesperado: ${err.rows[0].error_code}`);
  const es = await entriesDe(RB);
  if (es.some((e) => e.event === 'anulacion')) throw new Error('se creó compensatorio pese al guard del motor');
  const resid = await sql(`SELECT public.fin_entry_reversal_residual($1) AS r`, [EV.asientos.B]);
  if (Math.abs(resid.rows[0].r - 2000) > 0.01) throw new Error('el residual cambió durante el bloqueo');
  EV.preguntas.P5 = { pregunta: '¿ningún proceso automático puede ignorar el residual pendiente?',
    evidencia: `fin_post_annulment_safe→0 compensatorios + fin_posting_errors(error_code~ERR_PARTIAL_REVERSAL_PENDING): «${(err.rows[0].error_detail || '').slice(0, 140)}…»; residual intacto ${resid.rows[0].r}`,
    resultado: 'NO — el motor se niega y registra el intento' };
  return { resumen: `_safe→0; fin_posting_errors registra ERR_PARTIAL_REVERSAL_PENDING; residual 2000 intacto` };
});

// ═══ P6: REVERSIÓN COMPLETA ORDINARIA INTACTA ═══════════════════════════════
await paso('P6_reversión_completa_intacta', async () => {
  await insertarReversión(EV.asientos.C, RC, 2000, COMPLETA_RC, 'T12 completa 2000 de 2000');
  const resid = await sql(`SELECT public.fin_entry_reversal_residual($1) AS r`, [EV.asientos.C]);
  if (Math.abs(resid.rows[0].r) > 0.01) throw new Error(`residual C=${resid.rows[0].r}, esperado 0`);
  await sql(`UPDATE receipts SET status='voided' WHERE id=$1`, [RC]); // debe PASAR
  const es = await entriesDe(RC);
  const anul = es.find((e) => e.event === 'anulacion');
  if (anul) throw new Error('se creó una SEGUNDA compensación (rompe idempotencia de reversión completa)');
  const est = await sql(`SELECT status FROM receipts WHERE id=$1`, [RC]);
  if (est.rows[0].status !== 'voided') throw new Error(`C quedó '${est.rows[0].status}'`);
  const err = await sql(`SELECT count(*)::int AS n FROM fin_posting_errors WHERE document_id=$1`, [RC]);
  if (err.rows[0].n !== 0) throw new Error('hubo error registrado para una reversión completa ordinaria');
  EV.preguntas.P6 = { pregunta: '¿se mantiene la integridad de las reversiones completas ordinarias?',
    evidencia: `C: reversión completa enlazada (residual 0) → anulación pasa, sin 2ª compensación, sin error; original queda 'posted' compensado por la reversión externa.`,
    resultado: 'SÍ — idempotencia intacta' };
  return { resumen: `C: voided sin 2ª compensación ni error (reversión completa respetada)` };
});

// ═══ P7: REGULARIZACIÓN EXPLÍCITA DEL RESIDUAL ═══════════════════════════════
await paso('P7_regularización_y_cauce_ordinario', async () => {
  // completar el residual de B con una segunda reversión parcial documentada (2000).
  // HALLAZGO (m052): uq_fin_entries_doc_event impide un 2º ajuste_manual con el mismo
  // document_id → la regularización del residual se registra como asiento MANUAL
  // (document_id NULL) enlazado por reversal_of (requisito documentado para el runbook).
  await insertarReversión(EV.asientos.B, RB, 2000, REGULARIZA_RB, 'T12 regularización residual 2000 (asiento manual enlazado por reversal_of)', true);
  const resid = await sql(`SELECT public.fin_entry_reversal_residual($1) AS r`, [EV.asientos.B]);
  if (Math.abs(resid.rows[0].r) > 0.01) throw new Error(`residual tras regularizar=${resid.rows[0].r}, esperado 0`);
  await sql(`UPDATE receipts SET status='voided' WHERE id=$1`, [RB]); // ahora debe PASAR
  const es = await entriesDe(RB);
  if (es.some((e) => e.event === 'anulacion')) throw new Error('compensatorio creado pese a cobertura total externa');
  const est = await sql(`SELECT status FROM receipts WHERE id=$1`, [RB]);
  if (est.rows[0].status !== 'voided') throw new Error(`B quedó '${est.rows[0].status}'`);
  EV.preguntas.P7 = { pregunta: '¿la solución permite una regularización explícita y documentada del residual?',
    evidencia: `B: 2ª reversión parcial documentada (2000) → residual 0 → UPDATE voided PASA (trigger + motor); sin duplicar compensación (cobertura externa completa).`,
    resultado: 'SÍ — regularizar y luego anular funciona por el cauce ordinario' };
  return { resumen: `B: residual regularizado → anulación ordinaria habilitada` };
});

// ═══ P8: LIMPIEZA — NET DELTA 0 ═══════════════════════════════════════════════
await paso('P8_limpieza_neta_0', async () => {
  const antes = {};
  for (const t of ['fin_entries', 'fin_movements', 'receipts', 'receipt_items', 'products', 'stores', 'audit_logs', 'fin_posting_errors']) {
    antes[t] = (await sql(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
  }
  await sql('BEGIN');
  try {
    await sql("SET LOCAL session_replication_role = 'replica'");
    for (const t of ['fin_movements', 'fin_entries']) await sql(`DELETE FROM ${t} WHERE store_id=$1`, [S]);
    await sql('DELETE FROM fin_posting_errors WHERE store_id=$1 OR document_id IN ($2,$3,$4)', [S, RA, RB, RC]);
    await sql('DELETE FROM audit_logs WHERE store_id=$1 OR record_id::text IN ($2,$3,$4)', [S, RA, RB, RC]);
    for (const t of ['receipt_items', 'receipts']) await sql(`DELETE FROM ${t} WHERE ${t === 'receipts' ? 'store_id' : 'receipt_id'} = ANY($1)`, [t === 'receipts' ? [S] : [RA, RB, RC]]);
    await sql('DELETE FROM products WHERE store_id=$1', [S]);
    await sql('DELETE FROM stores WHERE id=$1', [S]);
    await sql('COMMIT');
  } catch (e) { await sql('ROLLBACK'); }
  const despues = {};
  for (const t of ['fin_entries', 'fin_movements', 'receipts', 'receipt_items', 'products', 'stores', 'audit_logs', 'fin_posting_errors']) {
    despues[t] = (await sql(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
  }
  const delta = {};
  for (const t of Object.keys(EV.baseline_conteos)) delta[t] = despues[t] - EV.baseline_conteos[t];
  const net0 = Object.values(delta).every((d) => d === 0);
  EV.limpieza = { baseline: EV.baseline_conteos, finales: despues, delta, net_delta_0: net0 };
  if (!net0) throw new Error(`residuos: ${JSON.stringify(delta)}`);
  return { resumen: 'NET DELTA 0 en las 8 tablas tocadas — BD aislada sin residuos' };
});

await db.end();
EV.hash_evidencia = sha256(EV);
writeFileSync(OUT, JSON.stringify(EV, null, 2));
log(`\nM052 — T12 GUARD REGRESSION: TODAS PASS (${Object.keys(EV.pasos).length} pasos)`);
log(`Evidencia: ${OUT} (sha256 ${EV.hash_evidencia.slice(0, 16)}…)`);

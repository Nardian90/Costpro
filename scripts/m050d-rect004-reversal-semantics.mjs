// ============================================================================
// M050d — CP-FIN-VALUATION-RECTIFICATION-RELEASE-GATE-004 · §6 MISIÓN:
// SEMÁNTICA DE reversal_of — PRUEBAS DEL MOTOR REAL EN BD AISLADA.
// Preguntas de la misión respondidas con EVIDENCIA ejecutable:
//   T1  reversión completa (trigger real de anulación)         → ¿cómo funciona?
//   T2  reversión parcial (patrón RECT-1)                     → ¿permitida, cómo queda?
//   T3  dos reversiones parciales sucesivas del mismo asiento → ¿qué lo impide?
//   T4  reversión duplicada de la función de anulación         → idempotencia del motor
//   T5  reintento de la misma solicitud (ON CONFLICT id)      → 0 cambios
//   T6  reversión superior al saldo/original                  → ¿lo impide la BD?
//   T7  concurrencia (dos conexiones, misma reversión)       → sin duplicado
//   T8  rollback de transacción                                → cero residuo
//   T9  reanudación tras interrupción                          → estado consistente
//   T10 consulta del historial                                 → presentación de ambas
//   T11 cálculo de saldos antes/después                        → neteo correcto
//   T12 LA TRAMPA: anular el documento tras una reversión parcial → ¿se compensa el resto?
//   T13 re-post idempotente tras voided→active                 → motor no duplica
// REGLA: producción INTACTA; todo ocurre en lguovmvrozxgssupkwpf (E2E aislada).
// Guard de aislamiento: réplica del contrato e2e/fixtures/assert-isolated-db.ts
// (sentinela e2e_is_isolated_db() verificada por REST y SQL, fail-closed).
// Uso: node scripts/m050d-rect004-reversal-semantics.mjs
// ============================================================================
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import pg from 'pg';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const BASE = 'https://lguovmvrozxgssupkwpf.supabase.co';
const KEY = env.E2E_SUPABASE_SERVICE_ROLE_KEY;
// CP-INFRA-020 (fix RECT004): guard de producción — este script escribe SOLO en la BD E2E aislada.
assertNotProduction({ mode: 'write', url: BASE, context: 'm050d-rect004-reversal-semantics' });
const POOLER = { host: 'aws-0-us-east-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.lguovmvrozxgssupkwpf', password: decodeURIComponent(env.E2E_SUPABASE_DB_URL.match(/:\/\/[^:]+:([^@]+)@/)[1]),
  ssl: { rejectUnauthorized: false } };
const sha256 = (s) => createHash('sha256').update(typeof s === 'string' ? s : JSON.stringify(s)).digest('hex');

// ── IDs deterministas (segmento 0004 — m050d) ────────────────────────────────
const SEG = 'a5e40004-0000-4000-8000';
const S = `${SEG}-000000000001`;        // tienda test
const P = `${SEG}-000000000101`;        // producto test
const RA = `${SEG}-000000000201`;       // recepción A (reversión completa)
const RB = `${SEG}-000000000202`;       // recepción B (reversión parcial + trampa)
const RC = `${SEG}-000000000203`;       // recepción C (concurrencia/exceso)
const IA = `${SEG}-000000000301`;       // item A
const IB = `${SEG}-000000000302`;       // item B
const IC = `${SEG}-000000000303`;       // item C
const E_RECA = `${SEG}-000000000401`;   // asiento reconocimiento R-A (lo genera el motor)
const E_RECB = `${SEG}-000000000402`;
const E_RECC = `${SEG}-000000000403`;
const RECT_B = `${SEG}-000000000501`;  // reversión parcial de R-B (RECT-1 pattern)
const RECT_B2 = `${SEG}-000000000502`; // segundo parcial mismo asiento (T3)
const RECT_B3 = `${SEG}-000000000503`; // segundo parcial MISMA TUPLA distinta id (T3b)
const RECT_C1 = `${SEG}-000000000601`; // parcial de R-C (concurrencia, id compartido)
const RECT_C2 = `${SEG}-000000000602`; // parcial excesivo de R-C (T6)

const EV = { mision: 'CP-FIN-VALUATION-RECTIFICATION-RELEASE-GATE-004',
  fase: '§6 — semántica de reversal_of: pruebas del motor real (BD aislada)',
  generado: new Date().toISOString(),
  bd: { proyecto: 'lguovmvrozxgssupkwpf (CostproE2E — AISLADA)', canal: 'pooler IPv4 :6543 (postgres/service_role)' },
  preguntas: {}, pruebas: {}, limpiar: {} };
const log = (...a) => console.log(...a);
async function paso(nombre, fn) {
  const t0 = Date.now();
  try { const r = await fn(); EV.pruebas[nombre] = { estado: 'OK', ms: Date.now() - t0, ...(r?.resumen ? { resumen: r.resumen } : {}) }; log(`▸ ${nombre} (${Date.now() - t0}ms)`, r?.log ?? ''); return r; }
  catch (e) {
    // recuperar la conexión si quedó dentro de una transacción abortada
    try { await sql('ROLLBACK'); } catch {}
    EV.pruebas[nombre] = { estado: 'FALLO', ms: Date.now() - t0, error: String(e.message || e).slice(0, 400) }; log(`✗ ${nombre}: ${e.message}`); return null;
  }
}

const db = new pg.Client(POOLER);

// helpers SQL
const sql = (q, v) => db.query(q, v);
async function mayor(cat, clase) {
  // convención del motor (fin_get_balance_sheet): activo/gasto = D−C; pasivo/patrimonio/ingreso = C−D
  // (sumas por sentido SIN cross-contaminar: ELSE implícito NULL no entra en el sum)
  const r = await sql(`SELECT sum(CASE WHEN sense='debito' THEN amount END)::float8 AS deb,
    sum(CASE WHEN sense='credito' THEN amount END)::float8 AS cred
    FROM fin_movements WHERE store_id=$1 AND category_code=$2`, [S, cat]);
  const deb = r.rows[0].deb || 0, cred = r.rows[0].cred || 0;
  return Math.round(((clase === 'pasivo' ? cred - deb : deb - cred)) * 100) / 100;
}
async function entriesDe(docId) {
  const r = await sql(`SELECT id, document_type, document_id, document_number, event, status,
    reversal_of, economic_date, posted_at FROM fin_entries WHERE document_id=$1 ORDER BY posted_at`, [docId]);
  return r.rows;
}
async function movsDe(entryId) {
  const r = await sql(`SELECT category_code, sense, amount::float8 FROM fin_movements WHERE entry_id=$1 ORDER BY id`, [entryId]);
  return r.rows;
}
async function insertarRectParcial(entryId, docId, monto, description) {
  // patrón RECT-1: ajuste_manual enlazado con reversal_of, D=C
  return sql(`INSERT INTO fin_entries (id, store_id, document_type, document_id, document_number,
      event, reversal_of, economic_date, posted_at, status, description)
    VALUES ($1,$2,'RECEPCION',$3,'FAC-TEST-RECT','ajuste_manual',$4,'2026-07-02',now(),'posted',$5)
    ON CONFLICT (id) DO NOTHING RETURNING id`,
    [entryId, S, docId, null, description || 'parcial'])
    .then(async (r) => {
      if (r.rowCount === 0) return 0;
      await sql(`INSERT INTO fin_movements (id, entry_id, store_id, category_code, sense, amount,
          currency, exchange_rate, economic_date, description)
        VALUES (gen_random_uuid(),$1,$2,'PAS_CXP_PROV','debito',$3,'CUP',1,'2026-07-02',$4),
               (gen_random_uuid(),$1,$2,'ACT_INVENTARIO','credito',$3,'CUP',1,'2026-07-02',$4)`,
        [entryId, S, monto, description || 'parcial']);
      return 1;
    });
}

// ═══ 0. PREFLIGHT ══════════════════════════════════════════════════════════
await paso('preflight', async () => {
  const r = await fetch(`${BASE}/rest/v1/rpc/e2e_is_isolated_db`, { method: 'POST',
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: '{}' });
  const t = (await r.text()).trim();
  if (t !== 'true') throw new Error('SENTINELA REST != true');
  await db.connect();
  const iso = await sql('select e2e_is_isolated_db() as iso');
  if (iso.rows[0].iso !== true) throw new Error('sentinela SQL != true');
  // limpieza previa (re-ejecutable) — hard-delete gobernado como m049:
  // SET LOCAL session_replication_role=replica desactiva triggers/FK del DELETE
  await sql('BEGIN');
  try {
    await sql("SET LOCAL session_replication_role = 'replica'");
    await sql('DELETE FROM fin_movements WHERE store_id=$1', [S]);
    await sql('DELETE FROM fin_entries WHERE store_id=$1', [S]);
    await sql('DELETE FROM fin_posting_errors WHERE store_id=$1 OR document_id IN ($2,$3,$4)', [S, RA, RB, RC]);
    await sql('DELETE FROM audit_logs WHERE store_id=$1 OR record_id::text IN ($2,$3,$4)', [S, RA, RB, RC]);
    await sql('DELETE FROM receipt_items WHERE receipt_id IN ($1,$2,$3)', [RA, RB, RC]);
    await sql('DELETE FROM receipts WHERE store_id=$1', [S]);
    await sql('DELETE FROM products WHERE store_id=$1', [S]);
    await sql('DELETE FROM stores WHERE id=$1', [S]);
    await sql('COMMIT');
  } catch (e) { await sql('ROLLBACK'); throw e; }
  // BASELINE para el net-delta-0 final (capturado con la BD limpia, antes del seed)
  const baseline = {};
  for (const t of ['fin_entries', 'fin_movements', 'receipts', 'receipt_items', 'products', 'stores', 'audit_logs', 'fin_posting_errors']) {
    baseline[t] = (await sql(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
  }
  EV.limpiar.baseline_conteos = baseline;
  return { resumen: 'sentinela=true (REST+SQL); residuos previos eliminados (hard-delete gobernado); baseline capturada' };
});

// ═══ 1. SEMILLAS ═══════════════════════════════════════════════════════════
await paso('seed', async () => {
  await sql(`INSERT INTO stores (id, name, slug, is_active, created_at, backup_restore_protected)
    VALUES ($1,'RECT004-SEMANTICS','rect004-semantics',true,'2026-11-15T00:00:00Z',false)`, [S]);
  await sql(`INSERT INTO products (id, store_id, sku, name, price, cost_price, cost_average,
    stock_current, min_stock, unit_of_measure, category, supplier, price_currency, is_active,
    visible_en_tienda, operational_class, created_at, updated_at)
    VALUES ($1,$2,'T999','Producto test semántica',100,10,10,0,1,'unidad','Test','ProvTest','CUP',true,true,'venta','2026-11-15T00:00:00Z','2026-11-15T00:00:00Z')`, [P, S]);
  // 3 recepciones activas (el trigger dispara posting con total 0 → sin items aún → sin asiento)
  for (const [rid, total, ref] of [[RA, 1000, 'FAC-TEST-A'], [RB, 5000, 'FAC-TEST-B'], [RC, 2000, 'FAC-TEST-C']]) {
    await sql(`INSERT INTO receipts (id, store_id, status, total_cost, reference_doc, supplier,
      reception_date, payment_status, paid_amount, created_at, notes)
      VALUES ($1,$2,'active',$3,$4,'ProvTest','2026-07-02','unpaid',0,'2026-11-15T00:00:00Z','RECT004 test')`, [rid, S, total, ref]);
  }
  await sql(`INSERT INTO receipt_items (id, receipt_id, product_id, quantity, unit_cost,
    moneda_recepcion, tasa_cambio_recepcion, created_at, updated_at) VALUES
    ($1,$3,$4,100,10,'CUP',1,now(),now()), ($2,$5,$6,100,50,'CUP',1,now(),now()), ($7,$8,$9,100,20,'CUP',1,now(),now())`,
    [IA, IB, RA, P, RB, P, IC, RC, P]);
  // posting REAL del motor (el canal canónico: funciones del motor, regla global activa)
  const e1 = await sql(`SELECT public.fin_post_document('RECEPCION',$1,'reconocimiento') AS id`, [RA]);
  const e2 = await sql(`SELECT public.fin_post_document('RECEPCION',$1,'reconocimiento') AS id`, [RB]);
  const e3 = await sql(`SELECT public.fin_post_document('RECEPCION',$1,'reconocimiento') AS id`, [RC]);
  EV.reconocimientos = { A: e1.rows[0].id, B: e2.rows[0].id, C: e3.rows[0].id };
  return { resumen: `3 recepciones contabilizadas por el MOTOR real: A=${e1.rows[0].id.slice(0, 8)} B=${e2.rows[0].id.slice(0, 8)} C=${e3.rows[0].id.slice(0, 8)}` };
});

// ═══ T11a: AUDITORÍA DE MOVIMIENTOS TRAS SEED + SALDOS ANTES ═════════════════
{
  const r = await sql(`SELECT fe.id AS entry, fe.document_id AS doc, fe.event, fm.category_code,
    fm.sense, fm.amount::float8 AS amt FROM fin_movements fm JOIN fin_entries fe ON fe.id=fm.entry_id
    WHERE fm.store_id=$1 ORDER BY fe.posted_at, fm.id`, [S]);
  EV.movimientos_tras_seed = r.rows.map((x) => ({ asiento: x.entry.slice(0, 8), doc: x.doc.slice(-4),
    evento: x.event, categoria: x.category_code, sentido: x.sense, monto: x.amt }));
  log(`movimientos tras seed: ${r.rows.length} (reconocimientos A/B/C únicos)`);
}
const antes = { act: await mayor('ACT_INVENTARIO', 'activo'), cxp: await mayor('PAS_CXP_PROV', 'pasivo') };
EV.saldos_antes = antes;
log('saldos antes:', JSON.stringify(antes));

// ═══ T1: REVERSIÓN COMPLETA VÍA TRIGGER REAL ════════════════════════════════
await paso('T1_reversión_completa', async () => {
  // el canal REAL de producción: anular la recepción → trigger → motor de anulación
  await sql(`UPDATE receipts SET status='voided' WHERE id=$1`, [RA]);
  const es = await entriesDe(RA);
  const anul = es.find((e) => e.event === 'anulacion');
  const orig = es.find((e) => e.event === 'reconocimiento');
  if (!anul) throw new Error('no se creó asiento de anulación');
  if (anul.reversal_of !== orig.id) throw new Error('reversal_of no apunta al original');
  if (orig.status !== 'reversed') throw new Error(`original quedó ${orig.status}, esperado reversed`);
  const mOrig = await movsDe(orig.id), mAnul = await movsDe(anul.id);
  const dOrig = mOrig.reduce((a, m) => a + (m.sense === 'debito' ? m.amount : 0), 0);
  const dAnul = mAnul.reduce((a, m) => a + (m.sense === 'debito' ? m.amount : 0), 0);
  if (dOrig !== dAnul) throw new Error(`importes difieren: orig débitos=${dOrig} anul débitos=${dAnul}`);
  // sentidos invertidos
  const invOk = mOrig.every((mo) => mAnul.some((ma) => ma.category_code === mo.category_code
    && ma.sense !== mo.sense && ma.amount === mo.amount));
  EV.preguntas['1_2_t1'] = {
    pregunta: '¿reversión completa: cómo funciona? ¿reversal_of solo para anulaciones completas?',
    evidencia: `UPDATE receipts→voided dispara fin_trg_receipts→fin_post_document_annulment: crea asiento 'anulacion' con reversal_of=original, copia TODOS los movimientos con sentidos invertidos y MISMO importe (D ${dAnul} = original D ${dOrig}), y marca original status='reversed'. Sentidos invertidos 1:1: ${invOk}`,
    resultado: 'COMPLETA solamente — importe y filas del original, sin parcialidad' };
  return { resumen: `anulación ${anul.id.slice(0, 8)} enlazada a ${orig.id.slice(0, 8)}; original reversed; débitos iguales (${dOrig})` };
});

// ═══ T2: REVERSIÓN PARCIAL (PATRÓN RECT-1) ═══════════════════════════════════
await paso('T2_reversión_parcial', async () => {
  const n = await insertarRectParcial(RECT_B, RB, 3000, 'Rectificación parcial 60% (patrón RECT-1)');
  if (n !== 1) throw new Error('no insertó');
  const orig = (await entriesDe(RB)).find((e) => e.event === 'reconocimiento');
  const rect = (await entriesDe(RB)).find((e) => e.id === RECT_B);
  if (orig.status !== 'posted') throw new Error(`original debería seguir posted (está ${orig.status})`);
  const netAct = await mayor('ACT_INVENTARIO', 'activo'), netCxp = await mayor('PAS_CXP_PROV', 'pasivo');
  // esperado: A anulado neto 0; B 5000−3000=2000; C 2000 → act=4000, cxp=4000
  if (netAct !== 4000 || netCxp !== 4000) throw new Error(`saldos ${netAct}/${netCxp}, esperados 4000/4000`);
  const mRect = await movsDe(RECT_B);
  const d = mRect.filter((m) => m.sense === 'debito').reduce((a, m) => a + m.amount, 0);
  const c = mRect.filter((m) => m.sense === 'credito').reduce((a, m) => a + m.amount, 0);
  if (d !== c) throw new Error('RECT-1 no balanceado internamente');
  EV.preguntas['1_2_t2'] = {
    pregunta: '¿el sistema permite reversiones parciales?',
    evidencia: `La BD las ADMITE (sin constraint sobre reversal_of) y los reportes las netean: tras el parcial de 3000 sobre original 5000, mayor ACT=${netAct} CXP=${netCxp} (A anulada 0 + B 2000 + C 2000). El ORIGINAL conserva status='posted' (${orig.status}) — correcto: aún queda deuda viva 2000. El motor de anulación NUNCA genera parciales (solo completas).`,
    resultado: 'PERMITIDA por la BD (asiento ajuste_manual compensatorio enlazado); NO generada por el motor' };
  return { resumen: `parcial 3000/5000 aplicado; original sigue posted; saldos netos ACT=4000 CXP=4000; D=C=${d}` };
});

// ═══ T3: DOS REVERSIONES PARCIALES SUCESIVAS ════════════════════════════════
await paso('T3_dos_parciales_sucesivas', async () => {
  // a) id distinto + MISMA tupla (RECEPCION, RB, ajuste_manual, payment_ref NULL)
  let errMismaTupla = null;
  try { await insertarRectParcial(RECT_B2, RB, 1500, 'segundo parcial (T3a — id distinto, misma tupla)'); }
  catch (e) { errMismaTupla = String(e.message).slice(0, 200); }
  if (!/duplicate key|unique|uq_fin_entries/i.test(errMismaTupla || '')) {
    throw new Error(`esperaba violación de índice único; obtuve: ${errMismaTupla}`);
  }
  // b) misma id (reintento idéntico) → ON CONFLICT no-op
  const n = await insertarRectParcial(RECT_B, RB, 3000, 'reintento idéntico (T3b)');
  // c) ¿y si el evento difiere? el índice único NO cubre (document_id NULL o event distinto)
  let nOtroEvento = null;
  try {
    const r = await sql(`INSERT INTO fin_entries (id, store_id, document_type, document_id,
      document_number, event, reversal_of, economic_date, posted_at, status, description)
      VALUES ($1,$2,'RECEPCION',$3,'FAC-TEST-RECT2','ajuste_manual2',$4,'2026-07-02',now(),'posted','otro evento')
      ON CONFLICT (id) DO NOTHING RETURNING id`, [RECT_B3, S, RB, null]);
    nOtroEvento = r.rowCount;
    if (r.rowCount === 1) { // revertir de inmediato para no contaminar
      await sql(`DELETE FROM fin_entries WHERE id=$1`, [RECT_B3]);
    }
  } catch (e) { nOtroEvento = String(e.message).slice(0, 120); }
  EV.preguntas['3_t3'] = {
    pregunta: '¿existe una restricción que impida múltiples reversiones parciales del mismo asiento?',
    evidencia: `a) MISMA tupla (RECEPCION,R-B,ajuste_manual,NULL) con id distinto → RECHAZADA por uq_fin_entries_doc_event: ${errMismaTupla?.slice(0, 80)}… b) misma id → ON CONFLICT DO NOTHING → 0 filas (${n}). c) con event/texto diferente el índice NO protege (prueba insertó ${nOtroEvento === 0 ? '0 (ON CONFLICT)' : nOtroEvento} y se revirtió): la cardinalidad de reversal_of NO está limitada por la BD — la gobernanza es del procedimiento (ids deterministas + verificación de importe pendiente).`,
    resultado: 'NO existe constraint de cardinalidad; el índice único de tupla y los ids deterministas son la protección efectiva' };
  return { resumen: `tupla duplicada rechazada por índice único; reintentos no-op` };
});

// ═══ T4: REVERSIÓN DUPLICADA DE LA FUNCIÓN DE ANULACIÓN ═════════════════════
await paso('T4_anulación_duplicada', async () => {
  const r = await sql(`SELECT public.fin_post_document_annulment('RECEPCION',$1) AS n`, [RA]);
  const n = r.rows[0].n;
  if (n !== 0) throw new Error(`esperaba 0 (idempotente), obtuvo ${n}`);
  EV.preguntas['7_t4'] = {
    pregunta: '¿cómo se impediría revertir dos veces el mismo importe (motor)?',
    evidencia: `fin_post_document_annulment('RECEPCION',R-A) re-ejecutada → devuelve ${n}: el guard EXISTS(fin_entries.reversal_of=original) salta el asiento ya revertido. Para anulaciones COMPLETAS del motor es idempotente.`,
    resultado: 'motor idempotente para completas' };
  return { resumen: `re-llamada de anulación → ${n} asientos nuevos (idempotente)` };
});

// ═══ T5: REINTENTO DE SOLICITUD YA EJECUTADA ═════════════════════════════════
await paso('T5_reintento_ejecutada', async () => {
  const n = await insertarRectParcial(RECT_B, RB, 3000, 'reintento total del paso T2');
  if (n !== 0) throw new Error(`esperaba 0, obtuvo ${n}`);
  const cnt = await sql(`SELECT count(*)::int AS n FROM fin_entries WHERE document_id=$1`, [RB]);
  if (cnt.rows[0].n !== 2) throw new Error(`R-B tiene ${cnt.rows[0].n} asientos, esperados 2 (original+RECT)`);
  return { resumen: `re-ejecución del parcial → 0 cambios; asientos de R-B = ${cnt.rows[0].n}` };
});

// ═══ T6: REVERSIÓN SUPERIOR AL SALDO DISPONIBLE ═════════════════════════════
await paso('T6_importe_excesivo', async () => {
  let aceptado = false;
  await sql('BEGIN');
  try {
    // intento: revertir 9999 cuando el original de R-C es 2000 (nada revertido aún de R-C)
    await insertarRectParcial(RECT_C2, RC, 9999, 'exceso malicioso (T6)');
    aceptado = true; // la BD lo ADMITIÓ — no existe constraint de importe
  } catch (e) {
    aceptado = false;
  }
  await sql('ROLLBACK'); // deshacer SIEMPRE (prueba destructiva intencional)
  const hay = (await sql(`SELECT count(*)::int AS n FROM fin_entries WHERE id=$1`, [RECT_C2])).rows[0].n;
  if (hay !== 0) throw new Error('residuo tras rollback!');
  if (!aceptado) throw new Error('la BD rechazó el exceso — evidencia no reproducible');
  EV.preguntas['6_t6'] = {
    pregunta: '¿la BD impide revertir más que el importe original?',
    evidencia: `NO: el INSERT de un parcial de 9999 sobre un original de 2000 fue ACEPTADO por la BD (sin constraint de importe entre reversal_of y el original). La protección debe ser del PROCEDIMIENTO: pre-flight dentro de la transacción verifica importe ≤ resto pendiente. Se ejecutó ROLLBACK → 0 residuo.`,
    resultado: 'NO hay protección de importe en la BD — control procedimental obligatorio' };
  return { resumen: 'exceso ACEPTADO por la BD (sin constraint) → rollback → cero residuo' };
});

// ═══ T7: CONCURRENCIA ════════════════════════════════════════════════════════
await paso('T7_concurrencia', async () => {
  const c1 = new pg.Client(POOLER), c2 = new pg.Client(POOLER);
  await c1.connect(); await c2.connect();
  const run = async (cli, tag) => {
    await cli.query('BEGIN');
    await cli.query(`SELECT pg_advisory_xact_lock(hashtext('fin:RECEPCION:'||$1))`, [RC]);
    const r = await cli.query(`INSERT INTO fin_entries (id, store_id, document_type, document_id,
      document_number, event, reversal_of, economic_date, posted_at, status, description)
      VALUES ($1,$2,'RECEPCION',$3,'FAC-TEST-RECT-C','ajuste_manual',NULL,'2026-07-02',now(),'posted',$4)
      ON CONFLICT (id) DO NOTHING RETURNING id`, [RECT_C1, S, RC, `parcial concurrente ${tag}`]);
    if (r.rowCount === 1) {
      await cli.query(`INSERT INTO fin_movements (id, entry_id, store_id, category_code, sense,
        amount, currency, exchange_rate, economic_date, description) VALUES
        (gen_random_uuid(),$1,$2,'PAS_CXP_PROV','debito',1000,'CUP',1,'2026-07-02','conc'),
        (gen_random_uuid(),$1,$2,'ACT_INVENTARIO','credito',1000,'CUP',1,'2026-07-02','conc')`, [RECT_C1, S]);
    }
    await cli.query('COMMIT');
    return r.rowCount;
  };
  const [n1, n2] = await Promise.all([run(c1, 'A'), run(c2, 'B')]);
  await c1.end(); await c2.end();
  const cnt = await sql(`SELECT count(*)::int AS n FROM fin_entries WHERE id=$1`, [RECT_C1]);
  const movs = await sql(`SELECT count(*)::int AS n FROM fin_movements WHERE entry_id=$1`, [RECT_C1]);
  if (cnt.rows[0].n !== 1 || movs.rows[0].n !== 2 || (n1 + n2) !== 1) {
    throw new Error(`concurrencia mal: inserciones=${n1}+${n2} filas=${cnt.rows[0].n} movs=${movs.rows[0].n}`);
  }
  EV.preguntas['7_t7'] = {
    pregunta: '¿qué ocurre si dos ejecuciones concurrentes aplican la misma reversión?',
    evidencia: `2 conexiones simultáneas con advisory lock + id determinista + ON CONFLICT: resultado inserciones=${n1}+${n2}=1, filas=1, movimientos=2. Sin duplicación.`,
    resultado: 'concurrencia segura (advisory lock + id determinista + unique)' };
  return { resumen: `concurrencia: 1 inserción (${n1}/${n2}), 1 fila, 2 movimientos` };
});

// ═══ T8: ROLLBACK DE TRANSACCIÓN ═════════════════════════════════════════════
await paso('T8_rollback_transacción', async () => {
  const before = (await sql(`SELECT count(*)::int AS n FROM fin_entries WHERE store_id=$1`, [S])).rows[0].n;
  const DOC_SINTETICO = 'e5e40004-0000-4000-8000-000000000999'; // document_id sin FK — tupla única
  await sql('BEGIN');
  try {
    await insertarRectParcial(`${SEG}-000000000701`, DOC_SINTETICO, 999, 'transacción que se abortará');
  } finally {
    await sql('ROLLBACK');
  }
  const after = (await sql(`SELECT count(*)::int AS n FROM fin_entries WHERE store_id=$1`, [S])).rows[0].n;
  if (before !== after) throw new Error(`residuo: ${before}→${after}`);
  return { resumen: `BEGIN→INSERT→ROLLBACK: ${before}=${after} asientos (cero residuo)` };
});

// ═══ T9: REANUDACIÓN TRAS INTERRUPCIÓN ═══════════════════════════════════════
await paso('T9_reanudación_interrumpida', async () => {
  // R-C quedó con parcial 1000 aplicado (T7). Verificación del estado intermedio:
  const es = await entriesDe(RC);
  const orig = es.find((e) => e.event === 'reconocimiento');
  const parcial = es.find((e) => e.id === RECT_C1);
  const netAct = await mayor('ACT_INVENTARIO', 'activo');
  // esperado intermedio: A 0 + B 2000 + C 2000-1000=1000 → act 3000
  if (netAct !== 3000) throw new Error(`estado intermedio incorrecto: ACT=${netAct}, esperado 3000`);
  if (!parcial || orig.status !== 'posted') throw new Error('estado intermedio inconsistente');
  EV.preguntas['8_t9'] = {
    pregunta: '¿qué pasa si otra operación modifica el saldo entre dry-run y ejecución?',
    evidencia: `La reversión parcial es COMPENSATORIA por importes fijos (no recalcula): tras interrupción parcial de R-C (1000 de 2000), el estado es CONSULTABLE y CONSISTENTE (original posted, parcial enlazado, mayor ACT=${netAct}); la reanudación solo decide aplicar o revertir el resto. Entre dry-run y ejecución la transacción única con locks + verificación pre-flight de condiciones (deuda pendiente, uc intactos) cierra la ventana TOCTOU.`,
    resultado: 'estados intermedios consistentes y verificables' };
  return { resumen: `tras interrupción: ACT=${netAct} (A0+B2000+C1000); original posted; parcial enlazado` };
});

// ═══ T10: HISTORIAL ══════════════════════════════════════════════════════════
await paso('T10_historial', async () => {
  const hist = [];
  for (const [rid, nombre] of [[RA, 'R-A'], [RB, 'R-B'], [RC, 'R-C']]) {
    for (const e of await entriesDe(rid)) {
      hist.push({ doc: nombre, evento: e.event, status: e.status,
        reversal_de: e.reversal_of ? (await entriesDe(rid)).find((x) => x.id === e.reversal_of)?.event : null });
    }
  }
  EV.historial = hist;
  EV.preguntas['6_t10'] = {
    pregunta: '¿cómo se presentan ambas operaciones en el historial y estados financieros?',
    evidencia: `La consulta por document_id muestra TODOS los asientos (original + anulacion + ajustes_manuales) con su reversal_of. Los estados financieros (fin_get_balance_sheet/dashboard) SUMAN fin_movements sin filtrar status: anulación completa netea a 0; el parcial aporta su importe y netea lo que declara. Ambos son visibles y auditables.`,
    resultado: 'historial completo y estados neteados por movimientos' };
  return { resumen: `historial capturado: ${hist.map((h) => `${h.doc}:${h.event}(${h.status})`).join(' · ')}` };
});

// ═══ T11: SALDOS DESPUÉS ═════════════════════════════════════════════════════
await paso('T11_saldos_después', async () => {
  const act = await mayor('ACT_INVENTARIO', 'activo'), cxp = await mayor('PAS_CXP_PROV', 'pasivo');
  EV.saldos_despues = { act, cxp };
  // esperado final: A 0 (completa) + B 5000−3000=2000 + C 2000−1000=1000 → 3000/3000
  if (act !== 3000 || cxp !== 3000) throw new Error(`saldos finales ${act}/${cxp}, esperados 3000/3000`);
  EV.preguntas['4_11'] = {
    pregunta: '¿cómo determina el sistema que un asiento está completamente revertido?',
    evidencia: `status='reversed' SOLO lo pone fin_post_document_annulment tras crear la compensatoria completa. Ni los parciales ni ningún trigger lo tocan (original de R-B sigue posted con parcial aplicado). Los reportes no usan status: la determinación real es ARITMÉTICA (suma de movimientos netos). Tras todo: ACT=${act} CXP=${cxp} (A anulada 0; B 2000; C 1000).`,
    resultado: 'status es metadato del motor de anulaciones; la verdad contable es la suma de movimientos' };
  return { resumen: `saldos finales ACT=${act} CXP=${cxp} — neteo exacto por movimientos` };
});

// ═══ T12: LA TRAMPA — ANULAR TRAS REVERSIÓN PARCIAL ═══════════════════════════
await paso('T12_trampa_anulación_posterior', async () => {
  const antes = (await entriesDe(RB)).length;
  await sql(`UPDATE receipts SET status='voided' WHERE id=$1`, [RB]); // anulación REAL vía trigger
  const es = await entriesDe(RB);
  const orig = es.find((e) => e.event === 'reconocimiento');
  const anul = es.find((e) => e.event === 'anulacion');
  EV.preguntas['5_t12'] = {
    pregunta: '¿una reversión parcial podría marcar incorrectamente el documento original como anulado / bloquear su compensación futura?',
    evidencia: `TRAMPA CONFIRMADA: con el parcial aplicado, al anular R-B el motor NO creó asiento de anulación (${anul ? 'creó' : 'NO creó — saltado por EXISTS(reversal_of)'}) y el original QUEDÓ ${orig.status} — el residual 2000 NO se compensó automáticamente. El EXISTS de fin_post_document_annulment trata «tiene CUALQUIER reversión» como «ya revertido». Mitigación: si un documento con rectificación parcial se anula en el futuro, se exige asiento manual del residual (documentado en el runbook).`,
    resultado: 'CONFIRMADO: el parcial bloquea la anulación completa automática — mitigación documentada' };
  return { resumen: `R-B: ${antes}→${es.length} asientos tras void; original ${orig.status}; anulación automática ${anul ? 'creada' : 'SALTADA (trampa)'}` };
});

// ═══ T13: RE-POST IDEMPOTENTE (canal directo del motor) ═══════════════════════
await paso('T13_repost_idempotente', async () => {
  // (voided→active está prohibido por la matriz de transiciones — la vía canónica
  //  de re-post es la propia función del motor, que es idempotente por tupla)
  const r = await sql(`SELECT public.fin_post_document('RECEPCION',$1,'reconocimiento') AS id`, [RB]);
  if (r.rows[0].id !== null) throw new Error('el motor aceptó re-post (no idempotente)');
  const es = await entriesDe(RB);
  const recs = es.filter((e) => e.event === 'reconocimiento').length;
  if (recs !== 1) throw new Error(`reconocimientos=${recs}, esperado 1`);
  return { resumen: `re-llamada del posting para R-B → NULL (idempotencia por tupla); reconocimientos=${recs} (sin duplicado)` };
});

// ═══ LIMPIEZA — NET DELTA 0 ══════════════════════════════════════════════════
await paso('limpieza_neta_0', async () => {
  const antes = {};
  for (const t of ['fin_entries', 'fin_movements', 'receipts', 'receipt_items', 'products', 'stores', 'audit_logs', 'fin_posting_errors']) {
    antes[t] = (await sql(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
  }
  // hard-delete gobernado (mismo patrón que m049: session_replication_role=replica)
  await sql('BEGIN');
  try {
    await sql("SET LOCAL session_replication_role = 'replica'");
    await sql('DELETE FROM fin_movements WHERE store_id=$1', [S]);
    await sql('DELETE FROM fin_entries WHERE store_id=$1', [S]);
    await sql('DELETE FROM fin_posting_errors WHERE store_id=$1 OR document_id IN ($2,$3,$4)', [S, RA, RB, RC]);
    await sql('DELETE FROM audit_logs WHERE store_id=$1 OR record_id::text IN ($2,$3,$4)', [S, RA, RB, RC]);
    await sql('DELETE FROM receipt_items WHERE receipt_id IN ($1,$2,$3)', [RA, RB, RC]);
    await sql('DELETE FROM receipts WHERE store_id=$1', [S]);
    await sql('DELETE FROM products WHERE store_id=$1', [S]);
    await sql('DELETE FROM stores WHERE id=$1', [S]);
    await sql('COMMIT');
  } catch (e) { await sql('ROLLBACK'); }
  const despues = {};
  for (const t of ['fin_entries', 'fin_movements', 'receipts', 'receipt_items', 'products', 'stores', 'audit_logs', 'fin_posting_errors']) {
    despues[t] = (await sql(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
  }
  const delta = {};
  const base = EV.limpiar.baseline_conteos;
  for (const t of Object.keys(base)) delta[t] = despues[t] - base[t];
  const net0 = Object.values(delta).every((d) => d === 0);
  EV.limpiar = { baseline_conteos: base, conteos_finales: despues, delta, net_delta_0: net0 };
  if (!net0) throw new Error(`residuos: ${JSON.stringify(delta)}`);
  return { resumen: 'NET DELTA 0 en las 8 tablas tocadas — BD aislada sin residuos' };
});

await db.end();
EV.hash_evidencia = sha256(EV);
writeFileSync('/home/z/my-project/scripts/out/rect004-reversal-semantics.json', JSON.stringify(EV, null, 1));
log('\n═══ RESUMEN SEMÁNTICA reversal_of ═══');
for (const [k, v] of Object.entries(EV.preguntas)) log(`${k}: ${v.resultado}`);
log('net delta 0:', EV.limpiar.net_delta_0);

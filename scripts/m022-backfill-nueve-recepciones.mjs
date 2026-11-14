#!/usr/bin/env node
/**
 * M022 — CP-RECEIPT-INTEGRITY-001 (CIERRE): EXTENSIÓN DEL BACKFILL m020 A LAS
 * NUEVE RECEPCIONES RESTANTES DEL INVENTARIO FORENSE (autorización expresa del
 * propietario, DECISIÓN 5, 2026-11-14).
 *
 * Alcance EXACTO (nueve documentos, ni uno más):
 *   PUERTO PADRE (899d2503-d000-41d2-89f0-0827f4ac37ab):
 *     · 0a133757-48e3-47c5-8055-9e2f45b02b1a (Recibido de JuanCarlos-184)  active
 *     · 2e393c20-e8e4-40a0-ba72-14f5dbfe805f (Almacen Lari)               active
 *     · 5e1b6b87-4123-4b60-8c76-5c9bb09d2a38 (S/N)                          active
 *     · 646be7c5-9d74-47a2-871f-0f1c1f790424 (Recibido de JuanCarlos)       active
 *     · 351fa9fe-dec7-4fcb-8497-9663aadc7349 (Conteo Inv1)                  active
 *   COSTPRO (Prueba) (43a4dabc-b8b4-4b66-82b3-0c75335ca5d1):
 *     · b7f5df9f-e80c-4f7b-9f15-a0878567b66c (REC-PP-001-2026)             active
 *     · 6fb4548d-2277-4652-a164-1aabc6de0727 (IPV-REC-29-06-2026)           active
 *     · a57bd2c1-460b-4877-ab3d-64643bd7e10f (FAC-VERIF-20261106)           active
 *     · a3fe3e76-5ac8-4bf3-b25b-5451e4ea2d8e (FAC-TEST-CP001)               REVERSED
 *
 * La recepción REVERTIDA se contabiliza como ciclo canónico completo:
 * reconocimiento + anulación enlazada (fin_post_document_annulment) → saldo
 * neto 0, fiel a su estado final. NUNCA como si permaneciera activa.
 *
 * ENERVIDA FAC-VITALLCONS-001 (fd9d6c88) YA está contabilizada (m020,
 * 2026-11-14 01:51Z) — NO se re-contabiliza (verificado: asiento=1).
 *
 * Motor canónico: SELECT public.fin_post_document('RECEPCION', id,
 * 'reconocimiento', NULL, actor) — idempotente por (document_id+event+payment_ref),
 * asiento atómico D=C. Documento a documento, verificación posterior de cada uno.
 *
 * Controles de idempotencia (misión §6):
 *   - pre-check: 0 asientos existentes por documento (si ya hay → SKIP documentado)
 *   - post-check: exactamente 1 reconocimiento (+1 anulación para la revertida)
 *   - D=C por asiento, importe = Σ(q·uc·tasa) esperado, 0 filas nuevas en
 *     fin_posting_errors, stock_movements SIN cambios (el backfill no toca inventario)
 *
 * Uso: ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND bun \
 *   scripts/m022-backfill-nueve-recepciones.mjs [--solo-verificar]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const soloVerificar = process.argv.includes('--solo-verificar');

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
assertNotProduction({ mode: 'write', url: SUPABASE_URL, context: 'm022-backfill-nueve-recepciones.mjs' });
if (ref !== 'wthkddeleylijmonclxg') {
  console.error('FALLO DE GUARD: destino no es producción (wthkddeleylijmonclxg)');
  process.exit(2);
}

const ACTOR = 'a1111111-1111-1111-1111-111111111111'; // propietario (delegación expresa de la misión)
const PP = '899d2503-d000-41d2-89f0-0827f4ac37ab';   // PUERTO PADRE (prefijo — se valida contra el id completo)
const DOCS = [
  { id: '0a133757-48e3-47c5-8055-9e2f45b02b1a', tienda: 'PUERTO PADRE', store: '899d2503-d000-41d2-89f0-0827f4ac37ab', doc: 'Recibido de JuanCarlos-184', ciclo: 'reconocimiento' },
  { id: '2e393c20-e8e4-40a0-ba72-14f5dbfe805f', tienda: 'PUERTO PADRE', store: '899d2503-d000-41d2-89f0-0827f4ac37ab', doc: 'Almacen Lari', ciclo: 'reconocimiento' },
  { id: '5e1b6b87-4123-4b60-8c76-5c9bb09d2a38', tienda: 'PUERTO PADRE', store: '899d2503-d000-41d2-89f0-0827f4ac37ab', doc: 'S/N', ciclo: 'reconocimiento' },
  { id: '646be7c5-9d74-47a2-871f-0f1c1f790424', tienda: 'PUERTO PADRE', store: '899d2503-d000-41d2-89f0-0827f4ac37ab', doc: 'Recibido de JuanCarlos', ciclo: 'reconocimiento' },
  { id: '351fa9fe-dec7-4fcb-8497-9663aadc7349', tienda: 'PUERTO PADRE', store: '899d2503-d000-41d2-89f0-0827f4ac37ab', doc: 'Conteo Inv1', ciclo: 'reconocimiento' },
  { id: 'b7f5df9f-e80c-4f7b-9f15-a0878567b66c', tienda: 'COSTPRO (Prueba)', store: '43a4dabc-b8b4-4b66-82b3-0c75335ca5d1', doc: 'REC-PP-001-2026', ciclo: 'reconocimiento' },
  { id: '6fb4548d-2277-4652-a164-1aabc6de0727', tienda: 'COSTPRO (Prueba)', store: '43a4dabc-b8b4-4b66-82b3-0c75335ca5d1', doc: 'IPV-REC-29-06-2026', ciclo: 'reconocimiento' },
  { id: 'a57bd2c1-460b-4877-ab3d-64643bd7e10f', tienda: 'COSTPRO (Prueba)', store: '43a4dabc-b8b4-4b66-82b3-0c75335ca5d1', doc: 'FAC-VERIF-20261106', ciclo: 'reconocimiento' },
  { id: 'a3fe3e76-5ac8-4bf3-b25b-5451e4ea2d8e', tienda: 'COSTPRO (Prueba)', store: '43a4dabc-b8b4-4b66-82b3-0c75335ca5d1', doc: 'FAC-TEST-CP001', ciclo: 'reconocimiento+anulacion' },
];

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

const OUT = resolve('docs/audits/receipt-integrity-20261114');
mkdirSync(OUT, { recursive: true });
const evidencia = { generado: new Date().toISOString(), documentos: [], parado: false };

// ── Estado global antes ──────────────────────────────────────────────────────
const conteoAntes = (await q(`SELECT
  (SELECT count(*) FROM public.fin_entries) AS fin_entries,
  (SELECT count(*) FROM public.fin_entries WHERE document_type='RECEPCION') AS fin_recepcion,
  (SELECT count(*) FROM public.fin_movements) AS fin_movements,
  (SELECT count(*) FROM public.fin_posting_errors) AS fin_posting_errors,
  (SELECT count(*) FROM public.stock_movements) AS stock_movements,
  (SELECT count(*) FROM public.receipt_items) AS receipt_items`))[0];
console.log('CONTEOS ANTES :', JSON.stringify(conteoAntes));
evidencia.conteo_antes = conteoAntes;

// FAC-VITALLCONS-001 intocable (verificación de no-regresión al final)
const fvc = (await q(`SELECT total_cost::float8 AS total, status FROM public.receipts
  WHERE id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63'`))[0];
const fvcAsientos = (await q(`SELECT count(*)::int AS n FROM public.fin_entries
  WHERE document_type='RECEPCION' AND document_id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63'`))[0].n;
console.log(`FAC-VITALLCONS-001 (intocable): total=${fvc.total} status=${fvc.status} asientos=${fvcAsientos}`);
evidencia.fac_vitallcons_antes = { total: fvc.total, status: fvc.status, asientos: fvcAsientos };

let erroresCriticos = 0;

for (const [idx, d] of DOCS.entries()) {
  console.log(`\n── [${idx + 1}/9] ${d.tienda} · ${d.doc} (${d.id.slice(0, 8)}) ciclo=${d.ciclo} ──`);
  const doc = { ...d, fase: 'PRE-CHECK' };

  // PRE-CHECK (criterios de postabilidad)
  const pre = (await q(`SELECT
      rc.id::text, rc.store_id::text, rc.status, rc.document_number, rc.reference_doc,
      rc.total_cost::float8 AS total_cost, rc.reception_date,
      (SELECT count(*)::int FROM public.receipt_items ri WHERE ri.receipt_id=rc.id) AS n_lineas,
      (SELECT coalesce(sum(ri.quantity * ri.unit_cost * coalesce(NULLIF(ri.tasa_cambio_recepcion,0),1)),0)::float8
         FROM public.receipt_items ri WHERE ri.receipt_id=rc.id) AS suma_lineas,
      (SELECT count(*)::int FROM public.receipt_items ri
         WHERE ri.receipt_id=rc.id AND ri.moneda_recepcion <> 'CUP') AS n_no_cup,
      (SELECT count(DISTINCT ri.tasa_cambio_recepcion)::int FROM public.receipt_items ri
         WHERE ri.receipt_id=rc.id) AS tasas_distintas,
      (SELECT count(*)::int FROM public.stock_movements sm
         WHERE sm.movement_type IN ('purchase','purchase_reverse')
           AND (sm.reference_id::text = rc.id::text OR sm.notes LIKE '%' || rc.id::text || '%')) AS n_mov_inv,
      (SELECT count(*)::int FROM public.fin_entries e
         WHERE e.document_type='RECEPCION' AND e.document_id=rc.id) AS n_asientos,
      (SELECT count(*)::int FROM public.fin_posting_errors fpe
         WHERE fpe.document_type='RECEPCION' AND fpe.document_id=rc.id) AS n_errores_previos
    FROM public.receipts rc WHERE rc.id='${d.id}'`))[0];

  if (!pre) { console.log('  ABORT: documento no existe.'); erroresCriticos++; evidencia.parado = true; evidencia.documentos.push(doc); break; }
  Object.assign(doc, { pre });
  const dif = (pre.total_cost - pre.suma_lineas).toFixed(2);

  const criterios = {
    tienda_ok: pre.store_id === d.store,
    estado_ok: pre.status === 'active' || (d.ciclo === 'reconocimiento+anulacion' && pre.status === 'reversed'),
    cabecera_cuadra: Math.abs(dif) <= 0.01,
    monedas_ok: pre.n_no_cup === 0,
    tasa_unica: pre.tasas_distintas === 1,
    inventario_ok: pre.n_mov_inv === pre.n_lineas,
    sin_asientos_previos: pre.n_asientos === 0,
    sin_errores_previos: pre.n_errores_previos === 0,
  };
  const todoOk = Object.values(criterios).every(Boolean);
  console.log(`  PRE: estado=${pre.status} líneas=${pre.n_lineas} total=${pre.total_cost} Σ(q·uc·tasa)=${pre.suma_lineas} dif=${dif} | inv=${pre.n_mov_inv}/${pre.n_lineas} | asientos previos=${pre.n_asientos}`);
  console.log(`  criterios: ${JSON.stringify(criterios)}`);
  doc.criterios = criterios;

  if (!todoOk) {
    console.log('  SKIP documentado (criterio incumplido) — NO se contabiliza en este lote.');
    doc.skip = true;
    evidencia.documentos.push(doc);
    continue;
  }

  if (soloVerificar) { doc.solo_verificar = true; evidencia.documentos.push(doc); continue; }

  // EJECUCIÓN — reconocimiento (idempotente por diseño)
  const postRes = await mgmt(`SELECT public.fin_post_document('RECEPCION', '${d.id}', 'reconocimiento', NULL, '${ACTOR}') AS entry_id`);
  if (!postRes.ok) {
    console.log(`  FALLO reconocimiento: ${postRes.text.slice(0, 250)}`);
    doc.error = postRes.text.slice(0, 250); erroresCriticos++;
    evidencia.documentos.push(doc);
    break; // parada inmediata ante error inesperado
  }
  const entryId = JSON.parse(postRes.text)[0].entry_id;
  console.log(`  EJECUCIÓN reconocimiento → entry_id=${entryId ? entryId.slice(0, 8) : 'NULL (idempotente: ya existía)'}`);
  doc.entry_reconocimiento = entryId;

  // Anulación enlazada SOLO para la recepción revertida (ciclo canónico)
  if (d.ciclo === 'reconocimiento+anulacion') {
    const annRes = await mgmt(`SELECT public.fin_post_document_annulment('RECEPCION', '${d.id}') AS anulaciones`);
    if (!annRes.ok) {
      console.log(`  FALLO anulación: ${annRes.text.slice(0, 250)}`);
      doc.error_anulacion = annRes.text.slice(0, 250); erroresCriticos++;
      evidencia.documentos.push(doc);
      break;
    }
    doc.anulaciones = JSON.parse(annRes.text)[0].anulaciones;
    console.log(`  EJECUCIÓN anulación canónica → ${doc.anulaciones} asiento(s) compensatorio(s) enlazado(s)`);
  }

  // POST-CHECK (verificación posterior del lote unitario)
  // reversal_of se consulta DIRECTO en BD (el snapshot no lo trae).
  const post = (await q(`SELECT
      e.id::text, e.event, e.status, e.payment_ref::text, e.economic_date::text,
      e.rule_version_id::text, e.movements_snapshot, e.reversal_of::text,
      (SELECT count(*)::int FROM public.fin_movements m WHERE m.entry_id=e.id) AS n_movs,
      (SELECT coalesce(sum(m.amount),0)::float8 FROM public.fin_movements m WHERE m.entry_id=e.id AND m.sense='debito') AS debitos,
      (SELECT coalesce(sum(m.amount),0)::float8 FROM public.fin_movements m WHERE m.entry_id=e.id AND m.sense='credito') AS creditos
    FROM public.fin_entries e
    WHERE e.document_type='RECEPCION' AND e.document_id='${d.id}'
    ORDER BY e.posted_at`));
  doc.post = post;
  const recEntry = post.find((e) => e.event === 'reconocimiento');
  const checks = {
    un_reconocimiento: post.filter((e) => e.event === 'reconocimiento').length === 1,
    monto_ok: recEntry ? Math.abs(recEntry.debitos - pre.suma_lineas) <= 0.01 : false,
    balance_ok: post.every((e) => Math.abs(e.debitos - e.creditos) <= 0.01),
    regla_ok: recEntry ? recEntry.rule_version_id && recEntry.rule_version_id.startsWith('dd429aab') : false,
  };
  if (d.ciclo === 'reconocimiento+anulacion') {
    const ann = post.find((e) => e.event === 'anulacion');
    const rec = post.find((e) => e.event === 'reconocimiento');
    checks.una_anulacion = post.filter((e) => e.event === 'anulacion').length === 1;
    checks.anulacion_enlazada = !!ann && !!ann.reversal_of && !!rec && ann.reversal_of === rec.id;
    checks.neto_cero = Math.abs(
      post.filter((e) => e.event === 'reconocimiento').reduce((s, e) => s + e.debitos, 0) -
      post.filter((e) => e.event === 'anulacion').reduce((s, e) => s + e.debitos, 0)) <= 0.01;
  }
  const postOk = Object.values(checks).every(Boolean);
  console.log(`  POST: ${post.length} asiento(s) → ${post.map((e) => `${e.event}(${e.status}) D=${e.debitos} C=${e.creditos}`).join(' | ')}`);
  console.log(`  verificación: ${JSON.stringify(checks)} → ${postOk ? 'OK' : 'FALLO'}`);
  doc.checks = checks;
  if (!postOk) erroresCriticos++;
  evidencia.documentos.push(doc);
  if (!postOk) break; // no continuar al siguiente documento ante error crítico
}

// ── IDEMPOTENCIA (re-publicación de una muestra → sin asientos nuevos) ──────
if (!soloVerificar) {
  const muestra = DOCS[0].id;
  const antesM = (await q(`SELECT count(*)::int AS n FROM public.fin_entries WHERE document_type='RECEPCION' AND document_id='${muestra}'`))[0].n;
  const re = await mgmt(`SELECT public.fin_post_document('RECEPCION', '${muestra}', 'reconocimiento', NULL, '${ACTOR}') AS entry_id`);
  const despuesM = (await q(`SELECT count(*)::int AS n FROM public.fin_entries WHERE document_type='RECEPCION' AND document_id='${muestra}'`))[0].n;
  const reId = re.ok ? JSON.parse(re.text)[0].entry_id : 'ERROR';
  evidencia.idempotencia = { muestra, asientos_antes: antesM, asientos_despues: despuesM, entry_id_devuelta: reId };
  console.log(`\nIDEMPOTENCIA (${muestra.slice(0, 8)}): ${antesM} → ${despuesM} asientos (debe ser iguales; entry_id devuelta: ${reId})`);
}

// ── Estado global después ───────────────────────────────────────────────────
const conteoDespues = (await q(`SELECT
  (SELECT count(*) FROM public.fin_entries) AS fin_entries,
  (SELECT count(*) FROM public.fin_entries WHERE document_type='RECEPCION') AS fin_recepcion,
  (SELECT count(*) FROM public.fin_movements) AS fin_movements,
  (SELECT count(*) FROM public.fin_posting_errors) AS fin_posting_errors,
  (SELECT count(*) FROM public.stock_movements) AS stock_movements,
  (SELECT count(*) FROM public.receipt_items) AS receipt_items`))[0];
console.log('\nCONTEOS DESPUÉS:', JSON.stringify(conteoDespues));
evidencia.conteo_despues = conteoDespues;
evidencia.deltas = {
  fin_entries: conteoDespues.fin_entries - conteoAntes.fin_entries,
  fin_recepcion: conteoDespues.fin_recepcion - conteoAntes.fin_recepcion,
  fin_movements: conteoDespues.fin_movements - conteoAntes.fin_movements,
  fin_posting_errors: conteoDespues.fin_posting_errors - conteoAntes.fin_posting_errors,
  stock_movements: conteoDespues.stock_movements - conteoAntes.stock_movements,
  receipt_items: conteoDespues.receipt_items - conteoAntes.receipt_items,
};

// FAC-VITALLCONS-001 sin cambios
const fvc2 = (await q(`SELECT total_cost::float8 AS total, status FROM public.receipts
  WHERE id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63'`))[0];
const fvcAsientos2 = (await q(`SELECT count(*)::int AS n FROM public.fin_entries
  WHERE document_type='RECEPCION' AND document_id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63'`))[0].n;
evidencia.fac_vitallcons_despues = { total: fvc2.total, status: fvc2.status, asientos: fvcAsientos2 };
const fvcIntacta = JSON.stringify(evidencia.fac_vitallcons_antes) === JSON.stringify(evidencia.fac_vitallcons_despues);
console.log(`FAC-VITALLCONS-001 tras backfill: total=${fvc2.total} status=${fvc2.status} asientos=${fvcAsientos2} → ${fvcIntacta ? 'INTACTA (OK)' : 'CAMBIÓ (FALLO)'}`);

// ── Resumen ─────────────────────────────────────────────────────────────────
const ok = erroresCriticos === 0
  && evidencia.deltas.fin_posting_errors === 0
  && evidencia.deltas.stock_movements === 0
  && evidencia.deltas.receipt_items === 0
  && fvcIntacta
  && evidencia.deltas.fin_entries === (soloVerificar ? 0 : 10);
console.log('\n════ RESUMEN M022 ════');
console.log(`deltas: ${JSON.stringify(evidencia.deltas)}`);
console.log(`errores críticos: ${erroresCriticos}`);
console.log(`RESULTADO: ${ok ? 'OK — backfill completo y verificado' : 'FALLO — revisar expediente'}`);
evidencia.resultado_ok = ok;

writeFileSync(resolve(OUT, 'm022-backfill-nueve-recepciones.json'), JSON.stringify(evidencia, null, 2));
console.log(`evidencia → ${OUT}/m022-backfill-nueve-recepciones.json`);
if (!ok) process.exit(9);

#!/usr/bin/env node
// F8/F9 — CP-FIN-FINAL-EXECUTION-001: verificador INDEPENDIENTE de la estructura
// contabilizada de ENERVIDA: re-deriva el plan motor-exacto (fin_compute_metrics
// + fin_apply_templates + regla activa) para CADA asiento publicado y compara
// la serialización hash v4 plan vs real (control #12), partida doble D=C exacta,
// conteos y sumas por tipo. SOLO LECTURA.
import { readFileSync, writeFileSync } from 'fs';
import { createHash } from 'node:crypto';
import { resolve } from 'path';
import { assertNotProduction } from './lib/assert-not-production.mjs';
const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
assertNotProduction({ mode: 'read-only', url: SUPABASE_URL, context: 'verificador read-only de la misión CP-FIN' });
if (ref !== 'wthkddeleylijmonclxg') { console.error('FALLO DE GUARD: destino no es producción'); process.exit(2); }
function assertReadOnly(query) {
  const n = query.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!n.startsWith('select') && !n.startsWith('with')) throw new Error('READ-ONLY GUARD');
  if (/\b(insert|update|delete|drop|alter|truncate|grant|revoke|copy|vacuum|analyze|notify|merge)\s/.test(n)) throw new Error('READ-ONLY GUARD: comando prohibido');
  return query;
}
async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: assertReadOnly(sql) }),
  });
  const t = await res.text();
  if (!res.ok) throw new Error(`(HTTP ${res.status}) ${t.slice(0, 400)}`);
  return JSON.parse(t || '[]');
}

const ENER = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const numCent = (v) => (Math.round(Number(v ?? 0) * 100) / 100).toFixed(2);
// Orden canónico determinista de movimientos (los id de fin_movements son UUID
// aleatorios: no codifican el orden de plantilla; se ordena por estructura).
const ordenCanonico = (a, b) => `${a.categoria}|${a.sentido}|${numCent(a.importe_cup)}|${a.moneda}|${a.moneda_origen ?? '-'}`
  .localeCompare(`${b.categoria}|${b.sentido}|${numCent(b.importe_cup)}|${b.moneda}|${b.moneda_origen ?? '-'}`);
const serMov = (m) => `MOV|${m.categoria}|${m.sentido}|${numCent(m.importe_origen)}|${numCent(m.importe_cup)}|${m.moneda}|${m.moneda_origen}`;
const serAsiento = (a) => [`ASIENTO|${a.tipo}|${a.doc_id}|${a.evento}|${a.payment_ref ?? '-'}|${a.regla ?? '-'}`,
  ...(a.movimientos || []).slice().sort(ordenCanonico).map(serMov)].join('|') + '\n';

// 1 · asientos publicados de ENERVIDA + movimientos reales
const reales = await q(`SELECT e.id AS entry_id, e.document_type AS tipo, e.document_id AS doc_id, e.event AS evento,
    e.payment_ref, (rv.id::text) AS rule_id, rv.version,
    (SELECT jsonb_agg(jsonb_build_object('categoria', m.category_code, 'sentido', m.sense,
      'importe_origen', m.amount, 'importe_cup', m.amount_cup, 'moneda', m.currency, 'moneda_origen', m.currency_origin)
      ORDER BY m.id) AS movimientos
    FROM public.fin_movements m WHERE m.entry_id = e.id) AS movimientos
  FROM public.fin_entries e
  LEFT JOIN public.fin_rule_versions rv ON rv.id = e.rule_version_id
  WHERE e.store_id = '${ENER}'
  ORDER BY e.document_id, e.event, e.payment_ref NULLS LAST`);
console.log('asientos publicados ENERVIDA:', reales.length,
  '· movimientos:', reales.reduce((s, e) => s + (e.movimientos || []).length, 0));

// 2 · plan motor-exacto re-derivado (bulk con LATERAL)
const idsLista = reales.map(r => `('${r.tipo}'::text,'${r.doc_id}'::uuid,'${r.evento}'::text,${r.payment_ref ? `'${r.payment_ref}'::uuid` : 'NULL::uuid'})`).join(',');
const planes = await q(`WITH ent AS (SELECT * FROM (VALUES ${idsLista}) AS v(tipo, doc_id, evento, payment_ref)),
regla AS (SELECT DISTINCT ON (document_type) document_type AS tipo, id::text AS rid, version, movements
  FROM public.fin_rule_versions WHERE status='active' ORDER BY document_type, store_id NULLS LAST)
SELECT ent.tipo, ent.doc_id::text AS doc_id, ent.evento, ent.payment_ref::text AS payment_ref,
  regla.rid, regla.version,
  mm.metrics AS metrics, public.fin_apply_templates(regla.movements, ent.evento, mm.metrics) AS movs_plan
FROM ent JOIN regla ON regla.tipo = ent.tipo
CROSS JOIN LATERAL (SELECT public.fin_compute_metrics(ent.tipo, ent.doc_id, ent.evento, ent.payment_ref) AS metrics) mm`);

const planPorClave = new Map(planes.map(p => [`${p.tipo}|${p.doc_id}|${p.evento}|${p.payment_ref ?? '-'}`, p]));

// 3 · comparación asiento a asiento (plan vs real) + partida doble
const hashPlan = createHash('sha256');
const hashReal = createHash('sha256');
const diferencias = [];
const desbalanceados = [];
const porTipo = {};
for (const e of reales) {
  const clave = `${e.tipo}|${e.doc_id}|${e.evento}|${e.payment_ref ?? '-'}`;
  const p = planPorClave.get(clave);
  const movsPlan = (p ? p.movs_plan : []).map(m => ({ categoria: m.categoria, sentido: m.sentido, importe_origen: Number(m.amount), importe_cup: Number(m.amount), moneda: 'CUP', moneda_origen: m.currency_origin || null }));
  const movsReal = (e.movimientos || []).map(m => ({ categoria: m.categoria, sentido: m.sentido, importe_origen: Number(m.importe_origen), importe_cup: Number(m.importe_cup), moneda: m.moneda, moneda_origen: m.moneda_origen }));
  const aPlan = { tipo: e.tipo, doc_id: e.doc_id, evento: e.evento, payment_ref: e.payment_ref, regla: p ? `${p.rid.slice(0, 8)}:v${p.version}` : '-', movimientos: movsPlan };
  const aReal = { tipo: e.tipo, doc_id: e.doc_id, evento: e.evento, payment_ref: e.payment_ref, regla: e.rule_id ? `${e.rule_id.slice(0, 8)}:v${e.version}` : '-', movimientos: movsReal };
  hashPlan.update(serAsiento(aPlan));
  hashReal.update(serAsiento(aReal));
  if (serAsiento(aPlan) !== serAsiento(aReal)) {
    diferencias.push({ clave, plan: serAsiento(aPlan).slice(0, 300), real: serAsiento(aReal).slice(0, 300) });
  }
  const d = movsReal.filter(m => m.sentido === 'debito').reduce((s, m) => s + m.importe_cup, 0);
  const c = movsReal.filter(m => m.sentido === 'credito').reduce((s, m) => s + m.importe_cup, 0);
  if (Math.round((d - c) * 100) !== 0) desbalanceados.push({ clave, d, c });
  const t = (porTipo[e.tipo] ||= { asientos: 0, movimientos: 0, debitos: 0, creditos: 0 });
  t.asientos++; t.movimientos += movsReal.length;
  t.debitos += d; t.creditos += c;
}
const hp = hashPlan.digest('hex');
const hr = hashReal.digest('hex');

// 4 · errores de contabilización ENERVIDA (control #9)
const errores = await q(`SELECT count(*) AS n FROM public.fin_posting_errors WHERE store_id='${ENER}'`);

console.log('\npor tipo documental:');
for (const [tipo, t] of Object.entries(porTipo)) {
  console.log(`  ${tipo.padEnd(20)} asientos=${t.asientos} movs=${t.movimientos} ΣD=${numCent(t.debitos)} ΣC=${numCent(t.creditos)} ${Math.abs(t.debitos - t.creditos) < 0.005 ? '✓' : '✗'}`);
}
console.log(`\nHASH v4 plan (re-derivado):  ${hp}`);
console.log(`HASH v4 real (contabilizado): ${hr}`);
console.log('hash plan == hash real:', hp === hr ? 'SÍ ✓ (control #12)' : 'NO ✗');
console.log('asientos con estructura ≠ plan:', diferencias.length, diferencias.length ? JSON.stringify(diferencias.slice(0, 3), null, 1) : '');
console.log('asientos con D≠C exacto:', desbalanceados.length);
console.log('fin_posting_errors ENERVIDA:', errores[0].n);
const ok = hp === hr && diferencias.length === 0 && desbalanceados.length === 0 && errores[0].n === 0;
console.log('\nVERIFICACIÓN GLOBAL:', ok ? 'TODO OK' : 'FALLOS PRESENTES');
writeFileSync(resolve('/home/z/my-project/mission/f8-verify-todos.json'), JSON.stringify({
  generado: new Date().toISOString(), hash_plan: hp, hash_real: hr, coinciden: hp === hr,
  asientos: reales.length, movimientos: reales.reduce((s, e) => s + (e.movimientos || []).length, 0),
  diferencias, desbalanceados, por_tipo: porTipo, fin_posting_errors: errores[0].n,
}, null, 2));
process.exit(ok ? 0 : 6);

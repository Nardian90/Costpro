#!/usr/bin/env node
// ============================================================================
// M108b — CP-FIN-OPENING-BALANCES-AND-CASH-RECONCILIATION-015 · PRE-LIMPIEZA
// BD AISLADA CostproE2E (lguovmvrozxgssupkwpf) — re-ejecutable.
// Contexto (reanudación 2026-11-18, protocolo 11f): la sesión anterior quedó
// cortada tras --setup de una ITERACIÓN ANTIGUA de m108 que además contabilizó
// 4 ventas (una con bug de secuencia: S3 sin débito de caja) y aplicó ~13 veces
// la migración en desarrollo → filas v2 duplicadas (ON CONFLICT no dispara con
// store_id NULL). Este script deja el aislado limpio ANTES de re-ejecutar la
// batería m108 con el diseño final:
//   F1  borrado del fixture (segmento 0e15, incl. auth user creado 17:34 por
//       la sesión cortada, email e2e015-fresh@costpro.test) + NET DELTA=0
//   F2  dedup de reglas v2 globales INACTIVAS (se conserva exactamente la
//       UNA activa por document_type; uq_fin_rules_one_active es el árbitro)
//   F3  verificación: 1 activa VENTA v2 + 1 activa FLUJO_CAJA v2 + v1 intacta
// Guard assert-not-production: modo write solo contra el aislado.
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const E2E = 'lguovmvrozxgssupkwpf';
const OUT = 'scripts/out/m015';
const MISION = 'CP-FIN-OPENING-BALANCES-AND-CASH-RECONCILIATION-015';
const F = {
  store: '0e15a000-0000-4000-8000-000000000001',
  user: '0e15b000-0000-4000-8000-000000000001',
};

const ENV = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) ENV[m[1]] = m[2].trim();
}
const TOKEN = ENV.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) throw new Error('SUPABASE_ACCESS_TOKEN ausente en .env');

async function q(sql, label, expectFail = false) {
  assertNotProduction({ mode: 'write', projectRef: E2E, context: `m108b:${label}` });
  const res = await fetch(`https://api.supabase.com/v1/projects/${E2E}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    if (expectFail) return { __error: text };
    throw new Error(`[${label}] HTTP ${res.status}: ${text.slice(0, 600)}`);
  }
  return JSON.parse(text || '[]');
}
const results = { mision: MISION, script: 'm108b-preclean', fases: [], generado: '' };
function fase(n, nombre, ok, detalle) {
  results.fases.push({ fase: n, nombre, ok, detalle });
  console.log(`${ok ? 'PASS' : 'FAIL'} · F${n} ${nombre} · ${detalle}`);
  if (!ok) { save(); throw new Error(`Fase F${n} fallida`); }
}
function save() {
  results.generado = new Date().toISOString();
  mkdirSync(resolve(process.cwd(), OUT), { recursive: true });
  writeFileSync(resolve(process.cwd(), `${OUT}/preclean-resultados.json`), JSON.stringify(results, null, 1));
}
const one = (rows, k) => rows[0]?.[k];
const N = (v) => Number(v);

console.log('══ Estado pre ══');
const pre = (await q(`SELECT
  (SELECT count(*) FROM public.fin_entries WHERE store_id='${F.store}') ents,
  (SELECT count(*) FROM public.fin_movements WHERE store_id='${F.store}') movs,
  (SELECT count(*) FROM public.transactions WHERE store_id='${F.store}') txs,
  (SELECT count(*) FROM public.cash_flow_documents WHERE store_id='${F.store}') cfs,
  (SELECT count(*) FROM public.fin_opening_balances WHERE store_id='${F.store}') obs,
  (SELECT count(*) FROM public.products WHERE store_id='${F.store}') prods,
  (SELECT count(*) FROM public.stores WHERE id='${F.store}') stores,
  (SELECT count(*) FROM public.profiles WHERE id='${F.user}') profs,
  (SELECT count(*) FROM auth.users WHERE id='${F.user}') ausers,
  (SELECT count(*) FROM public.audit_logs WHERE store_id='${F.store}') audits,
  (SELECT count(*) FROM public.fin_posting_errors WHERE store_id='${F.store}') perrs,
  (SELECT count(*) FROM public.fin_rule_versions WHERE version=2 AND status='inactive' AND store_id IS NULL) v2dup`, 'pre'));
console.log('Pre:', JSON.stringify(pre[0]));

console.log('══ F1 · borrado del fixture (segmento 0e15) vía RPC oficiales E2E ══');
// e2e_hard_delete_store/user: mecanismo oficial del repo (desactiva triggers
// user-level, activa app.restore_mode LOCAL y guarda patrones de test).
// Guardas: store 'E2E-015-CAJA-USD' ~ ^E2E; user ~ @costpro.test.
await q(`
BEGIN;
SELECT public.e2e_hard_delete_store('${F.store}');
SELECT public.e2e_hard_delete_user('${F.user}');
DELETE FROM public.store_exchange_rates WHERE store_id='${F.store}';
-- Cobertura explícita de las tablas CP-FIN (por si el RPC no las cubre;
-- idempotente: 0 filas si ya fueron borradas)
DELETE FROM public.fin_movements WHERE store_id='${F.store}';
DELETE FROM public.fin_entries WHERE store_id='${F.store}';
DELETE FROM public.fin_opening_balances WHERE store_id='${F.store}';
DELETE FROM public.fin_posting_errors WHERE store_id='${F.store}';
DELETE FROM public.audit_logs WHERE store_id='${F.store}';
COMMIT;`, 'wipe_fixture');

const post1 = (await q(`SELECT
  (SELECT count(*) FROM public.fin_entries WHERE store_id='${F.store}') ents,
  (SELECT count(*) FROM public.fin_movements WHERE store_id='${F.store}') movs,
  (SELECT count(*) FROM public.transactions WHERE store_id='${F.store}') txs,
  (SELECT count(*) FROM public.cash_flow_documents WHERE store_id='${F.store}') cfs,
  (SELECT count(*) FROM public.fin_opening_balances WHERE store_id='${F.store}') obs,
  (SELECT count(*) FROM public.products WHERE store_id='${F.store}') prods,
  (SELECT count(*) FROM public.stores WHERE id='${F.store}') stores,
  (SELECT count(*) FROM public.profiles WHERE id='${F.user}') profs,
  (SELECT count(*) FROM auth.users WHERE id='${F.user}') ausers,
  (SELECT count(*) FROM public.audit_logs WHERE store_id='${F.store}') audits,
  (SELECT count(*) FROM public.fin_posting_errors WHERE store_id='${F.store}') perrs`, 'post1'));
const p1 = post1[0];
const ok1 = Object.values(p1).every((v) => N(v) === 0);
fase(1, 'fixture_borrado_NET_DELTA_0', ok1, JSON.stringify(p1));

console.log('══ F2 · dedup de v2 globales inactivas ══');
if (N(one(pre, 'v2dup')) > 0) {
  const del = await q(`DELETE FROM public.fin_rule_versions
    WHERE version = 2 AND status = 'inactive' AND store_id IS NULL
      AND document_type IN ('VENTA', 'FLUJO_CAJA') RETURNING id;`, 'dedup_v2');
  console.log(`  eliminadas ${del.length} filas v2 inactivas duplicadas`);
} else {
  console.log('  sin duplicados que eliminar');
}
fase(2, 'dedup_v2_inactivas', true, `eliminadas ${N(one(pre, 'v2dup')) > 0 ? '(ver F1 log)' : 0} · pre=${one(pre, 'v2dup')}`);

console.log('══ F3 · verificación del motor de reglas ══');
const rv = (await q(`SELECT document_type, version, status, count(*) n
  FROM public.fin_rule_versions
  WHERE document_type IN ('VENTA', 'FLUJO_CAJA') AND store_id IS NULL
  GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;`, 'reglas'));
const activa = (dt) => rv.filter((r) => r.document_type === dt && r.status === 'active').map((r) => ({ v: r.version, n: N(r.n) }));
const ok3 = activa('VENTA').length === 1 && activa('VENTA')[0].v === 2 && activa('VENTA')[0].n === 1
  && activa('FLUJO_CAJA').length === 1 && activa('FLUJO_CAJA')[0].v === 2 && activa('FLUJO_CAJA')[0].n === 1;
fase(3, 'una_v2_activa_por_doctype', ok3, JSON.stringify(rv));
save();
console.log('PRECLEAN COMPLETO — aislado limpio y motor listo para m108');

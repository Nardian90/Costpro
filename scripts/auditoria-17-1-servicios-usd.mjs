#!/usr/bin/env node
/**
 * §17.1 — Auditoría técnica READ-ONLY del módulo Servicios Recibidos (2026-11-13)
 * ==========================================================================
 * Objetivo: dimensionar y documentar el defecto §17.1 del expediente CP-FIN:
 *   update_payment_status guarda paid_amount = SUM(amount_cup) (CUP) mientras
 *   el guard prevent_received_service_edit compara contra total_amount (divisa
 *   del documento) → servicios en divisa quedan inalterables / mal clasificados.
 *
 * RESTRICCIONES (autorización del propietario):
 *   · Solo lectura sobre producción (Management API /database/query).
 *   · NINGUNA escritura: no INSERT/UPDATE/DELETE/DDL. El script incluye un
 *     bloqueador estático de sentencias no-SELECT (fail-closed).
 *
 * Consultas:
 *   Q1: versiones vigentes de las funciones implicadas (pg_get_functiondef).
 *   Q2: inventario de servicios por moneda (activos/voided, paid_status).
 *   Q3: consistencia paid_amount vs moneda del documento:
 *         paid_amount_en_divisa_esperada = SUM(amount) para pagos en la divisa
 *         del doc; paid_amount guardado = SUM(amount_cup).
 *   Q4: servicios en divisa CON pagos (los bloqueados por ERR_TOTAL_BELOW_PAID).
 *   Q5: pagos de servicios en divisa con currency ≠ doc currency.
 *   Q6: clasificación incorrecta de payment_status (paid real vs guardado).
 *   Q7: receipts (misma función, rama 'receipt'): same check para contexto.
 *   Q8: conteo global para el informe.
 *
 * Uso: ALLOW_PROD=read-only node scripts/auditoria-17-1-servicios-usd.mjs
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// GUARD (CP-INFRA-019): lectura de producción exige el flag explícito.
import { assertNotProduction } from './lib/assert-not-production.mjs';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
assertNotProduction({ mode: 'read-only', url: SUPABASE_URL, context: 'auditoria-17-1-servicios-usd.mjs' });
if (ref !== 'wthkddeleylijmonclxg') {
  console.error('FALLO DE GUARD: destino no es producción (wthkddeleylijmonclxg)');
  process.exit(2);
}

async function mgmt(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

// ── Bloqueador estático de escrituras (fail-closed) ─────────────────────────
function assertReadOnly(query) {
  const normalized = query.replace(/\s+/g, ' ').trim().toLowerCase();
  const forbidden = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|set|call|copy|vacuum|analyze|notify|merge)\b/;
  // permitimos 'create' solo dentro de strings? No: este script jamás lo usa.
  if (!normalized.startsWith('select') && !normalized.startsWith('with')) {
    throw new Error('READ-ONLY GUARD: la consulta no empieza por SELECT/WITH');
  }
  if (forbidden.test(normalized)) {
    throw new Error('READ-ONLY GUARD: sentencia contiene comando prohibido: ' + normalized.slice(0, 120));
  }
  return query;
}

async function q(name, query) {
  assertReadOnly(query);
  const r = await mgmt(query);
  if (!r.ok) { console.error(`QUERY FAILED [${name}]`, r.status, r.text.slice(0, 500)); process.exit(4); }
  const rows = JSON.parse(r.text);
  console.log(`\n── ${name} (${rows.length} filas) ──`);
  console.log(JSON.stringify(rows, null, 2).slice(0, 6000));
  return rows;
}

console.log('§17.1 — Auditoría técnica READ-ONLY · producción ' + ref);
console.log('Modo: solo lectura (sin escrituras). Hora: ' + new Date().toISOString());

// ── Q1: versiones vigentes de las funciones ────────────────────────────────
await q('Q1a. update_payment_status (rama service, ¿guarda SUM(amount_cup)?)', `
SELECT CASE WHEN pg_get_functiondef('public.update_payment_status()'::regprocedure) LIKE '%SUM(amount_cup)%' THEN 'SI: v_paid=SUM(amount_cup) → paid_amount en CUP' ELSE 'NO' END AS defecto_paid_cup
`);

await q('Q1b. prevent_received_service_edit (regla 4: compara en divisa?)', `
SELECT CASE WHEN pg_get_functiondef('public.prevent_received_service_edit()'::regprocedure) LIKE '%ERR_TOTAL_BELOW_PAID%' THEN 'SI: guard compara total_amount(divisa) vs paid_amount(CUP)' ELSE 'NO' END AS guard_mezcla_monedas
`);

// ── Q2: inventario de servicios por moneda ────────────────────────────────
await q('Q2. received_services: servicios por moneda × estado × payment_status', `
SELECT currency, status, payment_status, count(*)::int AS n,
       round(avg(total_amount),2) AS avg_total, round(avg(paid_amount),2) AS avg_paid
FROM public.received_services
GROUP BY currency, status, payment_status
ORDER BY currency, status, payment_status
`);

// ── Q3: consistencia paid_amount vs moneda del documento ──────────────────
await q('Q3. Inconsistencia moneda: paid_amount (CUP) guardado vs pagos en divisa del doc', `
SELECT rs.currency, count(*)::int AS servicios_con_pagos,
       sum(CASE WHEN rs.paid_amount = p.pagos_cup THEN 0 ELSE 1 END)::int AS paid_amount_discrepa,
       round(sum(p.pagos_cup),2) AS total_pagos_cup,
       round(sum(p.pagos_divisa),2) AS total_pagos_divisa,
       round(sum(rs.total_amount),2) AS total_docs_divisa
FROM public.received_services rs
JOIN LATERAL (
  SELECT COALESCE(SUM(pt.amount_cup),0) AS pagos_cup,
         COALESCE(SUM(pt.amount) FILTER (WHERE pt.currency = rs.currency),0) AS pagos_divisa
  FROM public.payment_transactions pt
  WHERE pt.ref_type='service' AND pt.ref_id = rs.id
) p ON true
WHERE rs.currency <> 'CUP' AND p.pagos_cup > 0
GROUP BY rs.currency
`);

// ── Q4: servicios en divisa CON pagos (candidatos a bloqueados) ────────────
await q('Q4. Servicios divisa con pagos: ¿paid_amount > total_amount → bloqueados para edición?', `
SELECT rs.id, rs.service_number, rs.currency, rs.status, rs.payment_status,
       rs.total_amount AS total_divisa, round(rs.paid_amount,2) AS paid_guardado_cup,
       round((SELECT COALESCE(SUM(pt.amount),0) FROM public.payment_transactions pt
              WHERE pt.ref_type='service' AND pt.ref_id=rs.id AND pt.currency=rs.currency),2) AS pagos_en_divisa,
       (SELECT count(*)::int FROM public.payment_transactions pt
        WHERE pt.ref_type='service' AND pt.ref_id=rs.id) AS n_pagos,
       CASE WHEN rs.paid_amount > rs.total_amount THEN 'BLOQUEADO (paid CUP > total divisa)' ELSE 'no bloqueado por regla 4' END AS diagnostico
FROM public.received_services rs
WHERE rs.currency <> 'CUP'
  AND rs.paid_amount > 0
ORDER BY rs.service_date DESC
`);

// ── Q5: pagos en divisa distinta a la del documento ────────────────────────
await q('Q5. payment_transactions de servicios: moneda del pago vs moneda del doc', `
SELECT rs.currency AS moneda_doc, pt.currency AS moneda_pago, count(*)::int AS n_pagos,
       round(sum(pt.amount),2) AS sum_amount, round(sum(pt.amount_cup),2) AS sum_amount_cup
FROM public.payment_transactions pt
JOIN public.received_services rs ON rs.id = pt.ref_id
WHERE pt.ref_type='service'
GROUP BY rs.currency, pt.currency
ORDER BY rs.currency, pt.currency
`);

// ── Q6: clasificación incorrecta de payment_status ────────────────────────
await q('Q6. Servicios divisa con payment_status mal computado (comparación CUP vs divisa)', `
SELECT rs.id, rs.service_number, rs.currency, rs.payment_status AS estado_guardado,
       round(rs.total_amount,2) AS total_divisa,
       round((SELECT COALESCE(SUM(pt.amount),0) FROM public.payment_transactions pt
              WHERE pt.ref_type='service' AND pt.ref_id=rs.id AND pt.currency=rs.currency),2) AS pagos_divisa,
       CASE
         WHEN (SELECT COALESCE(SUM(pt.amount),0) FROM public.payment_transactions pt
               WHERE pt.ref_type='service' AND pt.ref_id=rs.id AND pt.currency=rs.currency) >= rs.total_amount THEN 'paid'
         WHEN (SELECT COALESCE(SUM(pt.amount),0) FROM public.payment_transactions pt
               WHERE pt.ref_type='service' AND pt.ref_id=rs.id AND pt.currency=rs.currency) > 0 THEN 'partial'
         ELSE 'unpaid'
       END AS estado_correcto
FROM public.received_services rs
WHERE rs.currency <> 'CUP' AND rs.status='active'
  AND rs.payment_status <> (
    CASE
      WHEN (SELECT COALESCE(SUM(pt.amount),0) FROM public.payment_transactions pt
            WHERE pt.ref_type='service' AND pt.ref_id=rs.id AND pt.currency=rs.currency) >= rs.total_amount THEN 'paid'
      WHEN (SELECT COALESCE(SUM(pt.amount),0) FROM public.payment_transactions pt
            WHERE pt.ref_type='service' AND pt.ref_id=rs.id AND pt.currency=rs.currency) > 0 THEN 'partial'
      ELSE 'unpaid'
    END)
`);

// ── Q7: receipts (misma función, rama 'receipt') para contexto ─────────────
// receipts NO tiene columna currency: total_cost ya está en CUP-equivalente y
// amount_cup es CUP → la rama 'receipt' NO padece la mezcla de monedas.
await q('Q7. receipts con pagos (contexto: rama receipt opera en CUP, sin mezcla)', `
SELECT count(*)::int AS receipts_con_pagos,
       sum(CASE WHEN r.paid_amount > r.total_cost THEN 1 ELSE 0 END)::int AS paid_mayor_total
FROM public.receipts r
WHERE r.paid_amount > 0
`);

// ── Q8: conteos globales para el informe ───────────────────────────────────
await q('Q8. Conteos globales', `
SELECT
  (SELECT count(*)::int FROM public.received_services) AS servicios_total,
  (SELECT count(*)::int FROM public.received_services WHERE currency <> 'CUP') AS servicios_divisa,
  (SELECT count(*)::int FROM public.received_services WHERE currency <> 'CUP' AND paid_amount > 0) AS divisa_con_pagos,
  (SELECT count(*)::int FROM public.received_services WHERE currency <> 'CUP' AND paid_amount > total_amount) AS bloqueados_estimados,
  (SELECT count(*)::int FROM public.payment_transactions WHERE ref_type='service') AS pagos_servicios,
  (SELECT count(*)::int FROM public.payment_transactions WHERE ref_type='service' AND currency <> 'CUP') AS pagos_servicios_divisa
`);

console.log('\nAUDITORÍA READ-ONLY COMPLETADA — sin escrituras.');

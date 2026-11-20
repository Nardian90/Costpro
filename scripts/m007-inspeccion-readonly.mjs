/**
 * ADN-SERVICES-RECEIVED-HISTORICAL-SETTLEMENT-007 — ETAPA 2 (§4.1.4-6)
 * Inspección READ-ONLY en PRODUCCIÓN de los 21 registros objetivo.
 * Guard CP-INFRA-019: mode 'read' → exige ALLOW_PROD=read-only.
 * Idempotente y re-ejecutable (solo SELECT).
 *
 * Salida: scripts/out/007-liquidacion/inspeccion-inicial.json + tabla consola.
 * Uso: ALLOW_PROD=read-only node scripts/m007-inspeccion-readonly.mjs
 */
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const REPO = '/home/z/my-project/Costpro';
const OUT = '/home/z/my-project/scripts/out/007-liquidacion';
mkdirSync(OUT, { recursive: true });

const env = {};
for (const l of readFileSync(resolve(REPO, '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];

// GUARD (CP-INFRA-019): lectura de producción exige ALLOW_PROD=read-only.
assertNotProduction({ mode: 'read', url: SUPABASE_URL, context: 'm007-inspeccion-readonly.mjs' });
if (ref !== 'wthkddeleylijmonclxg') {
  console.error('FALLO: destino no es producción'); process.exit(2);
}

async function mgmt(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

// 20 pendientes + 1 especial (SRV-20261116-00139) — §1/§3 de la misión
const NUMS = [
  'SRV-20261104-00114','SRV-20261103-00113','SRV-20261102-00112','SRV-20261031-00111',
  'SRV-20261030-00110','SRV-20261029-00109','SRV-20261028-00108','SRV-20261027-00107',
  'SRV-20261026-00106','SRV-20261025-00105','SRV-20261024-00104','SRV-20261023-00103',
  'SRV-20261022-00102','SRV-20261021-00101','SRV-20261020-00100','SRV-20261019-00099',
  'SRV-20261018-00098','SRV-20261017-00097','SRV-20261016-00096','SRV-20261010-00095',
  'SRV-20261116-00139',
];
const numList = NUMS.map((n) => `'${n}'`).join(',');

const results = {};

// 1) Estado de los 21 documentos
results.servicios = await mgmt(`SELECT id, store_id, service_number, service_date, service_type_name,
  supplier, currency, exchange_rate, total_amount, status,
  payment_status, payment_method, paid_amount, paid_at, due_date,
  left(coalesce(observations,''), 120) AS observations_head, length(coalesce(observations,'')) AS obs_len,
  created_at, updated_at
  FROM received_services WHERE service_number IN (${numList}) ORDER BY service_number;`);

// 2) Pagos existentes vinculados a esos servicios (idempotencia §4.2)
results.pagos = await mgmt(`SELECT pt.id, pt.store_id, pt.ref_type, pt.ref_id, rs.service_number,
  pt.amount, pt.currency, pt.exchange_rate, pt.amount_cup, pt.payment_method, pt.payment_date,
  pt.reference, pt.notes, pt.paid_by, pt.idempotency_key, pt.direction
  FROM payment_transactions pt
  LEFT JOIN received_services rs ON rs.id = pt.ref_id
  WHERE pt.ref_type='service' AND pt.ref_id IN
    (SELECT id FROM received_services WHERE service_number IN (${numList}))
  ORDER BY rs.service_number, pt.payment_date;`);

// 3) Asientos CP-FIN de esos documentos
results.asientos = await mgmt(`SELECT e.id, e.document_id, rs.service_number, e.event, e.status,
  e.economic_date, e.payment_ref, e.document_number, e.posted_at, e.reversal_of
  FROM fin_entries e
  LEFT JOIN received_services rs ON rs.id = e.document_id
  WHERE e.document_type='SERVICIO_RECIBIDO' AND e.document_id IN
    (SELECT id FROM received_services WHERE service_number IN (${numList}))
  ORDER BY rs.service_number, e.event, e.posted_at;`);

// 4) Errores de contabilización pendientes que afecten a estos docs
results.fin_errors = await mgmt(`SELECT pe.id, pe.document_type, pe.document_id, pe.event,
  pe.error_code, left(pe.error_detail, 160) AS error_detail, pe.attempts, pe.resolved_at, pe.created_at
  FROM fin_posting_errors pe
  WHERE pe.document_type='SERVICIO_RECIBIDO' AND pe.document_id IN
    (SELECT id FROM received_services WHERE service_number IN (${numList}));`);

// 5) Contexto: tienda(s) de los documentos y fecha de negocio actual Habana
results.contexto = await mgmt(`SELECT
  (SELECT name FROM stores WHERE id = (SELECT store_id FROM received_services WHERE service_number='SRV-20261018-00098')) AS tienda_muestra,
  (SELECT now() AT TIME ZONE 'America/Havana') AS ahora_habana,
  (SELECT count(*) FROM received_services WHERE service_number IN (${numList})) AS encontrados;`);

// 6) paid_by de referencia: admin demo (actor propietario)
results.actor = await mgmt(`SELECT id, email FROM profiles WHERE email='admin@demo.com' LIMIT 1;`);

writeFileSync(`${OUT}/inspeccion-inicial.json`, JSON.stringify(results, null, 2));

// Consola resumida
console.log('=== SERVICIOS (21 esperados) ===');
for (const s of results.servicios) {
  console.log(`${s.service_number} | ${s.service_date} | ${s.service_type_name?.slice(0,10)} | ${String(s.supplier).slice(0,18).padEnd(18)} | ${s.total_amount} ${s.currency} | doc:${s.status} pago:${s.payment_status} (${s.paid_amount}) met:${s.payment_method || '—'} paid_at:${s.paid_at ? s.paid_at.slice(0,10) : '—'} obs:${s.obs_len}`);
}
console.log('=== PAGOS EXISTENTES ===', results.pagos.length);
for (const p of results.pagos) {
  console.log(`${p.service_number} | ${p.amount} ${p.currency} | ${p.payment_method} | ${p.payment_date?.slice(0,16)} | key:${p.idempotency_key || '—'} | notes:${(p.notes||'').slice(0,40)}`);
}
console.log('=== ASIENTOS ===', results.asientos.length);
for (const a of results.asientos) {
  console.log(`${a.service_number} | ${a.event} | ${a.status} | eco:${a.economic_date} | payref:${a.payment_ref ? 'si' : '—'}`);
}
console.log('=== FIN ERRORS ===', results.fin_errors.length);
console.log('=== CONTEXTO ===', JSON.stringify(results.contexto[0]));
console.log('=== ACTOR ===', JSON.stringify(results.actor[0] || null));

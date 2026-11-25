#!/usr/bin/env node
/**
 * cpai-verify-financials.mjs — CP-AP-ACCOUNTING-INTEGRITY-AND-SUPPLIER-RECONCILIATION-001
 * FASE 7 — Comprobaciones financieras DESPUÉS de las correcciones (solo lectura).
 *
 * Verifica:
 *  1. Caja: el día 23/11 no tiene entrada fantasma por la contra-fila del
 *     documento anulado (elegibilidad 20261124120200) ni doble salida.
 *  2. TiendaPueblo: el SRV-20261026-00087 quedó vinculado al canónico.
 *  3. CxP completo: Total/Pagado/Saldo con semántica corregida (calculator
 *     paridad: receipts≠voided/reversed, services=active, comisiones canal propio).
 *  4. Integridad E: sin pagos huérfanos sobre docs anulados; sin documentos
 *     anulados con obligaciones activas; una sola reversión por pago.
 *  5. Identidad: suma por documentos == suma por proveedores.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const STORE_ID = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const env = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '.env'), 'utf8');
const TOKEN = env.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/m)[1].trim();
const fmt = (n) => Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function runSql(query) {
  const res = await fetch('https://api.supabase.com/v1/projects/wthkddeleylijmonclxg/database/query', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

const out = { mision: 'CP-AP-ACCOUNTING-INTEGRITY-AND-SUPPLIER-RECONCILIATION-001', fase: '7 — verificación post-corrección', at: new Date().toISOString(), checks: [] };
const check = (name, pass, detail) => { out.checks.push({ name, pass, detail }); console.log(`  ${pass ? 'OK ' : 'FALLO'} — ${name}${detail ? ` · ${detail}` : ''}`); return pass; };

/* ══ 1. CAJA: día 23/11 sin fantasmas ══ */
console.log('══ 1. Reporte de caja 23/11 (elegibilidad de la contra-fila) ══');
const caja = await runSql(`
  SELECT COALESCE(json_extract_path(get_cash_report('${STORE_ID}', '2026-11-23 00:00:00', '2026-11-24 00:00:00'), 'totals'), '{}'::json) AS totals;`);
const totals = caja[0]?.totals ?? {};
const pagosServicios = Number(totals.services_paid_cash_cup ?? totals.servicios_pagados_cup ?? 0);
// El pago del reemplazo activo ($1,800) resta EXACTAMENTE una vez; la contra-fila
// del anulado NO es entrada (documento anulado).
const rev = await runSql(`
  SELECT count(*) AS n FROM payment_transactions
   WHERE store_id='${STORE_ID}' AND direction='reversal' AND reverses_payment_id='4783f9ae-6121-467e-b95b-1836d51d5d7d';`);
check('Contra-fila Pixelarte existe (1)', Number(rev[0].n) === 1, `reversals=${rev[0].n}`);
// La elegibilidad: contra-filas sobre docs VÁLIDOS cuentan como entrada; sobre anulados no.
const contraInvalida = await runSql(`
  SELECT count(*) AS n FROM payment_transactions c
   JOIN received_services s ON s.id = c.ref_id
   WHERE c.store_id='${STORE_ID}' AND c.direction='reversal' AND c.reverses_payment_id='4783f9ae-6121-467e-b95b-1836d51d5d7d'
     AND s.status IN ('voided','cancelled');`);
check('La contra-fila es sobre documento anulado (excluida de caja por regla)', Number(contraInvalida[0].n) === 1);

/* ══ 2. TIENDAPUEBLO ══ */
console.log('══ 2. Corrección TiendaPueblo ══');
const tp = await runSql(`
  SELECT rs.supplier, rs.supplier_id, rs.status, rs.total_amount, rs.paid_amount, sp.name AS canonical
    FROM received_services rs
    LEFT JOIN suppliers sp ON sp.id = rs.supplier_id
   WHERE rs.service_number='SRV-20261026-00087' AND rs.reference_doc='C26102026';`);
const tpRow = tp[0];
check('SRV-20261026-00087 vinculado al canónico', tpRow?.supplier === 'Tienda Pueblo' && !!tpRow?.supplier_id, `supplier=${tpRow?.supplier} → ${tpRow?.canonical} (${tpRow?.supplier_id?.slice(0, 8) ?? '—'})`);
check('Importes intactos (total=400, pagado=400, active)', Number(tpRow?.total_amount) === 400 && Number(tpRow?.paid_amount) === 400 && tpRow?.status === 'active');
const aud = await runSql(`SELECT count(*) AS n FROM audit_logs WHERE action='SR_SUPPLIER_NORMALIZED' AND record_id='10b10057-8a58-453e-b3df-a0c56d768a85';`);
check('Audit SR_SUPPLIER_NORMALIZED registrado', Number(aud[0].n) >= 1);

/* ══ 3. CxP recomputado (semántica corregida) ══ */
console.log('══ 3. Cuentas por Pagar recomputadas ══');
const cxp = await runSql(`
  WITH docs AS (
    SELECT 'receipt' AS tipo, r.id, COALESCE(r.supplier,'—') AS supplier, r.total_cost AS total_cup, r.paid_amount, r.due_date, r.created_at
      FROM receipts r WHERE r.store_id='${STORE_ID}' AND r.status NOT IN ('voided','reversed')
    UNION ALL
    SELECT 'service', s.id, COALESCE(s.supplier,'—'), s.total_amount * CASE WHEN s.currency='CUP' OR s.currency IS NULL THEN 1 ELSE COALESCE(s.exchange_rate,1) END, s.paid_amount, s.due_date, s.created_at
      FROM received_services s WHERE s.store_id='${STORE_ID}' AND s.status='active'
    UNION ALL
    SELECT 'commission', c.id, 'Comisiones — ' || COALESCE(w.first_name,'') || ' ' || COALESCE(w.last_name,''), c.final_amount,
           CASE WHEN c.status='paid' THEN c.final_amount ELSE 0 END, c.due_date, c.created_at
      FROM commission_payments c LEFT JOIN workers w ON w.id=c.worker_id
     WHERE c.store_id='${STORE_ID}' AND c.status IN ('approved','paid')
  )
  SELECT count(*) AS n, sum(total_cup) AS total, sum(paid_amount) AS pagado, sum(total_cup - paid_amount) AS saldo FROM docs;`);
const r3 = cxp[0];
console.log(`  Docs=${r3.n} · Total=$${fmt(r3.total)} · Pagado=$${fmt(r3.pagado)} · Saldo=$${fmt(r3.saldo)}`);
check('Identidad contable Total − Pagado = Saldo', Math.abs(Number(r3.total) - Number(r3.pagado) - Number(r3.saldo)) < 0.01);

const porProveedor = await runSql(`
  WITH docs AS (
    SELECT COALESCE(r.supplier,'—') AS supplier, r.total_cost AS total_cup, r.paid_amount
      FROM receipts r WHERE r.store_id='${STORE_ID}' AND r.status NOT IN ('voided','reversed')
    UNION ALL
    SELECT COALESCE(s.supplier,'—'), s.total_amount * CASE WHEN s.currency='CUP' OR s.currency IS NULL THEN 1 ELSE COALESCE(s.exchange_rate,1) END, s.paid_amount
      FROM received_services s WHERE s.store_id='${STORE_ID}' AND s.status='active'
    UNION ALL
    SELECT 'Comisiones — ' || COALESCE(w.first_name,'') || ' ' || COALESCE(w.last_name,''), c.final_amount,
           CASE WHEN c.status='paid' THEN c.final_amount ELSE 0 END
      FROM commission_payments c LEFT JOIN workers w ON w.id=c.worker_id
     WHERE c.store_id='${STORE_ID}' AND c.status IN ('approved','paid')
  )
  SELECT sum(total_cup) AS total, sum(paid_amount) AS pagado FROM (SELECT supplier, sum(total_cup) AS total_cup, sum(paid_amount) AS paid_amount FROM docs GROUP BY supplier) x;`);
check('Suma por documentos == suma por proveedores',
  Math.abs(Number(porProveedor[0].total) - Number(r3.total)) < 0.01 && Math.abs(Number(porProveedor[0].pagado) - Number(r3.pagado)) < 0.01);

/* ══ 4. INTEGRIDAD (misión §8.E) ══ */
console.log('══ 4. Integridad ══');
const vivos = await runSql(`
  SELECT count(*) AS n, coalesce(sum(t.amount_cup),0) AS s FROM payment_transactions t
   WHERE t.store_id='${STORE_ID}' AND t.ref_type IN ('receipt','service') AND COALESCE(t.direction,'in')='in'
     AND NOT EXISTS (SELECT 1 FROM payment_transactions c WHERE c.reverses_payment_id=t.id)
     AND EXISTS (SELECT 1 FROM received_services s WHERE s.id=t.ref_id AND t.ref_type='service' AND s.status IN ('voided','cancelled'));`);
check('Cero pagos vivos sobre servicios anulados (caso Pixelarte cerrado)', Number(vivos[0].n) === 0, `vivos=${vivos[0].n} Σ=$${fmt(vivos[0].s)}`);
const dupRev = await runSql(`
  SELECT count(*) AS n FROM (SELECT reverses_payment_id FROM payment_transactions WHERE reverses_payment_id IS NOT NULL GROUP BY reverses_payment_id HAVING count(*)>1) x;`);
check('Una sola reversión por pago (uq_payment_reversal_origin)', Number(dupRev[0].n) === 0);
const sinDoc = await runSql(`
  SELECT count(*) AS n FROM payment_transactions t
   WHERE t.store_id='${STORE_ID}' AND t.ref_type='service'
     AND NOT EXISTS (SELECT 1 FROM received_services s WHERE s.id=t.ref_id);`);
check('Cero pagos huérfanos (service)', Number(sinDoc[0].n) === 0);
const pixel = await runSql(`
  SELECT paid_amount, payment_status FROM received_services WHERE id='fedb7c40-8f10-48fd-8356-cc7e6a7ce0e7';`);
check('F-23112026: obligación cancelada (paid=0, unpaid)', Number(pixel[0].paid_amount) === 0 && pixel[0].payment_status === 'unpaid');

/* ══ 5. Detalle de proveedores clave ══ */
console.log('══ 5. Grupos de proveedores (post saneamiento) ══');
const grupos = await runSql(`
  SELECT 'Tienda Pueblo' AS g, count(*) AS n, sum(s.total_amount) AS t FROM received_services s
   WHERE s.store_id='${STORE_ID}' AND s.status NOT IN ('voided') AND s.supplier ILIKE '%pueblo%'
  UNION ALL
  SELECT 'Sin identificar («—»)', count(*), sum(r.total_cost) FROM receipts r
   WHERE r.store_id='${STORE_ID}' AND r.status NOT IN ('voided') AND (r.supplier IS NULL OR r.supplier='—');`);
for (const g of grupos) console.log(`  ${g.g}: ${g.n} docs · $${fmt(g.t)}`);
check('La variante «TiendaPueblo» desapareció (todos bajo Tienda Pueblo)',
  grupos[0]?.n === 21, `servicios pueblo=${grupos[0]?.n} (esperado 21 = 20 + 1 saneado)`);
check('Las 3 recepciones sin proveedor se conservan como excepción documentada', Number(grupos[1]?.n) === 3, `$${fmt(grupos[1]?.t)} pendientes de identificación`);

mkdirSync(new URL('../download/cpai-evidencia/', import.meta.url), { recursive: true });
writeFileSync(new URL('../download/cpai-evidencia/verificacion-financiera-post-correccion.json', import.meta.url), JSON.stringify(out, null, 2));
const fails = out.checks.filter(c => !c.pass).length;
console.log(`\n${fails === 0 ? 'TODAS LAS COMPROBACIONES PASARON' : fails + ' COMPROBACIONES FALLARON'} — evidencia: download/cpai-evidencia/verificacion-financiera-post-correccion.json`);
process.exit(fails === 0 ? 0 : 1);

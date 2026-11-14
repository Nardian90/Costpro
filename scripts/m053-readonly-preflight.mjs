#!/usr/bin/env node
// ============================================================================
// M053 — CP-FIN-FINAL-CLOSE-005 · §8 MISIÓN: VERIFICACIÓN FINAL DE SOLO LECTURA
// (pre-flight del runbook RECT004, actualizado al momento de la revisión).
// ============================================================================
// Compara el snapshot congelado de RECT004 (commiteado en el expediente) con
// una extracción NUEVA de m050b (scripts/out/rect004-faseDP-snapshot.json,
// re-ejecutado read-only contra producción). Si TODAS las secciones congeladas
// son hash-idénticas, el pre-flight del runbook sigue VIGENTE y la propuesta
// RECT-1/RECT-2 no requiere recálculo (misión 005 §8).
//
// SOLO LECTURA: este script no toca ninguna base de datos; compara dos JSON.
// La extracción fresca la produce m050b (READ-ONLY ESTRICTO, Management API
// SELECT, guard de ref de producción).
// Uso: node scripts/m053-readonly-preflight.mjs [snapshot_referencia] [snapshot_fresco]
// ============================================================================
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const REF = process.argv[2] || resolve('docs/audits/valuation-rectification-release-gate-004/rect004-faseDP-snapshot.json');
const FRESH = process.argv[3] || '/home/z/my-project/scripts/out/rect004-faseDP-snapshot.json';
const OUT = process.argv[4] || resolve('docs/audits/valuation-rectification-final-close-005/preflight-readonly-evidencia.json');

const FROZEN = ['receipts_fvc', 'receipt_items_111_112', 'products_111_112', 'fin_entries_fvc',
  'fin_movements_fvc', 'fin_movements_cxp_fvc', 'kardex_111_112', 'receipts_proveedor',
  'payment_transactions_fvc_proveedor', 'receipt_items', 'issue_slip_items', 'issue_slips_111_112',
  'inventory_111_112', 'wac_change_log', 'fin_entries_vales_sku', 'fin_entries_vales_num',
  'fin_movements_gas_vales', 'reconstruccion_kardex', 'fin_movements_cogs_ventas',
  'fin_movements_act_ventas', 'v_cxp_proveedor', 'fin_opening_balances'];

const old = JSON.parse(readFileSync(REF, 'utf8'));
const fresh = JSON.parse(readFileSync(FRESH, 'utf8'));
const sha = (o) => createHash('sha256').update(JSON.stringify(o)).digest('hex');

const resultado = {
  mision: 'CP-FIN-FINAL-CLOSE-005',
  script: 'm053-readonly-preflight.mjs',
  fecha: new Date().toISOString(),
  comparacion: {
    referencia: { archivo: REF, extraccion: old.extraccion?.fecha_utc },
    fresco: { archivo: FRESH, extraccion: fresh.extraccion?.fecha_utc },
  },
  secciones: {},
  veredicto: null,
};

let allOk = true;
let comparadas = 0;
for (const k of FROZEN) {
  const ho = old.hashes?.[k] ?? (old[k] !== undefined ? sha(old[k]) : undefined);
  const hn = fresh.hashes?.[k] ?? (fresh[k] !== undefined ? sha(fresh[k]) : undefined);
  if (ho === undefined && hn === undefined) continue; // sección ausente en ambos
  comparadas += 1;
  const same = ho === hn;
  allOk = allOk && same;
  resultado.secciones[k] = same ? 'IDÉNTICA' : 'CAMBIADA';
}
resultado.secciones_comparadas = comparadas;
resultado.veredicto = allOk
  ? 'PRE-FLIGHT VIGENTE — todas las secciones congeladas idénticas; la propuesta RECT-1 (151.299.851 CUP) y RECT-2 (24 CUP) NO requiere recálculo'
  : 'HAY DIFERENCIAS — recalcular la propuesta y actualizar el runbook antes de solicitar autorización';

// Controles puntuales del pre-flight (misión §8)
const fvc = fresh.receipts_fvc?.[0] || {};
resultado.controles = {
  fvc_activa: fvc.status === 'active',
  fvc_total: Number(fvc.total_cost),
  fvc_payment_status: fvc.payment_status,
  lineas_fvc: fresh.receipt_items?.length,
  pagos_fvc_proveedor: fresh.payment_transactions_fvc_proveedor?.length,
  reversiones_fvc: (fresh.fin_entries_fvc || []).filter((e) => e.reversal_of).length,
  asientos_fvc: (fresh.fin_entries_fvc || []).map((e) => `${e.event}:${e.status}`),
  kardex_111_112_filas: (fresh.kardex_111_112 || []).length,
  kardex_nuevos_post_corte: (fresh.kardex_111_112_post_corte ?? fresh.post_corte?.kardex ?? 0),
  stocks_111_112: (fresh.products_111_112 || []).map((p) => ({ sku: p.sku, stock: p.stock_current, wac: p.cost_average })),
  cogs_motor_7: fresh.cogs_ventas?.total_gas_costo_ventas,
};

writeFileSync(OUT, JSON.stringify(resultado, null, 2));
console.log(`M053 — pre-flight read-only: ${resultado.veredicto}`);
console.log(`Evidencia: ${OUT}`);
if (!allOk) process.exit(1);

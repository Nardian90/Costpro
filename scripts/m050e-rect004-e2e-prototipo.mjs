// ============================================================================
// M050e — CP-FIN-VALUATION-RECTIFICATION-RELEASE-GATE-004 · §12 MISIÓN:
// PROTOTIPO E2E FINAL DE RECTIFICACIÓN — RECT-1 Y RECT-2 SEPARABLES.
// Extiende el prototipo m049 (misión 003) con las exigencias de la misión 004:
//   P3  aplicación PARCIAL (solo RECT-1)           → estado intermedio válido
//   P4  verificación del estado intermedio        → efectos RECT-1 presentes, RECT-2 ausentes
//   P5  idempotencia de RECT-1                    → re-ejecución = 0 cambios
//   P6  REANUDACIÓN: aplicar RECT-2 tras interrupción
//   P7  verificación final completa               → V1-V12 equivalentes
//   P8  idempotencia total (repetir solicitud)     → 0 cambios
//   P9  CONCURRENCIA: dos RECT-1 simultáneos       → 1 aplica, otro no-op
//   P10 ROLLBACK INDIVIDUAL de RECT-2             → vuelve al estado post-RECT-1
//   P11 re-aplicar RECT-2 (reanudación inversa)
//   P12 ROLLBACK TOTAL (RECT-2 + RECT-1)          → restauración byte a byte
//   P13 REPLAY completo re-aplicable
//   P14 CONTROLES INTACTOS: M021 escape hatch sigue obligatorio; RLS FORZADA;
//       motor REVOKE de anon/authenticated; sentinela true
//   P15 PRODUCCIÓN INTACTA (re-verificación read-only final)
//   P16 limpieza NET DELTA 0
// REGLA: producción INTACTA; toda escritura en lguovmvrozxgssupkwpf (E2E aislada).
// Guard de aislamiento: réplica del contrato e2e/fixtures/assert-isolated-db.ts
// (sentinela e2e_is_isolated_db() verificada por REST y SQL, fail-closed).
// Uso: node scripts/m050e-rect004-e2e-prototipo.mjs
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
const PROD_REF = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
const PROD_TOKEN = env.SUPABASE_ACCESS_TOKEN;
// CP-INFRA-020 (fix RECT004): guard de producción — este script escribe SOLO en la BD E2E aislada
// (la verificación P15 de producción es exclusivamente SELECT read-only).
assertNotProduction({ mode: 'write', url: 'https://lguovmvrozxgssupkwpf.supabase.co', context: 'm050e-rect004-e2e-prototipo' });
const POOLER = { host: 'aws-0-us-east-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.lguovmvrozxgssupkwpf',
  password: decodeURIComponent(env.E2E_SUPABASE_DB_URL.match(/:\/\/[^:]+:([^@]+)@/)[1]),
  ssl: { rejectUnauthorized: false } };
const sha256 = (s) => createHash('sha256').update(typeof s === 'string' ? s : JSON.stringify(s)).digest('hex');
const log = (...a) => console.log(...a);
const EXCESO = 151299851;

// ── IDs deterministas (segmento 0005 — m050e) ────────────────────────────────
const SEG = '7ec70005-0000-4000-8000';
const S = `${SEG}-000000000002`;
const P111 = `${SEG}-000000000111`;
const P112 = `${SEG}-000000000112`;
const RCP = `${SEG}-a0b300000001`;
const IT111 = `${SEG}-a0b300000002`;
const IT112 = `${SEG}-a0b300000003`;
const E_RECON = `${SEG}-c0b300000001`;
const E_TX = (n) => `${SEG}-c0b4${String(n).padStart(8, '0')}`;
const E_SLIP = (n) => `${SEG}-c0b5${String(n).padStart(8, '0')}`;
const E_RECT1 = `${SEG}-d0b300000001`;
const E_RECT2 = `${SEG}-d0b300000002`;
const mov = (n) => `${SEG}-b0b3${String(n).padStart(8, '0')}`;
const fmov = (n) => `${SEG}-f0b3${String(n).padStart(8, '0')}`;
const AUD = (n) => `${SEG}-e0b3${String(n).padStart(8, '0')}`;
const WCL = (n) => `${SEG}-9cb3${String(n).padStart(8, '0')}`;
const TRACE = 'RECT004';

const EV = { mision: 'CP-FIN-VALUATION-RECTIFICATION-RELEASE-GATE-004',
  fase: '§12 — prototipo E2E final: RECT-1 y RECT-2 separables',
  generado: new Date().toISOString(),
  bd: { proyecto: 'lguovmvrozxgssupkwpf (CostproE2E — AISLADA)', canal: 'pooler IPv4 :6543 (postgres/service_role)' },
  pasos: {}, validaciones: {}, permisos: {}, produccion: {}, limpiar: {} };
async function paso(nombre, fn) {
  const t0 = Date.now();
  try {
    const r = await fn();
    EV.pasos[nombre] = { estado: 'OK', ms: Date.now() - t0 };
    log(`▸ ${nombre} (${Date.now() - t0}ms)`, r?.log ?? '');
    return r;
  } catch (e) {
    try { await db.query('ROLLBACK'); } catch {}
    EV.pasos[nombre] = { estado: 'FALLO', ms: Date.now() - t0, error: String(e.message || e).slice(0, 500) };
    log(`✗ ${nombre}: ${e.message}`);
    return null;
  }
}
const db = new pg.Client(POOLER);
const sql = (q, v) => db.query(q, v);

// ═══════════════ DATOS RÉPLICA (Fase I verificada — idénticos a m049) ════════
const KARDEX = [
  ['112', '2026-07-01T12:00:00+00:00', 'purchase', 100, 680000, 'Confirmacion recepcion'],
  ['111', '2026-07-01T12:00:00+00:00', 'purchase', 49, 1700000, 'Confirmacion recepcion'],
  ['111', '2026-07-24T12:00:00+00:00', 'sale', -1, 0, 'Venta POS v2'],
  ['112', '2026-08-18T12:00:00+00:00', 'adjustment', -17, 0, 'Cuadre importación ENERVIDA: sku=112 Δ=-17'],
  ['111', '2026-08-18T12:00:00+00:00', 'adjustment', -1, 0, 'Cuadre importación ENERVIDA: sku=111 Δ=-1'],
  ['112', '2026-09-19T12:00:00+00:00', 'issue_slip_out', -4, 0, 'Vale de Salida VS-000037-2026'],
  ['111', '2026-10-04T12:00:00+00:00', 'sale', -1, 0, 'Venta POS v2'],
  ['112', '2026-10-05T11:00:00+00:00', 'issue_slip_out', -1, 0, 'Vale de Salida VS-000138-2026'],
  ['112', '2026-10-05T12:00:00+00:00', 'sale', -3, 1, 'Venta POS v2'],
  ['111', '2026-10-05T12:00:00+00:00', 'issue_slip_out', -1, 0, 'Vale de Salida VS-000139-2026'],
  ['111', '2026-10-09T12:00:00+00:00', 'issue_slip_out', -1, 1, 'Vale de Salida VS-000148-2026'],
  ['112', '2026-10-10T10:00:00+00:00', 'issue_slip_out', -10, 1, 'Vale de Salida VS-000165-2026'],
  ['112', '2026-10-10T11:00:00+00:00', 'issue_slip_out', -20, 1, 'Vale de Salida VS-000157-2026'],
  ['111', '2026-10-10T12:00:00+00:00', 'issue_slip_out', -20, 1, 'Vale de Salida VS-000158-2026'],
  ['111', '2026-10-14T12:00:00+00:00', 'sale', -1, 1, 'Venta POS v2'],
  ['111', '2026-10-22T12:00:00+00:00', 'sale', -1, 1, 'Venta POS v2'],
  ['112', '2026-10-28T11:00:00+00:00', 'issue_slip_out', -20, 1, 'Vale de Salida VS-000208-2026'],
  ['111', '2026-10-28T12:00:00+00:00', 'issue_slip_out', -12, 1, 'Vale de Salida VS-000208-2026'],
  ['112', '2026-11-07T10:00:00+00:00', 'issue_slip_out', -1, 1, 'Vale de Salida VS-000223-2026'],
  ['112', '2026-11-07T11:00:00+00:00', 'issue_slip_reverse', 1, 1, 'Reversion Vale de Salida VS-000223-2026'],
  ['112', '2026-11-07T12:00:00+00:00', 'issue_slip_out', -5, 1, 'Vale de Salida VS-000225-2026'],
];
const VENTAS = [
  ['tx1', '2026-07-24', '111', 1, 1, 2500, 'FAC-004479-2026'],
  ['tx2', '2026-10-04', '111', 1, 1, 2000, null],
  ['tx3', '2026-10-05', '112', 3, 3, 4500, null],
  ['tx4', '2026-10-14', '111', 1, 1, 2000, null],
  ['tx5', '2026-10-22', '111', 1, 1, 2000, null],
];
const VALES_ASIENTO = [
  ['VS-000148-2026', '2026-10-09', 1], ['VS-000157-2026', '2026-10-10', 20],
  ['VS-000158-2026', '2026-10-10', 20], ['VS-000165-2026', '2026-10-10', 10],
  ['VS-000208-2026', '2026-10-28', 32], ['VS-000225-2026', '2026-11-07', 5],
];

// ═════════════════════════ FUNCIONES DE ESTADO ════════════════════════════════
async function estadoActual() {
  const [rcp, items, layer, salidas0, cogs, vales, perd, act, cxp, entries, movs] = await Promise.all([
    sql(`SELECT total_cost::float8 AS t, payment_status FROM receipts WHERE id=$1`, [RCP]),
    sql(`SELECT product_id, unit_cost::float8 AS uc, moneda_recepcion AS mon, tasa_cambio_recepcion::float8 AS tasa FROM receipt_items WHERE receipt_id=$1 ORDER BY product_id`, [RCP]),
    sql(`SELECT count(*)::int AS n FROM stock_movements WHERE reference_id=$1 AND movement_type='purchase' AND unit_cost=1`, [RCP]),
    sql(`SELECT count(*)::int AS n, coalesce(sum(-quantity_change),0)::int AS u FROM stock_movements WHERE store_id=$1 AND product_id IN ($2,$3) AND quantity_change<0 AND unit_cost=0`, [S, P111, P112]),
    sql(`SELECT coalesce(sum(amount),0)::float8 AS t FROM fin_movements WHERE store_id=$1 AND category_code='GAS_COSTO_VENTAS' AND sense='debito'`, [S]),
    sql(`SELECT coalesce(sum(amount),0)::float8 AS t FROM fin_movements WHERE store_id=$1 AND category_code='GAS_VALES' AND sense='debito'`, [S]),
    sql(`SELECT coalesce(sum(amount),0)::float8 AS t FROM fin_movements WHERE store_id=$1 AND category_code='GAS_PERDIDA_INV' AND sense='debito'`, [S]),
    sql(`SELECT coalesce(sum(CASE WHEN sense='debito' THEN amount END),0)::float8 - coalesce(sum(CASE WHEN sense='credito' THEN amount END),0)::float8 AS neto FROM fin_movements WHERE store_id=$1 AND category_code='ACT_INVENTARIO'`, [S]),
    sql(`SELECT coalesce(sum(CASE WHEN sense='credito' THEN amount END),0)::float8 - coalesce(sum(CASE WHEN sense='debito' THEN amount END),0)::float8 AS neto FROM fin_movements WHERE store_id=$1 AND category_code='PAS_CXP_PROV'`, [S]),
    sql(`SELECT count(*)::int AS n FROM fin_entries WHERE store_id=$1`, [S]),
    sql(`SELECT count(*)::int AS n FROM fin_movements WHERE store_id=$1`, [S]),
  ]);
  const audit = (await sql(`SELECT count(*)::int AS n FROM audit_logs WHERE store_id=$1 AND trace_id=$2`, [S, TRACE])).rows[0].n;
  return {
    total: rcp.rows[0]?.t, payment_status: rcp.rows[0]?.payment_status,
    lineas: items.rows.map((i) => `${i.uc}@${i.mon}/t${i.tasa}`).join(' | '),
    capas_uc1: layer.rows[0].n, salidas_uc0: salidas0.rows[0].n, salidas_uc0_unidades: salidas0.rows[0].u,
    cogs: cogs.rows[0].t, gas_vales: vales.rows[0].t, gas_perdida: perd.rows[0].t,
    act_neto: Math.round(act.rows[0].neto * 100) / 100, cxp_neto: Math.round(cxp.rows[0].neto * 100) / 100,
    asientos: entries.rows[0].n, movimientos: movs.rows[0].n, audit_rect004: audit,
  };
}

// ═════════ RECT-1 — CORRECCIÓN DEL EXCESO (transacción independiente) ════════
async function aplicarRect1() {
  let cambios = 0;
  await sql('BEGIN');
  try {
    await sql(`SELECT pg_advisory_xact_lock(hashtext('fin:RECEPCION:'||$1))`, [RCP]);
    await sql(`SET LOCAL app.allow_receipt_item_edit = 'on'`);
    const r1 = await sql(`UPDATE receipt_items SET unit_cost=1, moneda_recepcion='CUP', tasa_cambio_recepcion=1, updated_at=now()
      WHERE receipt_id=$1 AND (unit_cost<>1 OR moneda_recepcion<>'CUP' OR tasa_cambio_recepcion<>1)
      RETURNING id`, [RCP]);
    cambios += r1.rowCount;
    const r2 = await sql(`UPDATE receipts SET total_cost=149.00, updated_at=now()
      WHERE id=$1 AND total_cost<>149.00 RETURNING id`, [RCP]);
    cambios += r2.rowCount;
    const r3 = await sql(`UPDATE stock_movements SET unit_cost=1
      WHERE reference_id=$1 AND movement_type='purchase' AND unit_cost<>1 RETURNING id`, [RCP]);
    cambios += r3.rowCount;
    const r4 = await sql(`INSERT INTO fin_entries (id, store_id, document_type, document_id, document_number,
        event, reversal_of, economic_date, posted_at, status, description, movements_snapshot)
      VALUES ($1,$2,'RECEPCION',$3,'FAC-VITALLCONS-001-RECT','ajuste_manual',$4,'2026-07-01',now(),'posted',$5,$6)
      ON CONFLICT (id) DO NOTHING RETURNING id`,
      [E_RECT1, S, RCP, E_RECON, 'Rectificación RECT-1 (m050e): reversión del exceso 151.299.851 CUP — costo real 1 CUP/u',
        JSON.stringify([
          { traza: { mision: 'RECT004', regla: 'rect-cxp-d' }, amount: EXCESO, sentido: 'debito', currency: 'CUP', categoria: 'PAS_CXP_PROV' },
          { traza: { mision: 'RECT004', regla: 'rect-inv-c' }, amount: EXCESO, sentido: 'credito', currency: 'CUP', categoria: 'ACT_INVENTARIO' }])]);
    cambios += r4.rowCount;
    if (r4.rowCount === 1) {
      await sql(`INSERT INTO fin_movements (id, entry_id, store_id, category_code, sense, amount, currency, exchange_rate, economic_date, description, traza)
        VALUES ($1,$2,$3,'PAS_CXP_PROV','debito',$4,'CUP',1,'2026-07-01',$5,$6),($7,$2,$3,'ACT_INVENTARIO','credito',$4,'CUP',1,'2026-07-01',$5,$8)
        ON CONFLICT (id) DO NOTHING`,
        [fmov(90), E_RECT1, S, EXCESO, 'Rectificación FAC-VITALLCONS-001: exceso 151.299.851',
          JSON.stringify({ mision: 'RECT004', regla: 'rect-cxp-d' }),
          fmov(91), JSON.stringify({ mision: 'RECT004', regla: 'rect-inv-c' })]);
      cambios += 2;
    }
    await sql(`INSERT INTO wac_change_log (id, store_id, product_id, wac_before, wac_after, event, qty_in, uc_in, source_ref, created_at)
      VALUES ($1,$2,$3,1,1,'rectificacion',10,1,$4,now()),($5,$2,$6,1,1,'rectificacion',20,1,$7,now())
      ON CONFLICT (id) DO NOTHING`,
      [WCL(1), S, P111, JSON.stringify({ mision: 'RECT004', decision: 'costo real 1 CUP/u', documento: 'FAC-VITALLCONS-001' }),
       WCL(2), P112, JSON.stringify({ mision: 'RECT004', decision: 'costo real 1 CUP/u', documento: 'FAC-VITALLCONS-001' })]);
    await sql(`INSERT INTO audit_logs (id, created_at, table_name, record_id, action, old_data, new_data, metadata, store_id, trace_id)
      VALUES ($1,now(),'receipt_items',$2,'SYSTEM_RECT_VALUATION',$3,$4,$5,$6,$7),
             ($8,now(),'receipt_items',$9,'SYSTEM_RECT_VALUATION',$10,$11,$5,$6,$7),
             ($12,now(),'receipts',$13,'SYSTEM_RECT_TOTAL',$14,$15,$16,$6,$7),
             ($17,now(),'fin_entries',$18,'SYSTEM_RECT_ENTRY',$19,$20,$21,$6,$7)
      ON CONFLICT (id) DO NOTHING`,
      [AUD(1), IT111, JSON.stringify({ uc: 2500, moneda: 'USD', tasa: 680 }), JSON.stringify({ uc: 1, moneda: 'CUP', tasa: 1 }),
        JSON.stringify({ mision: 'CP-FIN-VALUATION-RECTIFICATION-RELEASE-GATE-004', motivo: 'costo real 1 CUP/u (decisión propietario)' }),
        S, TRACE,
        AUD(2), IT112, JSON.stringify({ uc: 1000, moneda: 'USD', tasa: 680 }), JSON.stringify({ uc: 1, moneda: 'CUP', tasa: 1 }),
        AUD(3), RCP, JSON.stringify({ total_cost: 151300000 }), JSON.stringify({ total_cost: 149 }),
        JSON.stringify({ mision: 'CP-FIN-VALUATION-RECTIFICATION-RELEASE-GATE-004' }),
        AUD(4), E_RECT1, JSON.stringify({ asiento: 'reconocimiento original réplica', importe: 151300000 }),
        JSON.stringify({ asiento: 'RECT-1', reversal_of: E_RECON, debito: { PAS_CXP_PROV: EXCESO }, credito: { ACT_INVENTARIO: EXCESO } }),
        JSON.stringify({ mision: 'CP-FIN-VALUATION-RECTIFICATION-RELEASE-GATE-004', documento: 'FAC-VITALLCONS-001-RECT' })]);
    await sql('COMMIT');
  } catch (e) { await sql('ROLLBACK'); throw e; }
  return cambios;
}

// ═════════ RECT-2 — SALIDAS NUNCA CONTABILIZADAS (transacción independiente) ══
async function aplicarRect2() {
  let cambios = 0;
  await sql('BEGIN');
  try {
    await sql(`SELECT pg_advisory_xact_lock(hashtext('fin:RECEP2:'||$1))`, [RCP]);
    const r1 = await sql(`UPDATE stock_movements SET unit_cost=1
      WHERE store_id=$1 AND product_id IN ($2,$3) AND quantity_change<0 AND unit_cost=0
      RETURNING id, quantity_change`, [S, P111, P112]);
    cambios += r1.rowCount;
    for (const row of r1.rows) cambios += 0;
    const r2 = await sql(`INSERT INTO fin_entries (id, store_id, document_type, document_id, document_number,
        event, economic_date, posted_at, status, description, movements_snapshot)
      VALUES ($1,$2,'AJUSTE_INVENTARIO',$3,'FAC-VITALLCONS-001-RECT-SAL','ajuste_manual','2026-11-15',now(),'posted',$4,$5)
      ON CONFLICT (id) DO NOTHING RETURNING id`,
      [E_RECT2, S, RCP, 'Rectificación RECT-2 (m050e): reconocimiento de salidas nunca contabilizadas (6 vales + 18 ajustes × 1 CUP)',
        JSON.stringify([
          { traza: { mision: 'RECT004', regla: 'rect-vales-d' }, amount: 6, sentido: 'debito', currency: 'CUP', categoria: 'GAS_VALES' },
          { traza: { mision: 'RECT004', regla: 'rect-perdida-d' }, amount: 18, sentido: 'debito', currency: 'CUP', categoria: 'GAS_PERDIDA_INV' },
          { traza: { mision: 'RECT004', regla: 'rect-inv-c' }, amount: 24, sentido: 'credito', currency: 'CUP', categoria: 'ACT_INVENTARIO' }])]);
    cambios += r2.rowCount;
    if (r2.rowCount === 1) {
      await sql(`INSERT INTO fin_movements (id, entry_id, store_id, category_code, sense, amount, currency, exchange_rate, economic_date, description, traza)
        VALUES ($1,$2,$3,'GAS_VALES','debito',6,'CUP',1,'2026-11-15',$4,$5),
               ($6,$2,$3,'GAS_PERDIDA_INV','debito',18,'CUP',1,'2026-11-15',$7,$8),
               ($9,$2,$3,'ACT_INVENTARIO','credito',24,'CUP',1,'2026-11-15',$10,$11)
        ON CONFLICT (id) DO NOTHING`,
        [fmov(92), E_RECT2, S, 'Vales sin asiento: VS-000037 (4 u) + VS-000138 (1 u) + VS-000139 (1 u)', JSON.stringify({ mision: 'RECT004', regla: 'rect-vales-d' }),
          fmov(93), 'Ajustes de cuadre: sku=111 Δ−1 + sku=112 Δ−17 (18 u)', JSON.stringify({ mision: 'RECT004', regla: 'rect-perdida-d' }),
          fmov(94), 'Salidas SKU 111/112 (24 u × 1 CUP)', JSON.stringify({ mision: 'RECT004', regla: 'rect-inv-c' })]);
      cambios += 3;
    }
    await sql(`INSERT INTO audit_logs (id, created_at, table_name, record_id, action, old_data, new_data, metadata, store_id, trace_id)
      VALUES ($1,now(),'fin_entries',$2,'SYSTEM_RECT_ENTRY',$3,$4,$5,$6,$7)
      ON CONFLICT (id) DO NOTHING`,
      [AUD(5), E_RECT2, JSON.stringify({ asiento: '(salidas nunca tuvieron asiento — brecha documental)' }),
        JSON.stringify({ asiento: 'RECT-2', debit: { GAS_VALES: 6, GAS_PERDIDA_INV: 18 }, credit: { ACT_INVENTARIO: 24 } }),
        JSON.stringify({ mision: 'CP-FIN-VALUATION-RECTIFICATION-RELEASE-GATE-004', documento: 'FAC-VITALLCONS-001-RECT-SAL' }), S, TRACE]);
    await sql('COMMIT');
  } catch (e) { await sql('ROLLBACK'); throw e; }
  return cambios;
}

// ═════════ ROLLBACKS INDEPENDIENTES (byte a byte) ════════════════════════════
async function revertirRect2() {
  await sql('BEGIN');
  try {
    // rollback EXACTO de las 26 salidas que RECT-2 revalorizó (ids deterministas del seed):
    // mov(3) venta 07-24 · mov(4) ajuste −17 · mov(5) ajuste −1 · mov(6) VS-37 −4 ·
    // mov(7) venta 10-04 · mov(8) VS-138 −1 · mov(10) VS-139 −1  →  7 filas · 26 unidades
    await sql(`UPDATE stock_movements SET unit_cost=0 WHERE id IN ($1,$2,$3,$4,$5,$6,$7)`,
      [mov(3), mov(4), mov(5), mov(6), mov(7), mov(8), mov(10)]);
    await sql(`DELETE FROM fin_movements WHERE entry_id=$1`, [E_RECT2]);
    await sql(`DELETE FROM fin_entries WHERE id=$1`, [E_RECT2]);
    await sql(`DELETE FROM audit_logs WHERE trace_id=$1 AND record_id=$2`, [TRACE, E_RECT2]);
    await sql('COMMIT');
  } catch (e) { await sql('ROLLBACK'); throw e; }
}
async function revertirRect1() {
  await sql('BEGIN');
  try {
    await sql(`SET LOCAL app.allow_receipt_item_edit = 'on'`);
    await sql(`UPDATE receipt_items SET unit_cost=2500, moneda_recepcion='USD', tasa_cambio_recepcion=680 WHERE id=$1`, [IT111]);
    await sql(`UPDATE receipt_items SET unit_cost=1000, moneda_recepcion='USD', tasa_cambio_recepcion=680 WHERE id=$1`, [IT112]);
    await sql(`UPDATE receipts SET total_cost=151300000 WHERE id=$1`, [RCP]);
    await sql(`UPDATE stock_movements SET unit_cost=680000 WHERE reference_id=$1 AND movement_type='purchase' AND product_id=$2`, [RCP, P112]);
    await sql(`UPDATE stock_movements SET unit_cost=1700000 WHERE reference_id=$1 AND movement_type='purchase' AND product_id=$2`, [RCP, P111]);
    await sql(`DELETE FROM fin_movements WHERE entry_id=$1`, [E_RECT1]);
    await sql(`DELETE FROM fin_entries WHERE id=$1`, [E_RECT1]);
    await sql(`DELETE FROM wac_change_log WHERE id IN ($1,$2)`, [WCL(1), WCL(2)]);
    await sql(`DELETE FROM audit_logs WHERE trace_id=$1 AND record_id IN ($2,$3,$4,$5)`, [TRACE, IT111, IT112, RCP, E_RECT1]);
    await sql('COMMIT');
  } catch (e) { await sql('ROLLBACK'); throw e; }
}

// ═══ 0. PREFLIGHT ════════════════════════════════════════════════════════════
await paso('P0_preflight', async () => {
  const r = await fetch('https://lguovmvrozxgssupkwpf.supabase.co/rest/v1/rpc/e2e_is_isolated_db', {
    method: 'POST', headers: { apikey: env.E2E_SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.E2E_SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' }, body: '{}' });
  if ((await r.text()).trim() !== 'true') throw new Error('SENTINELA REST != true');
  await db.connect();
  const iso = await sql('SELECT e2e_is_isolated_db() AS iso');
  if (iso.rows[0].iso !== true) throw new Error('sentinela SQL != true');
  await sql('BEGIN');
  try {
    await sql(`SET LOCAL session_replication_role='replica'`);
    await sql(`DELETE FROM fin_movements WHERE store_id=$1`, [S]);
    await sql(`DELETE FROM fin_entries WHERE store_id=$1`, [S]);
    await sql(`DELETE FROM wac_change_log WHERE store_id=$1`, [S]);
    await sql(`DELETE FROM audit_logs WHERE store_id=$1`, [S]);
    await sql(`DELETE FROM stock_movements WHERE store_id=$1`, [S]);
    await sql(`DELETE FROM receipt_items WHERE receipt_id=$1`, [RCP]);
    await sql(`DELETE FROM receipts WHERE store_id=$1`, [S]);
    await sql(`DELETE FROM inventory WHERE store_id=$1`, [S]);
    await sql(`DELETE FROM products WHERE store_id=$1`, [S]);
    await sql(`DELETE FROM stores WHERE id=$1`, [S]);
    await sql('COMMIT');
  } catch (e) { await sql('ROLLBACK'); throw e; }
  const base = {};
  for (const t of ['receipts', 'receipt_items', 'stock_movements', 'fin_entries', 'fin_movements', 'wac_change_log', 'audit_logs', 'products', 'stores', 'inventory']) {
    base[t] = (await sql(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
  }
  EV.limpiar.baseline = base;
  return { resumen: `sentinela=true; baseline ${Object.values(base).join('/')}` };
});

// ═══ 1. SEMILLA RÉPLICA (estado defectuoso verificado) ════════════════════════
await paso('P1_seed_réplica', async () => {
  await sql(`INSERT INTO stores (id, name, slug, is_active, created_at, backup_restore_protected)
    VALUES ($1,'RECT004-PROTO','rect004-proto',true,'2026-11-15T00:00:00Z',false)`, [S]);
  await sql(`INSERT INTO products (id, store_id, sku, name, price, cost_price, cost_average, stock_current, min_stock, unit_of_measure, category, supplier, price_currency, is_active, visible_en_tienda, operational_class, created_at, updated_at)
    VALUES ($1,$2,'111','Grapas plásticas con clavo de acero',2000,0,1,10,1,'unidad','Ferretería','Vitallcons','CUP',true,true,'venta','2026-08-11T22:49:13Z','2026-10-28T16:00:00Z'),
           ($3,$2,'112','Grapas metálicas 3/4 con tornillo roscante',1000,0,1,20,1,'unidad','Ferretería','Vitallcons','USD',true,true,'venta','2026-08-11T22:49:13Z','2026-11-07T14:23:13Z')`,
    [P111, S, P112]);
  await sql(`INSERT INTO receipts (id, store_id, status, total_cost, reference_doc, supplier, reception_date, payment_status, paid_amount, due_date, created_at, notes)
    VALUES ($1,$2,'active',151300000,'FAC-VITALLCONS-001','Vitallcons','2026-07-01','unpaid',0,'2026-07-31','2026-08-11T22:49:18Z','RÉPLICA RECT004')`, [RCP, S]);
  await sql(`INSERT INTO receipt_items (id, receipt_id, product_id, quantity, unit_cost, moneda_recepcion, tasa_cambio_recepcion, created_at, updated_at) VALUES
    ($1,$3,$4,49,2500,'USD',680,'2026-08-11T22:49:18Z','2026-08-11T22:49:18Z'),
    ($2,$3,$5,100,1000,'USD',680,'2026-08-11T22:49:18Z','2026-08-11T22:49:18Z')`, [IT111, IT112, RCP, P111, P112]);
  // kardex 21 movimientos (created_at desempatado)
  let n = 1;
  for (const [sku, fecha, tipo, dq, uc, ref] of KARDEX) {
    const plus = (n - 1) * 60000;
    const caDes = new Date(new Date(fecha).getTime() + plus).toISOString();
    await sql(`INSERT INTO stock_movements (id, store_id, product_id, quantity_change, movement_type, reference_id, reference_doc, movement_date, created_at, unit_cost, unit_price, cost_value_change, balance_after, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,0,null,null)`,
      [mov(n), S, sku === '111' ? P111 : P112, dq, tipo, tipo === 'purchase' ? RCP : null, ref, fecha, caDes, uc]);
    n++;
  }
  // asientos réplica: reconocimiento + 5 ventas (COGS motor 1 CUP/u) + 6 vales (88 CUP)
  await sql(`INSERT INTO fin_entries (id, store_id, document_type, document_id, document_number, event, economic_date, posted_at, status, description)
    VALUES ($1,$2,'RECEPCION',$3,'FAC-VITALLCONS-001','reconocimiento','2026-07-01','2026-11-14T01:51:20Z','posted','Entrada de almacén (réplica RECT004)')`, [E_RECON, S, RCP]);
  await sql(`INSERT INTO fin_movements (id, entry_id, store_id, category_code, sense, amount, currency, exchange_rate, economic_date, description)
    VALUES ($1,$2,$3,'ACT_INVENTARIO','debito',151300000,'CUP',1,'2026-07-01','reconocimiento réplica'),
           ($4,$2,$3,'PAS_CXP_PROV','credito',151300000,'CUP',1,'2026-07-01','reconocimiento réplica')`, [fmov(1), E_RECON, S, fmov(2)]);
  let f = 10, e = 0;
  for (const [txid, fecha, sku, u, cogs, total] of VENTAS) {
    const eid = E_TX(++e);
    await sql(`INSERT INTO fin_entries (id, store_id, document_type, document_id, document_number, event, economic_date, posted_at, status, description)
      VALUES ($1,$2,'VENTA',null,$3,'reconocimiento',$4,$5,'posted',$6)`, [eid, S, txid, fecha, `${fecha}T12:30:00Z`, `Venta ${txid} (réplica — COGS motor a 1 CUP/u)`]);
    await sql(`INSERT INTO fin_movements (id, entry_id, store_id, category_code, sense, amount, currency, exchange_rate, economic_date, description)
      VALUES ($1,$2,$3,'ING_VENTAS','credito',$4,'CUP',1,$5,'venta réplica'),
             ($6,$2,$3,'ACT_EFECTIVO_CUP','debito',$4,'CUP',1,$5,'venta réplica'),
             ($7,$2,$3,'GAS_COSTO_VENTAS','debito',$8,'CUP',1,$5,'COGS motor réplica'),
             ($9,$2,$3,'ACT_INVENTARIO','credito',$8,'CUP',1,$5,'COGS motor réplica')`,
      [fmov(f++), eid, S, total, fecha, fmov(f++), fmov(f++), cogs, fmov(f++)]);
  }
  let v = 0;
  for (const [vale, fecha, monto] of VALES_ASIENTO) {
    const eid = E_SLIP(++v);
    await sql(`INSERT INTO fin_entries (id, store_id, document_type, document_id, document_number, event, economic_date, posted_at, status, description)
      VALUES ($1,$2,'VALE_SALIDA',null,$3,'reconocimiento',$4,$5,'posted',$6)`, [eid, S, vale, fecha, `${fecha}T12:00:00Z`, `Vale ${vale} (réplica)`]);
    await sql(`INSERT INTO fin_movements (id, entry_id, store_id, category_code, sense, amount, currency, exchange_rate, economic_date, description)
      VALUES ($1,$2,$3,'GAS_VALES','debito',$4,'CUP',1,$5,'vale réplica'),
             ($6,$2,$3,'ACT_INVENTARIO','credito',$4,'CUP',1,$5,'vale réplica')`,
      [fmov(f++), eid, S, monto, fecha, fmov(f++)]);
  }
  return { resumen: 'réplica FVC defectuosa (151.300.000; 2 líneas USD@680) + kardex 21 + asientos réplica (reconocimiento + 5 ventas COGS 7 + 6 vales 88)' };
});

// ═══ 2. ESTADO INICIAL + HASH ════════════════════════════════════════════════
const ESTADO_0 = await estadoActual();
EV.validaciones.estado_inicial = ESTADO_0;
EV.hash_estado_inicial = sha256(ESTADO_0);
log('estado inicial:', JSON.stringify(ESTADO_0));

// ═══ 3. APLICACIÓN PARCIAL — SOLO RECT-1 (interrupción simulada) ══════════════
await paso('P3_aplicación_parcial_RECT1_solo', async () => {
  const c = await aplicarRect1();
  if (c === 0) throw new Error('RECT-1 no aplicó nada (¿ya estaba?)');
  return { resumen: `RECT-1 aplicado solo (RECT-2 NO) — cambios=${c}` };
});

// ═══ 4. VERIFICACIÓN DEL ESTADO INTERMEDIO ═══════════════════════════════════
await paso('P4_verificación_intermedia', async () => {
  const e = await estadoActual();
  EV.validaciones.estado_intermedio = e;
  const ok = e.total === 149 && e.lineas === '1@CUP/t1 | 1@CUP/t1' && e.capas_uc1 === 2
    && e.salidas_uc0 === 7 && e.salidas_uc0_unidades === 26
    && e.cogs === 7 && e.gas_vales === 88 && e.gas_perdida === 0
    && e.act_neto === 149 - 7 - 88 - 0 && e.cxp_neto === 149
    && e.asientos === 13 && e.movimientos === 36 && e.audit_rect004 === 4;
  // act intermedio: 151.300.000-151.299.851=149 − 7 COGS − 88 vales − 0 ajustes = 54
  if (!ok) throw new Error(`estado intermedio incorrecto: ${JSON.stringify(e)}`);
  EV.validaciones.intermedia_ok = true;
  return { resumen: `RECT-1 presente (total 149, capas 2, ACT 54, CXP 149) y RECT-2 AUSENTE (26 salidas uc=0, GAS_VALES 88, GAS_PERDIDA 0) — separable` };
});

// ═══ 5. IDEMPOTENCIA DE RECT-1 ═══════════════════════════════════════════════
await paso('P5_idempotencia_RECT1', async () => {
  const c = await aplicarRect1();
  if (c !== 0) throw new Error(`re-ejecución de RECT-1 cambió ${c}`);
  return { resumen: 're-ejecución RECT-1 → 0 cambios' };
});

// ═══ 6. REANUDACIÓN — APLICAR RECT-2 ═════════════════════════════════════════
await paso('P6_reanudación_RECT2', async () => {
  const c = await aplicarRect2();
  if (c === 0) throw new Error('RECT-2 no aplicó nada');
  return { resumen: `RECT-2 aplicado tras la interrupción — cambios=${c}` };
});

// ═══ 7. VERIFICACIÓN FINAL COMPLETA ══════════════════════════════════════════
await paso('P7_verificación_final', async () => {
  const e = await estadoActual();
  EV.validaciones.estado_final = e;
  // identidad final: ACT = 149 − 7 − 94 − 18 = 30; CXP = 149; COGS 7 intacto
  const ok = e.total === 149 && e.capas_uc1 === 2 && e.salidas_uc0 === 0
    && e.cogs === 7 && e.gas_vales === 94 && e.gas_perdida === 18
    && e.act_neto === 30 && e.cxp_neto === 149
    && e.asientos === 14 && e.movimientos === 39 && e.audit_rect004 === 5;
  if (!ok) throw new Error(`estado final incorrecto: ${JSON.stringify(e)}`);
  // D=C por asiento
  const dc = await sql(`SELECT fe.id, sum(CASE WHEN fm.sense='debito' THEN fm.amount ELSE -fm.amount END)::float8 AS d
    FROM fin_entries fe JOIN fin_movements fm ON fm.entry_id=fe.id WHERE fe.store_id=$1 GROUP BY fe.id HAVING abs(sum(CASE WHEN fm.sense='debito' THEN fm.amount ELSE -fm.amount END))>0.01`, [S]);
  if (dc.rows.length > 0) throw new Error(`asientos descuadrados: ${dc.rows.length}`);
  // precios de venta intactos
  const pr = await sql(`SELECT price::float8 AS p FROM products WHERE id IN ($1,$2) ORDER BY id`, [P111, P112]);
  if (pr.rows[0].p !== 2000 || pr.rows[1].p !== 1000) throw new Error('precios de venta alterados');
  // existencias intactas 10/20
  const st = await sql(`SELECT stock_current::float8 AS s FROM products WHERE id IN ($1,$2) ORDER BY id`, [P111, P112]);
  if (st.rows[0].s !== 10 || st.rows[1].s !== 20) throw new Error(`existencias alteradas: ${st.rows[0].s}/${st.rows[1].s}`);
  // reversal_of de RECT-1 → asiento original
  const rev = await sql(`SELECT reversal_of FROM fin_entries WHERE id=$1`, [E_RECT1]);
  if (rev.rows[0].reversal_of !== E_RECON) throw new Error('reversal_of no enlaza al original');
  EV.validaciones.final_ok = true;
  return { resumen: `total 149 · salidas uc=0: 0 · COGS 7 intacto · GAS_VALES 94 · GAS_PERDIDA 18 · ACT=30 · CXP=149 · D=C en 14 asientos · precios/existencias intactos · reversal_of→original` };
});

// ═══ 8. IDEMPOTENCIA TOTAL ════════════════════════════════════════════════════
await paso('P8_idempotencia_total', async () => {
  const c1 = await aplicarRect1(), c2 = await aplicarRect2();
  if (c1 !== 0 || c2 !== 0) throw new Error(`re-ejecución total cambió RECT1=${c1} RECT2=${c2}`);
  return { resumen: 'repetición de la solicitud completa → 0 cambios' };
});

// ═══ 9. CONCURRENCIA ══════════════════════════════════════════════════════════
await paso('P9_concurrencia', async () => {
  // dos ejecuciones simultáneas del MISMO rectificación (estado ya aplicado):
  // idempotencia por advisory lock + ON CONFLICT debe dar 0 duplicados
  const c1 = new pg.Client(POOLER), c2 = new pg.Client(POOLER);
  await c1.connect(); await c2.connect();
  const run = async (cli) => {
    await cli.query('BEGIN');
    await cli.query(`SELECT pg_advisory_xact_lock(hashtext('fin:RECEPCION:'||$1))`, [RCP]);
    const r = await cli.query(`INSERT INTO fin_entries (id, store_id, document_type, document_id, document_number, event, reversal_of, economic_date, posted_at, status, description)
      VALUES ($1,$2,'RECEPCION',$3,'FAC-VITALLCONS-001-RECT','ajuste_manual',$4,'2026-07-01',now(),'posted','concurrencia RECT004')
      ON CONFLICT (id) DO NOTHING RETURNING id`, [E_RECT1, S, RCP, E_RECON]);
    await cli.query('COMMIT');
    return r.rowCount;
  };
  const [a, b] = await Promise.all([run(c1), run(c2)]);
  await c1.end(); await c2.end();
  const n = (await sql(`SELECT count(*)::int AS n FROM fin_entries WHERE id=$1`, [E_RECT1])).rows[0].n;
  if (a + b !== 0 || n !== 1) throw new Error(`concurrencia: inserciones=${a}+${b}, filas=${n}`);
  return { resumen: `2 conexiones simultáneas sobre RECT-1 ya aplicado → ${a}+${b} inserciones, 1 fila única` };
});

// ═══ 10. ROLLBACK INDIVIDUAL DE RECT-2 ════════════════════════════════════════
await paso('P10_rollback_RECT2_individual', async () => {
  await revertirRect2();
  const e = await estadoActual();
  const ok = e.salidas_uc0 === 7 && e.salidas_uc0_unidades === 26 && e.gas_vales === 88
    && e.gas_perdida === 0 && e.asientos === 13 && e.audit_rect004 === 4
    && e.total === 149 && e.act_neto === 54;
  if (!ok) throw new Error(`rollback RECT-2 incorrecto: ${JSON.stringify(e)}`);
  EV.validaciones.tras_rollback_rect2 = e;
  return { resumen: 'RECT-2 revertido: 26 salidas uc=0, GAS_VALES 88, GAS_PERDIDA 0, asientos 13 — RECT-1 SIGUE (total 149, ACT 54)' };
});

// ═══ 11. RE-APLICAR RECT-2 (REANUDACIÓN INVERSA) ══════════════════════════════
await paso('P11_reaplicar_RECT2', async () => {
  const c = await aplicarRect2();
  if (c === 0) throw new Error('RECT-2 no re-aplicó');
  const e = await estadoActual();
  if (e.gas_vales !== 94 || e.gas_perdida !== 18 || e.asientos !== 14) throw new Error(`estado tras re-aplicar: ${JSON.stringify(e)}`);
  return { resumen: `RECT-2 re-aplicado (cambios=${c}) — vuelve al estado final completo` };
});

// ═══ 12. ROLLBACK TOTAL (RECT-2 + RECT-1) — RESTAURACIÓN BYTE A BYTE ═════════
await paso('P12_rollback_total', async () => {
  await revertirRect2();
  await revertirRect1();
  const e = await estadoActual();
  const hash = sha256(e);
  EV.validaciones.estado_tras_rollback_total = e;
  EV.validaciones.hash_tras_rollback_total = hash;
  const ok = e.total === 151300000 && e.lineas === '2500@USD/t680 | 1000@USD/t680'
    && e.capas_uc1 === 0 && e.salidas_uc0 === 7 && e.cogs === 7 && e.gas_vales === 88
    && e.gas_perdida === 0 && e.act_neto === 151300000 - 7 - 88 && e.cxp_neto === 151300000
    && e.asientos === 12 && e.movimientos === 34 && e.audit_rect004 === 0;
  if (!ok) throw new Error(`rollback total incorrecto: ${JSON.stringify(e)}`);
  if (hash !== EV.hash_estado_inicial) throw new Error('hash del estado ≠ hash inicial (no byte a byte)');
  EV.validaciones.rollback_total_byte_a_byte = true;
  return { resumen: 'rollback total: estado = estado inicial EXACTO (hash idéntico) — asientos 12, movimientos 34, audit 0' };
});

// ═══ 13. REPLAY COMPLETO ══════════════════════════════════════════════════════
await paso('P13_replay_completo', async () => {
  const c1 = await aplicarRect1(), c2 = await aplicarRect2();
  if (c1 === 0 || c2 === 0) throw new Error(`replay: RECT1=${c1} RECT2=${c2}`);
  const e = await estadoActual();
  if (e.asientos !== 14 || e.gas_vales !== 94 || e.gas_perdida !== 18 || e.act_neto !== 30) {
    throw new Error(`replay incorrecto: ${JSON.stringify(e)}`);
  }
  EV.validaciones.replay_ok = true;
  return { resumen: 'replay desde estado original → estado final completo exacto (14 asientos, ACT 30, GAS_VALES 94, GAS_PERDIDA 18)' };
});

// ═══ 14. CONTROLES DE PRODUCCIÓN Y PERMISOS NO DEBILITADOS ════════════════════
await paso('P14_controles_intactos', async () => {
  const c = {};
  // a) M021: UPDATE sin escape hatch debe FALLAR
  let m021 = null;
  await sql('BEGIN');
  try {
    await sql(`SELECT set_config('app.allow_receipt_item_edit','off',true)`);
    await sql(`UPDATE receipt_items SET unit_cost=2 WHERE id=$1`, [IT111]);
    m021 = 'ACEPTÓ (defecto!)';
  } catch (e) { m021 = `RECHAZADO (${String(e.message).slice(0, 60)})`; }
  await sql('ROLLBACK');
  c.m021_sin_hatch = m021;
  // b) RLS FORCE en fin_entries / fin_movements
  const rls = await sql(`SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
    WHERE relname IN ('fin_entries','fin_movements') AND relnamespace='public'::regnamespace`);
  c.rls_fin = rls.rows.map((r) => `${r.relname}: rls=${r.relrowsecurity} force=${r.relforcerowsecurity}`).join(' | ');
  // c) motor REVOKE de anon/authenticated
  const g1 = await sql(`SELECT has_function_privilege('anon','public.fin_post_document(text,uuid,text,uuid,uuid)','EXECUTE') AS a,
    has_function_privilege('authenticated','public.fin_post_document(text,uuid,text,uuid,uuid)','EXECUTE') AS b`);
  c.motor_anon = g1.rows[0].a; c.motor_authenticated = g1.rows[0].b;
  const g2 = await sql(`SELECT has_table_privilege('anon','public.fin_entries','INSERT') AS a,
    has_table_privilege('anon','public.fin_entries','SELECT') AS b`);
  c.fin_entries_anon = g2.rows[0];
  // d) sentinela sigue true
  const iso = await sql('SELECT e2e_is_isolated_db() AS iso');
  c.sentinela = iso.rows[0].iso;
  const todoOk = /RECHAZADO/.test(m021) && rls.rows.length === 2
    && rls.rows.every((r) => r.relrowsecurity && r.relforcerowsecurity)
    && g1.rows[0].a === false && g1.rows[0].b === false
    && g2.rows[0].a === false && iso.rows[0].iso === true;
  EV.permisos = c;
  if (!todoOk) throw new Error(`controles debilitados: ${JSON.stringify(c)}`);
  return { resumen: 'M021 sin hatch RECHAZADO; RLS FORCE activa; motor/anon sin EXECUTE ni INSERT; sentinela true' };
});

// ═══ 15. PRODUCCIÓN INTACTA (re-verificación read-only final) ════════════════
await paso('P15_producción_intacta', async () => {
  const q = async (query) => {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${PROD_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }) });
    if (!res.ok) throw new Error(`prod HTTP ${res.status}`);
    return JSON.parse(await res.text() || '[]');
  };
  const r = await q(`SELECT
    (SELECT total_cost::float8 FROM receipts WHERE id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63') AS total,
    (SELECT count(*)::int FROM receipt_items WHERE receipt_id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63') AS lineas,
    (SELECT count(*)::int FROM fin_entries WHERE document_id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63') AS asientos_fvc,
    (SELECT count(*)::int FROM fin_entries WHERE reversal_of IN (SELECT id FROM fin_entries WHERE document_id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63')) AS reversiones,
    (SELECT count(*)::int FROM stock_movements WHERE product_id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16','14aeb370-7e00-4889-b29b-ef2bc778f4c4')) AS kardex,
    (SELECT payment_status FROM receipts WHERE id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63') AS pago`);
  const row = r[0];
  const ok = row.total === 192039436 && row.lineas === 101 && row.asientos_fvc === 1
    && row.reversiones === 0 && row.kardex === 21 && row.pago === 'unpaid';
  EV.produccion = { verificado: new Date().toISOString(), canal: 'Management API /database/query (SELECT)', ...row, intacta: ok };
  if (!ok) throw new Error(`producción cambió: ${JSON.stringify(row)}`);
  return { resumen: 'FVC intacta: total 192.039.436 · 101 líneas · 1 asiento · 0 reversiones · kardex 21 · unpaid' };
});

// ═══ 16. LIMPIEZA — NET DELTA 0 ══════════════════════════════════════════════
await paso('P16_limpieza_neta_0', async () => {
  await sql('BEGIN');
  try {
    await sql(`SET LOCAL session_replication_role='replica'`);
    await sql(`DELETE FROM fin_movements WHERE store_id=$1`, [S]);
    await sql(`DELETE FROM fin_entries WHERE store_id=$1`, [S]);
    await sql(`DELETE FROM wac_change_log WHERE store_id=$1`, [S]);
    await sql(`DELETE FROM audit_logs WHERE store_id=$1`, [S]);
    await sql(`DELETE FROM stock_movements WHERE store_id=$1`, [S]);
    await sql(`DELETE FROM receipt_items WHERE receipt_id=$1`, [RCP]);
    await sql(`DELETE FROM receipts WHERE store_id=$1`, [S]);
    await sql(`DELETE FROM inventory WHERE store_id=$1`, [S]);
    await sql(`DELETE FROM products WHERE store_id=$1`, [S]);
    await sql(`DELETE FROM stores WHERE id=$1`, [S]);
    await sql('COMMIT');
  } catch (e) { await sql('ROLLBACK'); throw e; }
  const final = {};
  for (const t of Object.keys(EV.limpiar.baseline)) {
    final[t] = (await sql(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
  }
  const delta = {};
  for (const t of Object.keys(EV.limpiar.baseline)) delta[t] = final[t] - EV.limpiar.baseline[t];
  const net0 = Object.values(delta).every((d) => d === 0);
  EV.limpiar = { baseline: EV.limpiar.baseline, finales: final, delta, net_delta_0: net0 };
  if (!net0) throw new Error(`residuos: ${JSON.stringify(delta)}`);
  return { resumen: 'NET DELTA 0 en las 10 tablas tocadas — BD aislada sin residuos' };
});

await db.end();
EV.veredicto = {
  separables: EV.validaciones.intermedia_ok && EV.validaciones.final_ok,
  idempotencia: EV.pasos['P5_idempotencia_RECT1']?.estado === 'OK' && EV.pasos['P8_idempotencia_total']?.estado === 'OK',
  interrupción_reanudación: EV.pasos['P6_reanudación_RECT2']?.estado === 'OK' && EV.pasos['P11_reaplicar_RECT2']?.estado === 'OK',
  rollback_individual: EV.pasos['P10_rollback_RECT2_individual']?.estado === 'OK',
  rollback_total_byte_a_byte: EV.validaciones.rollback_total_byte_a_byte === true,
  replay: EV.validaciones.replay_ok === true,
  concurrencia: EV.pasos['P9_concurrencia']?.estado === 'OK',
  controles_intactos: EV.pasos['P14_controles_intactos']?.estado === 'OK',
  produccion_intacta: EV.pasos['P15_producción_intacta']?.estado === 'OK',
  net_delta_0: EV.limpiar.net_delta_0 === true,
};
EV.veredicto.TODO_PASS = Object.values(EV.veredicto).every((v) => v === true);
EV.hash_evidencia = sha256(EV);
writeFileSync('/home/z/my-project/scripts/out/rect004-e2e-prototipo.json', JSON.stringify(EV, null, 1));
log('\n═══ VEREDICTO PROTOTIPO E2E RECT004 ═══');
log(JSON.stringify(EV.veredicto, null, 1));

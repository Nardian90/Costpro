#!/usr/bin/env node
// ============================================================================
// M080 — CP-FIN-POST-RECTIFICATION-INDEPENDENT-CERTIFICATION-012
// Extracción integral READ-ONLY de producción para la certificación
// independiente post-RECT-011 de FAC-VITALLCONS-001.
//
// · Canal: Management API /database/query (SELECT exclusivamente).
// · Guards: CP-INFRA-019 (assertNotProduction read) + guard de referencia
//   (proyecto = producción) + guard anti-escritura (solo SELECT/WITH).
// · Re-ejecutable: ninguna escritura, resultados deterministas.
// · Salida: scripts/out/m012/extract.json
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { createHash } from 'crypto';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const PROD = 'wthkddeleylijmonclxg';
const FVC = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'; // ENERVIDA-VITALLCONS
const ORIG = '93bb5da9-0afd-4325-baad-a275710062c5';
const RECT1 = '7ec90009-0000-4000-8000-d0b300000001';
const RECT2 = '7ec90009-0000-4000-8000-d0b300000002';
const E011 = '7ec9000b-0000-4000-8000-d11300000001';
const WIN_START = '2026-11-16T19:42:56.855Z'; // inicio misión 011 (ventana m077 V14)
const EXEC_START = '2026-11-16T20:02:56.855Z';
const EXEC_END = '2026-11-16T20:03:05.869Z';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;

async function q(sql, label) {
  assertNotProduction({ mode: 'read', projectRef: PROD, context: `m080:${label}` });
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] HTTP ${res.status}: ${text.slice(0, 500)}`);
  const rows = JSON.parse(text || '[]');
  console.log(`[OK] ${label} → ${rows.length} filas`);
  return rows;
}
// Guard anti-escritura CP-INFRA-020 (nivel consulta): solo SELECT/WITH.
function qs(sql, label) {
  const head = sql.trim().slice(0, 60).toUpperCase();
  if (!head.startsWith('SELECT') && !head.startsWith('WITH')) {
    throw new Error(`GUARD RO: consulta no-SELECT rechazada en ${label}`);
  }
  return q(sql, label);
}
const md5 = (s) => createHash('md5').update(s).digest('hex');

const out = {
  mision: 'CP-FIN-POST-RECTIFICATION-INDEPENDENT-CERTIFICATION-012',
  extraccion: {
    fecha_utc: new Date().toISOString(),
    metodo: 'Management API /database/query — SOLO SELECT (producción intacta)',
    guard: 'CP-INFRA-019 (read) + CP-INFRA-020 (anti-escritura por consulta)',
    origen: `${PROD} (producción)`,
    referencias: { receipt: FVC, store: STORE, asiento_original: ORIG, rect1: RECT1, rect2: RECT2, rect011: E011,
      ventana_mision_inicio: WIN_START, ejecucion_inicio: EXEC_START, ejecucion_fin: EXEC_END },
  },
  consultas: [],
};
const run = async (label, sql) => {
  const t0 = Date.now();
  try { const r = await qs(sql, label); out.consultas.push({ label, filas: r.length, ms: Date.now() - t0 }); return r; }
  catch (e) { out.consultas.push({ label, error: String(e.message).slice(0, 300) }); console.error(`[ERR] ${label}: ${e.message.slice(0, 200)}`); return null; }
};

// ═══ 0. CONTEXTO TEMPORAL + ESQUEMA ══════════════════════════════════════════
out.tiempo = (await run('tiempo', `SELECT now() AT TIME ZONE 'UTC' AS utc, current_setting('TimeZone') AS tz,
    now() AS server_now, to_char(now() AT TIME ZONE 'America/Havana','YYYY-MM-DD HH24:MI:SS') AS havana`))[0] || null;

out.esquema = {};
for (const t of ['receipts', 'receipt_items', 'user_store_memberships', 'audit_logs', 'suppliers', 'fin_entries', 'fin_movements']) {
  const rows = await run(`cols_${t}`, `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema='public' AND table_name='${t}' ORDER BY ordinal_position`);
  out.esquema[t] = rows ? rows.map((r) => r.column_name) : null;
}

// ═══ 1. §3 RECEPCIÓN: cabecera, 101 líneas, capas, duplicados, SKU999 ═══════
out.receipt = (await run('receipt', `SELECT row_to_json(r) AS fila FROM public.receipts r WHERE r.id='${FVC}'`))[0]?.fila || null;

out.receipt_items = await run('lineas_101', `SELECT ri.id AS line_id, ri.product_id, p.sku, p.name, ri.quantity,
    ri.unit_cost, ri.moneda_recepcion, ri.tasa_cambio_recepcion,
    (ri.unit_cost*ri.tasa_cambio_recepcion*ri.quantity) AS subtotal_cup,
    p.price AS precio_venta, p.cost_average AS wac_actual, p.stock_current AS stock_actual, p.is_service,
    ri.created_at, ri.updated_at
  FROM public.receipt_items ri JOIN public.products p ON p.id=ri.product_id
  WHERE ri.receipt_id='${FVC}' ORDER BY NULLIF(regexp_replace(p.sku,'\\D','','g'),'')::bigint NULLS LAST, p.sku`);

out.capas_fvc = await run('capas_fvc', `SELECT sm.id AS capa_id, sm.product_id, p.sku, sm.quantity_change, sm.unit_cost,
    sm.created_at, sm.movement_date, sm.store_id
  FROM public.stock_movements sm JOIN public.products p ON p.id=sm.product_id
  WHERE sm.reference_id='${FVC}' AND sm.movement_type='purchase' ORDER BY sm.id`);

out.capas_duplicadas = await run('capas_duplicadas', `SELECT product_id, count(*)::int AS n
  FROM public.stock_movements WHERE reference_id='${FVC}' AND movement_type='purchase'
  GROUP BY product_id HAVING count(*)>1`);

out.movimientos_fvc_no_compra = await run('movs_fvc_no_compra', `SELECT id, product_id, movement_type, quantity_change, unit_cost, created_at
  FROM public.stock_movements WHERE reference_id='${FVC}' AND movement_type<>'purchase'`);

out.movimientos_fvc_todos = await run('movs_fvc_tipos', `SELECT movement_type, count(*)::int AS n,
    coalesce(sum(quantity_change*unit_cost),0) AS valor
  FROM public.stock_movements WHERE reference_id='${FVC}' GROUP BY 1 ORDER BY 1`);

out.sku999 = (await run('sku999', `SELECT p.id AS product_id, p.sku, p.name, p.is_service, p.operational_class, p.cost_average AS wac,
    p.stock_current AS stock,
    (SELECT count(*)::int FROM public.stock_movements sm WHERE sm.product_id=p.id AND sm.reference_id='${FVC}') AS capas_fvc,
    (SELECT coalesce(sum(sm.quantity_change),0) FROM public.stock_movements sm WHERE sm.product_id=p.id) AS saldo_kardex,
    (SELECT count(*)::int FROM public.stock_movements sm WHERE sm.product_id=p.id AND sm.movement_type<>'purchase') AS movs_no_compra
  FROM public.products p WHERE p.sku='999'`))[0] || null;

// ═══ 2. §4 INVENTARIO: kardex 101, valoración por producto, WAC ═════════════
out.kardex_101 = await run('kardex_101', `SELECT sm.id, sm.product_id, sm.movement_type, sm.quantity_change, sm.unit_cost,
    sm.created_at, sm.reference_id, sm.store_id
  FROM public.stock_movements sm
  WHERE sm.product_id IN (SELECT product_id FROM public.receipt_items WHERE receipt_id='${FVC}')
  ORDER BY sm.created_at, sm.id`);
out.kardex_101_hash_uc = (await run('kardex_hash', `SELECT md5(string_agg(sm.id || '|' || sm.unit_cost, ',' ORDER BY sm.id)) AS h,
    count(*)::int AS n FROM public.stock_movements sm
  WHERE sm.product_id IN (SELECT product_id FROM public.receipt_items WHERE receipt_id='${FVC}')`))[0] || null;

out.valoracion_101 = await run('valoracion_101', `SELECT sm.product_id, p.sku,
    coalesce(sum(sm.quantity_change),0) AS qty_actual,
    coalesce(sum(sm.quantity_change*sm.unit_cost),0) AS valor_actual,
    CASE WHEN coalesce(sum(sm.quantity_change),0)<>0
      THEN coalesce(sum(sm.quantity_change*sm.unit_cost),0)/sum(sm.quantity_change) END AS wac_recalculado,
    p.cost_average AS wac_registrado, p.stock_current AS stock_campo
  FROM public.stock_movements sm JOIN public.products p ON p.id=sm.product_id
  WHERE sm.product_id IN (SELECT product_id FROM public.receipt_items WHERE receipt_id='${FVC}')
  GROUP BY sm.product_id, p.sku, p.cost_average, p.stock_current ORDER BY p.sku`);

out.capas_otras_recepciones_25 = await run('capas_otras_25', `SELECT sm.product_id, p.sku, sm.reference_id, r.reference_doc,
    sm.quantity_change, sm.unit_cost, sm.created_at
  FROM public.stock_movements sm
  JOIN public.products p ON p.id=sm.product_id
  LEFT JOIN public.receipts r ON r.id::text=sm.reference_id
  WHERE sm.movement_type='purchase' AND sm.reference_id<>'${FVC}'
    AND sm.product_id IN (SELECT product_id FROM public.receipt_items WHERE receipt_id='${FVC}')
  ORDER BY p.sku, sm.created_at`);

out.capas_global_uc_distinto_1 = await run('capas_uc_ne1', `SELECT count(*)::int AS n,
    coalesce(sum(quantity_change*unit_cost),0) AS valor,
    count(*) FILTER (WHERE reference_id='${FVC}')::int AS del_fvc
  FROM public.stock_movements WHERE movement_type='purchase' AND unit_cost<>1`);

out.wac_log_mision = await run('wac_log_mision', `SELECT id, product_id, wac_before, wac_after, source_ref, changed_by, created_at
  FROM public.wac_change_log WHERE id::text LIKE '7ec9000b-%' ORDER BY created_at`);
out.wac_log_otros_recientes = await run('wac_log_otros', `SELECT count(*)::int AS n FROM public.wac_change_log
  WHERE created_at > '${WIN_START}' AND id::text NOT LIKE '7ec9000b-%'`);

// ═══ 3. §5 ASIENTOS: 4 asientos del documento + duplicados + auditoría ══════
out.fin_entries_fvc = await run('asientos_fvc', `SELECT id, store_id, document_type, document_id, document_number, event,
    payment_ref, status, reversal_of, posted_at, economic_date, created_by, description
  FROM public.fin_entries WHERE document_id='${FVC}' ORDER BY posted_at`);

out.fin_movements_fvc = await run('movs_asientos_fvc', `SELECT fm.id, fm.entry_id, fm.category_code, fm.sense,
    fm.amount, fm.amount_cup, fm.currency_origin, fm.description, fm.document_number,
    fm.economic_date, fm.created_at, fm.store_id
  FROM public.fin_movements fm WHERE fm.entry_id IN (SELECT id FROM public.fin_entries WHERE document_id='${FVC}')
  ORDER BY fm.entry_id, fm.category_code, fm.sense`);

out.balance_por_asiento = await run('balance_asientos', `SELECT e.id, e.event, e.status, count(fm.id)::int AS movs,
    coalesce(sum(CASE WHEN fm.sense='debito' THEN fm.amount_cup ELSE -fm.amount_cup END),0) AS diff_cup,
    coalesce(sum(CASE WHEN fm.sense='debito' THEN fm.amount ELSE -fm.amount END),0) AS diff_moneda
  FROM public.fin_entries e LEFT JOIN public.fin_movements fm ON fm.entry_id=e.id
  WHERE e.document_id='${FVC}' GROUP BY e.id, e.event, e.status ORDER BY min(e.posted_at)`);

out.reversal_of_check = await run('reversal_of', `SELECT id, event, reversal_of, status FROM public.fin_entries
  WHERE reversal_of IN ('${ORIG}','${RECT1}','${RECT2}','${E011}') OR id IN ('${ORIG}','${RECT1}','${RECT2}','${E011}')
  ORDER BY posted_at`);

out.asientos_anulacion = await run('anulaciones', `SELECT id, event, document_id, reversal_of, status, posted_at
  FROM public.fin_entries WHERE document_id='${FVC}'
    AND (event ILIKE '%anul%' OR event ILIKE '%reverse%' OR event ILIKE '%cancel%')`);

out.auditoria_rect = await run('auditoria_rect', `SELECT action, trace_id, count(*)::int AS n,
    min(created_at) AS primera, max(created_at) AS ultima
  FROM public.audit_logs WHERE action LIKE 'SYSTEM_RECT%' GROUP BY 1,2 ORDER BY 1,2`);

out.auditoria_asientos = await run('auditoria_asientos', `SELECT count(*)::int AS n FROM public.audit_logs
  WHERE (old_data::text LIKE '%${E011}%' OR new_data::text LIKE '%${E011}%')`);

// ═══ 4. §6 CUENTAS: catálogo, saldos por categoría, libro mayor ═════════════
out.fin_categories = await run('categorias', `SELECT code, name, clase, grupo, sort_order FROM public.fin_categories ORDER BY sort_order`);

out.saldos_por_categoria = await run('saldos_categorias', `SELECT c.code, c.name, c.clase, c.grupo,
    count(DISTINCT m.entry_id)::int AS movimientos,
    round(CASE WHEN c.clase IN ('activo','gasto')
      THEN coalesce(sum(CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END),0)
      ELSE coalesce(sum(CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END),0) END, 2) AS saldo
  FROM public.fin_categories c
  LEFT JOIN public.fin_movements m ON m.category_code=c.code AND m.store_id='${STORE}'
  GROUP BY c.code, c.name, c.clase, c.grupo, c.sort_order ORDER BY c.sort_order`);

out.libro_mayor_cuentas = await run('libro_mayor', `SELECT m.id, m.entry_id, e.event, e.document_type, e.document_id,
    e.status, m.category_code, m.sense, m.amount, m.amount_cup, m.economic_date, e.posted_at, m.created_at
  FROM public.fin_movements m JOIN public.fin_entries e ON e.id=m.entry_id
  WHERE m.store_id='${STORE}' AND m.category_code IN
    ('ACT_INVENTARIO','PAS_CXP_PROV','GAS_COSTO_VENTAS','GAS_VALES','GAS_PERDIDA_INV')
  ORDER BY m.created_at, m.id`, 0) || [];

// Paginación defensiva si el libro mayor es enorme (no esperado, pero RO seguro)
if (out.libro_mayor_cuentas.length >= 4900) {
  let offset = out.libro_mayor_cuentas.length;
  for (let i = 0; i < 10; i++) {
    const more = await run(`libro_mayor_pag${i}`, `SELECT m.id, m.entry_id, e.event, e.document_type, e.document_id,
      e.status, m.category_code, m.sense, m.amount, m.amount_cup, m.economic_date, e.posted_at, m.created_at
      FROM public.fin_movements m JOIN public.fin_entries e ON e.id=m.entry_id
      WHERE m.store_id='${STORE}' AND m.category_code IN
        ('ACT_INVENTARIO','PAS_CXP_PROV','GAS_COSTO_VENTAS','GAS_VALES','GAS_PERDIDA_INV')
      ORDER BY m.created_at, m.id LIMIT 2000 OFFSET ${offset}`);
    if (!more || more.length === 0) break;
    out.libro_mayor_cuentas = out.libro_mayor_cuentas.concat(more);
    offset += more.length;
    if (more.length < 2000) break;
  }
}

out.cxp_por_documento = await run('cxp_por_doc', `SELECT e.document_id, e.document_type, e.event,
    coalesce(sum(CASE WHEN fm.sense='credito' THEN fm.amount_cup ELSE -fm.amount_cup END),0) AS neto_cxp,
    count(*)::int AS movs
  FROM public.fin_movements fm JOIN public.fin_entries e ON e.id=fm.entry_id
  WHERE fm.store_id='${STORE}' AND fm.category_code='PAS_CXP_PROV'
  GROUP BY e.document_id, e.document_type, e.event ORDER BY neto_cxp DESC`);

out.asientos_recientes_todos = await run('asientos_desde_ventana', `SELECT id, event, document_type, document_id, store_id,
    status, posted_at
  FROM public.fin_entries WHERE posted_at > '${WIN_START}' ORDER BY posted_at`);

// ═══ 5. §7 ESTADOS FINANCIEROS: RPC de la app + usuario con acceso ══════════
out.store_access = await run('acceso_tienda', `SELECT user_id, role FROM public.user_store_memberships
  WHERE store_id='${STORE}' ORDER BY role LIMIT 10`);
const owner = (out.store_access || []).find((r) => r.role === 'owner') || (out.store_access || [])[0] || null;
out.rpc_user_used = owner ? owner.user_id : null;

if (owner) {
  const bal = await run('rpc_balance', `SELECT public.fin_get_balance_sheet('${STORE}','2026-11-17','${owner.user_id}') AS bs`);
  out.rpc_balance_sheet = bal?.[0]?.bs || null;
  const inc = await run('rpc_income', `SELECT public.fin_get_income_statement('${STORE}','2026-11-01','2026-11-17','${owner.user_id}') AS inc`);
  out.rpc_income_statement = inc?.[0]?.inc || null;
  const led = await run('rpc_ledger_inv', `SELECT public.fin_get_category_detail('${STORE}','ACT_INVENTARIO','2026-11-01','2026-11-17',500,0,'${owner.user_id}') AS led`);
  out.rpc_ledger_act_inventario = led?.[0]?.led || null;
  const led2 = await run('rpc_ledger_cxp', `SELECT public.fin_get_category_detail('${STORE}','PAS_CXP_PROV','2026-11-01','2026-11-17',500,0,'${owner.user_id}') AS led`);
  out.rpc_ledger_pas_cxp = led2?.[0]?.led || null;
}

// Valoración operativa total de la tienda (inventario reporte)
out.valoracion_tienda = await run('valoracion_tienda', `SELECT count(*)::int AS productos_con_stock,
    coalesce(sum(p.stock_current*p.cost_average),0) AS valor_campo,
    coalesce(sum(v.qty*v.val),0) AS valor_kardex
  FROM public.products p
  LEFT JOIN (SELECT product_id, sum(quantity_change) AS qty, sum(quantity_change*unit_cost) AS val
             FROM public.stock_movements GROUP BY product_id) v ON v.product_id=p.id
  WHERE p.store_id='${STORE}' AND p.is_service=false AND coalesce(p.stock_current,0)<>0`);

// ═══ 6. §8 TEMPORAL: actividad posterior a la corrección ════════════════════
out.post_ejecucion_movimientos = await run('post_movs_101', `SELECT sm.id, sm.product_id, p.sku, sm.movement_type,
    sm.quantity_change, sm.unit_cost, sm.created_at, sm.reference_id
  FROM public.stock_movements sm JOIN public.products p ON p.id=sm.product_id
  WHERE sm.product_id IN (SELECT product_id FROM public.receipt_items WHERE receipt_id='${FVC}')
    AND sm.created_at > '${EXEC_END}'
  ORDER BY sm.created_at`);

out.post_ejecucion_tx_items = await run('post_tx_items', `SELECT ti.id, ti.product_id, p.sku, ti.quantity,
    ti.cost_at_sale AS costo_registrado, ti.price_at_sale, ti.price_at_sale_cup, ti.created_at,
    t.id AS tx_id, t.created_at AS tx_fecha, t.status
  FROM public.transaction_items ti
  JOIN public.products p ON p.id=ti.product_id
  LEFT JOIN public.transactions t ON t.id=ti.transaction_id
  WHERE ti.product_id IN (SELECT product_id FROM public.receipt_items WHERE receipt_id='${FVC}')
    AND ti.created_at > '${EXEC_END}' ORDER BY ti.created_at`);

out.post_ejecucion_vales = await run('post_vales', `SELECT isi.id, isi.product_id, p.sku, isi.quantity, isi.unit_cost,
    isi.created_at, is2.id AS vale_id, is2.slip_number, is2.created_at AS vale_fecha, is2.status
  FROM public.issue_slip_items isi
  JOIN public.products p ON p.id=isi.product_id
  LEFT JOIN public.issue_slips is2 ON is2.id=isi.slip_id
  WHERE isi.product_id IN (SELECT product_id FROM public.receipt_items WHERE receipt_id='${FVC}')
    AND isi.created_at > '${EXEC_END}' ORDER BY isi.created_at`);

out.updated_at_lineas = await run('updated_at_lineas', `SELECT min(updated_at) AS primera, max(updated_at) AS ultima,
    count(*)::int AS n, count(*) FILTER (WHERE updated_at BETWEEN '${EXEC_START}' AND '${EXEC_END}')::int AS en_ventana,
    count(*) FILTER (WHERE updated_at < '${EXEC_START}')::int AS antes,
    count(*) FILTER (WHERE updated_at > '${EXEC_END}')::int AS despues
  FROM public.receipt_items WHERE receipt_id='${FVC}'`);

// stock_movements es append-only (sin updated_at): la evidencia de inmutabilidad
// es que NO existen capas nuevas de la recepción tras la ventana de ejecución.
out.capas_creadas_post = await run('capas_creadas_post', `SELECT count(*)::int AS n,
    count(*) FILTER (WHERE created_at BETWEEN '${EXEC_START}' AND '${EXEC_END}')::int AS en_ventana
  FROM public.stock_movements WHERE reference_id='${FVC}' AND movement_type='purchase'`);

// ═══ 7. §9 INTEGRIDAD FUERA DE ALCANCE ══════════════════════════════════════
out.integridad = {};
out.integridad.otras_recepciones_cabeceras = await run('int_otras_cabeceras', `SELECT count(*)::int AS n
  FROM public.receipts WHERE id<>'${FVC}' AND updated_at > '${WIN_START}'`);
out.integridad.otras_recepciones_lineas = await run('int_otras_lineas', `SELECT count(*)::int AS n
  FROM public.receipt_items WHERE receipt_id<>'${FVC}' AND updated_at > '${WIN_START}'`);
out.integridad.productos_ajenos = await run('int_productos_ajenos', `SELECT count(*)::int AS n
  FROM public.products WHERE updated_at > '${WIN_START}'
    AND id NOT IN (SELECT product_id FROM public.receipt_items WHERE receipt_id='${FVC}')`);
out.integridad.otros_movimientos = await run('int_otros_movs', `SELECT count(*)::int AS n,
    count(*) FILTER (WHERE store_id<>'${STORE}')::int AS otras_tiendas
  FROM public.stock_movements WHERE created_at > '${WIN_START}'`);
out.integridad.otras_tiendas_asientos = await run('int_otras_tiendas_asientos', `SELECT count(*)::int AS n
  FROM public.fin_entries WHERE posted_at > '${WIN_START}' AND store_id<>'${STORE}'`);
out.integridad.audit_log_ventana = await run('int_auditoria', `SELECT trace_id, action, count(*)::int AS n, max(created_at) AS ultima
  FROM public.audit_logs WHERE created_at > '${WIN_START}' GROUP BY 1,2 ORDER BY 3 DESC LIMIT 50`);
out.integridad.proveedores = await run('proveedores', `SELECT id, name FROM public.suppliers ORDER BY name LIMIT 30`);
out.integridad.precios_cambiados = await run('int_precios', `SELECT p.sku, p.price, p.updated_at
  FROM public.products p WHERE p.updated_at > '${WIN_START}'
    AND p.id IN (SELECT product_id FROM public.receipt_items WHERE receipt_id='${FVC}')`);

// ═══ HASHES DE CONTROL ══════════════════════════════════════════════════════
out.hashes = {
  lineas: md5(out.receipt_items?.map((r) => `${r.line_id}|${r.unit_cost}|${r.moneda_recepcion}|${r.tasa_cambio_recepcion}`).join(',') || ''),
  capas: md5(out.capas_fvc?.map((r) => `${r.capa_id}|${r.unit_cost}`).join(',') || ''),
  kardex: md5((out.kardex_101 || []).map((r) => `${r.id}|${r.unit_cost}`).join(',') || ''),
};

mkdirSync(resolve('scripts/out/m012'), { recursive: true });
writeFileSync(resolve('scripts/out/m012/extract.json'), JSON.stringify(out, null, 2));
console.log(`\nExtract → scripts/out/m012/extract.json (${JSON.stringify(out.hashes)})`);
const errs = out.consultas.filter((c) => c.error);
console.log(`Consultas OK: ${out.consultas.length - errs.length}/${out.consultas.length}${errs.length ? ' · ERRORES: ' + errs.map((e) => e.label).join(', ') : ''}`);

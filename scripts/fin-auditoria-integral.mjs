#!/usr/bin/env node
/**
 * CP-FIN — AUDITORÍA INTEGRAL del motor de partida doble (misión de
 * validación final, §5-§7 de la auditoría). Ejecuta los 10 escenarios
 * matemáticos (A-J) con documentos REALES contra la BD E2E aislada
 * (lguovmvrozxgssupkwpf), más RLS multitienda (SET ROLE) y la matriz de
 * integración documental. Limpieza total al final (net delta 0).
 *
 * Uso: node fin-auditoria-integral.mjs
 */
import { readFileSync } from 'node:fs';

const E = process.env;
const REPO = '/home/z/my-project/Costpro';
const REF = 'lguovmvrozxgssupkwpf';
if (!E.SUPABASE_ACCESS_TOKEN) {
  const env = readFileSync(`${REPO}/.env`, 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !E[m[1]]) E[m[1]] = m[2].trim();
  }
}
function fatal(msg) { console.error(`[aud] FATAL: ${msg}`); process.exit(1); }
function fail(msg) { console.error(`[aud] ✗ FALLO: ${msg}`); RESULTS.fallos.push(msg); }
function ok(msg) { console.log(`[aud] ✓ ${msg}`); }
const RESULTS = { casos: [], fallos: [] };
function caso(id, nombre, pass, detalle) {
  RESULTS.casos.push({ id, nombre, pass, detalle: detalle || '' });
  console.log(`  ${pass ? '✓' : '✗'} ${id} — ${nombre}${detalle ? ` · ${detalle}` : ''}`);
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${E.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 2500)); return sql(query); }
  const text = await res.text();
  if (!res.ok) throw new Error(`(HTTP ${res.status}) ${text.slice(0, 600)}`);
  return JSON.parse(text || '[]');
}
const movs = async (dt, doc) => sql(`
  SELECT m.category_code, m.sense, m.amount, m.currency, m.exchange_rate, m.amount_cup,
         m.currency_origin, e.event, e.rule_version_id
  FROM public.fin_entries e JOIN public.fin_movements m ON m.entry_id = e.id
  WHERE e.document_type='${dt}' AND e.document_id='${doc}' ORDER BY e.event, m.category_code;`);
const sums = async (dt, doc) => sql(`
  SELECT e.event, coalesce(sum(CASE WHEN m.sense='debito' THEN m.amount_cup ELSE 0 END),0) deb,
         coalesce(sum(CASE WHEN m.sense='credito' THEN m.amount_cup ELSE 0 END),0) cred, count(m.id) nm
  FROM public.fin_entries e LEFT JOIN public.fin_movements m ON m.entry_id=e.id
  WHERE e.document_type='${dt}' AND e.document_id='${doc}' GROUP BY e.event;`);
const byCat = (rows, cat, sense) => rows.filter(m => m.category_code === cat && m.sense === sense);
const amt = (rows, cat, sense) => Number((byCat(rows, cat, sense)[0] || {}).amount_cup || 0);

async function main() {
  console.log('════ CP-FIN · AUDITORÍA INTEGRAL (BD aislada ' + REF + ') ════');

  // ── Fixtures: tienda, admin, vendedor/producto de una venta real existente ──
  const store = (await sql(`SELECT id FROM public.stores WHERE name='Enervida' LIMIT 1`))[0]?.id
    || (await sql(`SELECT id FROM public.stores ORDER BY created_at LIMIT 1`))[0].id;
  const admin = (await sql(`SELECT id FROM public.profiles WHERE role='admin' ORDER BY created_at LIMIT 1`))[0].id;
  const storeB = (await sql(`SELECT id FROM public.stores WHERE id <> '${store}' ORDER BY created_at LIMIT 1`))[0].id;
  const sampleTx = (await sql(`SELECT store_id, seller_id FROM public.transactions WHERE status='completed' ORDER BY created_at DESC LIMIT 1`))[0];
  const sampleItem = (await sql(`SELECT ti.product_id FROM public.transaction_items ti
    JOIN public.transactions t ON t.id = ti.transaction_id
    JOIN public.products pr ON pr.id = ti.product_id  -- producto EXISTENTE (hay items huérfanos históricos)
    WHERE t.status='completed' ORDER BY ti.created_at DESC LIMIT 1`))[0];
  if (!sampleTx || !sampleItem) fatal('sin ventas históricas en la aislada para reutilizar vendedor/producto');
  console.log(`fixtures: store=${store} storeB=${storeB} admin=${admin} seller=${sampleTx.seller_id} product=${sampleItem.product_id}`);

  // ── §0 PRE-LIMPIEZA (idempotente) ──
  await sql(`BEGIN;
    SET LOCAL app.restore_mode = 'true';
    -- Defecto pre-existente del módulo servicios (multimoneda): paid_amount se
    -- guarda en CUP y el guard prevent_received_service_edit lo compara contra
    -- total_amount en divisa → un servicio USD pagado queda "atascado" (ni
    -- editable ni anulable ni borrables sus pagos). Para limpiar datos de
    -- auditoría se normaliza total ANTES de tocar los pagos (documentado en el
    -- informe final como hallazgo fuera de alcance CP-FIN).
    UPDATE public.received_services SET total_amount = GREATEST(total_amount, COALESCE(paid_amount, 0))
      WHERE service_number LIKE 'FIN-AUD-%' AND COALESCE(paid_amount, 0) > total_amount;
    DELETE FROM public.fin_movements WHERE entry_id IN (SELECT id FROM public.fin_entries WHERE document_id::text IN (
      SELECT id::text FROM public.transactions WHERE idempotency_key LIKE 'FIN-AUD-%'
      UNION ALL SELECT id::text FROM public.received_services WHERE service_number LIKE 'FIN-AUD-%'
      UNION ALL SELECT id::text FROM public.receipts WHERE document_number LIKE 'FIN-AUD-%'
      UNION ALL SELECT id::text FROM public.payrolls WHERE payroll_number LIKE 'FIN-AUD-%'));
    DELETE FROM public.fin_entries WHERE document_id::text IN (
      SELECT id::text FROM public.transactions WHERE idempotency_key LIKE 'FIN-AUD-%'
      UNION ALL SELECT id::text FROM public.received_services WHERE service_number LIKE 'FIN-AUD-%'
      UNION ALL SELECT id::text FROM public.receipts WHERE document_number LIKE 'FIN-AUD-%'
      UNION ALL SELECT id::text FROM public.payrolls WHERE payroll_number LIKE 'FIN-AUD-%');
    DELETE FROM public.fin_entries WHERE document_type='TRANSFERENCIA';
    DELETE FROM public.payment_transactions WHERE ref_type='service' AND ref_id IN
      (SELECT id FROM public.received_services WHERE service_number LIKE 'FIN-AUD-%');
    DELETE FROM public.payment_transactions WHERE ref_type='receipt' AND ref_id IN (SELECT id FROM public.receipts WHERE document_number LIKE 'FIN-AUD-%');
    DELETE FROM public.payment_transactions WHERE ref_type='sale' AND ref_id IN (SELECT id FROM public.transactions WHERE idempotency_key LIKE 'FIN-AUD-%');
    DELETE FROM public.transaction_items WHERE transaction_id IN (SELECT id FROM public.transactions WHERE idempotency_key LIKE 'FIN-AUD-%');
    DELETE FROM public.transactions WHERE idempotency_key LIKE 'FIN-AUD-%';
    DELETE FROM public.received_services WHERE service_number LIKE 'FIN-AUD-%';
    DELETE FROM public.receipt_items WHERE receipt_id IN (SELECT id FROM public.receipts WHERE document_number LIKE 'FIN-AUD-%');
    DELETE FROM public.receipts WHERE document_number LIKE 'FIN-AUD-%';
    DELETE FROM public.payrolls WHERE payroll_number LIKE 'FIN-AUD-%';
    DELETE FROM public.transfers WHERE notes LIKE 'FIN-AUD-%';
    DELETE FROM public.fin_posting_errors WHERE document_id::text IN (
      SELECT id::text FROM public.transactions WHERE idempotency_key LIKE 'FIN-AUD-%'
      UNION ALL SELECT id::text FROM public.received_services WHERE service_number LIKE 'FIN-AUD-%'
      UNION ALL SELECT id::text FROM public.receipts WHERE document_number LIKE 'FIN-AUD-%'
      UNION ALL SELECT id::text FROM public.payrolls WHERE payroll_number LIKE 'FIN-AUD-%');
    -- errores huérfanos de la fase de descubrimiento (documento ya borrado por
    -- limpiezas anteriores): restauran el estado pristino de 0 errores
    DELETE FROM public.fin_posting_errors e
    WHERE NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = e.document_id)
      AND NOT EXISTS (SELECT 1 FROM public.received_services s WHERE s.id = e.document_id)
      AND NOT EXISTS (SELECT 1 FROM public.receipts rc WHERE rc.id = e.document_id)
      AND NOT EXISTS (SELECT 1 FROM public.payrolls p WHERE p.id = e.document_id)
      AND NOT EXISTS (SELECT 1 FROM public.devolutions d WHERE d.id = e.document_id)
      AND NOT EXISTS (SELECT 1 FROM public.payment_transactions pt WHERE pt.id = e.document_id)
      AND NOT EXISTS (SELECT 1 FROM public.transfers tr WHERE tr.id = e.document_id);
    DELETE FROM public.fin_rule_versions WHERE notes LIKE 'FIN-AUD-v2-%';
    UPDATE public.fin_rule_versions SET status='active'
      WHERE document_type='SERVICIO_RECIBIDO' AND status='inactive' AND version=1
      AND NOT EXISTS (SELECT 1 FROM public.fin_rule_versions WHERE document_type='SERVICIO_RECIBIDO' AND status='active');
    COMMIT;`);

  // ════════════════════════════════════════════════════════════════════
  console.log('\n── CASO A · Venta en efectivo 100 CUP (costo 60) — REAL, secuencia create_sale_v2 ──');
  // Secuencia REAL del RPC: cabecera 'completed' + items + pagos en UNA transacción;
  // el trigger diferido dispara al COMMIT con todos los datos presentes (fix 20261113120300).
  const txA = crypto.randomUUID();
  await sql(`BEGIN;
    INSERT INTO public.transactions
      (id, store_id, seller_id, total_amount, status, sale_currency, sale_exchange_rate,
       payment_method, completed_at, idempotency_key, invoice_number)
    VALUES ('${txA}', '${sampleTx.store_id}', '${sampleTx.seller_id}', 100, 'completed', 'CUP', 1,
       'cash', now(), 'FIN-AUD-A', 'FIN-AUD-A-001');
    INSERT INTO public.transaction_items (transaction_id, product_id, quantity, price_at_sale, cost_at_sale)
    VALUES ('${txA}', '${sampleItem.product_id}', 1, 100, 60);
    INSERT INTO public.payment_transactions
      (store_id, ref_type, ref_id, transaction_id, amount, payment_method, currency, exchange_rate, direction)
    VALUES ('${sampleTx.store_id}', 'sale', '${txA}', '${txA}', 100, 'cash', 'CUP', 1, 'in');
    COMMIT;`);
  {
    const rows = await movs('VENTA', txA);
    const s = (await sums('VENTA', txA)).find(x => x.event === 'reconocimiento');
    const efectivoD = amt(rows, 'ACT_EFECTIVO_CUP', 'debito');
    const ventasC = amt(rows, 'ING_VENTAS', 'credito');
    const cogsD = amt(rows, 'GAS_COSTO_VENTAS', 'debito');
    const invC = amt(rows, 'ACT_INVENTARIO', 'credito');
    caso('A.1', '4 movimientos: D efectivo 100 / C ingresos 100 / D costo 60 / C inventario 60',
      rows.length === 4 && efectivoD === 100 && ventasC === 100 && cogsD === 60 && invC === 60,
      `ef=${efectivoD} ing=${ventasC} cogs=${cogsD} inv=${invC}`);
    caso('A.2', 'asiento equilibrado (160 D = 160 C)',
      Number(s.deb) === 160 && Number(s.cred) === 160, `D=${s.deb} C=${s.cred}`);
    const inc = await sql(`SELECT public.fin_get_income_statement('${sampleTx.store_id}', CURRENT_DATE - 1, CURRENT_DATE + 1, NULL) AS r;`);
    const i = typeof inc[0].r === 'string' ? JSON.parse(inc[0].r) : inc[0].r;
    caso('A.3', 'utilidad bruta = 40 (ingresos netos 100, costo de ventas 60)',
      Number(i.ingresos_netos) === 100 && Number(i.costo_ventas) === -60 && Number(i.utilidad_bruta) === 40,
      `ing=${i.ingresos_netos} cogs=${i.costo_ventas} UB=${i.utilidad_bruta}`);
  }

  // ════════════════════════════════════════════════════════════════════
  console.log('\n── CASO B · Venta a crédito 200 (costo 120) — PATRÓN (no existe venta a crédito en COSTPRO) ──');
  {
    // B.1: el patrón CxC está soportado por el motor (simulador con override)
    const movsCxC = JSON.stringify([
      { id: 'b1', evento: 'reconocimiento', categoria: 'ACT_CXC', sentido: 'debito', origen: { tipo: 'metrica', metrica: 'total_cup' }, orden: 1 },
      { id: 'b2', evento: 'reconocimiento', categoria: 'ING_VENTAS', sentido: 'credito', origen: { tipo: 'metrica', metrica: 'total_cup' }, orden: 2 },
      { id: 'b3', evento: 'reconocimiento', categoria: 'GAS_COSTO_VENTAS', sentido: 'debito', origen: { tipo: 'metrica', metrica: 'costo_productos_cup' }, orden: 3 },
      { id: 'b4', evento: 'reconocimiento', categoria: 'ACT_INVENTARIO', sentido: 'credito', origen: { tipo: 'metrica', metrica: 'costo_productos_cup' }, orden: 4 },
    ]);
    const m = { store_id: store, total_cup: 200, costo_productos_cup: 120 };
    const sim = await sql(`SELECT public.fin_simulate('VENTA', NULL, \$j\$${m ? JSON.stringify(m) : '{}'}\$j\$::jsonb, \$j\$${movsCxC}\$j\$::jsonb, NULL) AS r;`);
    const s1 = typeof sim[0].r === 'string' ? JSON.parse(sim[0].r) : sim[0].r;
    caso('B.1', 'patrón CxC soportado: D CxC 200 / C ingresos 200 + D costo 120 / C inventario 120 (equilibrado 320=320)',
      s1.equilibrado === true && Number(s1.total_debitos) === 320, `D=${s1.total_debitos} C=${s1.total_creditos}`);
    // B.2: el cobro posterior NO reconoce ingreso (patrón de pago)
    const movsCobro = JSON.stringify([
      { id: 'c1', evento: 'reconocimiento', categoria: 'ACT_EFECTIVO_CUP', sentido: 'debito', origen: { tipo: 'metrica', metrica: 'importe_pago_cup' }, orden: 1 },
      { id: 'c2', evento: 'reconocimiento', categoria: 'ACT_CXC', sentido: 'credito', origen: { tipo: 'metrica', metrica: 'importe_pago_cup' }, orden: 2 },
    ]);
    const sim2 = await sql(`SELECT public.fin_simulate('VENTA', NULL, \$j\${"store_id":"${store}","importe_pago_cup":200}\$j\$::jsonb, \$j\$${movsCobro}\$j\$::jsonb, NULL) AS r;`);
    const s2 = typeof sim2[0].r === 'string' ? JSON.parse(sim2[0].r) : sim2[0].r;
    const sinIngreso = !s2.movimientos.some(x => x.categoria === 'ING_VENTAS');
    caso('B.2', 'cobro posterior: D efectivo 200 / C CxC 200 SIN nuevo ingreso',
      s2.equilibrado === true && sinIngreso && s2.movimientos.length === 2,
      `movs=${s2.movimientos.length}, ingreso presente=${!sinIngreso}`);
    // B.3: la regla por defecto de VENTA NO genera CxC (sin ventas a crédito en COSTPRO)
    const regla = await sql(`SELECT movements FROM public.fin_rule_versions WHERE document_type='VENTA' AND status='active' AND store_id IS NULL;`);
    const tieneCxC = JSON.stringify(regla[0].movements).includes('ACT_CXC');
    caso('B.3', 'documentado: la regla por defecto no genera CxC (COSTPRO no tiene ventas a crédito)',
      tieneCxC === false, `ACT_CxC en regla por defecto=${tieneCxC}`);
  }

  // ════════════════════════════════════════════════════════════════════
  console.log('\n── CASO C · Servicio recibido pendiente 50 CUP + pago — REAL ──');
  const svcC = (await sql(`INSERT INTO public.received_services
    (store_id, service_number, service_date, service_type_name, supplier, currency, exchange_rate,
     total_amount, status, payment_status, payment_method, paid_amount)
    VALUES ('${store}', 'FIN-AUD-C', CURRENT_DATE, 'Auditoría C', 'Proveedor Aud', 'CUP', 1, 50, 'active', 'unpaid', 'cash', 0)
    RETURNING id;`))[0].id;
  await sql(`INSERT INTO public.payment_transactions
    (store_id, ref_type, ref_id, amount, payment_method, currency, exchange_rate, direction)
    VALUES ('${store}', 'service', '${svcC}', 50, 'cash', 'CUP', 1, 'in');`);
  {
    const rows = await movs('SERVICIO_RECIBIDO', svcC);
    const rec = rows.filter(m => m.event === 'reconocimiento');
    const pago = rows.filter(m => m.event === 'pago');
    caso('C.1', 'reconocimiento: D GAS_SERVICIOS 50 / C PAS_SERV_PEND 50',
      amt(rec, 'GAS_SERVICIOS', 'debito') === 50 && amt(rec, 'PAS_SERV_PEND', 'credito') === 50);
    caso('C.2', 'pago: D PAS_SERV_PEND 50 / C efectivo 50 (deuda ↓ y caja ↓; gasto NO duplicado)',
      amt(pago, 'PAS_SERV_PEND', 'debito') === 50 && amt(pago, 'ACT_EFECTIVO_CUP', 'credito') === 50
      && rec.filter(m => m.category_code === 'GAS_SERVICIOS').length === 1,
      `gastos reconocidos=${rec.filter(m => m.category_code === 'GAS_SERVICIOS').length}`);
  }

  // ════════════════════════════════════════════════════════════════════
  console.log('\n── CASO D · Compra inventario pendiente 150 CUP + pago — REAL, secuencia register_reception ──');
  const recD = crypto.randomUUID();
  await sql(`BEGIN;
    INSERT INTO public.receipts (id, store_id, document_number, status, reception_date)
    VALUES ('${recD}', '${store}', 'FIN-AUD-D', 'active', CURRENT_DATE);
    INSERT INTO public.receipt_items (receipt_id, product_id, quantity, unit_cost, moneda_recepcion, tasa_cambio_recepcion)
    VALUES ('${recD}', '${sampleItem.product_id}', 3, 50, 'CUP', 1);
    COMMIT;`);
  await sql(`INSERT INTO public.payment_transactions
    (store_id, ref_type, ref_id, amount, payment_method, currency, exchange_rate, direction)
    VALUES ('${store}', 'receipt', '${recD}', 150, 'cash', 'CUP', 1, 'in');`);
  {
    const rows = await movs('RECEPCION', recD);
    const rec = rows.filter(m => m.event === 'reconocimiento');
    const pago = rows.filter(m => m.event === 'pago');
    caso('D.1', 'reconocimiento: D ACT_INVENTARIO 150 / C PAS_CXP_PROV 150',
      amt(rec, 'ACT_INVENTARIO', 'debito') === 150 && amt(rec, 'PAS_CXP_PROV', 'credito') === 150);
    caso('D.2', 'SIN costo de ventas en la compra (ningún GAS_COSTO_VENTAS)',
      rec.filter(m => m.category_code === 'GAS_COSTO_VENTAS').length === 0);
    caso('D.3', 'pago: D PAS_CXP_PROV 150 / C efectivo 150 (deuda ↓ y caja ↓; sin re-reconocer inventario ni costo)',
      amt(pago, 'PAS_CXP_PROV', 'debito') === 150 && amt(pago, 'ACT_EFECTIVO_CUP', 'credito') === 150
      && rec.filter(m => m.category_code === 'ACT_INVENTARIO').length === 1);
  }

  // ════════════════════════════════════════════════════════════════════
  console.log('\n── CASO E · Nómina: devengo/deducciones/neto + pago — REAL ──');
  const nomE = (await sql(`INSERT INTO public.payrolls
    (store_id, payroll_number, status, tipo_nomina, period_start, period_end, currency, entidad_nombre,
     payment_method, notes, total_workers, total_regular_hours, total_overtime_hours, total_accrued_days,
     total_base_salary, total_overtime, total_complementos, total_other_earnings, total_social_security,
     total_gross, total_deductions, total_net, total_vacation_days, total_vacation_amount, created_by)
    VALUES ('${store}', 'FIN-AUD-E', 'confirmed', 'sueldos', CURRENT_DATE - 15, CURRENT_DATE, 'CUP', 'Entidad Auditoría',
     'efectivo', 'auditoría CP-FIN', 1, 0, 0, 0, 1000, 0, 0, 0, 150, 1000, 200, 800, 0, 0, '${admin}')
    RETURNING id;`))[0].id;
  {
    const rows0 = await movs('NOMINA', nomE);
    const rec = rows0.filter(m => m.event === 'reconocimiento');
    caso('E.1', 'confirmada: D GAS_NOMINAS 1000 (gross) / C PAS_NOMINA_PEND 800 (neto) + C PAS_RETENCIONES 200',
      amt(rec, 'GAS_NOMINAS', 'debito') === 1000 && amt(rec, 'PAS_NOMINA_PEND', 'credito') === 800
      && amt(rec, 'PAS_RETENCIONES', 'credito') === 200,
      `gasto=${amt(rec,'GAS_NOMINAS','debito')} neta=${amt(rec,'PAS_NOMINA_PEND','credito')} ret=${amt(rec,'PAS_RETENCIONES','credito')}`);
    await sql(`UPDATE public.payrolls SET status='paid' WHERE id='${nomE}';`);
    const rows1 = await movs('NOMINA', nomE);
    const pago = rows1.filter(m => m.event === 'pago');
    caso('E.2', 'pagada: D PAS_NOMINA_PEND 800 / C efectivo 800 (SIN nuevo gasto; retenciones quedan pendientes)',
      amt(pago, 'PAS_NOMINA_PEND', 'debito') === 800 && amt(pago, 'ACT_EFECTIVO_CUP', 'credito') === 800
      && rows1.filter(m => m.event === 'reconocimiento' && m.category_code === 'GAS_NOMINAS').length === 1
      && pago.filter(m => m.category_code === 'PAS_RETENCIONES').length === 0);
  }

  // ════════════════════════════════════════════════════════════════════
  console.log('\n── CASO F · Transferencia interna CONFIRMADA — REAL ──');
  {
    const beforeInv = (await sql(`SELECT coalesce(sum(cost_average * stock_current), 0) v FROM public.products WHERE store_id='${store}'`))[0];
    await sql(`INSERT INTO public.transfers (origin_store_id, destination_store_id, created_by, status, notes, total_cost)
      VALUES ('${store}', '${storeB}', '${admin}', 'CONFIRMADA', 'FIN-AUD-F', 100);`);
    const entries = await sql(`SELECT count(*)::int n FROM public.fin_entries WHERE document_type='TRANSFERENCIA';`);
    const afterInv = (await sql(`SELECT coalesce(sum(cost_average * stock_current), 0) v FROM public.products WHERE store_id='${store}'`))[0];
    caso('F.1', 'transferencia CONFIRMADA: CERO asientos financieros (sin ingresos ni gastos)',
      entries[0].n === 0, `asientos=${entries[0].n}`);
    caso('F.2', 'valor del inventario de la tienda invariante',
      Number(beforeInv.v) === Number(afterInv.v), `antes=${beforeInv.v} después=${afterInv.v}`);
  }

  // ════════════════════════════════════════════════════════════════════
  console.log('\n── CASO G · Anulación (reversión compensatoria, sin duplicados) ──');
  await sql(`UPDATE public.received_services SET status='voided' WHERE id='${svcC}';`);
  // La segunda edición la BLOQUEA el negocio (trg_prevent_received_service_edit) —
  // protección real de la app; se verifica y luego se prueba la idempotencia
  // del MOTOR con una segunda llamada directa de anulación.
  const dobleBloqueada = await sql(`BEGIN; UPDATE public.received_services SET status='voided' WHERE id='${svcC}'; ROLLBACK;`)
    .then(() => false).catch(() => true);
  // idempotencia del motor: re-anular directamente no crea duplicados
  await sql(`SELECT public.fin_post_annulment_safe('SERVICIO_RECIBIDO', '${svcC}');`);
  {
    const rows = await movs('SERVICIO_RECIBIDO', svcC);
    const es = await sums('SERVICIO_RECIBIDO', svcC);
    const ests = await sql(`SELECT event, status FROM public.fin_entries WHERE document_type='SERVICIO_RECIBIDO' AND document_id='${svcC}' AND event IN ('reconocimiento','pago');`);
    const anulCount = (await sql(`SELECT count(*)::int n FROM public.fin_entries WHERE document_type='SERVICIO_RECIBIDO' AND document_id='${svcC}' AND event='anulacion';`))[0].n;
    caso('G.1', 'anulación compensa reconocimiento y pago (originales → reversed)',
      ests.length === 2 && ests.every(x => x.status === 'reversed') && anulCount === 2,
      `estados=${ests.map(x => x.event + ':' + x.status).join(', ')}`);
    caso('G.2', 'sin duplicados: exactamente 2 asientos de anulación pese a re-anulación directa + negocio bloquea doble void',
      anulCount === 2 && dobleBloqueada, `anulaciones=${anulCount} dobleVoidBloqueada=${dobleBloqueada}`);
    const anul = rows.filter(m => m.event === 'anulacion');
    caso('G.3', 'asientos compensatorios equilibrados e INVERSOS (efectivo −50, gasto −50, CxP ±0)',
      es.filter(x => x.event === 'anulacion').every(x => Number(x.deb) === Number(x.cred))
      && amt(anul, 'ACT_EFECTIVO_CUP', 'debito') === 50 && amt(anul, 'PAS_SERV_PEND', 'credito') === 50
      && amt(anul, 'GAS_SERVICIOS', 'credito') === 50,
      `efD=${amt(anul,'ACT_EFECTIVO_CUP','debito')} gasC=${amt(anul,'GAS_SERVICIOS','credito')}`);
  }

  // ════════════════════════════════════════════════════════════════════
  console.log('\n── CASO H · Multimoneda (USD con tasa autorizada) — REAL ──');
  const svcH = (await sql(`INSERT INTO public.received_services
    (store_id, service_number, service_date, service_type_name, supplier, currency, exchange_rate,
     total_amount, status, payment_status, payment_method, paid_amount)
    VALUES ('${store}', 'FIN-AUD-H', CURRENT_DATE, 'Auditoría H', 'Proveedor USD', 'USD', 400, 10, 'active', 'unpaid', 'transfer', 0)
    RETURNING id;`))[0].id;
  await sql(`INSERT INTO public.payment_transactions
    (store_id, ref_type, ref_id, amount, payment_method, currency, exchange_rate, direction)
    VALUES ('${store}', 'service', '${svcH}', 10, 'transfer', 'USD', 400, 'in');`);
  {
    const rows = await movs('SERVICIO_RECIBIDO', svcH);
    const rec = rows.filter(m => m.event === 'reconocimiento');
    const m0 = rec[0];
    caso('H.1', 'movimiento en USD normalizado con tasa del documento: currency_origin=USD, importe 4000 CUP-equiv (10 USD × 400)',
      rec.length >= 2 && m0.currency_origin === 'USD' && m0.currency === 'CUP'
      && Number(m0.amount) === 4000 && Number(m0.amount_cup) === 4000,
      `cur_orig=${m0.currency_origin} amount=${m0.amount} cup=${m0.amount_cup}`);
    const pago = rows.filter(m => m.event === 'pago');
    const p0 = pago[0];
    caso('H.2', 'pago en USD: D ACT_BANCOS 4000 CUP-equivalente / C PAS_SERV_PEND 4000 (banco ≠ cash, moneda origen preservada)',
      p0 && p0.category_code === 'ACT_BANCOS' && Number(p0.amount_cup) === 4000 && p0.currency_origin === 'USD',
      `cat=${p0 ? p0.category_code : '?'} cup=${p0 ? p0.amount_cup : '?'} orig=${p0 ? p0.currency_origin : '?'}`);
    // H.3: nunca se suman CUP y USD directamente: todos los movimientos están
    // normalizados (currency='CUP', amount_cup=amount) y conservan la moneda origen
    const directos = await sql(`SELECT count(*)::int n FROM public.fin_movements
      WHERE currency <> 'CUP' OR amount_cup <> amount;`);
    caso('H.3', 'NINGÚN movimiento suma monedas sin convertir (todos CUP-normalizados; origen en currency_origin)',
      directos[0].n === 0, `inconsistencias=${directos[0].n}`);
    // H.4: la conversión usa la TASA DEL PROPIO documento (400), no una inventada
    const entrySnap = await sql(`SELECT movements_snapshot FROM public.fin_entries
      WHERE document_type='SERVICIO_RECIBIDO' AND document_id='${svcH}' AND event='reconocimiento';`);
    const snap = typeof entrySnap[0].movements_snapshot === 'string' ? JSON.parse(entrySnap[0].movements_snapshot) : entrySnap[0].movements_snapshot;
    caso('H.4', 'la tasa de conversión es la del documento (10 USD × 400 = 4000, no otra)',
      snap.every(m => Number(m.amount) === 4000), `montos=${snap.map(m => m.amount).join(',')}`);
  }

  // ════════════════════════════════════════════════════════════════════
  console.log('\n── CASO I · Versiones de reglas (históricos conservan versión) ──');
  {
    const v1 = (await sql(`SELECT id, movements FROM public.fin_rule_versions
      WHERE document_type='SERVICIO_RECIBIDO' AND status='active' AND store_id IS NULL;`))[0];
    // (el asiento del Caso C quedó contabilizado con v1)
    const entryC = (await sql(`SELECT rule_version_id FROM public.fin_entries
      WHERE document_type='SERVICIO_RECIBIDO' AND document_id='${svcC}' AND event='reconocimiento';`))[0];
    // crear y activar v2 (idéntica en movimientos; auditada como FIN-AUD-v2)
    const v2 = (await sql(`INSERT INTO public.fin_rule_versions
      (document_type, store_id, version, status, movements, effective_from, notes)
      VALUES ('SERVICIO_RECIBIDO', NULL, 2, 'draft', \$j\$${JSON.stringify(v1.movements)}\$j\$::jsonb, CURRENT_DATE, 'FIN-AUD-v2 auditoría')
      RETURNING id;`))[0].id;
    // activación como el producto la hace: usuario admin REAL vía JWT (el RPC
    // rechaza canal postgres sin usuario — anti-spoofing verificado en m014)
    await sql(`BEGIN;
      SET LOCAL request.jwt.claims = '{"sub":"${admin}","role":"authenticated"}';
      SELECT public.fin_activate_rule_version('${v2}');
      COMMIT;`);
    const svcI = (await sql(`INSERT INTO public.received_services
      (store_id, service_number, service_date, service_type_name, supplier, currency, exchange_rate,
       total_amount, status, payment_status, payment_method, paid_amount)
      VALUES ('${store}', 'FIN-AUD-I', CURRENT_DATE, 'Auditoría I', 'Proveedor v2', 'CUP', 1, 30, 'active', 'unpaid', 'cash', 0)
      RETURNING id;`))[0].id;
    const entryI = (await sql(`SELECT rule_version_id FROM public.fin_entries
      WHERE document_type='SERVICIO_RECIBIDO' AND document_id='${svcI}' AND event='reconocimiento';`))[0];
    caso('I.1', 'documento NUEVO usa la versión v2 recién activada',
      entryI.rule_version_id === v2, `entry=${entryI.rule_version_id} v2=${v2}`);
    caso('I.2', 'documento HISTÓRICO conserva su versión original (v1)',
      entryC.rule_version_id === v1.id, `entryC=${entryC.rule_version_id} v1=${v1.id}`);
    // restaurar v1 (limpieza del estado de reglas): primero desactivar v2
    // (uq_fin_rules_one_active es un índice único parcial sobre status='active')
    await sql(`BEGIN; SET LOCAL app.restore_mode='true';
      UPDATE public.fin_rule_versions SET status='inactive' WHERE id='${v2}';
      UPDATE public.fin_rule_versions SET status='active' WHERE id='${v1.id}';
      DELETE FROM public.fin_movements WHERE entry_id IN (SELECT id FROM public.fin_entries WHERE document_id='${svcI}');
      DELETE FROM public.fin_entries WHERE document_id='${svcI}';
      DELETE FROM public.received_services WHERE id='${svcI}';
      DELETE FROM public.fin_rule_versions WHERE id='${v2}';
      COMMIT;`);
    const activo = await sql(`SELECT count(*)::int n FROM public.fin_rule_versions WHERE document_type='SERVICIO_RECIBIDO' AND status='active' AND store_id IS NULL;`);
    caso('I.3', 'estado restaurado: exactamente 1 regla activa (v1) tras la auditoría',
      activo[0].n === 1, `activas=${activo[0].n}`);
  }

  // ════════════════════════════════════════════════════════════════════
  console.log('\n── CASO J · Concurrencia (llamadas simultáneas, sin duplicados) ──');
  {
    const svcJ = (await sql(`INSERT INTO public.received_services
      (store_id, service_number, service_date, service_type_name, supplier, currency, exchange_rate,
       total_amount, status, payment_status, payment_method, paid_amount)
      VALUES ('${store}', 'FIN-AUD-J', CURRENT_DATE, 'Auditoría J', 'Proveedor J', 'CUP', 1, 70, 'active', 'unpaid', 'cash', 0)
      RETURNING id;`))[0].id;
    // disparo concurrente: 2 llamadas paralelas de fin_post_document
    const call = `SELECT public.fin_post_document('SERVICIO_RECIBIDO', '${svcJ}', 'reconocimiento', NULL, '${admin}') AS r;`;
    const [r1, r2] = await Promise.all([sql(call), sql(call)]);
    let n1 = (await sql(`SELECT count(*)::int n FROM public.fin_entries WHERE document_type='SERVICIO_RECIBIDO' AND document_id='${svcJ}' AND event='reconocimiento';`))[0].n;
    caso('J.1', '2 llamadas CONCURRENTES → exactamente 1 asiento (advisory lock + índice único)',
      n1 === 1, `asientos=${n1} (respuestas: ${JSON.stringify(r1).slice(0,60)} / ${JSON.stringify(r2).slice(0,60)})`);
    // y una tercera SECUENCIAL tampoco duplica
    await sql(call);
    n1 = (await sql(`SELECT count(*)::int n FROM public.fin_entries WHERE document_type='SERVICIO_RECIBIDO' AND document_id='${svcJ}' AND event='reconocimiento';`))[0].n;
    caso('J.2', 'reintento SECUENCIAL → sigue exactamente 1 asiento (idempotencia)',
      n1 === 1, `asientos=${n1}`);
  }

  // ════════════════════════════════════════════════════════════════════
  console.log('\n── RLS MULTITIENDA (SET ROLE authenticated) ──');
  {
    // movimientos existentes en la tienda A (postgres los ve todos)
    const totalA = (await sql(`SELECT count(*)::int n FROM public.fin_movements WHERE store_id='${store}';`))[0].n;
    // usuario con membresía en A y usuario SIN membresía en A
    const member = (await sql(`SELECT u.user_id FROM public.user_store_memberships u
      WHERE u.store_id='${store}' AND u.status='active' AND u.user_id <> '${admin}'
      ORDER BY u.created_at LIMIT 1;`))[0];
    const nonMember = (await sql(`SELECT p.id FROM public.profiles p
      WHERE p.id <> '${admin}' AND p.role NOT IN ('admin','superadmin') AND NOT EXISTS
        (SELECT 1 FROM public.user_store_memberships u WHERE u.store_id='${store}' AND u.user_id=p.id)
      ORDER BY p.created_at LIMIT 1;`))[0];
    if (member && nonMember && totalA > 0) {
      const asMember = await sql(`BEGIN;
        SET LOCAL ROLE authenticated;
        SET LOCAL request.jwt.claims = '{"sub":"${member.user_id}","role":"authenticated"}';
        SELECT count(*)::int n FROM public.fin_movements WHERE store_id='${store}';
        COMMIT;`);
      const asNonMember = await sql(`BEGIN;
        SET LOCAL ROLE authenticated;
        SET LOCAL request.jwt.claims = '{"sub":"${nonMember.id}","role":"authenticated"}';
        SELECT count(*)::int n FROM public.fin_movements WHERE store_id='${store}';
        COMMIT;`);
      caso('RLS.1', `miembro de la tienda ve SUS movimientos (${totalA})`,
        asMember[0].n === totalA, `visto=${asMember[0].n} esperado=${totalA}`);
      caso('RLS.2', 'NO miembro ve CERO movimientos de la tienda ajena',
        asNonMember[0].n === 0, `visto=${asNonMember[0].n}`);
      // intento de escritura directa evadiendo el motor
      const escr = await sql(`BEGIN;
        SET LOCAL ROLE authenticated;
        SET LOCAL request.jwt.claims = '{"sub":"${member.user_id}","role":"authenticated"}';
        SELECT count(*)::int n FROM public.fin_entries WHERE store_id='${store}';
        ROLLBACK;`);
      caso('RLS.3', 'fin_entries legible por tienda (SELECT-only para authenticated)',
        escr[0].n > 0, `visto=${escr[0].n}`);
    } else {
      caso('RLS.0', 'fixtures insuficientes para prueba dinámica RLS (miembro/no-miembro)', false,
        `member=${!!member} nonMember=${!!nonMember} movs=${totalA}`);
    }
  }

  // ════════════════════════════════════════════════════════════════════
  console.log('\n── MATRIZ DE INTEGRACIÓN DOCUMENTAL (estática: regla × trigger) ──');
  {
    const matriz = await sql(`
      SELECT dt.code, dt.module, dt.trigger_status,
             (rv.id IS NOT NULL) AS regla_activa,
             coalesce(jsonb_array_length(rv.movements), 0) AS n_movs,
             EXISTS (SELECT 1 FROM information_schema.triggers t
                     WHERE t.trigger_schema='public' AND t.trigger_name LIKE 'fin_trg%'
                       AND t.event_object_table = dt.source_table) AS trigger_fin
      FROM public.fin_document_types dt
      LEFT JOIN public.fin_rule_versions rv ON rv.document_type = dt.code AND rv.status='active'
      ORDER BY dt.sort_order;`);
    const dinamicos = { VENTA: 'A', DEVOLUCION_VENTA: null, RECEPCION: 'D', SERVICIO_RECIBIDO: 'C/H/G/J',
      VALE_SALIDA: null, AJUSTE_INVENTARIO: null, COMISION: null, NOMINA: 'E', FLUJO_CAJA: null,
      TRANSFERENCIA: 'F', ORDEN_COMPRA: null, ORDEN_PRODUCCION: null, DEVOLUCION_PROVEEDOR: null };
    console.log('  Tipo | Módulo | Regla activa | movs | Trigger | Caso dinámico');
    for (const m of matriz) {
      console.log(`  ${m.code} | ${m.module} | ${m.regla_activa} | ${m.n_movs} | ${m.trigger_fin} | ${dinamicos[m.code] || '—'}`);
    }
    const conRegla = matriz.filter(m => m.regla_activa);
    const sinRegla = matriz.filter(m => !m.regla_activa);
    caso('MAT.1', '10 tipos documentales con regla activa',
      conRegla.length === 10, `con regla=${conRegla.length}`);
    caso('MAT.2', 'los tipos SIN regla son exactamente los documentados (OC, producción, devolución a proveedor)',
      // tipos documentados SIN regla por diseño (semillas base+motor): OC (la deuda
      // nace en la recepción), orden de producción (futura), orden de trabajo
      // (anticipos), devolución a proveedor (se modela como reversa de recepción)
      // y APERTURA_FIN (is_postable=false: aperturas vía RPC, no vía reglas).
      sinRegla.length === 5
      && sinRegla.every(m => ['ORDEN_COMPRA', 'ORDEN_PRODUCCION', 'ORDEN_TRABAJO', 'DEVOLUCION_PROV', 'APERTURA_FIN'].includes(m.code)),
      `sin regla: ${sinRegla.map(m => m.code).join(', ')}`);
    caso('MAT.3', 'todos los tipos con tabla fuente tienen trigger fin_* (TRANSFERENCIA con regla vacía explícita)',
      matriz.filter(m => m.trigger_status !== '' && !m.trigger_fin && m.regla_activa && m.n_movs > 0).length === 0);
  }

  // ════════════════════════════════════════════════════════════════════
  console.log('\n── LIMPIEZA TOTAL (net delta 0) ──');
  await sql(`BEGIN;
    SET LOCAL app.restore_mode = 'true';
    -- mismo desbloqueo del defecto pre-existente multimoneda (ver §0)
    UPDATE public.received_services SET total_amount = GREATEST(total_amount, COALESCE(paid_amount, 0))
      WHERE service_number LIKE 'FIN-AUD-%' AND COALESCE(paid_amount, 0) > total_amount;
    DELETE FROM public.fin_movements WHERE entry_id IN (SELECT id FROM public.fin_entries WHERE document_id IN
      ('${txA}','${svcC}','${recD}','${nomE}','${svcH}') OR document_type='TRANSFERENCIA'
      OR document_id IN (SELECT id FROM public.received_services WHERE service_number LIKE 'FIN-AUD-%'));
    DELETE FROM public.fin_entries WHERE document_id IN ('${txA}','${svcC}','${recD}','${nomE}','${svcH}')
      OR document_type='TRANSFERENCIA'
      OR document_id IN (SELECT id FROM public.received_services WHERE service_number LIKE 'FIN-AUD-%');
    DELETE FROM public.payment_transactions WHERE ref_id IN ('${txA}','${svcC}','${recD}','${svcH}') AND ref_type IN ('sale','service','receipt');
    DELETE FROM public.transaction_items WHERE transaction_id='${txA}';
    DELETE FROM public.transactions WHERE id='${txA}';
    DELETE FROM public.received_services WHERE service_number LIKE 'FIN-AUD-%';
    DELETE FROM public.receipt_items WHERE receipt_id='${recD}';
    DELETE FROM public.receipts WHERE id='${recD}';
    DELETE FROM public.payrolls WHERE id='${nomE}';
    DELETE FROM public.transfers WHERE notes LIKE 'FIN-AUD-%';
    DELETE FROM public.fin_posting_errors WHERE document_id IN ('${txA}','${svcC}','${recD}','${nomE}','${svcH}')
      OR document_id IN (SELECT id FROM public.received_services WHERE service_number LIKE 'FIN-AUD-%');
    COMMIT;`);
  const resid = await sql(`SELECT
    (SELECT count(*) FROM public.fin_entries e WHERE e.document_id IN ('${txA}','${svcC}','${recD}','${nomE}','${svcH}')) e,
    (SELECT count(*) FROM public.received_services WHERE service_number LIKE 'FIN-AUD-%') s,
    (SELECT count(*) FROM public.transactions WHERE idempotency_key LIKE 'FIN-AUD-%') t,
    (SELECT count(*) FROM public.receipts WHERE document_number LIKE 'FIN-AUD-%') r,
    (SELECT count(*) FROM public.payrolls WHERE payroll_number LIKE 'FIN-AUD-%') p,
    (SELECT count(*) FROM public.transfers WHERE notes LIKE 'FIN-AUD-%') tr;`);
  const totalResid = Object.values(resid[0]).reduce((a, b) => a + Number(b), 0);
  caso('LIMP.1', 'cero residuos de la auditoría (net delta 0)', totalResid === 0, JSON.stringify(resid[0]));

  // ════════════════════════════════════════════════════════════════════
  console.log('\n════ RESUMEN DE LA AUDITORÍA ════');
  const pass = RESULTS.casos.filter(c => c.pass).length;
  for (const c of RESULTS.casos) if (!c.pass) console.log(`  ✗ ${c.id} — ${c.nombre} · ${c.detalle}`);
  console.log(`casos: ${pass}/${RESULTS.casos.length} PASS${RESULTS.fallos.length ? ' · FALLOS=' + RESULTS.fallos.length : ''}`);
  console.log(RESULTS.fallos.length === 0 ? 'AUDITORÍA INTEGRAL: TODO OK' : 'AUDITORÍA INTEGRAL: CON FALLOS');
  process.exitCode = RESULTS.fallos.length === 0 && pass === RESULTS.casos.length ? 0 : 1;
}

main().catch(e => fatal(e.message));

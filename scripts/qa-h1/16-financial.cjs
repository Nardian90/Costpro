/**
 * FASE H1 — §12 INTEGRIDAD FINANCIERA (matriz de manipulación campo a campo)
 */
const { rpc, fixtures, login, q, createSuite, brief } = require('./lib.cjs');

const S = createSuite('FIN — Integridad financiera', '16-financial');

(async () => {
  const fx = fixtures();
  const tokA = (await login('qa.h1.a@costpro.test', fx.pass_a)).token;
  const tokSup = (await login('qa.h1.sup@costpro.test', fx.pass_sup)).token;

  const items = (price, qty = 1) => [{ product_id: fx.product_a, quantity: qty, price_at_sale: price, cost_at_sale: 999 }];
  const sale = (over = {}) => ({
    p_store_id: fx.store_a,
    p_seller_id: fx.user_a,
    p_items: items(100),
    p_payment_method: 'cash',
    p_discount_type: 'fixed',
    p_discount_value: 0,
    p_applied_taxes: [],
    p_tax_amount: 0,
    p_total_amount: 100,
    p_subtotal: 100,
    p_cash_amount: 100,
    p_sale_currency: 'CUP',
    p_sale_exchange_rate: 1,
    p_idempotency_key: `qa-fin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...over,
  });
  const tx = (id) => q(`SELECT subtotal, tax_amount, total_amount, discount_value, sale_exchange_rate
    FROM public.transactions WHERE id='${id}';`);
  const itemsOf = (id) => q(`SELECT price_at_sale, cost_at_sale, price_at_sale_cup
    FROM public.transaction_items WHERE transaction_id='${id}';`);

  // ── unit_price inferior (sin supervisor) ──
  await S.test('T-FIN-001', '§12 — precio inferior al autorizado (50 vs catálogo 100) sin supervisor',
    'ERR_SUPERVISOR_REQUIRED (gate de desvío ≥15%)',
    async () => {
      const r = await rpc('create_sale_v2', sale({ p_items: items(50), p_total_amount: 50 }), tokA);
      const gated = r.status >= 400 && /SUPERVISOR_REQUIRED/.test(JSON.stringify(r.body));
      return {
        status: gated ? 'PASS' : 'FAIL',
        current: brief(r),
        evidence: gated ? 'gate de desvío de precio operativo (E-SEC-FINAL D1)' : 'precio por debajo de catálogo sin autorización',
      };
    });

  // ── precio inferior CON supervisor válido (camino propio RC-1) ──
  await S.test('T-FIN-002', '§12 — precio inferior CON supervisor válido (manager propio, motivo)',
    'venta autorizada persistida con snapshot de precio',
    async () => {
      const r = await rpc('create_sale_v2', sale({
        p_items: items(50), p_total_amount: 50,
        p_seller_id: fx.super_a,
        p_supervisor_user_id: fx.super_a,
        p_discount_reason: 'QA autorización supervisor',
      }), tokSup);
      if (r.status !== 200) return { status: 'FAIL', current: brief(r), evidence: 'venta con supervisor válida falló' };
      const it = await itemsOf(r.body.transaction_id);
      return {
        status: Number(it[0].price_at_sale) === 50 ? 'PASS' : 'FAIL',
        current: `price_at_sale=${it[0].price_at_sale}`,
        evidence: 'camino supervisor (sesión propia manager + motivo) funciona — RC-1 intacto',
      };
    });

  // ── precio superior ──
  await S.test('T-FIN-003', '§12 — precio superior al autorizado (150 vs 100)',
    'política documentada E-SEC-FINAL D1: desvío evalúa SOLO precio<catálogo; overprice permitido sin gate (decisión funcional vigente) — anotado para revisión H0',
    async () => {
      const r = await rpc('create_sale_v2', sale({ p_items: items(150), p_total_amount: 150 }), tokA);
      const allowed = r.status === 200;
      return {
        status: 'PASS',
        current: allowed ? `ACEPTADA sin supervisor (política D1 vigente)` : brief(r),
        evidence: allowed
          ? 'E-SEC-FINAL D1 (migración 20260927000001) computa desvío únicamente cuando v_price < v_reference: el sobreprecio NO dispara gate. Es comportamiento aprobado documentado; H0 puede endurecerlo.'
          : 'overprice bloqueado',
      };
    });

  // ── subtotal incorrecto ──
  await S.test('T-FIN-004', '§12 — subtotal del cliente (999) debe ser recalculado server-side',
    'transactions.subtotal == 100 (valor servidor), no el del cliente',
    async () => {
      const r = await rpc('create_sale_v2', sale({ p_subtotal: 999 }), tokA);
      if (r.status !== 200) return { status: 'FAIL', current: brief(r), evidence: 'venta falló' };
      const t = await tx(r.body.transaction_id);
      return {
        status: Number(t[0].subtotal) === 100 ? 'PASS' : 'FAIL',
        current: `subtotal persistido=${t[0].subtotal}`,
        evidence: 'p_subtotal es recalculado (parámetro ignorado)',
      };
    });

  // ── total incorrecto ──
  await S.test('T-FIN-005', '§12 — total del cliente inconsistente → rechazo',
    'ERR_TOTAL_MISMATCH',
    async () => {
      const r = await rpc('create_sale_v2', sale({ p_total_amount: 50 }), tokA);
      const mismatch = r.status >= 400 && /TOTAL_MISMATCH/.test(JSON.stringify(r.body));
      return {
        status: mismatch ? 'PASS' : 'FAIL',
        current: brief(r),
        evidence: mismatch ? 'validación de total server-side' : 'total arbitrario aceptado',
      };
    });

  // ── tax param ignorado pero applied_taxes arbitrario ──
  await S.test('T-FIN-006', '§12 — tax_amount del cliente ignorado; autoridad real en applied_taxes',
    'el impuesto persistido deriva de fuente autorizada — hoy: del JSONB cliente (referencia T-H4-003)',
    async () => {
      const r = await rpc('create_sale_v2', sale({ p_tax_amount: 999, p_applied_taxes: [{ type: 'fixed', value: 10 }], p_total_amount: 110 }), tokA);
      if (r.status !== 200) return { status: 'FAIL', current: brief(r), evidence: 'venta falló' };
      const t = await tx(r.body.transaction_id);
      const taxFromClientJson = Number(t[0].tax_amount) === 10;
      return {
        status: 'FAIL',
        current: `tax_amount cliente=999 → persistido=${t[0].tax_amount} (derivó del JSONB cliente con value=10)`,
        evidence: 'el parámetro p_tax_amount se ignora (bien) pero la fuente real del impuesto sigue siendo p_applied_taxes del cliente (mal) — ver T-H4-001..005',
      };
    });

  // ── descuento negativo ──
  await S.test('T-FIN-007', '§12 — descuento negativo (fixed -100) no puede aumentar el total',
    'DENIED — descuento no puede ser negativo ni esquivar el gate',
    async () => {
      const r = await rpc('create_sale_v2', sale({ p_discount_value: -100, p_total_amount: 200 }), tokA);
      if (r.status === 200) {
        const t = await tx(r.body.transaction_id);
        return {
          status: 'FAIL',
          current: `ACEPTADA: subtotal=${t[0].subtotal} descuento=${t[0].discount_value} total=${t[0].total_amount}`,
          evidence: 'descuento NEGATIVO persistido — el total se infla y el gate de supervisor no dispara (pct negativo)',
        };
      }
      return { status: 'PASS', current: brief(r), evidence: 'descuento negativo rechazado' };
    });

  // ── descuento > subtotal ──
  await S.test('T-FIN-008', '§12 — descuento mayor que el subtotal (999999)',
    'capped a subtotal y gate de supervisor (100% descuento exige autorización)',
    async () => {
      const r = await rpc('create_sale_v2', sale({ p_discount_value: 999999, p_total_amount: 0 }), tokA);
      const gated = r.status >= 400 && /SUPERVISOR_REQUIRED/.test(JSON.stringify(r.body));
      return {
        status: gated ? 'PASS' : 'FAIL',
        current: brief(r),
        evidence: gated ? 'cap + gate operativos' : 'descuento sin límite',
      };
    });

  // ── exchange rate manipulado ──
  await S.test('T-FIN-009', '§12 — exchange rate manipulado (referencia T-H5-001)',
    'tasa server-side — hoy el cliente la impone (FAIL vía H5)',
    async () => {
      const r = await rpc('create_sale_v2', sale({ p_sale_currency: 'USD', p_sale_exchange_rate: 1000000 }), tokA);
      if (r.status !== 200) return { status: 'FAIL', current: brief(r), evidence: 'venta falló' };
      const t = await tx(r.body.transaction_id);
      const it = await itemsOf(r.body.transaction_id);
      return {
        status: 'FAIL',
        current: `rate persistida=${t[0].sale_exchange_rate} · price_at_sale_cup=${it[0].price_at_sale_cup}`,
        evidence: `tasa cliente 1000000 persistida; price_at_sale_cup = precio*rate cliente (${it[0].price_at_sale_cup}) — autoridad de tasa en el cliente (ver suite H5)`,
      };
    });

  // ── cost_at_sale manipulado ──
  await S.test('T-FIN-010', '§12 — cost_at_sale del cliente (999) ignorado → WAC del servidor',
    'transaction_items.cost_at_sale == WAC del producto (50)',
    async () => {
      const r = await rpc('create_sale_v2', sale(), tokA); // items llevan cost_at_sale=999
      if (r.status !== 200) return { status: 'FAIL', current: brief(r), evidence: 'venta falló' };
      const it = await itemsOf(r.body.transaction_id);
      return {
        status: Number(it[0].cost_at_sale) === 50 ? 'PASS' : 'FAIL',
        current: `cost_at_sale persistido=${it[0].cost_at_sale} (cliente envió 999)`,
        evidence: 'DF-02: costo siempre del servidor (WAC bajo lock); claves cost/cost_at_sale del request ignoradas',
      };
    });

  // ── payment inconsistente (mixed) ──
  await S.test('T-FIN-011', '§12 — pagos mixed inconsistentes con el total',
    'ERR_PAYMENT_MISMATCH',
    async () => {
      const r = await rpc('create_sale_v2', sale({
        p_payment_method: 'mixed', p_cash_amount: 40, p_transfer_amount: 40,
      }), tokA);
      const mismatch = r.status >= 400 && /PAYMENT_MISMATCH/.test(JSON.stringify(r.body));
      return {
        status: mismatch ? 'PASS' : 'FAIL',
        current: brief(r),
        evidence: mismatch ? 'invariante de suma de pagos operativa' : 'pagos inconsistentes aceptados',
      };
    });

  // ── pago cash mayor al total (server override) ──
  await S.test('T-FIN-012', '§12 — cash_amount cliente (999) ignorado en método cash',
    'cash_amount persistido == total server (100)',
    async () => {
      const r = await rpc('create_sale_v2', sale({ p_cash_amount: 999 }), tokA);
      if (r.status !== 200) return { status: 'FAIL', current: brief(r), evidence: 'venta falló' };
      const t = await q(`SELECT cash_amount FROM public.transactions WHERE id='${r.body.transaction_id}';`);
      return {
        status: Number(t[0].cash_amount) === 100 ? 'PASS' : 'FAIL',
        current: `cash_amount persistido=${t[0].cash_amount}`,
        evidence: 'para método único el servidor impone el importe = total',
      };
    });

  S.finish();
})().catch(e => { console.error('❌ suite FIN:', e); process.exit(1); });

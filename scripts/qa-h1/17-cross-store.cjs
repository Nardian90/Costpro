/**
 * FASE H1 — §13 CROSS-STORE SECURITY (matriz A–F con actores reales)
 */
const { rpc, rest, fixtures, login, q, createSuite, isDenied, brief } = require('./lib.cjs');

const S = createSuite('CS — Cross-store security', '17-cross-store');

(async () => {
  const fx = fixtures();
  const tokA = (await login('qa.h1.a@costpro.test', fx.pass_a)).token;
  const tokB = (await login('qa.h1.b@costpro.test', fx.pass_b)).token;

  const itemsA = [{ product_id: fx.product_a, quantity: 1, price_at_sale: 100 }];
  const itemsB = [{ product_id: fx.product_b, quantity: 1, price_at_sale: 200 }];
  const sale = (over = {}) => ({
    p_store_id: fx.store_a,
    p_seller_id: fx.user_a,
    p_items: itemsA,
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
    p_idempotency_key: `qa-cs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...over,
  });

  // A — USER_A crea venta en STORE_A
  await S.test('T-CS-001', 'CS-A — USER_A crea venta en STORE_A',
    'HTTP 200 con transacción creada',
    async () => {
      const r = await rpc('create_sale_v2', sale(), tokA);
      return {
        status: r.status === 200 && r.body.transaction_id ? 'PASS' : 'FAIL',
        current: brief(r),
        evidence: `venta legítima en tienda propia (${r.body?.transaction_id})`,
      };
    });

  // B — USER_A intenta vender en STORE_B
  await S.test('T-CS-002', 'CS-B — USER_A intenta crear venta en STORE_B',
    'DENIED (ERR_UNAUTHORIZED)',
    async () => {
      const r = await rpc('create_sale_v2', sale({
        p_store_id: fx.store_b, p_items: itemsB, p_total_amount: 200, p_subtotal: 200,
      }), tokA);
      const denied = isDenied(r) && /UNAUTHORIZED/.test(JSON.stringify(r.body));
      return {
        status: denied ? 'PASS' : 'FAIL',
        current: brief(r),
        evidence: denied ? 'membresía de tienda validada (has_store_access_as)' : 'venta cross-store aceptada',
      };
    });

  // C — USER_A usa seller de STORE_B (spoof) — cubre matriz C
  await S.test('T-CS-003', 'CS-C — USER_A utiliza seller de STORE_B',
    'DENIED (referencia T-H3-003)',
    async () => {
      const r = await rpc('create_sale_v2', sale({ p_seller_id: fx.user_b }), tokA);
      if (r.status === 200) {
        const t = await q(`SELECT seller_id FROM public.transactions WHERE id='${r.body.transaction_id}';`);
        return {
          status: 'FAIL',
          current: `ACEPTADA con seller_id=${t[0].seller_id}`,
          evidence: `venta en STORE_A atribuida a USER_B (miembro de STORE_B): tx ${r.body.transaction_id}`,
        };
      }
      return { status: 'PASS', current: brief(r), evidence: 'seller cross-store rechazado' };
    });

  // D — USER_A usa producto de STORE_B en STORE_A
  await S.test('T-CS-004', 'CS-D — USER_A utiliza producto de STORE_B en venta de STORE_A',
    'DENIED — producto ajeno a la tienda no puede venderse',
    async () => {
      const r = await rpc('create_sale_v2', sale({ p_items: itemsB, p_total_amount: 200 }), tokA);
      if (r.status === 200) {
        const it = await q(`SELECT product_id FROM public.transaction_items WHERE transaction_id='${r.body.transaction_id}';`);
        return {
          status: 'FAIL',
          current: `ACEPTADA: item product_id=${it[0]?.product_id} (producto de STORE_B) en venta de STORE_A`,
          evidence: `venta cross-store de producto ajeno: tx ${r.body.transaction_id}`,
        };
      }
      const why = JSON.stringify(r.body);
      return {
        status: 'PASS',
        current: brief(r),
        evidence: `producto cross-store rechazado (${/STORE_MISMATCH/.test(why) ? 'ERR_STORE_MISMATCH via trigger fn_sync_inventory_on_movement (defense-in-depth: el trigger valida product.store_id vs movement.store_id; el RPC en sí usa fallback sin filtro de tienda en primera pasada)' : 'mecanismo RPC'})`,
      };
    });

  // E — USER_A reutiliza clave de idempotencia creada por USER_B
  await S.test('T-CS-005', 'CS-E — USER_A reutiliza idempotency key creada por USER_B',
    'DENY/CONFLICT sin revelar la transacción ajena',
    async () => {
      // USER_B crea venta en STORE_B con clave conocida
      const keyE = `qa-cs-e-${Date.now()}`;
      const rb = await rpc('create_sale_v2', sale({
        p_store_id: fx.store_b, p_seller_id: fx.user_b, p_items: itemsB,
        p_total_amount: 200, p_subtotal: 200, p_idempotency_key: keyE,
      }), tokB);
      if (rb.status !== 200) throw new Error(`fixture USER_B falló: ${brief(rb)}`);
      // USER_A reutiliza la clave apuntando a STORE_B
      const r = await rpc('create_sale_v2', sale({
        p_store_id: fx.store_b, p_items: itemsB, p_total_amount: 200, p_idempotency_key: keyE,
      }), tokA);
      const leaks = r.status === 200 && r.body?.status === 'idempotent';
      return {
        status: leaks ? 'FAIL' : 'PASS',
        current: `USER_A + clave de USER_B → ${brief(r)}`,
        evidence: leaks
          ? `FUGA: USER_A obtuvo transaction_id=${r.body.transaction_id} de la venta de USER_B en STORE_B sin membresía`
          : 'reutilización cross-actor rechazada sin fuga',
      };
    });

  // F — USER_A modifica transacción de STORE_B (tabla directa, RLS)
  await S.test('T-CS-006', 'CS-F — USER_A UPDATE directo sobre transacción de STORE_B',
    'DENIED por RLS (0 filas afectadas)',
    async () => {
      const txs = await q(`SELECT id FROM public.transactions WHERE store_id='${fx.store_b}' ORDER BY created_at DESC LIMIT 1;`);
      if (!txs[0]) return { status: 'FAIL', current: 'sin transacción de STORE_B para probar', evidence: 'fixture' };
      const r = await rest('PATCH', `/rest/v1/transactions?id=eq.${txs[0].id}`, tokA, { total_amount: 1 });
      const denied = r.status === 403 || r.status === 401 || (r.status === 204 && false);
      // PostgREST: 204 con 0 filas NO informa… se verifica post-hoc que no cambió
      const t = await q(`SELECT total_amount FROM public.transactions WHERE id='${txs[0].id}';`);
      const unchanged = Number(t[0].total_amount) === 200;
      return {
        status: (r.status === 403 || r.status === 401 || unchanged) ? 'PASS' : 'FAIL',
        current: `PATCH → ${r.status} · total sigue=${t[0].total_amount}`,
        evidence: `RLS transactions_update_rls exige membresía activa en la tienda de la transacción: escritura de USER_A sobre STORE_B bloqueada`,
      };
    });

  // F2 — USER_A lee transacciones de STORE_B
  await S.test('T-CS-007', 'CS-F — USER_A SELECT de transacciones de STORE_B',
    '0 filas visibles (RLS SELECT)',
    async () => {
      const r = await rest('GET', `/rest/v1/transactions?store_id=eq.${fx.store_b}&select=id`, tokA);
      const rows = Array.isArray(r.body) ? r.body.length : -1;
      return {
        status: rows === 0 ? 'PASS' : 'FAIL',
        current: `GET → ${r.status} filas=${rows}`,
        evidence: 'aislamiento de lectura cross-store operativo',
      };
    });

  S.finish();
})().catch(e => { console.error('❌ suite CS:', e); process.exit(1); });

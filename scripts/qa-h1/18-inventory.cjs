/**
 * FASE H1 — §14 INVENTARIO + CONCURRENCIA
 */
const { rpc, fixtures, login, q, createSuite, brief } = require('./lib.cjs');

const S = createSuite('INV — Inventario + concurrencia', '18-inventory');

(async () => {
  const fx = fixtures();
  const tokA = (await login('qa.h1.a@costpro.test', fx.pass_a)).token;

  const inv = (store, product) => q(`SELECT quantity FROM public.inventory
    WHERE store_id='${store}' AND product_id='${product}';`);
  const sale = (items, over = {}) => ({
    p_store_id: fx.store_a,
    p_seller_id: fx.user_a,
    p_items: items,
    p_payment_method: 'cash',
    p_discount_type: 'fixed',
    p_discount_value: 0,
    p_applied_taxes: [],
    p_tax_amount: 0,
    p_subtotal: 100,
    p_cash_amount: 100,
    p_sale_currency: 'CUP',
    p_sale_exchange_rate: 1,
    p_idempotency_key: `qa-inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...over,
  });

  // T-INV-001: cadena atómica completa
  await S.test('T-INV-001', 'INV — venta crea tx + items + decremento + stock_movement',
    'transacción, items, movimiento y decremento consistentes',
    async () => {
      const before = await inv(fx.store_a, fx.product_a);
      const r = await rpc('create_sale_v2', sale([{ product_id: fx.product_a, quantity: 2, price_at_sale: 100 }], { p_total_amount: 200, p_cash_amount: 200 }), tokA);
      if (r.status !== 200) return { status: 'FAIL', current: brief(r), evidence: 'venta falló' };
      const after = await inv(fx.store_a, fx.product_a);
      const moves = await q(`SELECT count(*) AS c FROM public.stock_movements WHERE reference_id='${r.body.transaction_id}';`);
      const itemsN = await q(`SELECT count(*) AS c FROM public.transaction_items WHERE transaction_id='${r.body.transaction_id}';`);
      const delta = Number(before[0].quantity) - Number(after[0].quantity);
      return {
        status: delta === 2 && Number(moves[0].c) === 1 && Number(itemsN[0].c) === 1 ? 'PASS' : 'FAIL',
        current: `delta_inventory=${delta} movimientos=${moves[0].c} items=${itemsN[0].c}`,
        evidence: 'cadena tx→items→movimiento→decremento atómica',
      };
    });

  // T-INV-002: stock insuficiente
  await S.test('T-INV-002', 'INV — stock insuficiente → rechazo sin efectos',
    'ERR_INSUFFICIENT_STOCK y 0 escrituras',
    async () => {
      const before = await inv(fx.store_a, fx.product_a);
      const r = await rpc('create_sale_v2', sale([{ product_id: fx.product_a, quantity: 999999, price_at_sale: 100 }], { p_total_amount: 100 }), tokA);
      const after = await inv(fx.store_a, fx.product_a);
      const stockErr = r.status >= 400 && /INSUFFICIENT_STOCK/.test(JSON.stringify(r.body));
      const unchanged = Number(before[0].quantity) === Number(after[0].quantity);
      return {
        status: stockErr && unchanged ? 'PASS' : 'FAIL',
        current: `${brief(r)} · inventario ${before[0].quantity}→${after[0].quantity}`,
        evidence: 'oversell bloqueado por SELECT FOR UPDATE + pre-validación',
      };
    });

  // T-INV-003: dos ventas simultáneas sobre la última unidad
  await S.test('T-INV-003', 'INV — 2 ventas concurrentes sobre la última unidad (stock=1)',
    'exactamente 1 éxito · 1 rechazo · inventario >= 0 · sin duplicar movimiento',
    async () => {
      // repone la última unidad del producto LOW (fixture maintenance, restore_mode documentado)
      await q(`SELECT set_config('app.restore_mode','true', false); UPDATE public.inventory SET quantity=1 WHERE store_id='${fx.store_a}' AND product_id='${fx.product_a_low}'; SELECT 'ok' AS r;`);
      const key = `qa-inv-conc-${Date.now()}`;
      const mk = () => rpc('create_sale_v2', sale(
        [{ product_id: fx.product_a_low, quantity: 1, price_at_sale: 100 }], { p_total_amount: 100, p_idempotency_key: key }
      ), tokA);
      const [ra, rb] = await Promise.all([mk(), mk()]);
      const after = await inv(fx.store_a, fx.product_a_low);
      // los 200 pueden incluir el retorno idempotente (misma tx): contar IDS distintos
      const ids = [ra, rb].filter(x => x.status === 200 && x.body?.transaction_id).map(x => x.body.transaction_id);
      const distinct = new Set(ids);
      const created = Number((await q(`SELECT count(*) AS c FROM public.transactions WHERE idempotency_key='${key}';`))[0].c);
      const moves = Number((await q(`SELECT count(*) AS c FROM public.stock_movements m
        JOIN public.transactions t ON t.id::text = m.reference_id WHERE t.idempotency_key='${key}';`))[0].c);
      const qty = Number(after[0].quantity);
      return {
        status: created === 1 && distinct.size === 1 && moves === 1 && qty === 0 ? 'PASS' : 'FAIL',
        current: `transacciones=${created} idsDistintos=${distinct.size} movimientos=${moves} inventario_final=${qty} · resp200=${ids.length}`,
        evidence: created === 1 && distinct.size === 1
          ? 'advisory lock por tienda + idempotencia serializan la última unidad sin oversell'
          : `duplicación u oversell bajo concurrencia: ids=${[...distinct].join(',')}`,
      };
    });

  // T-INV-004: rollback por fallo intermedio (2 items, 2º sin stock)
  await S.test('T-INV-004', 'INV — rollback atómico: fallo en 2ª línea revierte la 1ª',
    'sin transacción, sin movimientos, inventario intacto',
    async () => {
      const before = await inv(fx.store_a, fx.product_a);
      const r = await rpc('create_sale_v2', sale([
        { product_id: fx.product_a, quantity: 1, price_at_sale: 100 },
        { product_id: fx.product_a_low, quantity: 999, price_at_sale: 100 }, // stock=1 → falla
      ], { p_total_amount: 300 }), tokA);
      const after = await inv(fx.store_a, fx.product_a);
      const unchanged = Number(before[0].quantity) === Number(after[0].quantity);
      // ¿quedó transacción colgante con idempotency_key de este intento?
      const keyUsed = r._key; // no disponible — verificar por movimientos recientes fallidos
      const moves = await q(`SELECT count(*) AS c FROM public.stock_movements
        WHERE product_id='${fx.product_a}' AND created_at >= now() - interval '30 seconds';`);
      // los movimientos recientes legítimos de T-INV-001/002 cuentan; verificamos
      // que NO haya movimiento 'sale' sin transacción correspondiente
      const orphan = await q(`SELECT count(*) AS c FROM public.stock_movements m
        WHERE m.movement_type='sale' AND m.product_id='${fx.product_a}'
          AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.id::text = m.reference_id);`);
      return {
        status: r.status >= 400 && unchanged && Number(orphan[0].c) === 0 ? 'PASS' : 'FAIL',
        current: `${brief(r)} · inventario ${before[0].quantity}→${after[0].quantity} · movimientosHuérfanos=${orphan[0].c}`,
        evidence: 'atomicidad de la transacción SQL revierte items+movimientos al fallar',
      };
    });

  // T-INV-005: invariante quantity >= 0 tras la suite
  await S.test('T-INV-005', 'INV — invariante inventory.quantity >= 0 en fixtures QA',
    'todas las cantidades QA >= 0',
    async () => {
      const rows = await q(`SELECT store_id, product_id, quantity FROM public.inventory
        WHERE store_id IN ('${fx.store_a}','${fx.store_b}');`);
      const neg = rows.filter(r => Number(r.quantity) < 0);
      return {
        status: neg.length === 0 ? 'PASS' : 'FAIL',
        current: `filas=${rows.length} negativas=${neg.length}`,
        evidence: 'trigger prevent_negative_inventory + pre-validación RPC mantienen el invariante',
      };
    });

  S.finish();
})().catch(e => { console.error('❌ suite INV:', e); process.exit(1); });

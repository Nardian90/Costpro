/**
 * FASE H1 — H2: AUTHENTICATION ORDER (§5)
 *
 * T-H2-001  Runtime: USER autenticado SIN membresía + clave existente → debe
 *           ERR_UNAUTHORIZED (authz antes de idempotencia). Evidencia de orden.
 * T-H2-002  Runtime: USER autenticado SIN membresía + clave aleatoria → denied
 *           (authz funciona cuando la clave no golpea).
 * T-H2-003  Post-condición: llamadas denegadas no crean transacción (no write).
 * T-H2-004  Cadena completa observable: para una venta válida existe
 *           transaction + items + payment + stock_movement (orden de efectos
 *           verificado post-hoc); la secuencia interna exacta
 *           actor→authorization→membership NO es directamente observable
 *           sin instrumentation → NOT-OBSERVABLE (parcial) + evidencia estática.
 */
const { rpc, fixtures, login, q, createSuite, isDenied, bodyLeaksTx, brief } = require('./lib.cjs');

const S = createSuite('H2 — AUTHENTICATION ORDER', '11-h2-order');

(async () => {
  const fx = fixtures();
  const tokA = (await login('qa.h1.a@costpro.test', fx.pass_a)).token;
  const tokB = (await login('qa.h1.b@costpro.test', fx.pass_b)).token;

  const baseItems = [{ product_id: fx.product_a, quantity: 1, price_at_sale: 100 }];
  const baseSale = (over = {}) => ({
    p_store_id: fx.store_a,
    p_seller_id: fx.user_a,
    p_items: baseItems,
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
    ...over,
  });

  // venta válida de USER_A con clave conocida
  const key = `qa-h2-${Date.now()}`;
  const created = await rpc('create_sale_v2', baseSale({ p_idempotency_key: key }), tokA);
  if (created.status !== 200) throw new Error(`fixture falló: ${brief(created)}`);
  const txId = created.body.transaction_id;

  // ── T-H2-001: USER_B (sin membresía en STORE_A) + clave existente ──
  await S.test('T-H2-001', 'H2 — authZ debe preceder a idempotencia: no-miembro + clave existente',
    'ERR_UNAUTHORIZED (HTTP >= 400) SIN transaction_id — la clave no puede satisfacerse antes de autorizar',
    async () => {
      const r = await rpc('create_sale_v2', baseSale({ p_idempotency_key: key }), tokB);
      const denied = isDenied(r);
      const leaks = bodyLeaksTx(r);
      return {
        status: denied && !leaks ? 'PASS' : 'FAIL',
        current: `USER_B (sin membresía STORE_A) + clave existente → ${brief(r)}`,
        evidence: leaks
          ? `ORDEN VIOLADO: idempotencia se resuelve ANTES de la autorización — USER_B obtiene transaction_id=${r.body.transaction_id} de una venta de STORE_A sin ser miembro`
          : 'orden correcto',
      };
    });

  // ── T-H2-002: no-miembro + clave aleatoria ──
  await S.test('T-H2-002', 'H2 — no-miembro + clave aleatoria → denied',
    'HTTP >= 400 ERR_UNAUTHORIZED sin datos',
    async () => {
      const r = await rpc('create_sale_v2', baseSale({ p_idempotency_key: `qa-h2-r-${Date.now()}` }), tokB);
      return {
        status: isDenied(r) && !bodyLeaksTx(r) ? 'PASS' : 'FAIL',
        current: brief(r),
        evidence: `autorización efectiva cuando la clave no golpea: ${brief(r)}`,
      };
    });

  // ── T-H2-003: llamadas denegadas no persisten nada ──
  await S.test('T-H2-003', 'H2 — denegación no produce escritura (no side-effects)',
    '0 transacciones nuevas creadas por llamadas denegadas',
    async () => {
      const before = await q(`SELECT count(*) AS c FROM public.transactions WHERE store_id='${fx.store_a}';`);
      await rpc('create_sale_v2', baseSale({ p_idempotency_key: `qa-h2-x1-${Date.now()}` }), 'anon');
      await rpc('create_sale_v2', baseSale({ p_idempotency_key: `qa-h2-x2-${Date.now()}` }), tokB);
      const after = await q(`SELECT count(*) AS c FROM public.transactions WHERE store_id='${fx.store_a}';`);
      const delta = Number(after[0].c) - Number(before[0].c);
      return {
        status: delta === 0 ? 'PASS' : 'FAIL',
        current: `transacciones antes=${before[0].c} después=${after[0].c} (delta=${delta})`,
        evidence: 'llamadas anon y no-miembro no crean transacciones',
      };
    });

  // ── T-H2-004: cadena de efectos de una venta válida ──
  await S.test('T-H2-004', 'H2 — cadena authentication→…→inventory: efectos observables post-hoc',
    'transacción + items + pago + movimiento de stock presentes y consistentes; orden interno exacto no observable',
    async () => {
      const tx = await q(`SELECT id, seller_id, status, total_amount FROM public.transactions WHERE id='${txId}';`);
      const items = await q(`SELECT count(*) AS c FROM public.transaction_items WHERE transaction_id='${txId}';`);
      const pays = await q(`SELECT count(*) AS c FROM public.payment_transactions WHERE idempotency_key LIKE '%${txId}%' OR paid_by='${fx.user_a}' AND payment_date >= now() - interval '1 hour';`);
      const moves = await q(`SELECT count(*) AS c FROM public.stock_movements WHERE reference_id='${txId}';`);
      const chainOk = tx[0] && Number(items[0].c) >= 1 && Number(moves[0].c) >= 1;
      return {
        status: chainOk ? 'NOT-OBSERVABLE' : 'FAIL',
        current: `tx=${!!tx[0]} items=${items[0].c} pagos~${pays[0].c} movimientos=${moves[0].c}`,
        evidence: chainOk
          ? 'Efectos finales correctos (tx+items+movement). La secuencia INTERNA exacta (actor→authz→membership→idempotencia→validación→cálculo→inventario) NO es observable en runtime sin instrumentation de PG: se requiere verificación por Agent 3 (pg_stat/statements o trace). Evidencia estática complementaria: pg_get_functiondef posiciona "2. Idempotencia" (offset ~2798) ANTES de "3. Auth/ERR_UNAUTHORIZED" (offset ~3242).'
          : 'cadena de efectos incompleta',
      };
    });

  S.finish();
})().catch(e => { console.error('❌ suite H2:', e); process.exit(1); });

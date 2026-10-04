/**
 * FASE H1 — H6: IDEMPOTENCY (§11 — matriz completa + concurrencia)
 */
const { rpc, fixtures, login, q, createSuite, brief } = require('./lib.cjs');

const S = createSuite('H6 — IDEMPOTENCY', '15-h6-idempotency');

(async () => {
  const fx = fixtures();
  const tokA = (await login('qa.h1.a@costpro.test', fx.pass_a)).token;
  const tokB = (await login('qa.h1.b@costpro.test', fx.pass_b)).token;

  const items = (price = 100, qty = 1) => [{ product_id: fx.product_a, quantity: qty, price_at_sale: price }];
  const sale = (key, over = {}) => ({
    p_store_id: fx.store_a,
    p_seller_id: fx.user_a,
    p_items: items(),
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
    p_idempotency_key: key,
    ...over,
  });
  const key = `qa-h6-${Date.now()}`;
  const txCount = (k) => q(`SELECT count(*) AS c FROM public.transactions WHERE idempotency_key='${k}';`);
  const movesOf = (k) => q(`SELECT count(*) AS c FROM public.stock_movements m
    JOIN public.transactions t ON m.reference_id = t.id::text WHERE t.idempotency_key='${k}';`);
  const paysOf = (k) => q(`SELECT count(*) AS c FROM public.payment_transactions p
    JOIN public.transactions t ON p.idempotency_key IN ('pay-cash-'||t.id::text, 'pay-transfer-'||t.id::text, 'pay-zelle-'||t.id::text)
    WHERE t.idempotency_key='${k}';`);

  // crear la venta base
  const r0 = await rpc('create_sale_v2', sale(key), tokA);
  if (r0.status !== 200) throw new Error(`fixture falló: ${brief(r0)}`);
  const tx0 = r0.body.transaction_id;

  // ── same key + same payload ──
  await S.test('T-H6-001', 'H6 — misma clave + mismo payload → misma transacción',
    'segunda llamada retorna la MISMA transaction_id; 1 fila en transactions',
    async () => {
      const r = await rpc('create_sale_v2', sale(key), tokA);
      const c = await txCount(key);
      return {
        status: r.status === 200 && r.body.transaction_id === tx0 && Number(c[0].c) === 1 ? 'PASS' : 'FAIL',
        current: `retry → ${brief(r)} · filas=${c[0].c}`,
        evidence: `idempotencia básica por (key, store) funciona`,
      };
    });

  // ── same key + identical retry: no duplicados ──
  await S.test('T-H6-002', 'H6 — retry idéntico: 0 duplicados (tx/items/pagos/movimientos)',
    'exactly 1 transaction, 1 set items, 1 pago, 1 movimiento de stock',
    async () => {
      await rpc('create_sale_v2', sale(key), tokA);
      await rpc('create_sale_v2', sale(key), tokA);
      const c = await txCount(key);
      const m = await movesOf(key);
      const p = await paysOf(key);
      const it = await q(`SELECT count(*) AS c FROM public.transaction_items WHERE transaction_id='${tx0}';`);
      const okAll = Number(c[0].c) === 1 && Number(m[0].c) === 1 && Number(p[0].c) === 1 && Number(it[0].c) === 1;
      return {
        status: okAll ? 'PASS' : 'FAIL',
        current: `tx=${c[0].c} items=${it[0].c} pagos=${p[0].c} movimientos=${m[0].c}`,
        evidence: okAll ? 'sin duplicación en retry' : 'duplicación detectada',
      };
    });

  // ── same key + different quantity → conflict ──
  await S.test('T-H6-003', 'H6 — misma clave + cantidad DIFERENTE → CONFLICT',
    'respuesta de conflicto (no retorno silencioso de la transacción previa)',
    async () => {
      const r = await rpc('create_sale_v2', sale(key, { p_items: items(100, 2), p_total_amount: 200 }), tokA);
      const silent = r.status === 200 && r.body.transaction_id === tx0 && r.body.status === 'idempotent';
      return {
        status: silent ? 'FAIL' : (r.status === 409 || /conflict/i.test(JSON.stringify(r.body)) ? 'PASS' : 'FAIL'),
        current: `payload distinto (qty=2) con misma clave → ${brief(r)}`,
        evidence: silent
          ? 'CONFLICTO NO DETECTADO: el retry con payload distinto retorna silenciosamente la transacción original — la clave no está ligada al hash del payload'
          : 'conflicto detectado',
      };
    });

  // ── same key + different price → conflict ──
  await S.test('T-H6-004', 'H6 — misma clave + precio DIFERENTE → CONFLICT',
    'respuesta de conflicto',
    async () => {
      const r = await rpc('create_sale_v2', sale(key, { p_items: items(150), p_total_amount: 150 }), tokA);
      const silent = r.status === 200 && r.body.status === 'idempotent';
      return {
        status: silent ? 'FAIL' : (/conflict/i.test(JSON.stringify(r.body)) ? 'PASS' : 'FAIL'),
        current: `precio distinto con misma clave → ${brief(r)}`,
        evidence: silent ? 'CONFLICTO NO DETECTADO para payload con precio distinto' : 'conflicto detectado',
      };
    });

  // ── same key + different store ──
  await S.test('T-H6-005', 'H6 — misma clave + tienda DIFERENTE → deny/conflict',
    'deny o conflict (la clave NO puede reutilizarse en otra tienda)',
    async () => {
      // USER_A no tiene acceso a STORE_B: se evalúa authz (denied) — y la clave no
      // debe satisfacerse en otra tienda.
      const r = await rpc('create_sale_v2', sale(key, { p_store_id: fx.store_b }), tokA);
      const denied = r.status >= 400 && r.body?.status !== 'idempotent';
      return {
        status: denied ? 'PASS' : 'FAIL',
        current: `USER_A + clave existente + STORE_B → ${brief(r)}`,
        evidence: 'el alcance store de la clave impide satisfacerla en otra tienda (authz deniega antes)',
      };
    });

  // ── same key + different actor ──
  await S.test('T-H6-006', 'H6 — misma clave + actor DIFERENTE → deny/conflict (sin fuga)',
    'USER_B con clave de USER_A → deny/conflict, SIN transaction_id de la venta ajena',
    async () => {
      const r = await rpc('create_sale_v2', sale(key), tokB);
      const leaks = r.status === 200 && r.body?.status === 'idempotent' && r.body?.transaction_id === tx0;
      return {
        status: leaks ? 'FAIL' : 'PASS',
        current: `USER_B + clave de USER_A (STORE_A) → ${brief(r)}`,
        evidence: leaks
          ? `FUGA CROSS-ACTOR: USER_B (sin membresía en STORE_A) recibió transaction_id=${tx0} de la venta de USER_A`
          : 'sin fuga cross-actor',
      };
    });

  // ── anon + existing key (fila de matriz) ──
  await S.test('T-H6-007', 'H6 (matriz) — anonymous + clave existente → unauthorized',
    'HTTP >= 401/403 sin transaction_id',
    async () => {
      const r = await rpc('create_sale_v2', sale(key), 'anon');
      const leaks = r.status === 200 && r.body?.status === 'idempotent';
      return {
        status: leaks ? 'FAIL' : 'PASS',
        current: brief(r),
        evidence: leaks ? 'fuga anónima de transaction_id' : 'anon no obtiene datos',
      };
    });

  // ── anon + random key (fila de matriz) ──
  await S.test('T-H6-008', 'H6 (matriz) — anonymous + clave aleatoria → unauthorized',
    'HTTP >= 400 sin datos',
    async () => {
      const r = await rpc('create_sale_v2', sale(`qa-h6-rand-${Date.now()}`), 'anon');
      return {
        status: r.status >= 400 && !r.body?.transaction_id ? 'PASS' : 'FAIL',
        current: brief(r),
        evidence: 'anon denied',
      };
    });

  // ── concurrent same key ──
  await S.test('T-H6-009', 'H6 — concurrente misma clave (mismo actor/tienda/payload)',
    'EXACTLY 1 transacción · 0 duplicados de inventario/pago/movimiento',
    async () => {
      const ckey = `qa-h6-conc-${Date.now()}`;
      const payload = sale(ckey);
      // 1ª llamada crea la transacción
      const r1 = await rpc('create_sale_v2', payload, tokA);
      // 2 llamadas simultáneas (retry + retry) compiten
      const [ra, rb] = await Promise.all([
        rpc('create_sale_v2', payload, tokA),
        rpc('create_sale_v2', payload, tokA),
      ]);
      const c = await txCount(ckey);
      const m = await movesOf(ckey);
      const p = await paysOf(ckey);
      const ids = new Set([r1, ra, rb].filter(x => x.status === 200).map(x => x.body.transaction_id));
      const exactlyOne = Number(c[0].c) === 1 && ids.size === 1 && Number(m[0].c) === 1 && Number(p[0].c) === 1;
      return {
        status: exactlyOne ? 'PASS' : 'FAIL',
        current: `tx=${c[0].c} movimientos=${m[0].c} pagos=${p[0].c} idsDistintos=${ids.size}`,
        evidence: exactlyOne
          ? 'advisory lock por tienda + idempotencia serializan correctamente los retries concurrentes'
          : 'duplicación bajo concurrencia',
      };
    });

  S.finish();
})().catch(e => { console.error('❌ suite H6:', e); process.exit(1); });

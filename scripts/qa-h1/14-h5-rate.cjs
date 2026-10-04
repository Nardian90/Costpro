/**
 * FASE H1 — H5: EXCHANGE RATE AUTHORITY (§10)
 *
 * T-H5-001  Matriz de tasas cliente: 680 / 1000000 / 0 / negativa → server-side
 * T-H5-002  server_rate (store_exchange_rates=400) vs client_rate=7 → gana servidor
 * T-H5-003  Jerarquía store_exchange_rates → exchange_rates → effective
 * T-H5-004  Modificación no autorizada de la fuente de tasa
 * T-H5-005  Staleness — CONTRATO H0 AUSENTE → BLOCKED
 * T-H5-006  Banda de desviación — CONTRATO H0 AUSENTE → BLOCKED
 */
const { rpc, rest, fixtures, login, q, createSuite, brief } = require('./lib.cjs');

const S = createSuite('H5 — EXCHANGE RATE AUTHORITY', '14-h5-rate');

(async () => {
  const fx = fixtures();
  const tokA = (await login('qa.h1.a@costpro.test', fx.pass_a)).token;

  const baseItems = [{ product_id: fx.product_a, quantity: 1, price_at_sale: 100 }];
  const saleUSD = (rate, over = {}) => ({
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
    p_sale_currency: 'USD',
    p_sale_exchange_rate: rate,
    p_idempotency_key: `qa-h5-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...over,
  });
  const storedRate = (id) => q(`SELECT sale_exchange_rate FROM public.transactions WHERE id='${id}';`);

  // ── T-H5-001: matriz de tasas arbitrarias ──
  await S.test('T-H5-001', 'H5.1 — tasa de cambio cliente arbitraria (680 · 1000000 · 0 · -5)',
    'la tasa efectiva persistida proviene de la fuente server-side autorizada, no del payload',
    async () => {
      const probes = [
        { rate: 680, total: 100 },
        { rate: 1000000, total: 100 },
        { rate: 0, total: 100 },
        { rate: -5, total: 100 },
      ];
      const out = [];
      let clientWins = 0;
      for (const p of probes) {
        const r = await rpc('create_sale_v2', saleUSD(p.rate, { p_total_amount: p.total }), tokA);
        if (r.status === 200) {
          const tx = await storedRate(r.body.transaction_id);
          const stored = Number(tx[0].sale_exchange_rate);
          if (stored === p.rate) clientWins++;
          out.push(`rate=${p.rate}→aceptada stored=${stored}`);
        } else {
          out.push(`rate=${p.rate}→rechazada ${r.status}`);
        }
      }
      return {
        status: clientWins === 0 ? 'PASS' : 'FAIL',
        current: out.join(' · '),
        evidence: clientWins > 0
          ? `${clientWins}/4 tasas arbitrarias del cliente fueron persistidas tal cual (sin validación contra fuente server-side; única regla actual: zelle exige rate>1 y moneda != CUP)`
          : 'tasa server-side',
      };
    });

  // ── T-H5-002: server vs client ──
  await S.test('T-H5-002', 'H5.2 — client_rate != server_rate → gana la fuente autorizada',
    'transactions.sale_exchange_rate == server_rate (store_exchange_rates de STORE_A = 400)',
    async () => {
      const r = await rpc('create_sale_v2', saleUSD(7), tokA);
      if (r.status !== 200) return { status: 'FAIL', current: brief(r), evidence: 'venta de prueba falló' };
      const tx = await storedRate(r.body.transaction_id);
      const stored = Number(tx[0].sale_exchange_rate);
      return {
        status: stored === 400 ? 'PASS' : 'FAIL',
        current: `server_rate=400 (store_exchange_rates) · client_rate=7 · persisted=${stored}`,
        evidence: `la tasa efectiva es la del CLIENTE (${stored}), no la fuente server-side configurada para STORE_A`,
      };
    });

  // ── T-H5-003: jerarquía ──
  await S.test('T-H5-003', 'H5.3 — jerarquía store_exchange_rates → exchange_rates → effective',
    'el RPC resuelve la tasa con esa jerarquía server-side',
    async () => {
      const rows = await q(`SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p
        JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_sale_v2';`);
      const refsStore = /store_exchange_rates/.test(rows[0].def);
      const refsGlobal = /exchange_rates/.test(rows[0].def);
      return {
        status: refsStore && refsGlobal ? 'PASS' : 'FAIL',
        current: `refs LIVE: store_exchange_rates=${refsStore} · exchange_rates=${refsGlobal}`,
        evidence: 'create_sale_v2 NO implementa resolución de tasa: p_sale_exchange_rate (cliente) se persiste y usa directamente (price_at_sale_cup = price*rate; zelle_amount/rate). La jerarquía de fuentes NO existe en el RPC.',
      };
    });

  // ── T-H5-004: modificación no autorizada de la fuente ──
  await S.test('T-H5-004', 'H5.4 — usuario normal no puede alterar la fuente de tasa de confianza',
    'USER_A (clerk) NO puede UPDATE store_exchange_rates ni INSERT/UPDATE exchange_rates',
    async () => {
      // a) clerk modifica tasa de SU tienda (policy "Users can manage own store rates")
      const up = await rest('PATCH', `/rest/v1/store_exchange_rates?store_id=eq.${fx.store_a}&currency=eq.USD`, tokA,
        { rate: 1 });
      const ownStoreWritable = up.status === 204 || up.status === 200;
      // restaurar valor fixture si se modificó
      if (ownStoreWritable) await q(`UPDATE public.store_exchange_rates SET rate=400 WHERE store_id='${fx.store_a}' AND currency='USD';`);
      // b) clerk inserta en exchange_rates global
      const ins = await rest('POST', '/rest/v1/exchange_rates', tokA, {
        rate_date: '2026-10-04', currency: 'USD', source: 'qa', rate: 1,
      });
      const globalWritable = ins.status === 201 || ins.status === 200;
      if (globalWritable) await q(`DELETE FROM public.exchange_rates WHERE source='qa';`);
      return {
        status: !ownStoreWritable && !globalWritable ? 'PASS' : 'FAIL',
        current: `store_exchange_rates(own) PATCH → ${up.status} · exchange_rates INSERT → ${ins.status}`,
        evidence: ownStoreWritable
          ? 'La policy "Users can manage own store rates" (roles=public, USING profiles.store_id match) permite a CUALQUIER miembro (incl. clerk) reescribir la tasa de confianza de su tienda — la fuente server-side NO es confiable mientras el checkout dependa de ella'
          : 'fuentes protegidas',
      };
    });

  // ── T-H5-005: staleness ──
  await S.test('T-H5-005', 'H5.5 — staleness de tasa (p.ej. 45 días)',
    'CONTRATO H0: límite de staleness — H0 NO PRODUCIDO',
    async () => {
      const cols = await q(`SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='store_exchange_rates';`);
      return {
        status: 'BLOCKED',
        current: `columnas store_exchange_rates: ${cols.map(c => c.column_name).join(', ')}`,
        evidence: 'El spec H0 no existe; el límite de staleness es decisión H0 y NO SE INVENTA. Además: store_exchange_rates no tiene campo de fecha de captura (solo updated_at de fila) y el RPC no consulta la fuente — no hay contrato de staleness implementado que probar.',
      };
    });

  // ── T-H5-006: banda de desviación ──
  await S.test('T-H5-006', 'H5.6 — banda de desviación (p.ej. ±10%)',
    'CONTRATO H0: banda dentro/fuera — H0 NO PRODUCIDO',
    async () => {
      return {
        status: 'BLOCKED',
        current: 'sin banda implementada: cualquier tasa cliente se acepta (ver T-H5-001)',
        evidence: 'El spec H0 no existe; la banda de desviación es decisión H0 y NO SE INVENTA. La prueba se anclará al valor exacto documentado en H0 cuando exista.',
      };
    });

  S.finish();
})().catch(e => { console.error('❌ suite H5:', e); process.exit(1); });

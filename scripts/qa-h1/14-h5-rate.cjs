/**
 * FASE H1 — H5: EXCHANGE RATE AUTHORITY (§6)
 *
 * T-H5-001  Matriz de tasas cliente: 680 / 1000000 / 0 / negativa → server-side
 * T-H5-002  server_rate (store_exchange_rates=400) vs client_rate=7 → gana servidor
 * T-H5-003  Jerarquía store_exchange_rates → exchange_rates → effective
 * T-H5-004  Modificación no autorizada de la fuente de tasa
 * T-H5-005  Staleness — ENMIENDA H0-R-FINAL (D-EXR-01 APPROVED): 45 días → FAIL CLOSED
 * T-H5-006  Banda de desviación — ENMIENDA H0-R-FINAL (D-EXR-02 APPROVED): NO es control
 *           de autorización; observabilidad no-autoritativa
 */
const { rpc, rest, fixtures, login, q, createSuite, brief, isDenied } = require('./lib.cjs');

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

  // ── T-H5-005: staleness (D-EXR-01 · ENMIENDA H0-R-FINAL · APPROVED) ──
  // Contrato: MAX_EXCHANGE_RATE_AGE = 45 DÍAS. Una tasa cuya fecha efectiva tenga
  // más de 45 días NO puede utilizarse para una nueva venta V2 → FAIL CLOSED →
  // checkout rechazado (ERR_RATE_STALE, HTTP >= 400, sin transaction_id). El cliente
  // NO puede sustituir la tasa vencida vía p_sale_exchange_rate (ni arbitraria ni
  // igual al valor vencido). La jerarquía de precedencia server-side queda intacta
  // (§6.1): la tasa que gana por precedencia y está vencida → rechazo, sin fallback
  // silencioso a otra fuente y sin uso silencioso de la vencida.
  await S.test('T-H5-005', 'H5.5 — staleness de tasa: fecha efectiva >45 días → FAIL CLOSED (D-EXR-01)',
    'MAX_EXCHANGE_RATE_AGE=45 días (APPROVED): tasa vencida NO puede usarse en venta V2 nueva → rechazo ERR_RATE_STALE (HTTP >= 400, sin transaction_id); p_sale_exchange_rate NO puede sustituirla (probe con tasa arbitraria 7 y probe con la propia tasa vencida 350 — ambas rechazadas)',
    async () => {
      const STALE_RATE = 350;
      // fixture QA: tasa de tienda EUR para STORE_A con updated_at = 60 días atrás (vencida)
      // (store_exchange_rates no tiene trigger que fuerce updated_at — verificado; UNIQUE (store_id,currency) libre para EUR)
      const ins = await q(`INSERT INTO public.store_exchange_rates (store_id, currency, rate, updated_by)
        VALUES ('${fx.store_a}', 'EUR', ${STALE_RATE}, '${fx.user_a}') RETURNING id;`);
      const rowId = ins[0].id;
      let out = [];
      let violations = 0;
      try {
        await q(`UPDATE public.store_exchange_rates SET updated_at = now() - interval '60 days', created_at = now() - interval '60 days' WHERE id='${rowId}';`);
        const chk = await q(`SELECT rate, updated_at, GREATEST(0, EXTRACT(EPOCH FROM (now() - updated_at))/86400)::int AS age_days FROM public.store_exchange_rates WHERE id='${rowId}';`);
        const age = chk[0].age_days;
        // sonda 1: cliente envía tasa arbitraria (7) — no puede sustituir la vencida
        const r1 = await rpc('create_sale_v2', saleUSD(7, { p_sale_currency: 'EUR' }), tokA);
        // sonda 2: cliente envía la MISMA tasa vencida (350) — sigue vencida, sigue rechazada
        const r2 = await rpc('create_sale_v2', saleUSD(STALE_RATE, { p_sale_currency: 'EUR' }), tokA);
        for (const [label, r] of [['client_rate=7', r1], ['client_rate=350(vencida)', r2]]) {
          const denied = isDenied(r);
          const code = r.body && r.body.message ? String(r.body.message) : '';
          const staleCode = code.includes('ERR_RATE_STALE');
          if (denied && staleCode) {
            out.push(`${label}→RECHAZADA ${r.status} ERR_RATE_STALE ✓`);
          } else if (denied) {
            violations++;
            out.push(`${label}→rechazada ${r.status} SIN código ERR_RATE_STALE (${code.slice(0, 60)})`);
          } else {
            violations++;
            const tx = await storedRate(r.body.transaction_id);
            out.push(`${label}→ACEPTADA (stored=${tx[0] && tx[0].sale_exchange_rate}) — viola D-EXR-01: tasa vencida ${age}d usada/sustituida por cliente`);
          }
        }
        return {
          status: violations === 0 ? 'PASS' : 'FAIL',
          current: `fixture EUR(store) rate=${STALE_RATE} age=${age}d (>45) · ${out.join(' · ')}`,
          evidence: violations > 0
            ? 'D-EXR-01 NO implementado: create_sale_v2 no resuelve tasa server-side (0 refs a fuentes — T-H5-003) ni aplica gate de staleness; la venta con única tasa de tienda vencida (>45 días) se ACEPTA y persiste la tasa del cliente en vez de rechazar FAIL-CLOSED con ERR_RATE_STALE'
            : 'staleness fail-closed con 45 días',
        };
      } finally {
        await q(`DELETE FROM public.store_exchange_rates WHERE id='${rowId}';`);
      }
    });

  // ── T-H5-006: banda de desviación (D-EXR-02 · ENMIENDA H0-R-FINAL · APPROVED) ──
  // Contrato: client_rate != server_rate NO es control de autorización: NO implica
  // DENY ni ALLOW. La decisión financiera usa SIEMPRE server_authoritative_rate
  // (persistida). La desviación queda como observabilidad NO-autoritativa
  // (audit_logs.metadata: client_rate/server_rate/rate_source). Sin banda ±10%.
  await S.test('T-H5-006', 'H5.6 — desviación cliente↔servidor NO es control de autorización (D-EXR-02)',
    'client_rate != server_rate NO implica DENY ni ALLOW: la venta NO se rechaza por desviación (HTTP 200); la tasa persistida es SIEMPRE la server (store_exchange_rates STORE_A USD = 400); la desviación se registra como observabilidad no-autoritativa en audit_logs.metadata (client_rate, server_rate, rate_source)',
    async () => {
      // tasa servidor fresca (fixture USD=400) vs cliente 7 → desviación extrema (~98%)
      const r = await rpc('create_sale_v2', saleUSD(7), tokA);
      if (r.status !== 200) {
        return { status: 'FAIL', current: brief(r), evidence: 'D-EXR-02: la desviación NO puede causar rechazo — la venta con server rate fresco (400) y client rate divergente (7) debe ser HTTP 200' };
      }
      const tx = await storedRate(r.body.transaction_id);
      const stored = Number(tx[0].sale_exchange_rate);
      const serverWins = stored === 400;
      // observabilidad no-autoritativa: auditoría de la venta registra client vs server
      const aud = await q(`SELECT metadata FROM public.audit_logs WHERE action='CREATE_SALE_V2' AND record_id='${r.body.transaction_id}' LIMIT 1;`);
      const meta = aud[0] && aud[0].metadata ? aud[0].metadata : null;
      const auditObs = !!(meta && meta.client_rate !== undefined && meta.server_rate !== undefined && meta.rate_source !== undefined);
      return {
        status: serverWins && auditObs ? 'PASS' : 'FAIL',
        current: `HTTP 200 (desviación no bloquea ✓) · persisted=${stored} (server=400) · audit(client_rate/server_rate/rate_source)=${auditObs ? 'presente' : 'ausente'}`,
        evidence: serverWins && auditObs
          ? 'desviación no-autoritativa con tasa servidor persistida y auditada'
          : `D-EXR-02/§6.2 NO implementado: la desviación no bloquea (correcto), PERO ${serverWins ? '' : 'la tasa persistida es la del CLIENTE (7), no la server-authoritative (400) — la decisión financiera debe usar server_authoritative_rate; '}${auditObs ? '' : 'audit_logs.metadata (CREATE_SALE_V2) no registra client_rate/server_rate/rate_source — sin trazabilidad de divergencia (hoy el metadata solo lleva líneas/importes, sin campos de tasa)'}`,
      };
    });

  S.finish();
})().catch(e => { console.error('❌ suite H5:', e); process.exit(1); });

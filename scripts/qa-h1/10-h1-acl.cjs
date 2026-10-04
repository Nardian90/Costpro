/**
 * FASE H1 — H1: ACL + AUTH BEFORE IDEMPOTENCY (§4)
 *
 * T-H1-001  Anonymous cannot execute V2 (denied, sin filtrado de datos)
 * T-H1-002  ACL LIVE: sin EXECUTE para PUBLIC/anon en create_sale_v2 (§16)
 * T-H1-003  Existing idempotency key + anon → UNAUTHORIZED (sin transaction_id)
 * T-H1-004  Random key + anon vs existing key + anon → indistinguibles
 */
const { rpc, fixtures, login, q, createSuite, isDenied, bodyLeaksTx, brief } = require('./lib.cjs');

const S = createSuite('H1 — ACL + AUTH BEFORE IDEMPOTENCY', '10-h1-acl');

(async () => {
  const fx = fixtures();
  const tokA = (await login('qa.h1.a@costpro.test', fx.pass_a)).token;

  // payload base de venta válida en STORE_A (producto QA)
  const baseItems = [{ product_id: fx.product_a, quantity: 1, price_at_sale: 100, cost_at_sale: 999 }];
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

  // ── T-H1-001: anon no puede ejecutar V2 ──
  await S.test('T-H1-001', 'H1.1 — Anonymous cannot execute create_sale_v2',
    'DENIED (HTTP >= 400, sin transaction_id, sin divulgación de existencia de transacción/clave/tienda/usuario)',
    async () => {
      const r = await rpc('create_sale_v2', baseSale({ p_idempotency_key: `qa-h1-random-${Date.now()}` }), 'anon');
      const denied = isDenied(r);
      const leaks = bodyLeaksTx(r);
      const msg = JSON.stringify(r.body || {});
      const infoLeak = /store|user|seller|product|stock|price/i.test(msg.replace(/ERR_UNAUTHORIZED|P0001|message|code|details|null/gi, ''));
      return {
        status: denied && !leaks && !infoLeak ? 'PASS' : 'FAIL',
        current: brief(r),
        evidence: `anon + clave aleatoria → ${brief(r)} · filtraTx=${leaks} · infoAdicional=${infoLeak}`,
      };
    });

  // ── T-H1-002: ACL LIVE sin PUBLIC/anon ──
  await S.test('T-H1-002', 'H1/§16 — ACL LIVE: create_sale_v2 sin EXECUTE para PUBLIC ni anon',
    'proacl NO contiene =X (PUBLIC) ni anon=X',
    async () => {
      const rows = await q(`SELECT COALESCE(array_to_string(proacl, ','), '') AS acl
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname='create_sale_v2';`);
      const acl = rows[0].acl;
      const hasPublic = /=X/.test(acl);
      const hasAnon = /anon=X/.test(acl);
      return {
        status: !hasPublic && !hasAnon ? 'PASS' : 'FAIL',
        current: `ACL LIVE = {${acl}}`,
        evidence: `PUBLIC execute=${hasPublic} · anon execute=${hasAnon} — patrón canónico F4 = {PUBLIC, authenticated, service_role}`,
      };
    });

  // ── preparar venta existente con clave conocida (actor real USER_A) ──
  const knownKey = `qa-h1-known-${Date.now()}`;
  const created = await rpc('create_sale_v2', baseSale({ p_idempotency_key: knownKey }), tokA);
  if (created.status !== 200) throw new Error(`fixture: la venta de preparación falló: ${brief(created)}`);

  // ── T-H1-003: anon + clave existente ──
  await S.test('T-H1-003', 'H1.2 — Anonymous + idempotency key EXISTENTE → UNAUTHORIZED sin datos',
    'HTTP >= 400 sin transaction_id, sin status idempotent/success',
    async () => {
      const r = await rpc('create_sale_v2', baseSale({ p_idempotency_key: knownKey }), 'anon');
      const unauthorized = r.status === 401 || r.status === 403 || (r.status === 400 && /UNAUTHORIZED/i.test(JSON.stringify(r.body)));
      const leaks = bodyLeaksTx(r);
      return {
        status: unauthorized && !leaks ? 'PASS' : 'FAIL',
        current: `anon + clave existente → ${brief(r)}`,
        evidence: leaks
          ? `FUGA: anon obtuvo transaction_id=${r.body.transaction_id} de una venta ajena sin autenticarse (orden idempotencia-antes-de-auth)`
          : 'sin fuga observable',
      };
    });

  // ── T-H1-004: indistinguibilidad random vs existing ──
  await S.test('T-H1-004', 'H1.3 — anon: clave existente vs aleatoria indistinguibles antes de autenticar',
    'misma forma de rechazo (status + body) para clave existente y aleatoria',
    async () => {
      const rExisting = await rpc('create_sale_v2', baseSale({ p_idempotency_key: knownKey }), 'anon');
      const rRandom = await rpc('create_sale_v2', baseSale({ p_idempotency_key: `qa-h1-rand-${Date.now()}` }), 'anon');
      const sameStatus = rExisting.status === rRandom.status;
      const sameShape = !!rExisting.body?.message && !!rRandom.body?.message
        && rExisting.body.message === rRandom.body.message;
      const indistinguishable = sameStatus && sameShape && !bodyLeaksTx(rExisting);
      return {
        status: indistinguishable ? 'PASS' : 'FAIL',
        current: `existing → ${brief(rExisting)} || random → ${brief(rRandom)}`,
        evidence: `statusIgual=${sameStatus} · mensajeIgual=${sameShape} — la existencia de la clave ES distinguible por un atacante anónimo`,
      };
    });

  S.finish();
})().catch(e => { console.error('❌ suite H1:', e); process.exit(1); });

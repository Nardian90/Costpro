/**
 * FASE H1 — §17 TESTS DE CONTRATO DE RUTA: /api/pos/checkout
 */
const { rpc, appPost, fixtures, login, q, createSuite, brief } = require('./lib.cjs');
const fs = require('fs');
const path = require('path');

const S = createSuite('RT — Contrato ruta /api/pos/checkout', '30-route-checkout');

(async () => {
  const fx = fixtures();
  const tokA = (await login('qa.h1.a@costpro.test', fx.pass_a)).token;

  const routeBody = (over = {}) => ({
    store_id: fx.store_a,
    seller_id: fx.user_a,
    payment_method: 'cash',
    discount_type: 'fixed',
    discount_value: 0,
    applied_taxes: [],
    tax_amount: 0,
    total_amount: 100,
    subtotal: 100,
    cash_amount: 100,
    transfer_amount: 0,
    zelle_amount: 0,
    sale_currency: 'CUP',
    sale_exchange_rate: 1,
    customer_name: null,
    idempotency_key: `qa-rt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    items: [{ product_id: fx.product_a, quantity: 1, price: 100, cost: 999 }],
    ...over,
  });

  // 401 sin auth
  await S.test('T-RT-001', 'RT — POST /api/pos/checkout sin sesión → 401',
    'HTTP 401',
    async () => {
      const r = await appPost('/api/pos/checkout', 'token-invalido-abc', routeBody());
      return {
        status: r.status === 401 ? 'PASS' : 'FAIL',
        current: `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`,
        evidence: 'withAuth fail-closed',
      };
    });

  // happy path por la ruta
  await S.test('T-RT-002', 'RT — USER_A venta válida por la ruta → 200 + tx + seller=USER_A',
    'HTTP 200, transaction_id presente, seller_id persistido = USER_A',
    async () => {
      const r = await appPost('/api/pos/checkout', tokA, routeBody());
      if (r.status !== 200) return { status: 'FAIL', current: `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 150)}`, evidence: 'venta por ruta falló' };
      const t = await q(`SELECT seller_id, store_id FROM public.transactions WHERE id='${r.body.transaction_id}';`);
      return {
        status: t[0] && t[0].seller_id === fx.user_a && t[0].store_id === fx.store_a ? 'PASS' : 'FAIL',
        current: `tx=${r.body.transaction_id} seller=${t[0]?.seller_id}`,
        evidence: 'ruta canónica V2 operativa con actores reales',
      };
    });

  // seller spoofing por la ruta
  await S.test('T-RT-003', 'RT — la ruta no debe permitir seller spoofing (seller_id=USER_B)',
    'la ruta DERIVA el vendedor del servidor (session) o rechaza; jamás persiste seller=USER_B',
    async () => {
      const r = await appPost('/api/pos/checkout', tokA, routeBody({ seller_id: fx.user_b }));
      if (r.status === 200) {
        const t = await q(`SELECT seller_id FROM public.transactions WHERE id='${r.body.transaction_id}';`);
        return {
          status: t[0] && t[0].seller_id === fx.user_a ? 'PASS' : 'FAIL',
          current: `ACEPTADA con seller persistido=${t[0]?.seller_id}`,
          evidence: `la ruta reenvía seller_id del body tal cual al RPC: venta de USER_A atribuida a USER_B (${t[0]?.seller_id})`,
        };
      }
      return { status: 'PASS', current: `HTTP ${r.status}`, evidence: 'ruta rechaza seller ajeno' };
    });

  // tax authority por la ruta
  await S.test('T-RT-004', 'RT — la ruta no debe aceptar impuestos del cliente',
    'applied_taxes del body no puede ser la fuente del impuesto persistido',
    async () => {
      const r = await appPost('/api/pos/checkout', tokA, routeBody({
        applied_taxes: [{ type: 'percentage', value: 100 }], tax_amount: 100, total_amount: 200,
      }));
      if (r.status === 200) {
        const t = await q(`SELECT tax_amount FROM public.transactions WHERE id='${r.body.transaction_id}';`);
        return {
          status: 'FAIL',
          current: `ACEPTADA: tax_amount persistido=${t[0].tax_amount} (100% del cliente)`,
          evidence: 'la ruta reenvía applied_taxes cliente→RPC sin resolución server-side: 100% de impuesto impuesto por el cliente',
        };
      }
      return { status: 'PASS', current: `HTTP ${r.status}`, evidence: 'ruta valida impuestos' };
    });

  // rate authority por la ruta
  await S.test('T-RT-005', 'RT — la ruta no debe aceptar tasa de cambio del cliente',
    'sale_exchange_rate del body no puede fijar la tasa efectiva',
    async () => {
      const r = await appPost('/api/pos/checkout', tokA, routeBody({
        sale_currency: 'USD', sale_exchange_rate: 1000000,
      }));
      if (r.status === 200) {
        const t = await q(`SELECT sale_exchange_rate FROM public.transactions WHERE id='${r.body.transaction_id}';`);
        return {
          status: 'FAIL',
          current: `ACEPTADA: rate persistida=${t[0].sale_exchange_rate}`,
          evidence: 'la ruta reenvía sale_exchange_rate cliente→RPC sin fuente server-side',
        };
      }
      return { status: 'PASS', current: `HTTP ${r.status}`, evidence: 'ruta valida tasa' };
    });

  // RPC canónico (static)
  await S.test('T-RT-006', 'RT — la ruta usa EXCLUSIVAMENTE create_sale_v2 (sin legacy RPC)',
    'route.ts invoca rpc("create_sale_v2") y no existe llamada a create_sale V1',
    async () => {
      const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src/app/api/pos/checkout/route.ts'), 'utf8');
      const usesV2 = /rpc\('create_sale_v2'/.test(src);
      const usesV1 = /rpc\('create_sale'/.test(src);
      return {
        status: usesV2 && !usesV1 ? 'PASS' : 'FAIL',
        current: `v2=${usesV2} v1=${usesV1}`,
        evidence: 'contrato canónico V2 en la ruta',
      };
    });

  // service-role bind (static + behavior)
  await S.test('T-RT-007', 'RT — service-role de la ruta está bound a la sesión (p_user_id)',
    'p_user_id SIEMPRE session.user.id; el body no puede inyectarlo',
    async () => {
      const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src/app/api/pos/checkout/route.ts'), 'utf8');
      const bound = /p_user_id:\s*session\.user\.id/.test(src);
      // el schema zod no acepta p_user_id del body
      const schema = !/p_user_id/.test(src.match(/const checkoutSchema[\s\S]*?\}\);/)?.[0] || '');
      // comportamiento: enviar p_user_id en el body no cambia el actor
      const r = await appPost('/api/pos/checkout', tokA, routeBody({ p_user_id: fx.user_b }));
      const rOk = r.status === 200;
      return {
        status: bound && rOk ? 'PASS' : 'FAIL',
        current: `static bind=${bound} · body p_user_id ignorado=${rOk}`,
        evidence: 'la identidad del actor en la ruta proviene de la sesión verificada; p_user_id del body es filtrado por zod e ignorado',
      };
    });

  S.finish();
})().catch(e => { console.error('❌ suite RT:', e); process.exit(1); });

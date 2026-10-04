#!/usr/bin/env node
/** H-IMPL — Reproducción diagnóstica del escenario T-INV-003 (concurrencia última unidad). */
const path = require('path');
const { rpc, fixtures, login, q, brief } = require(path.join(__dirname, '..', 'qa-h1', 'lib.cjs'));

(async () => {
  const fx = fixtures();
  const tokA = (await login('qa.h1.a@costpro.test', fx.pass_a)).token;

  // repone la última unidad (igual que el test)
  await q(`SELECT set_config('app.restore_mode','true', false); UPDATE public.inventory SET quantity=1 WHERE store_id='${fx.store_a}' AND product_id='${fx.product_a_low}'; SELECT 'ok' AS r;`);

  const key = `qa-inv-probe-${Date.now()}`;
  const mk = () => rpc('create_sale_v2', {
    p_store_id: fx.store_a,
    p_seller_id: fx.user_a,
    p_items: [{ product_id: fx.product_a_low, quantity: 1, price_at_sale: 100 }],
    p_payment_method: 'cash',
    p_discount_type: 'fixed',
    p_discount_value: 0,
    p_applied_taxes: [],
    p_tax_amount: 0,
    p_subtotal: 100,
    p_cash_amount: 100,
    p_sale_currency: 'CUP',
    p_sale_exchange_rate: 1,
    p_idempotency_key: key,
    p_total_amount: 100,
  }, tokA);

  console.log('— llamada secuencial previa (verifica payload válido):');
  const r0 = await mk();
  console.log('  ', brief(r0));

  // nueva clave para la prueba concurrente limpia
  const key2 = `qa-inv-probe2-${Date.now()}`;
  const mk2 = () => rpc('create_sale_v2', {
    p_store_id: fx.store_a,
    p_seller_id: fx.user_a,
    p_items: [{ product_id: fx.product_a_low, quantity: 1, price_at_sale: 100 }],
    p_payment_method: 'cash',
    p_discount_type: 'fixed',
    p_discount_value: 0,
    p_applied_taxes: [],
    p_tax_amount: 0,
    p_subtotal: 100,
    p_cash_amount: 100,
    p_sale_currency: 'CUP',
    p_sale_exchange_rate: 1,
    p_idempotency_key: key2,
    p_total_amount: 100,
  }, tokA);

  console.log('— dos llamadas CONCURRENTES con la misma clave:');
  const [ra, rb] = await Promise.all([mk2(), mk2()]);
  console.log('  A:', brief(ra));
  console.log('  B:', brief(rb));

  const c = await q(`SELECT count(*) AS c FROM public.transactions WHERE idempotency_key='${key2}';`);
  console.log('  transacciones con la clave:', c[0].c);
  const reg = await q(`SELECT idempotency_key, operation, param_hash, result FROM public.idempotency_registry WHERE idempotency_key IN ('${key}','${key2}');`);
  console.log('  registry:', JSON.stringify(reg, null, 1));
})().catch(e => { console.error('❌', e); process.exit(1); });

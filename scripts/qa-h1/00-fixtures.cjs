/**
 * FASE H1 — Fixtures QA (idempotentes, reutilizables).
 *
 * Crea con service_role (PREPARACIÓN CONTROLADA — permitido por FASE H1 §3):
 *   STORE_A  "QA-H1-A"        + PRODUCT_A (price 100, WAC 50, stock 1000)
 *                             + PRODUCT_A_LOW (stock 1 — tests de última unidad)
 *   STORE_B  "QA-H1-B"        + PRODUCT_B (price 200, WAC 80, stock 500)
 *   USER_A   qa.h1.a@costpro.test   — global 'usuario', membership STORE_A 'clerk'
 *   USER_B   qa.h1.b@costpro.test   — global 'usuario', membership STORE_B 'clerk'
 *   SUPER_A  qa.h1.sup@costpro.test — global 'usuario', membership STORE_A 'manager'
 *   ENC_B    qa.h1.enc@costpro.test — global 'encargado', membership STORE_B 'clerk'
 *             (rol GLOBAL encargado — para demostrar alcance cross-store de
 *              update_transaction_taxes sin tocar usuarios compartidos)
 *   store_exchange_rates STORE_A USD=400 (fuente server-side para H5.2)
 *
 * Uso:  node scripts/qa-h1/00-fixtures.cjs           → ensure + login check
 *       node scripts/qa-h1/00-fixtures.cjs restock   → repone stocks de prueba
 *       node scripts/qa-h1/00-fixtures.cjs cleanup    → elimina fixtures
 */
const path = require('path');
const { q, login, saveState, loadState } = require('./lib.cjs');

const PASS_A = 'QaH1-UserA-2026';
const PASS_B = 'QaH1-UserB-2026';
const PASS_SUP = 'QaH1-SupA-2026';
const PASS_ENC = 'QaH1-EncB-2026';

async function ensureStore(name) {
  const found = await q(`SELECT id FROM public.stores WHERE name = '${name}' LIMIT 1;`);
  if (found[0]) return found[0].id;
  const ins = await q(`INSERT INTO public.stores (name, address, is_active)
    VALUES ('${name}', 'QA FASE H1', true) RETURNING id;`);
  return ins[0].id;
}

async function ensureProduct(storeId, sku, name, price, costAvg, stock) {
  const found = await q(`SELECT id FROM public.products WHERE sku = '${sku}' LIMIT 1;`);
  if (found[0]) {
    // cost_average NO se toca: guard w62_guard_wac_writer (único escritor fn_recalc_wac)
    await q(`UPDATE public.products SET price=${price},
      stock_current=${stock}, is_active=true, is_service=false WHERE id='${found[0].id}';`);
    return found[0].id;
  }
  const ins = await q(`INSERT INTO public.products (name, sku, price, cost_price, cost_average,
    stock_current, store_id, is_active, is_service, min_stock)
    VALUES ('${name}', '${sku}', ${price}, ${costAvg}, ${costAvg}, ${stock},
    '${storeId}', true, false, 1) RETURNING id;`);
  return ins[0].id;
}

/** Crea (o repara) usuario auth + profile + membership. Devuelve user_id. */
async function ensureUser(email, password, globalRole, profileStoreId) {
  // 1) auth.user: lookup por SQL (el listado admin /auth/v1/admin/users responde
  //    500 en este proyecto) + create/repair via admin API (service_role — fixture prep)
  let user = null;
  const found = await q(`SELECT id FROM auth.users WHERE email='${email}' LIMIT 1;`);
  if (found[0]) user = { id: found[0].id };
  if (!user) {
    const created = await rest_admin('/auth/v1/admin/users', 'POST', {
      email, password, email_confirm: true,
    });
    if (!created || !created.id) throw new Error(`create user ${email} falló: ${JSON.stringify(created).slice(0, 200)}`);
    user = { id: created.id };
  } else {
    // asegura password conocida + confirmado + desbaneado
    await rest_admin(`/auth/v1/admin/users/${user.id}`, 'PUT', {
      password, email_confirm: true, ban_duration: 'none',
    });
  }
  // 2) profile: rol global (NUNCA 'admin' — evitar bypass global de has_store_access_as)
  await q(`INSERT INTO public.profiles (id, email, role, store_id, is_active)
    VALUES ('${user.id}', '${email}', '${globalRole}', ${profileStoreId ? `'${profileStoreId}'` : 'NULL'}, true)
    ON CONFLICT (id) DO UPDATE SET role='${globalRole}',
      store_id=${profileStoreId ? `'${profileStoreId}'` : 'NULL'}, is_active=true;`);
  return user.id;
}

async function ensureMembership(userId, storeId, role) {
  await q(`INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
    VALUES ('${userId}', '${storeId}', '${role}', 'active')
    ON CONFLICT DO NOTHING;`);
}

async function ensureInventory(storeId, productId, qty) {
  const found = await q(`SELECT id, quantity FROM public.inventory
    WHERE store_id='${storeId}' AND product_id='${productId}' LIMIT 1;`);
  if (found[0]) {
    // mecanismo documentado de la app (restore_mode) para fixtures
    await q(`SELECT set_config('app.restore_mode','true', false); UPDATE public.inventory SET quantity=${qty} WHERE id='${found[0].id}'; SELECT 'ok' AS r;`);
    return;
  }
  await q(`INSERT INTO public.inventory (store_id, product_id, quantity)
    VALUES ('${storeId}', '${productId}', ${qty});`);
}

async function rest_admin(p, method = 'GET', body = undefined) {
  const { URL_, SERVICE } = require('./lib.cjs');
  const r = await fetch(`${URL_}${p}`, {
    method,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let j = null; try { j = text ? JSON.parse(text) : null; } catch { /* raw */ }
  return j;
}

(async () => {
  const cmd = process.argv[2] || 'ensure';
  const state = loadState();

  if (cmd === 'cleanup') {
    const s = state;
    if (!s.store_a) { console.log('nada que limpiar'); return; }
    console.log('🧹 limpieza de fixtures QA-H1…');
    // orden por dependencias
    await q(`DELETE FROM public.transaction_items WHERE transaction_id IN
      (SELECT id FROM public.transactions WHERE store_id IN ('${s.store_a}','${s.store_b}'));`).catch(e => console.log('  ti:', e.message.slice(0, 80)));
    await q(`DELETE FROM public.payment_transactions WHERE idempotency_key LIKE 'pay-%'
      AND idempotency_key IN (SELECT 'pay-cash-'||id::text FROM public.transactions WHERE store_id IN ('${s.store_a}','${s.store_b}'));`).catch(e => console.log('  pt:', e.message.slice(0, 80)));
    await q(`DELETE FROM public.payment_transactions WHERE paid_by IN
      ('${s.user_a}','${s.user_b}','${s.super_a}','${s.enc_b}');`).catch(e => console.log('  pt2:', e.message.slice(0, 80)));
    await q(`DELETE FROM public.stock_movements WHERE store_id IN ('${s.store_a}','${s.store_b}');`).catch(e => console.log('  sm:', e.message.slice(0, 80)));
    await q(`DELETE FROM public.transactions WHERE store_id IN ('${s.store_a}','${s.store_b}');`).catch(e => console.log('  tx:', e.message.slice(0, 80)));
    await q(`DELETE FROM public.audit_logs WHERE store_id IN ('${s.store_a}','${s.store_b}');`).catch(e => console.log('  al:', e.message.slice(0, 80)));
    await q(`DELETE FROM public.business_events WHERE entity_id IN ('${s.product_a}','${s.product_a_low}','${s.product_b}');`).catch(e => console.log('  be:', e.message.slice(0, 80)));
    await q(`DELETE FROM public.supervisor_token_usages WHERE store_id IN ('${s.store_a}','${s.store_b}');`).catch(e => console.log('  stu:', e.message.slice(0, 80)));
    await q(`DELETE FROM public.tax_configurations WHERE store_id IN ('${s.store_a}','${s.store_b}');`).catch(e => console.log('  tc:', e.message.slice(0, 80)));
    await q(`DELETE FROM public.store_exchange_rates WHERE store_id IN ('${s.store_a}','${s.store_b}');`).catch(e => console.log('  ser:', e.message.slice(0, 80)));
    await q(`DELETE FROM public.sync_log WHERE store_id IN ('${s.store_a}','${s.store_b}');`).catch(e => console.log('  sl:', e.message.slice(0, 80)));
    for (const p of [s.product_a, s.product_a_low, s.product_b]) {
      if (p) await q(`DELETE FROM public.products WHERE id='${p}';`).catch(e => console.log('  p:', e.message.slice(0, 80)));
    }
    for (const u of [s.user_a, s.user_b, s.super_a, s.enc_b]) {
      if (u) {
        await q(`DELETE FROM public.user_store_memberships WHERE user_id='${u}';`).catch(() => {});
        await q(`DELETE FROM public.profiles WHERE id='${u}';`).catch(() => {});
        await rest_admin(`/auth/v1/admin/users/${u}`, 'DELETE');
      }
    }
    await q(`DELETE FROM public.stores WHERE id IN ('${s.store_a}','${s.store_b}');`).catch(e => console.log('  st:', e.message.slice(0, 80)));
    require('fs').unlinkSync(path.join(__dirname, 'state.json'));
    console.log('✅ cleanup completo');
    return;
  }

  if (cmd === 'restock') {
    const mk = (store, product, qty) =>
      `SELECT set_config('app.restore_mode','true', false); UPDATE public.inventory SET quantity=${qty} WHERE store_id='${store}' AND product_id='${product}'; SELECT 'ok' AS r;`;
    await q(mk(state.store_a, state.product_a, 1000));
    await q(mk(state.store_a, state.product_a_low, 1));
    await q(mk(state.store_b, state.product_b, 500));
    console.log('✅ inventario repuesto (A=1000, A_LOW=1, B=500)');
    return;
  }

  // ── ensure ──
  console.log('🔧 creando/verificando fixtures QA-H1…');
  const store_a = await ensureStore('QA-H1-A');
  const store_b = await ensureStore('QA-H1-B');
  const product_a = await ensureProduct(store_a, 'QA-H1-A-001', 'QA Producto A', 100, 50, 1000);
  const product_a_low = await ensureProduct(store_a, 'QA-H1-A-LOW', 'QA Producto A Low', 100, 50, 1);
  const product_b = await ensureProduct(store_b, 'QA-H1-B-001', 'QA Producto B', 200, 80, 500);

  const user_a = await ensureUser('qa.h1.a@costpro.test', PASS_A, 'usuario', store_a);
  const user_b = await ensureUser('qa.h1.b@costpro.test', PASS_B, 'usuario', store_b);
  const super_a = await ensureUser('qa.h1.sup@costpro.test', PASS_SUP, 'usuario', store_a);
  const enc_b = await ensureUser('qa.h1.enc@costpro.test', PASS_ENC, 'encargado', store_b);

  await ensureMembership(user_a, store_a, 'clerk');
  await ensureMembership(user_b, store_b, 'clerk');
  await ensureMembership(super_a, store_a, 'manager');
  await ensureMembership(enc_b, store_b, 'clerk');

  // tasa server-side de STORE_A para H5.2 (fixture de fuente confiable)
  await q(`INSERT INTO public.store_exchange_rates (store_id, currency, rate, updated_by)
    VALUES ('${store_a}', 'USD', 400, '${user_a}')
    ON CONFLICT DO NOTHING;`);

  // filas de inventory (fuente real de stock para el trigger de movimientos)
  await ensureInventory(store_a, product_a, 1000);
  await ensureInventory(store_a, product_a_low, 1);
  await ensureInventory(store_b, product_b, 500);

  // verificar login de los 4 actores
  const la = await login('qa.h1.a@costpro.test', PASS_A);
  const lb = await login('qa.h1.b@costpro.test', PASS_B);
  const ls = await login('qa.h1.sup@costpro.test', PASS_SUP);
  const le = await login('qa.h1.enc@costpro.test', PASS_ENC);

  saveState({
    store_a, store_b, product_a, product_a_low, product_b,
    user_a, user_b, super_a, enc_b,
    pass_a: PASS_A, pass_b: PASS_B, pass_sup: PASS_SUP, pass_enc: PASS_ENC,
    created_at: new Date().toISOString(),
  });

  console.log('\n✅ fixtures listos:');
  console.log(`  STORE_A    ${store_a}`);
  console.log(`  STORE_B    ${store_b}`);
  console.log(`  PRODUCT_A  ${product_a} (price 100, wac 50, stock 1000)`);
  console.log(`  P_A_LOW    ${product_a_low} (stock 1)`);
  console.log(`  PRODUCT_B  ${product_b} (price 200, wac 80, stock 500)`);
  console.log(`  USER_A     ${user_a} (clerk@A)      login OK`);
  console.log(`  USER_B     ${user_b} (clerk@B)      login OK`);
  console.log(`  SUPER_A    ${super_a} (manager@A)   login OK`);
  console.log(`  ENC_B      ${enc_b} (encargado global, clerk@B) login OK`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });

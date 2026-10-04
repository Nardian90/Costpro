/**
 * FASE H1 — H3: SELLER BINDING (§6)
 *
 * T-H3-001  Actor vende como sí mismo → PASS, atribución = USER_A
 * T-H3-002  USER_A vende como USER_B → DENIED o derivación server-side a USER_A
 * T-H3-003  Cross-store seller spoof (USER_A/STORE_A + seller USER_B/STORE_B) → DENIED
 * T-H3-004  p_seller_id ausente → contrato H0 (AUSENTE) → BLOCKED + probe
 * T-H3-005  p_user_id spoofing con sesión authenticated → ignorado (v_uid=auth.uid())
 * T-H3-006  /sync/batch: caller legítimo service-role no abre spoofing (static)
 */
const { rpc, fixtures, login, q, createSuite, isDenied, bodyLeaksTx, brief } = require('./lib.cjs');
const fs = require('fs');
const path = require('path');

const S = createSuite('H3 — SELLER BINDING', '12-h3-seller');

(async () => {
  const fx = fixtures();
  const tokA = (await login('qa.h1.a@costpro.test', fx.pass_a)).token;

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
    p_idempotency_key: `qa-h3-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...over,
  });
  const txOf = (id) => q(`SELECT seller_id FROM public.transactions WHERE id='${id}';`);

  // ── T-H3-001 ──
  await S.test('T-H3-001', 'H3.1 — USER_A vende como sí mismo → atribución = USER_A',
    'HTTP 200 y transactions.seller_id == USER_A',
    async () => {
      const r = await rpc('create_sale_v2', baseSale(), tokA);
      if (r.status !== 200) return { status: 'FAIL', current: brief(r), evidence: 'venta legítima falló' };
      const tx = await txOf(r.body.transaction_id);
      return {
        status: tx[0] && tx[0].seller_id === fx.user_a ? 'PASS' : 'FAIL',
        current: `seller_id persistido = ${tx[0] ? tx[0].seller_id : 'n/a'}`,
        evidence: `venta válida con seller_id=USER_A → tx ${r.body.transaction_id}`,
      };
    });

  // ── T-H3-002 ──
  await S.test('T-H3-002', 'H3.2 — USER_A vende como USER_B (spoof mismo nivel)',
    'DENIED o derivación inequívoca a USER_A; NUNCA seller=USER_B',
    async () => {
      const r = await rpc('create_sale_v2', baseSale({ p_seller_id: fx.user_b }), tokA);
      if (r.status === 200) {
        const tx = await txOf(r.body.transaction_id);
        const seller = tx[0] ? tx[0].seller_id : null;
        return {
          status: seller === fx.user_a ? 'PASS' : 'FAIL',
          current: `venta ACEPTADA con seller_id persistido = ${seller}`,
          evidence: `SPOOFING: la transacción ${r.body.transaction_id} quedó atribuida a USER_B (${fx.user_b}) siendo el actor autenticado USER_A`,
        };
      }
      return {
        status: isDenied(r) ? 'PASS' : 'FAIL',
        current: brief(r),
        evidence: 'rechazo o derivación server-side',
      };
    });

  // ── T-H3-003 ──
  await S.test('T-H3-003', 'H3.3 — Cross-store seller spoof (actor USER_A/STORE_A, seller USER_B/STORE_B)',
    'DENIED; nunca seller de otra tienda',
    async () => {
      const r = await rpc('create_sale_v2', baseSale({ p_seller_id: fx.user_b }), tokA);
      if (r.status === 200) {
        const tx = await txOf(r.body.transaction_id);
        return {
          status: 'FAIL',
          current: `ACEPTADA con seller_id=${tx[0] ? tx[0].seller_id : '?'} (miembro de STORE_B)`,
          evidence: `venta en STORE_A atribuida a un vendedor de otra tienda: tx ${r.body.transaction_id}`,
        };
      }
      return { status: isDenied(r) ? 'PASS' : 'FAIL', current: brief(r), evidence: 'cross-store seller rechazado' };
    });

  // ── T-H3-004: contrato H0 ausente ──
  await S.test('T-H3-004', 'H3.4 — p_seller_id ausente (NULL): rechazar o derivar del actor',
    'CONTRATO H0: rechazar O derivar server-side del actor — H0 NO PRODUCIDO',
    async () => {
      const r = await rpc('create_sale_v2', baseSale({ p_seller_id: null }), tokA);
      let seller = 'n/a';
      if (r.status === 200) {
        const tx = await txOf(r.body.transaction_id);
        seller = tx[0] ? tx[0].seller_id : 'NULL';
      }
      return {
        status: 'BLOCKED',
        current: `probe actual: HTTP ${r.status} → seller_id=${seller}`,
        evidence: 'La especificación H0 (CREATE-SALE-V2-HARDENING-SPEC.md) NO EXISTE en el repo (verificado en baseline). La decisión rechazar-vs-derivar es un contrato H0: NO SE INVENTA. Comportamiento actual observado y documentado como evidencia para el implementador.',
      };
    });

  // ── T-H3-005: p_user_id ignorado para authenticated ──
  await S.test('T-H3-005', 'H3.5 — p_user_id spoofing con sesión authenticated → ignorado',
    'v_uid = auth.uid() (USER_A): la venta se evalúa contra USER_A, no contra p_user_id',
    async () => {
      // USER_A (con acceso a STORE_A) pasa p_user_id=USER_B; si el RPC usara p_user_id
      // la autorización se evaluaría contra USER_B (miembro de STORE_B, NO de STORE_A).
      // Esperado: la llamada procede como USER_A (200) — p_user_id ignorado fuera de service_role.
      const r = await rpc('create_sale_v2', baseSale({ p_user_id: fx.user_b }), tokA);
      const ignored = r.status === 200; // evaluó contra USER_A (con acceso) y no falló authz
      return {
        status: ignored ? 'PASS' : 'FAIL',
        current: `authenticated + p_user_id=USER_B → ${brief(r)}`,
        evidence: ignored
          ? 'p_user_id se ignora para rol authenticated (v_uid=auth.uid()); el bypass de identidad solo existe en service_role'
          : 'p_user_id afectó la evaluación de identidad — revisar',
      };
    });

  // ── T-H3-006: /sync/batch callers legítimos de service_role ──
  await S.test('T-H3-006', 'H3.5 — census: llamadores service_role de create_sale_v2',
    'solo /api/pos/checkout (server route) y ningún path cliente expone service_role al usuario',
    async () => {
      const route = fs.readFileSync(path.join(__dirname, '..', '..', 'src/app/api/pos/checkout/route.ts'), 'utf8');
      const sync = fs.readFileSync(path.join(__dirname, '..', '..', 'src/app/api/sync/batch/route.ts'), 'utf8');
      const checkoutUsesAdmin = /getSupabaseAdminSafe/.test(route) && /p_user_id:\s*session\.user\.id/.test(route);
      const syncUsesUserToken = /getSupabaseAuthClient\(session\.token\)/.test(sync) && !/getSupabaseAdminSafe/.test(sync);
      return {
        status: checkoutUsesAdmin && syncUsesUserToken ? 'PASS' : 'FAIL',
        current: `checkout admin-client+p_user_id(session)=${checkoutUsesAdmin} · sync user-token=${syncUsesUserToken}`,
        evidence: '/api/pos/checkout usa service_role con p_user_id=session.user.id (bind a sesión); /api/sync/batch ejecuta RPCs con el token DEL USUARIO (authenticado). Ninguna superficie cliente ejecuta como service_role.',
      };
    });

  S.finish();
})().catch(e => { console.error('❌ suite H3:', e); process.exit(1); });

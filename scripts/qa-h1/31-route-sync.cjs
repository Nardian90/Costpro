/**
 * FASE H1 — §17 TESTS DE CONTRATO DE RUTA: /api/sync/batch (H3.5)
 */
const { appPost, fixtures, login, q, createSuite } = require('./lib.cjs');
const fs = require('fs');
const path = require('path');

const S = createSuite('SB — Contrato ruta /api/sync/batch', '31-route-sync');

(async () => {
  const fx = fixtures();
  const tokA = (await login('qa.h1.a@costpro.test', fx.pass_a)).token;

  const batch = (op, over = {}) => appPost('/api/sync/batch', tokA, {
    clientInfo: { userId: fx.user_a, deviceId: 'qa-h1-device' },
    operations: [op],
    ...over,
  });
  const saleOp = (payload, over = {}) => ({
    id: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    operationType: 'CREATE',
    entity: 'sale',
    payload,
    createdAt: new Date().toISOString(),
    clientClock: Date.now(),
    ...over,
  });

  // 401 sin auth
  await S.test('T-SB-001', 'SB — POST /api/sync/batch sin sesión → 401',
    'HTTP 401',
    async () => {
      const r = await appPost('/api/sync/batch', 'token-invalido-abc', {
        clientInfo: { userId: 'x', deviceId: 'x' }, operations: [],
      });
      return { status: r.status === 401 ? 'PASS' : 'FAIL', current: `HTTP ${r.status}`, evidence: 'withAuth fail-closed' };
    });

  // acceso a tienda ajena por sync (FIX-SEC-H3)
  await S.test('T-SB-002', 'SB — operación de venta con p_store_id ajeno (STORE_B) → 403',
    'HTTP 403 STORE_ACCESS_DENIED (gate por operación)',
    async () => {
      const r = await batch(saleOp({
        p_store_id: fx.store_b, p_seller_id: fx.user_a,
        p_items: [{ product_id: fx.product_b, quantity: 1, price_at_sale: 200 }],
        p_total_amount: 200,
      }));
      const denied = r.status === 403;
      return {
        status: denied ? 'PASS' : 'FAIL',
        current: `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`,
        evidence: denied ? 'FIX-SEC-H3: membresía validada por operación antes de ejecutar' : 'operación cross-store aceptada por sync',
      };
    });

  // RPC canónico
  await S.test('T-SB-003', 'SB — sync usa EXCLUSIVAMENTE create_sale_v2 (nunca V1)',
    'route.ts mapea entity=sale → create_sale_v2 sin fallback V1',
    async () => {
      const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src/app/api/sync/batch/route.ts'), 'utf8');
      const usesV2 = /create_sale_v2/.test(src);
      const usesV1 = /rpc\('create_sale'/.test(src);
      return {
        status: usesV2 && !usesV1 ? 'PASS' : 'FAIL',
        current: `v2=${usesV2} v1=${usesV1}`,
        evidence: 'camino offline canonical V2',
      };
    });

  // service-role: sync usa token del usuario
  await S.test('T-SB-004', 'SB — sync ejecuta RPCs con el token DEL USUARIO (no service_role)',
    'getSupabaseAuthClient(session.token); sin getSupabaseAdminSafe',
    async () => {
      const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src/app/api/sync/batch/route.ts'), 'utf8');
      const userToken = /getSupabaseAuthClient\(session\.token\)/.test(src);
      const admin = /getSupabaseAdminSafe|SUPABASE_SERVICE_ROLE_KEY/.test(src);
      return {
        status: userToken && !admin ? 'PASS' : 'FAIL',
        current: `userToken=${userToken} admin=${admin}`,
        evidence: 'la ruta offline no expone service_role al usuario: el RPC corre como authenticated (auth.uid=usuario)',
      };
    });

  // seller spoofing a través de sync
  await S.test('T-SB-005', 'SB — seller spoofing vía payload de sync (p_seller_id=USER_B)',
    'la venta offline no puede atribuirse a otro vendedor (binding server-side)',
    async () => {
      const r = await batch(saleOp({
        p_store_id: fx.store_a, p_seller_id: fx.user_b,
        p_items: [{ product_id: fx.product_a, quantity: 1, price_at_sale: 100 }],
        p_total_amount: 100, p_payment_method: 'cash', p_discount_type: 'fixed', p_discount_value: 0,
      }));
      // inspección post-hoc: sync_log.response_data = {id: <resultado RPC completo>}
      const log = await q(`SELECT response_data FROM public.sync_log
        WHERE user_id='${fx.user_a}' ORDER BY created_at DESC LIMIT 5;`);
      let spoofed = null;
      for (const l of log) {
        let rd = l.response_data;
        if (typeof rd === 'string') { try { rd = JSON.parse(rd); } catch { rd = null; } }
        // candidatos: rd.id.transaction_id (payload encolado) | rd.transaction_id | rd.serverId
        const cand = [
          typeof rd?.id === 'object' && rd.id ? rd.id.transaction_id : null,
          typeof rd?.transaction_id === 'string' ? rd.transaction_id : null,
          typeof rd?.serverId === 'string' ? rd.serverId : null,
          typeof rd?.id === 'string' ? rd.id : null,
        ];
        for (const txId of cand) {
          if (txId && /^[0-9a-f-]{36}$/i.test(txId)) {
            const t = await q(`SELECT seller_id FROM public.transactions WHERE id='${txId}';`);
            if (t[0] && t[0].seller_id === fx.user_b) { spoofed = txId; break; }
          }
        }
        if (spoofed) break;
      }
      return {
        status: spoofed ? 'FAIL' : 'PASS',
        current: `HTTP ${r.status} · spoofed=${spoofed || 'no'} · log=${JSON.stringify(r.body).slice(0, 140)}`,
        evidence: spoofed
          ? `venta offline de USER_A atribuida a USER_B (${spoofed}) — el payload de sync reenvía p_seller_id sin binding`
          : 'sin spoofing vía sync',
      };
    });

  S.finish();
})().catch(e => { console.error('❌ suite SB:', e); process.exit(1); });

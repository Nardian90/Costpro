/**
 * E2E-PRODUCT-FIX-ROUND1 — FASE 2/3/4: Reproducción independiente de los defectos
 * ============================================================================
 * 1) DEVOLUTIONS:  POST /api/devolutions → 500 PGRST203 (ambigüedad overloads)
 * 2) INV-008 vía API:    POST /api/inventory/adjust (register_stock_movement ACL)
 * 3) INV-008 vía UI-RPC: rpc perform_inventory_adjustment (lo que llama el modal)
 * 4) BUG-022:      POST /api/reports/generate → GET url SIN auth
 * Identidad aislada (provisionRunEnv) + teardown garantizado.
 *
 * Uso: cd /home/z/my-project/Costpro && bun e2e/scripts/repro-round1.ts
 */
import { provisionRunEnv, teardownRunEnv, signInRunUser, generateRunId } from '../fixtures/run-env';
import { sb, apiHeaders, BASE_URL, rpcAsUser } from '../fixtures/session.fixture';

async function jlog(tag: string, v: unknown) {
  console.log(tag, JSON.stringify(v));
}

async function section(name: string, fn: () => Promise<void>) {
  console.log(`\n──────── ${name} ────────`);
  try {
    await fn();
  } catch (e) {
    console.log(`[ERROR en ${name}]`, e instanceof Error ? e.message : String(e));
  }
}

async function main() {
  process.env.E2E_RUN_ID = process.env.E2E_RUN_ID || generateRunId();
  const ctx = await provisionRunEnv();
  jlog('[RUN]', { runId: ctx.runId, tenantId: ctx.tenantId, admin: ctx.users.admin.email, pilotA: ctx.pilotStoreA.id, productA: ctx.productA });

  try {
    const { token, userId } = await signInRunUser(ctx.users.admin.email, ctx.users.admin.password);
    jlog('[AUTH]', { userId: userId.slice(0, 8) + '…', ok: true });

    // Inventario determinista (30 unidades)
    let invRows = await sb.select<{ quantity: number; version: number }>(
      'inventory',
      `store_id=eq.${ctx.pilotStoreA.id}&product_id=eq.${ctx.productA}&select=quantity,version`,
    );
    if (invRows.length === 0) {
      await sb.insert('inventory', [{
        store_id: ctx.pilotStoreA.id, product_id: ctx.productA,
        quantity: 30, low_stock_threshold: 0, version: 1,
      }]);
      invRows = await sb.select<{ quantity: number; version: number }>(
        'inventory', `store_id=eq.${ctx.pilotStoreA.id}&product_id=eq.${ctx.productA}&select=quantity,version`,
      );
    }
    const before = invRows[0];
    jlog('[INV] BEFORE', { quantity: before?.quantity, version: before?.version });

    // ── 1) DEVOLUTIONS (E2E-DEV-001 path) ────────────────────────────────
    await section('DEV /api/devolutions', async () => {
      const devRes = await fetch(`${BASE_URL}/api/devolutions`, {
        method: 'POST',
        headers: apiHeaders(token),
        body: JSON.stringify({
          store_id: ctx.pilotStoreA.id,
          items: [{ product_id: ctx.productA, quantity: 1, unit_price: 100 }],
          reason: 'R1 repro DEV API-level',
        }),
      });
      console.log(`POST /api/devolutions → HTTP ${devRes.status}`);
      console.log(`BODY: ${(await devRes.text()).slice(0, 600)}`);
    });

    // ── 2) INV-008 vía API route (register_stock_movement, client auth) ──
    await section('INV-008 API /api/inventory/adjust', async () => {
      const adjRes = await fetch(`${BASE_URL}/api/inventory/adjust`, {
        method: 'POST',
        headers: apiHeaders(token),
        body: JSON.stringify({
          productId: ctx.productA,
          storeId: ctx.pilotStoreA.id,
          quantity: 7,
          movementType: 'add',
          version: before?.version ?? 1,
          reason: 'R1 repro INV-008 API',
        }),
      });
      console.log(`POST /api/inventory/adjust → HTTP ${adjRes.status}`);
      console.log(`BODY: ${(await adjRes.text()).slice(0, 600)}`);
    });

    // ── 3) INV-008 vía UI RPC (perform_inventory_adjustment) ─────────────
    await section('INV-008 UI-RPC perform_inventory_adjustment', async () => {
      const r = await rpcAsUser('perform_inventory_adjustment', token, {
        p_store_id: ctx.pilotStoreA.id,
        p_product_id: ctx.productA,
        p_user_id: userId,
        p_quantity_delta: 7,
        p_unit_cost_adjustment: null,
        p_reason: 'R1 repro INV-008 UI-path',
        p_operation_date: new Date().toISOString(),
      });
      console.log(`rpc perform_inventory_adjustment → ok=${r.ok} status=${r.status}`);
      console.log(`data: ${JSON.stringify(r.data)?.slice(0, 400)}`);
      console.log(`error: ${r.error}`);
    });

    // Estado tras ambos intentos de ajuste
    const invAfter = await sb.select<{ quantity: number; version: number }>(
      'inventory', `store_id=eq.${ctx.pilotStoreA.id}&product_id=eq.${ctx.productA}&select=quantity,version`,
    );
    jlog('[INV] AFTER', invAfter[0] || null);
    const movs = await sb.select(
      'stock_movements',
      `store_id=eq.${ctx.pilotStoreA.id}&product_id=eq.${ctx.productA}&select=id,quantity_change,movement_type,created_at&order=created_at.desc&limit=5`,
    );
    jlog('[INV] MOVEMENTS (desc, top 5)', movs);

    // ── 4) BUG-022: reports URL pública ──────────────────────────────────
    await section('RPT-BUG022 /api/reports/generate', async () => {
      const repRes = await fetch(`${BASE_URL}/api/reports/generate`, {
        method: 'POST',
        headers: apiHeaders(token),
        body: JSON.stringify({ type: 'inventory', store_id: ctx.pilotStoreA.id, format: 'a4', orientation: 'portrait' }),
      });
      const repText = await repRes.text();
      console.log(`POST /api/reports/generate → HTTP ${repRes.status}`);
      console.log(`BODY: ${repText.slice(0, 300)}`);
      try {
        const repJson = JSON.parse(repText);
        const url = repJson?.url ?? repJson?.data?.url;
        if (url) {
          const urlRes = await fetch(url, { method: 'GET' });
          console.log(`GET url SIN auth → HTTP ${urlRes.status} | content-type: ${urlRes.headers.get('content-type')}`);
          console.log(`URL host: ${new URL(url).host} | path: ${new URL(url).pathname.slice(0, 80)}`);
        } else {
          console.log('sin url en la respuesta');
        }
      } catch { /* noop */ }
    });
  } finally {
    await teardownRunEnv().catch((e) => console.error('[TEARDOWN] error:', e));
    console.log('\n[TEARDOWN] completado');
  }
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });

/**
 * CP-POS-002 (T5.2) — E2E offline del POS: reserva local, persistencia,
 * bloqueo de overselling local y doble envío.
 * ============================================================================
 * Etiqueta: @offline (NO está en el filtro por defecto del workflow
 * e2e-isolated: 'health-api|isolated-db-sentinel|auth.spec.ts|...').
 *
 * Regla de la misión (T5.2): NO incorporar al conjunto automático de PR
 * hasta 3 ejecuciones verdes consecutivas por workflow_dispatch contra
 * CostproE2E. Por eso el spec exige además opt-in EXPLÍCITO:
 *
 *   CP_POS_002_RUN_OFFLINE_E2E=1
 *
 * Sin esa variable el spec falla cerrado (skip condicional documentado —
 * nunca un skip silencioso).
 *
 * Aislamiento: la suite corre bajo el pipeline e2e-isolated del repo
 * (global-setup → assertIsolatedDb: solo CostproE2E o local; producción
 * wthkddeleylijmonclxg se rechaza ANTES de conectar). beforeAll
 * revalida el guard (fail-closed si alguien corre el spec suelto).
 *
 * Datos 100% sintéticos: el stock/productos provienen del snapshot del
 * entorno aislado (nunca datos reales de clientes).
 *
 * Ejecución manual:
 *   CP_POS_002_RUN_OFFLINE_E2E=1 E2E_ALLOW_CREATION=1 E2E_ISOLATION=1 \
 *     bunx playwright test pos-offline --project=core
 * (o workflow_dispatch del workflow e2e-isolated con spec_filter=pos-offline
 *  tras añadir la variable al repositorio).
 */
import { test, expect } from '@playwright/test';

// SKIP-REASON: CP-POS-002 — E2E offline manual hasta completar tres ejecuciones verdes consecutivas (workflow_dispatch contra CostproE2E con CP_POS_002_RUN_OFFLINE_E2E=1); después se evalúa añadirlo al filtro del workflow e2e-isolated.
const RUN_OFFLINE_E2E = process.env.CP_POS_002_RUN_OFFLINE_E2E === '1';

test.describe('POS offline — reserva local, persistencia y doble envío @offline', () => {
  test.skip(!RUN_OFFLINE_E2E, 'CP-POS-002: spec manual — requiere CP_POS_002_RUN_OFFLINE_E2E=1 y entorno aislado (CostproE2E o local). Ver SKIP-REASON arriba.');

  test.beforeAll(async () => {
    // Fail-closed de aislamiento: revalidar el destino AQUÍ también (no
    // solo global-setup) — si alguien ejecuta este spec suelto contra un
    // entorno no aislado, se detiene antes de escribir nada.
    const { assertIsolatedDb } = await import('./fixtures/assert-isolated-db');
    await assertIsolatedDb();
  });

  test('venta offline persiste localmente, bloquea exceder el stock local y el doble envío no duplica', async ({ browser }) => {
    test.setTimeout(180_000);

    const token = process.env.E2E_TEST_USER_TOKEN;
    const storeId = process.env.E2E_TEST_STORE_ID;
    test.skip(!token || !storeId, 'E2E_TEST_USER_TOKEN/E2E_TEST_STORE_ID no configurados (global-setup del pipeline aislado).');

    const context = await browser.newContext();
    const page = await context.newPage();

    // ── Preparación (online): sesión del piloto + catálogo cargado ──
    await page.goto('/');
    await page.evaluate(async ([t]: [string]) => {
      const mod = await import('/src/lib/supabaseClient');
      await mod.supabase.auth.setSession({ access_token: t, refresh_token: '' });
    }, [token!]);
    await page.goto('/terminal/pos');
    // Esperar la hidratación del catálogo (snapshot persistido).
    await page.waitForFunction(
      async (sid: string) => {
        const mod = await import('/src/lib/sync/offline-storage');
        return (await mod.offlineStorage.getSnapshotTimestamp(`products_${sid}`)) !== null;
      },
      storeId!,
      { timeout: 45_000 },
    );

    // ── Modo avión ──
    await context.setOffline(true);

    // Producto con stock conocido del snapshot REAL (datos sintéticos del
    // entorno aislado).
    const products = await page.evaluate(async (sid: string) => {
      const mod = await import('/src/lib/sync/offline-storage');
      return (
        (await mod.offlineStorage.getSnapshot<Array<{ id: string; stock_current: number; name: string }>>(
          `products_${sid}`,
        )) ?? []
      );
    }, storeId!);
    expect(products.length, 'el snapshot de productos debe existir antes de vender offline').toBeGreaterThan(0);

    const product = products.find((p) => (p.stock_current ?? 0) >= 2) ?? products[0]!;
    const stock = product.stock_current ?? 0;

    // ── Venta válida dentro del stock local → persistida en la cola ──
    const enqueue = async (qty: number, stockLocal: number) =>
      page.evaluate(
        async ([pid, sid, q, st]: [string, string, number, number]) => {
          const mod = await import('/src/lib/sync/offline-storage');
          const key = `sale-${crypto.randomUUID()}`;
          await mod.saleOutbox.create({ storeId: sid, idempotencyKey: key, payload: { kind: 'e2e-offline' } });
          const intent = await mod.saleOutbox.getOpen(key);
          return mod.offlineStorage.enqueueSaleWithReservation(
            {
              entity: 'sale',
              operationType: 'CREATE',
              idempotencyKey: intent!.queueIdempotencyKey,
              payload: {
                p_store_id: sid,
                p_items: [{ product_id: pid, variant_id: null, quantity: q }],
                p_idempotency_key: key,
              },
            },
            (p: string) => (p === pid ? st : null),
          );
        },
        [product.id, storeId!, qty, stockLocal] as [string, string, number, number],
      );

    const okSale = await enqueue(Math.max(1, Math.min(2, stock)), stock);
    expect(okSale.ok, 'venta dentro del stock local se persiste en la cola (outbox + reserva)').toBe(true);

    // ── Exceder el stock disponible localmente → BLOQUEADO ──
    const overSale = await enqueue(stock + 5, stock);
    expect(overSale.ok, `venta de ${stock + 5} uds con stock local ${stock} DEBE bloquearse offline`).toBe(false);

    // La reserva de la primera venta ya descuenta: stock−reservado disponible.
    if (stock >= 2) {
      const afterFirst = await page.evaluate(async (sid: string) => {
        const mod = await import('/src/lib/sync/offline-storage');
        return mod.offlineStorage.getReservedByProduct(sid);
      }, storeId!);
      expect(Number(afterFirst.get(product.id) ?? 0)).toBeGreaterThan(0);
    }

    // ── Doble envío de la MISMA confirmación → una sola operación ──
    const dupKey = `sale-${crypto.randomUUID()}`;
    const dup = await page.evaluate(
      async ([sid, key]: [string, string]) => {
        const mod = await import('/src/lib/sync/offline-storage');
        const a = await mod.saleOutbox.create({ storeId: sid, idempotencyKey: key, payload: { n: 1 } });
        const b = await mod.saleOutbox.create({ storeId: sid, idempotencyKey: key, payload: { n: 2 } });
        const all = (await mod.saleOutbox.getAll()).filter((i) => i.idempotencyKey === key);
        return { same: a.idempotencyKey === b.idempotencyKey, total: all.length };
      },
      [storeId!, dupKey] as [string, string],
    );
    expect(dup.same).toBe(true);
    expect(dup.total, 'doble envío con la misma llave NO crea dos operaciones').toBe(1);

    await context.setOffline(false);
    await context.close();
  });
});

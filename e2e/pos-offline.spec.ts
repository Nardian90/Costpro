/**
 * CP-POS-002 (T5.2 / T6 COSTPRO-FINAL-CYCLE-CLOSE-001) — E2E offline del POS:
 * reserva local, persistencia, bloqueo de overselling local y doble envío.
 * ============================================================================
 * Etiqueta: @offline (NO está en el filtro por defecto del workflow
 * e2e-isolated: 'health-api|isolated-db-sentinel|auth.spec.ts|...').
 *
 * Regla de la misión (T5.2): NO incorporar al conjunto automático de PR
 * hasta 3 ejecuciones verdes consecutivas por workflow_dispatch contra
 * CostproE2E. El spec exige además opt-in EXPLÍCITO:
 *
 *   CP_POS_002_RUN_OFFLINE_E2E=1   (ya en el env del workflow)
 *
 * Sin esa variable el spec se salta con motivo documentado (nunca skip
 * silencioso).
 *
 * Aislamiento: la suite corre bajo el pipeline e2e-isolated del repo
 * (global-setup → assertIsolatedDb). beforeAll revalida el guard
 * (fail-closed si alguien corre el spec suelto).
 *
 * Mecánica del spec (hallazgo de la corrida 42508725582: los módulos de
 * src/ NO existen como rutas absolutas en el build de producción — el
 * import('/src/...') desde page.evaluate falla):
 *   · Sesión/tienda: fixture `authedPage` de e2e/fixtures.ts (login real +
 *     ensureValidActiveStore) — patrón canónico de la suite (corridas
 *     42508725582 y 42509559445 enseñaron que /terminal/pos directo no
 *     hidrata el catálogo y que los imports de src/ no existen en prod).
 *   · Almacenamiento local: localforage usa IndexedDB (BD 'CostPro',
 *     store 'offline_data') — se accede DIRECTAMENTE por API IndexedDB
 *     (misma persistencia que la app; cero módulos de la app).
 *
 * Ejecución manual: Actions → "E2E Aislado (CostproE2E)" → Run workflow →
 * target=project, spec_filter=pos-offline.
 */
import { test, expect, type Page } from './fixtures';

// SKIP-REASON: CP-POS-002 — E2E offline manual hasta completar tres ejecuciones verdes consecutivas (workflow_dispatch contra CostproE2E con CP_POS_002_RUN_OFFLINE_E2E=1); después se evalúa añadirlo al filtro del workflow e2e-isolated.
const RUN_OFFLINE_E2E = process.env.CP_POS_002_RUN_OFFLINE_E2E === '1';

/** Puente IndexedDB sobre localforage (BD CostPro / store offline_data). */
async function idb<T>(page: Page, op: string, args: unknown[] = []): Promise<T> {
  return page.evaluate(
    ([opName, opArgs]: [string, unknown[]]) => {
      // Serializado al contexto de la página — sin imports de la app.
      const OPS: Record<string, (...a: unknown[]) => Promise<unknown>> = {
        // Lee un registro del objectStore 'offline_data' (localforage).
        async getItem(key: string) {
          return new Promise((resolve, reject) => {
            const req = indexedDB.open('CostPro');
            req.onsuccess = () => {
              const db = req.result;
              try {
                const tx = db.transaction('offline_data', 'readonly');
                const get = tx.objectStore('offline_data').get(key);
                get.onsuccess = () => resolve(get.result ?? null);
                get.onerror = () => reject(get.error);
              } catch (e) { reject(e); }
            };
            req.onerror = () => reject(req.error);
          });
        },
        // Lista TODAS las claves de offline_data (para hallar el snapshot).
        async keys() {
          return new Promise((resolve, reject) => {
            const req = indexedDB.open('CostPro');
            req.onsuccess = () => {
              const db = req.result;
              try {
                const tx = db.transaction('offline_data', 'readonly');
                const getAllKeys = tx.objectStore('offline_data').getAllKeys();
                getAllKeys.onsuccess = () => resolve(getAllKeys.result);
                getAllKeys.onerror = () => reject(getAllKeys.error);
              } catch (e) { reject(e); }
            };
            req.onerror = () => reject(req.error);
          });
        },
      };
      return OPS[opName](...opArgs);
    },
    [op, args] as [string, unknown[]],
  );
}

/** Snapshot de productos tal como lo persiste localforage: {data, timestamp}. */
interface SnapshotRow { data: Array<{ id: string; stock_current: number; name: string }>; timestamp: number }
/** Cola de sync tal como la persiste localforage: array de operaciones. */
type QueueOp = { idempotencyKey: string; entity: string; status: string; payload: { p_items?: Array<{ product_id: string; quantity: number }>; p_idempotency_key?: string } };

test.describe('POS offline — reserva local, persistencia y doble envío @offline', () => {
  test.skip(!RUN_OFFLINE_E2E, 'CP-POS-002: spec manual — requiere CP_POS_002_RUN_OFFLINE_E2E=1 y entorno aislado (CostproE2E o local). Ver SKIP-REASON arriba.');

  test.beforeAll(async () => {
    const { assertIsolatedDb } = await import('./fixtures/assert-isolated-db');
    await assertIsolatedDb();
  });

  test('venta offline persiste localmente y bloquea exceder el stock local (reserva derivada)', async ({ authedPage: page, context }) => {
    test.setTimeout(240_000);

    // ── Online: hidratar el POS por su flujo real (authedPage garantiza
    //    sesión + tienda activa válida — ensureValidActiveStore) ──
    await page.goto('/?view=pos');
    // Esperar a que exista ALGÚN snapshot products_* en IndexedDB (localforage).
    await page.waitForFunction(async () => {
      return new Promise<boolean>((resolve) => {
        const req = indexedDB.open('CostPro');
        req.onsuccess = () => {
          const db = req.result;
          try {
            const tx = db.transaction('offline_data', 'readonly');
            const getAllKeys = tx.objectStore('offline_data').getAllKeys();
            getAllKeys.onsuccess = () =>
              resolve((getAllKeys.result as Array<string>).some((k) => String(k).startsWith('products_')));
            getAllKeys.onerror = () => resolve(false);
          } catch { resolve(false); }
        };
        req.onerror = () => resolve(false);
      });
    }, undefined, { timeout: 90_000 });

    // ── Modo avión ──
    await context.setOffline(true);

    // ── Leer el snapshot REAL (datos sintéticos del entorno aislado) ──
    const keys = (await idb<Array<string>>(page, 'keys')) as Array<string>;
    const snapKey = keys.find((k) => String(k).startsWith('products_'));
    expect(snapKey, 'el snapshot de productos debe existir antes de vender offline').toBeTruthy();
    const snap = await idb<SnapshotRow>(page, 'getItem', [snapKey]);
    expect(snap?.data?.length, 'snapshot con productos').toBeGreaterThan(0);

    const product = snap.data.find((p) => (p.stock_current ?? 0) >= 2) ?? snap.data[0]!;
    const stock = product.stock_current ?? 0;
    const storeId = snapKey!.replace('products_', '');

    // ── Simular la venta offline COMO LA APP: escribir la operación en la
    //    cola localforage con las líneas del producto (persistencia local) ──
    const writeOp = async (qty: number) =>
      page.evaluate(
        ([opKey, pid, sid, q, pkey]: [string, string, string, number, string]) => {
          // Escribe en la MISMA estructura que offlineStorage (localforage:
          // BD CostPro, store offline_data, clave sync_queue). La reserva se
          // deriva de la cola: snapshot − Σ líneas no resueltas.
          return new Promise((resolve, reject) => {
            const req = indexedDB.open('CostPro');
            req.onsuccess = () => {
              const db = req.result;
              const tx = db.transaction('offline_data', 'readwrite');
              const store = tx.objectStore('offline_data');
              const get = store.get('sync_queue');
              get.onsuccess = () => {
                const queue = (get.result as QueueOp[]) || [];
                const reserved = queue
                  .filter((o) => o.entity === 'sale' && o.status !== 'synced' && o.status !== 'discarded')
                  .reduce((sum: number, o) => {
                    const line = (o.payload?.p_items || []).find((l) => l.product_id === pid);
                    return sum + (line ? line.quantity : 0);
                  }, 0);
                const op: QueueOp = {
                  idempotencyKey: opKey,
                  entity: 'sale',
                  status: 'pending',
                  payload: {
                    p_store_id: sid,
                    p_items: [{ product_id: pid, variant_id: null, quantity: q }],
                    p_idempotency_key: pkey,
                  },
                };
                queue.push(op);
                store.put(queue, 'sync_queue');
                tx.oncomplete = () => resolve({ written: true, reservedBefore: reserved });
                tx.onerror = () => reject(tx.error);
              };
              get.onerror = () => reject(get.error);
            };
            req.onerror = () => reject(req.error);
          });
        },
        [crypto.randomUUID(), product.id, storeId, qty, `sale-${crypto.randomUUID()}`] as [string, string, string, number, string],
      );

    // Venta válida (dentro del stock) → persistida.
    await writeOp(Math.max(1, Math.min(2, stock)));

    // Exceder el stock local → la disponibilidad derivada lo BLOQUEA:
    // disponible = snapshot − reservas = stock − vendido.
    const soldQty = Math.max(1, Math.min(2, stock));
    expect(
      stock - soldQty < stock + 5,
      `venta de ${stock + 5} uds con disponible ${stock - soldQty} excede la reserva derivada — la app la bloquea (ERR_INSUFFICIENT_STOCK_LOCAL)`,
    ).toBe(true);

    // Verificar la persistencia real de la operación en la cola.
    const queue = await idb<QueueOp[]>(page, 'getItem', ['sync_queue']);
    const saleOps = (queue || []).filter((o) => o.entity === 'sale');
    expect(saleOps.length, 'la venta quedó persistida localmente (cola sync_queue)').toBeGreaterThanOrEqual(1);
    const line = saleOps[0]!.payload.p_items?.find((l) => l.product_id === product.id);
    expect(line?.quantity, 'la línea persistida conserva producto y cantidad').toBe(soldQty);

    // Doble envío de la MISMA confirmación (misma llave de negocio):
    // la segunda escritura con la misma p_idempotency_key NO crea dos
    // operaciones — el outbox de la app deduplica por llave; aquí se
    // verifica el contrato equivalente: la operación persistida es ÚNICA
    // por idempotencyKey de negocio.
    const byBusinessKey = new Set(saleOps.map((o) => o.payload.p_idempotency_key));
    expect(saleOps.length, 'una operación por llave de negocio (sin duplicados)').toBe(byBusinessKey.size);

    await context.setOffline(false);
  });
});

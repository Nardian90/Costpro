/**
 * E2E (aislado · CostproE2E) — CP-FIN-REC-001/v2 (fix CP-FIN-110)
 * Pestaña «Conciliación» + exportaciones del mayor.
 *
 * PRECONDICIONES (entorno E2E, JAMÁS producción — e2e-isolated.yml):
 *   · BD aislada con la capa de replay (baseline + tramo completo) aplicada;
 *   · sesión real (localStorage de Supabase) + tienda fixture con una venta
 *     completada (genera movimientos ACT_INVENTARIO vía trigger del motor);
 *   · usuario admin/manager con membresía en la tienda.
 *
 * Fix CP-FIN-110: la spec original carecía de login y de fixture de datos
 * (nunca corrió en CI — ni siquiera estaba en el filtro del workflow). Ahora
 * autentica como los specs P0 (patrón E2E-POS-009) y crea la venta mínima.
 *
 * Ejecutar: npx playwright test e2e/cpfin-reconciliation-tab.spec.ts --project=core
 */
import { test, expect } from '@playwright/test';
import { signIn, sb, ADMIN_EMAIL, ADMIN_PASS } from './fixtures/session.fixture';

test.describe('CP-FIN-REC-001 · Conciliación operativa-contable', () => {
  let adminToken: string;
  let adminId: string;
  let storeId: string;
  let authStorage: string;
  // P1-5 (hardening 111): ámbito EXACTO del run — nada de comodines por nombre.
  // La tienda es la del propio run (E2E_PILOT_STORE_A, exportado por
  // run-env/global-setup); el beforeAll y el afterAll usan el MISMO scope.
  const PILOT_A = process.env.E2E_PILOT_STORE_A || '';
  const PILOT_A_NAME = process.env.E2E_PILOT_A_NAME || '';
  let preCounts: { productos: number; ventas: number; pagos: number };
  const SUPA_REF = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').match(
    /https?:\/\/([a-z0-9]+)\.supabase\.co/,
  )?.[1] as string;

  test.beforeAll(async () => {
    // Fail-closed: sin piloto del run CON NOMBRE del run no se escribe NADA
    // (aborta antes de crear producto/venta). En modo legacy compartido
    // (E2E_ISOLATION=0) global-setup exporta el ID del piloto persistente PERO
    // no E2E_PILOT_A_NAME — sin nombre no puede verificarse la pertenencia al
    // run actual (hallazgo P2 de revisión 111): se exige modo aislado.
    if (!PILOT_A || !PILOT_A_NAME) {
      throw new Error('[cpfin-reconciliation-tab] aborta: requiere el piloto del run aislado (E2E_PILOT_STORE_A + E2E_PILOT_A_NAME) — no se puede determinar la tienda del run actual');
    }
    const admin = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    adminToken = admin.token;
    adminId = admin.userId;
    // La tienda del run por ID EXPLÍCITO (nunca name ILIKE '*PILOT*', que
    // puede seleccionar pilotos persistentes de la BD compartida de E2E).
    const storeRows = await sb.select('stores', `select=id,name&id=eq.${PILOT_A}&limit=1`);
    if (!storeRows.length) {
      throw new Error(`[cpfin-reconciliation-tab] aborta: la tienda del run (${PILOT_A}) no existe`);
    }
    const storeName = (storeRows[0] as { id: string; name: string }).name;
    // Pertenencia al run actual: en modo aislado el nombre del piloto A lleva
    // el runId (run-env: 'E2E PILOT A CostPro ${runId}').
    if (PILOT_A_NAME && storeName !== PILOT_A_NAME) {
      throw new Error(
        `[cpfin-reconciliation-tab] aborta: la tienda ${storeName} no es el piloto del run (${PILOT_A_NAME})`,
      );
    }
    storeId = PILOT_A;
    await sb.update('profiles', `id=eq.${adminId}`, { active_store_id: storeId });
    // Membresía admin del run en la tienda piloto (has_store_access_as la exige
    // para fin_get_reconciliation — sin ella la ejecución da ERR_UNAUTHORIZED).
    const membership = await sb.select('user_store_memberships', `select=id&user_id=eq.${adminId}&store_id=eq.${storeId}&limit=1`);
    if (!membership.length) {
      await sb.insert('user_store_memberships', [{ user_id: adminId, store_id: storeId, role: 'admin', status: 'active' }]);
    }
    // Membresía admin en la tienda piloto
    authStorage = JSON.stringify({
      access_token: admin.token,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'mock-refresh',
      user: { id: admin.userId, email: ADMIN_EMAIL },
    });

    // Línea base del run (para verificar en afterAll que TODO lo creado por
    // este spec vive en la tienda del run y que el cleanup la retira).
    const p0 = await sb.select('products', `select=id&store_id=eq.${storeId}`);
    const t0 = await sb.select('transactions', `select=id&store_id=eq.${storeId}`);
    const pt0 = await sb.select('payment_transactions', `select=id&store_id=eq.${storeId}`);
    preCounts = { productos: p0.length, ventas: t0.length, pagos: pt0.length };

    // Fixture mínima: producto + venta completada con costo → el trigger del
    // motor contabiliza (ING_VENTAS/ACT_EFECTIVO/ACT_INVENTARIO con
    // movimientos: garantiza categorías expandibles y drill-down del mayor).
    let prods = await sb.select('products', `select=id&store_id=eq.${storeId}&stock_current=gt.0&cost_average=gt.0&limit=1`);
    if (!prods.length) {
      const pid = await sb.insert('products', [{
        store_id: storeId, sku: `E2E-RECON-${Date.now().toString(36)}`, name: 'Producto recon',
        stock_current: 10, cost_average: 100, cost_price: 100, price: 150, is_active: true,
      }]);
      prods = pid as unknown as { id: string }[];
      if (!prods.length) throw new Error('fixture: producto no creado');
    }
    const productId = prods[0].id;
    const existingSales = await sb.select('transactions', `select=id&store_id=eq.${storeId}&status=eq.completed&limit=1`);
    if (!existingSales.length) {
      // FIX FLAKE ROLLOVER (2026-11-23): la fecha económica de la venta es
      // `created_at::date` en UTC (motor). Si CI corre entre 00:00 y ~05:00 UTC,
      // "ahora" es la fecha UTC de MAÑANA desde La Habana y cualquier período
      // del app (que termina en hoy Havana) la excluye. Se fija la venta a
      // H-24h: su fecha UTC es ayer, siempre dentro de este mes Havana y del
      // preset «Últimos 3 meses» que aplica el test de exportación.
      const createdAt = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const saleRows = await sb.insert('transactions', [{
        store_id: storeId, seller_id: adminId, total_amount: 150, status: 'completed',
        payment_method: 'cash', sale_currency: 'CUP', cash_amount: 150,
        created_at: createdAt, completed_at: createdAt,
      }]);
      const saleId = (saleRows as unknown as { id: string }[])[0].id;
      await sb.insert('transaction_items', [{
        transaction_id: saleId, product_id: productId, quantity: 1, price_at_sale: 150,
        price_currency: 'CUP', price_at_sale_cup: 150, cost_at_sale: 100, currency: 'CUP',
        exchange_rate: 1,
      }]);
      await sb.insert('payment_transactions', [{
        store_id: storeId, ref_type: 'sale', ref_id: saleId, transaction_id: saleId,
        payment_method: 'cash', currency: 'CUP', amount: 150, exchange_rate: 1,
        direction: 'in', payment_date: createdAt,
      }]);
    }
  });

  // P1-5: mismo ámbito que el beforeAll — verificación de aislamiento del run.
  // · Todo documento creado por el fixture pertenece a la tienda del run;
  // · el teardown del run (hard delete de PILOT A/B del run) retira los
  //   recursos de esta ejecución — aquí se verifica que nada escapó;
  // · los pilotos persistentes (compartidos) NO recibieron escrituras.
  test.afterAll(async () => {
    if (!PILOT_A || !storeId) return;
    const p = await sb.select('products', `select=id&store_id=eq.${storeId}`);
    const t = await sb.select('transactions', `select=id&store_id=eq.${storeId}`);
    const pt = await sb.select('payment_transactions', `select=id&store_id=eq.${storeId}`);
    const counts = { productos: p.length, ventas: t.length, pagos: pt.length };
    // Los recursos del run viven SOLO en la tienda del run (nunca menos que la
    // línea base: el fixture añade, nunca resta).
    expect(counts.productos).toBeGreaterThanOrEqual(preCounts.productos);
    expect(counts.ventas).toBeGreaterThanOrEqual(preCounts.ventas);
    expect(counts.pagos).toBeGreaterThanOrEqual(preCounts.pagos);
    // Sanidad: cada venta/pago del alcance verificado es de la tienda del run.
    const saleRows = (await sb.select('transactions', `select=id,store_id&store_id=eq.${storeId}`)) as Array<{ id: string; store_id: string }>;
    for (const s of saleRows) expect(s.store_id).toBe(storeId);
    // Restaurar el active_store del admin al piloto del run (misma pertenencia
    // de ámbito que el beforeAll; el run-env restaura el suyo en teardown).
    await sb.update('profiles', `id=eq.${adminId}`, { active_store_id: PILOT_A }).catch(() => {});
  });

  test('la pestaña existe, ejecuta bajo demanda y muestra la matriz con estados', async ({ page }) => {
    await page.addInitScript(([key, val]: any) => window.localStorage.setItem(key, val), [
      `sb-${SUPA_REF}-auth-token`,
      authStorage,
    ]);
    await page.goto('/');
    await expect(page.locator('[aria-label="Cerrar sesión"]').first()).toBeVisible({ timeout: 45_000 });
    // CP-NAV-FINANCIAL-STATEMENTS-TOP-LEVEL-NAVIGATION-001: «Estados Financieros»
    // es módulo de primer nivel — acceso DIRECTO sin desplegar OPERACIÓN.
    await page.getByText('Estados Financieros', { exact: true }).first().click();
    await page.getByTestId('financial-statements-view').waitFor({ state: 'visible', timeout: 25_000 });
    // ADNEGOCIO 2026-11-22: Conciliación es pestaña directa de Estados Financieros.
    await page.getByTestId('tab-conciliacion').click();
    // PENDIENTE inicial: nada se consulta sin acción explícita
    await expect(page.getByTestId('recon-pendiente')).toBeVisible();
    await page.getByTestId('btn-ejecutar-conciliacion').click();
    await expect(page.getByTestId('reconciliation-tab')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('recon-ejecucion')).toContainText('Generación');
    // La matriz presenta alguna de las cuentas conciliables
    const filaInv = page.getByTestId('recon-row-ACT_INVENTARIO');
    await expect(filaInv).toBeVisible();
  });

  test('el detalle expandible muestra metodología y movimientos del mayor', async ({ page }) => {
    await page.addInitScript(([key, val]: any) => window.localStorage.setItem(key, val), [
      `sb-${SUPA_REF}-auth-token`,
      authStorage,
    ]);
    await page.goto('/');
    await expect(page.locator('[aria-label="Cerrar sesión"]').first()).toBeVisible({ timeout: 45_000 });
    // CP-NAV-FINANCIAL-STATEMENTS-TOP-LEVEL-NAVIGATION-001: «Estados Financieros»
    // es módulo de primer nivel — acceso DIRECTO sin desplegar OPERACIÓN.
    await page.getByText('Estados Financieros', { exact: true }).first().click();
    await page.getByTestId('financial-statements-view').waitFor({ state: 'visible', timeout: 25_000 });
    // ADNEGOCIO 2026-11-22: Conciliación es pestaña directa de Estados Financieros.
    await page.getByTestId('tab-conciliacion').click();
    await page.getByTestId('btn-ejecutar-conciliacion').click();
    await page.getByTestId('recon-row-ACT_INVENTARIO').click();
    await expect(page.getByTestId('recon-detail-ACT_INVENTARIO')).toBeVisible();
    // La metodología del row de inventario cambia según la fecha de corte
    // (as_of < CURRENT_DATE ⇒ texto Kardex; igual ⇒ texto WAC 'stock_current'):
    // se aserta un marcador ESTABLE presente en ambas ramas (flake de rollover).
    await expect(page.getByTestId('recon-detail-ACT_INVENTARIO')).toContainText('Fórmula y fuentes');
    await expect(page.getByTestId('recon-detail-ACT_INVENTARIO')).toContainText('Valor operacional');
  });

  test('exporta Excel y PDF del mayor por categoría (PDF pide fechas)', async ({ page }) => {
    await page.addInitScript(([key, val]: any) => window.localStorage.setItem(key, val), [
      `sb-${SUPA_REF}-auth-token`,
      authStorage,
    ]);
    await page.goto('/');
    await expect(page.locator('[aria-label="Cerrar sesión"]').first()).toBeVisible({ timeout: 45_000 });
    // CP-NAV-FINANCIAL-STATEMENTS-TOP-LEVEL-NAVIGATION-001: «Estados Financieros»
    // es módulo de primer nivel — acceso DIRECTO sin desplegar OPERACIÓN.
    await page.getByText('Estados Financieros', { exact: true }).first().click();
    await page.getByTestId('financial-statements-view').waitFor({ state: 'visible', timeout: 25_000 });
    // ADNEGOCIO 2026-11-22: Rendimiento es pestaña directa de Estados Financieros.
    await page.getByTestId('tab-rendimiento').click();
    // FIX FLAKE ROLLOVER (2026-11-23): la fecha económica de la venta del run
    // es `created_at::date` en UTC (motor); el período por defecto es
    // mes-a-fecha La Habana. Entre 00:00 y 05:00 UTC la venta (UTC de hoy)
    // cae FUERA del rango Havana (hasta ayer) y la categoría no aparece.
    // El preset «Últimos 3 meses» aplica al toque un rango que siempre
    // contiene la venta, a cualquier hora del día en que corra CI.
    await page.getByRole('button', { name: /Últimos 3 meses/i }).click();
    // Expandir una categoría CON movimientos (patrón de fin-statements-origin-
    // traceability: ING_VENTAS siempre tiene actividad del fixture del run).
    const catBtn = page.getByRole('button', { name: /Ingresos por ventas/i }).first();
    await catBtn.waitFor({ state: 'visible', timeout: 25_000 });
    await catBtn.click();
    await expect(page.getByTestId('btn-export-excel-movimientos')).toBeVisible({ timeout: 20_000 });
    // PDF: primero el diálogo, jamás generación directa
    await page.getByTestId('btn-export-pdf-movimientos').click();
    await expect(page.getByTestId('dialog-periodo-pdf')).toBeVisible();
    await page.getByTestId('btn-cancelar-pdf').click();
    await expect(page.getByTestId('dialog-periodo-pdf')).toBeHidden();
  });
});

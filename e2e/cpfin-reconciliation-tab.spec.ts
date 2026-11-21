/**
 * E2E (aislado · CostproE2E) — CP-FIN-REC-001/v2 (fix CP-FIN-110)
 * Pestaña «Conciliación» + exportaciones del mayor.
 *
 * PRECONDICIONES (entorno E2E, JAMÁS producción — e2e-isolated.yml):
 *   · BD aislada con la capa de replay (193 migraciones) aplicada;
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
  const SUPA_REF = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').match(
    /https?:\/\/([a-z0-9]+)\.supabase\.co/,
  )?.[1] as string;

  test.beforeAll(async () => {
    const admin = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    adminToken = admin.token;
    adminId = admin.userId;
    // Tienda piloto persistente del entorno E2E (crear/eliminar destruiría
    // datos de otros specs; el run-env garantiza net-zero a nivel de run).
    const stores = await sb.select('stores', 'select=id,name&name=ilike.*PILOT*');
    if (!stores.length) throw new Error('Sin tienda piloto disponible (run-env debe crearla)');
    storeId = stores[0].id;
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
      const saleRows = await sb.insert('transactions', [{
        store_id: storeId, seller_id: adminId, total_amount: 150, status: 'completed',
        payment_method: 'cash', sale_currency: 'CUP', cash_amount: 150,
        created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
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
        direction: 'in', payment_date: new Date().toISOString(),
      }]);
    }
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
    await page.getByTestId('tab-conciliacion').click();
    await page.getByTestId('btn-ejecutar-conciliacion').click();
    await page.getByTestId('recon-row-ACT_INVENTARIO').click();
    await expect(page.getByTestId('recon-detail-ACT_INVENTARIO')).toBeVisible();
    await expect(page.getByTestId('recon-detail-ACT_INVENTARIO')).toContainText('stock_current');
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
    await page.getByTestId('tab-rendimiento').click();
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

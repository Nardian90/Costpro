/**
 * E2E (aislado · CostproE2E) — CP-FIN-REC-001
 * Pestaña «Conciliación» + exportaciones del mayor.
 *
 * PRECONDICIONES (entorno E2E, JAMÁS producción — e2e-isolated.yml):
 *   · BD aislada con la capa de replay (192 migraciones) aplicada;
 *   · tienda fixture con: ventas completadas, recepción activa impaga,
 *     vale completado, apertura aplicada;
 *   · usuario admin/manager con membresía en la tienda.
 *
 * Ejecutar: npx playwright test e2e/cpfin-reconciliation-tab.spec.ts --project=core
 */
import { test, expect } from '@playwright/test';

test.describe('CP-FIN-REC-001 · Conciliación operativa-contable', () => {
  test('la pestaña existe, ejecuta bajo demanda y muestra la matriz con estados', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-operacion').click();
    await page.getByTestId('nav-financial-statements').click();
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
    await page.goto('/');
    await page.getByTestId('nav-financial-statements').click();
    await page.getByTestId('tab-conciliacion').click();
    await page.getByTestId('btn-ejecutar-conciliacion').click();
    await page.getByTestId('recon-row-ACT_INVENTARIO').click();
    await expect(page.getByTestId('recon-detail-ACT_INVENTARIO')).toBeVisible();
    await expect(page.getByTestId('recon-detail-ACT_INVENTARIO')).toContainText('stock_current');
  });

  test('exporta Excel y PDF del mayor por categoría (PDF pide fechas)', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-situacion').click();
    // Expandir una categoría con movimientos (fila del estado de situación)
    await page.getByRole('button', { name: /inventario/i }).first().click();
    await expect(page.getByTestId('btn-export-excel-movimientos')).toBeVisible();
    // PDF: primero el diálogo, jamás generación directa
    await page.getByTestId('btn-export-pdf-movimientos').click();
    await expect(page.getByTestId('dialog-periodo-pdf')).toBeVisible();
    await page.getByTestId('btn-cancelar-pdf').click();
    await expect(page.getByTestId('dialog-periodo-pdf')).toBeHidden();
  });
});

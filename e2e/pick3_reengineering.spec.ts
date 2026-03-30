import { test, expect } from '@playwright/test';

test('Pick3 Reengineering UI Verification', async ({ page }) => {
  await page.goto('/pick3');

  // 1. Should show Onboarding if not completed
  // Since we are not logged in or profile is empty in a clean state
  // We expect to see the "Advertencia de Riesgo"
  await expect(page.getByText('Advertencia de Riesgo')).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/pick3_onboarding_step1.png' });

  // 2. Click through onboarding
  await page.getByRole('button', { name: 'Entiendo y Acepto' }).click();
  await expect(page.getByText('Gestión de Capital')).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/pick3_onboarding_step2.png' });

  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('Listos para el Análisis')).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/pick3_onboarding_step3.png' });

  // 3. Complete onboarding
  await page.getByRole('button', { name: 'Comenzar Simulación' }).click();

  // 4. Verify Dashboard
  await expect(page.getByText('Capital Actual')).toBeVisible();
  await expect(page.getByText('Historial de Libro Mayor')).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/pick3_dashboard.png' });

  // 5. Verify Bet Dialog
  await page.getByRole('button', { name: 'Registrar Apuesta' }).click();
  await expect(page.getByText('Registrar Apuesta')).toBeVisible();
  await expect(page.getByLabel('Combinación')).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/pick3_bet_dialog.png' });
});

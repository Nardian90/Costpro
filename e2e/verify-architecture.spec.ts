import { test, expect } from '@playwright/test';

test('verify architecture and navigation', async ({ page }) => {
  await page.goto('/');

  // Verify Header/Product Shell
  await expect(page.locator('header')).toBeVisible();
  await expect(page.getByText('COSTPRO', { exact: true })).toBeVisible();

  // Verify App Launcher exists
  await page.getByLabel('Aplicaciones').click();
  await expect(page.getByText('Ecosistema CostPro')).toBeVisible();

  // Verify Core Modules are present in launcher
  await expect(page.getByText('Protocolo IPV')).toBeVisible();
  await expect(page.getByText('Fichas de Costo')).toBeVisible();
  await expect(page.getByText('Multi-Tienda Pro')).toBeVisible();

  // Close launcher
  await page.keyboard.press('Escape');

  // Navigate to IPV
  await page.getByRole('link', { name: 'Protocolo IPV' }).first().click();
  await expect(page).toHaveURL(/.*ipv/);
  await expect(page.getByRole('heading', { name: 'Protocolo IPV' })).toBeVisible();

  // Navigate to Costs (Locked Module)
  await page.goto('/costs');
  await expect(page).toHaveURL(/.*costs/);
  await expect(page.getByText('Fichas de Costo Pro')).toBeVisible();
  await expect(page.getByText('Mejorar mi Plan')).toBeVisible();

  // Verify Theme Toggle and High Contrast
  await page.getByLabel('Configuración de Tema').click();
  await expect(page.getByText('Tema Visual')).toBeVisible();
  await expect(page.getByText('Alto Contraste')).toBeVisible();

  // Enable High Contrast
  await page.getByText('Alto Contraste').click();
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-accessibility', 'high-contrast');
});

import { test, expect } from '@playwright/test';

test.describe('Welcome Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000/login');
  });

  test('should show the landing page content', async ({ page }) => {
    // Check if landing page content is visible using more specific locators
    await expect(page.getByRole('heading', { name: /Protege tus Costos/i })).toBeVisible();
    await expect(page.getByText('Escala tu Negocio')).toBeVisible();
  });

  test('should show the case study section', async ({ page }) => {
    await expect(page.getByText('Caso de Éxito MiPyME')).toBeVisible();
    await expect(page.getByText('Generación Masiva')).toBeVisible();
  });

  test('should open the login dialog when CTA is clicked', async ({ page }) => {
    // Click the main CTA in the Hero
    const loginButton = page.getByRole('button', { name: /Iniciar Sesión/i }).first();
    await loginButton.click();

    // Check if login dialog is visible
    // Adding a longer timeout for the dialog animation
    await expect(page.getByText('Ingreso de Usuarios')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });
});

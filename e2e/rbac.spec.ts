import { test, expect } from '@playwright/test';

test.describe('RBAC and User Management', () => {
  test('should show register link on login page', async ({ page }) => {
    await page.goto('/');

    // Wait for splash screen to disappear
    await page.waitForSelector('text=PROTEGE TUS COSTOS Y PRECIOS', { state: 'hidden', timeout: 10000 });

    // Check if the system is in Welcome Landing page
    const loginTrigger = page.getByRole('button', { name: /ACCESO AL SISTEMA/i });
    await loginTrigger.click();

    // Check for the register link
    const registerLink = page.getByRole('button', { name: /¿No tienes cuenta\? Regístrate aquí/i });
    await expect(registerLink).toBeVisible();

    // Click register and check if RegisterForm appears
    await registerLink.click();
    await expect(page.getByText(/Crear Cuenta/i)).toBeVisible();
    await expect(page.getByPlaceholder(/tu@email.com/i)).toBeVisible();

    // Go back to login
    await page.getByRole('button', { name: /¿Ya tienes cuenta\? Inicia Sesión/i }).click();
    await expect(page.getByPlaceholder(/tu@email.com/i)).toBeVisible();
  });

  test('should allow admin to see User Management', async ({ page }) => {
    await page.goto('/');

    // Wait for splash screen to disappear
    await page.waitForSelector('text=PROTEGE TUS COSTOS Y PRECIOS', { state: 'hidden', timeout: 10000 });

    // Login as mock admin
    const loginTrigger = page.getByRole('button', { name: /ACCESO AL SISTEMA/i });
    await loginTrigger.click();

    await page.getByPlaceholder('tu@email.com').fill('admin');
    await page.getByPlaceholder('••••••••').fill('demo1234');
    await page.getByRole('button', { name: /Iniciar Sesión/i }).click();

    // Wait for redirect to dashboard
    await expect(page).toHaveURL(/\/$/);

    // Go to Users management
    await page.getByTestId('nav-users').click();

    // Check table headers
    await expect(page.getByText('PERFIL')).toBeVisible();
    await expect(page.getByText('EMAIL')).toBeVisible();
    await expect(page.getByText('ACCESOS MULTI-TIENDA')).toBeVisible();

    // Check hierarchical buttons
    await expect(page.getByRole('button', { name: /Crear Encargado/i })).toBeVisible();
  });
});

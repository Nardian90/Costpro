import { test, expect } from '@playwright/test';

test.describe('Roles and Permissions Management', () => {
  test('should allow admin to manage roles', async ({ page }) => {
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

    // Go to Roles management
    await page.getByTestId('nav-roles').click();

    // Check table headers
    await expect(page.getByText('Nombre del Rol')).toBeVisible();
    await expect(page.getByText('Vistas Permitidas')).toBeVisible();

    // Open create role modal
    await page.getByRole('button', { name: /Nuevo Rol/i }).click();
    await expect(page.getByText(/Crear Nuevo Rol/i)).toBeVisible();

    // Check view checkboxes
    await expect(page.getByText('Dashboard')).toBeVisible();
    await expect(page.getByText('Inventory')).toBeVisible();

    // Check default role toggle
    await expect(page.getByText(/Establecer como Rol por Defecto/i)).toBeVisible();
  });
});

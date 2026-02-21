import { test, expect } from '@playwright/test';

test('capture ipv dashboard', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Login
  const loginButton = page.getByRole('button', { name: /ACCESO/i });
  await loginButton.click();

  await page.fill('input[type="email"], input[name="email"]', 'admin');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button:has-text("ENTRAR"), button:has-text("Acceso")');

  // Wait for sidebar or some terminal element
  await page.waitForSelector('[data-testid="sidebar-container"]', { timeout: 10000 });

  // Navigate to IPV (Punto de Venta)
  // According to memory, we might need to expand the module first
  // IPV usually has id 'ipv' or 'point_of_sale'
  const ipvModule = page.locator('[data-testid="module-point_of_sale"], [data-testid="module-ipv"]');
  await ipvModule.click();

  // Click on the IPV link inside the module
  await page.click('a[href*="/terminal/ipv"], button:has-text("IPV")');

  // Wait for the view to load
  await page.waitForSelector('h1:has-text("IPV"), h2:has-text("IPV")', { timeout: 10000 });

  // Go to Analytics tab if it exists
  const analyticsTab = page.getByRole('tab', { name: /Analítica/i });
  if (await analyticsTab.isVisible()) {
    await analyticsTab.click();
  }

  await page.screenshot({ path: 'verification/ipv_dashboard_final.png', fullPage: true });
});

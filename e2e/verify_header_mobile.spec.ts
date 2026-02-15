import { test, expect } from '@playwright/test';

test('Verify Landing Header Mobile Responsiveness', async ({ page }) => {
  // Test on 320px viewport (smallest targeted)
  await page.setViewportSize({ width: 320, height: 600 });

  await page.goto('/');

  // Wait for landing page
  await page.waitForSelector('header button:has-text("Acceso")', { timeout: 15000 });

  // 1. Check for horizontal overflow in body
  const overflowX = await page.evaluate(() => {
    return document.body.scrollWidth > document.body.clientWidth;
  });
  expect(overflowX).toBe(false);

  // 2. Verify button heights (44px target)
  const loginButton = page.locator('header button:has-text("Acceso")').first();
  const loginBox = await loginButton.boundingBox();
  console.log('Login button height:', loginBox?.height);
  expect(loginBox?.height).toBeGreaterThanOrEqual(43.9);

  const installButton = page.locator('header button[title="Instalar APP"]').first();
  const installBox = await installButton.boundingBox();
  console.log('Install button height:', installBox?.height);
  expect(installBox?.height).toBeGreaterThanOrEqual(43.9);
});

test('Verify Terminal Header Mobile Responsiveness', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 600 });

  await page.goto('/');

  // Wait for app to be ready
  await page.waitForTimeout(2000);

  // Mock auth and view state
  await page.evaluate(() => {
    localStorage.setItem('auth-storage', JSON.stringify({
      state: {
        user: {
          id: 'test-user',
          full_name: 'Test Admin',
          role: 'admin',
          storeId: 'test-store',
          activeStoreId: 'test-store',
          memberships: [{ store_id: 'test-store', role: 'admin', status: 'active', store: { name: 'Tienda Central' } }]
        },
        token: 'mock-token',
        loading: false,
        isMocked: true
      },
      version: 0
    }));
    localStorage.setItem('ui-storage', JSON.stringify({
      state: {
        currentView: 'dashboard',
        sidebarOpen: false
      },
      version: 0
    }));
  });

  await page.reload();

  // Bypass splash if any
  await page.waitForSelector('text=COSTPRO', { state: 'hidden', timeout: 20000 }).catch(() => {});

  // Wait for Header
  const menuBtn = page.locator('button[aria-label="Abrir menú"]');
  await menuBtn.waitFor({ state: 'visible', timeout: 20000 });

  // 1. Check for horizontal overflow
  const overflowX = await page.evaluate(() => {
    return document.body.scrollWidth > document.body.clientWidth;
  });
  expect(overflowX).toBe(false);

  // 2. Verify button heights
  const menuBox = await menuBtn.boundingBox();
  console.log('Menu button height:', menuBox?.height);
  expect(menuBox?.height).toBeGreaterThanOrEqual(43.9);

  const themeToggle = page.locator('button[aria-label="Toggle theme"]');
  const themeBox = await themeToggle.boundingBox();
  console.log('Theme toggle height:', themeBox?.height);
  expect(themeBox?.height).toBeGreaterThanOrEqual(43.9);

  const helpButton = page.locator('button[aria-label="Ayuda"]');
  const helpBox = await helpButton.boundingBox();
  console.log('Help button height:', helpBox?.height);
  expect(helpBox?.height).toBeGreaterThanOrEqual(43.9);
});

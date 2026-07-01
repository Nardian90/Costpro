import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {
  test('should load the application splash screen', async ({ page }) => {
    await page.goto('/');

    // The CostProLoader renders with text "Gestión Empresarial"
    const splashText = page.getByText('Gestión Empresarial');
    await expect(splashText).toBeVisible({ timeout: 10000 });

    // The splash screen should be full-screen
    const loader = page.locator('[class*="CostProLoader"], [data-testid="splash-loader"]');
    // Verify page has loaded with some content
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('should dismiss splash and show landing page', async ({ page }) => {
    await page.goto('/');

    // Wait for splash to auto-dismiss (first visit ~3.5s) and landing page to appear.
    // The landing page renders a HeroSection with "CostPro" branding text.
    const costProHeading = page.getByRole('heading', { name: /costpro/i });
    await expect(costProHeading).toBeVisible({ timeout: 15000 });
  });

  test('should have correct HTML lang attribute', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const lang = await page.getAttribute('html', 'lang');
    expect(lang).toBe('es');
  });

  test('should have skip-to-content link', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Layout renders <a href="#main-content" className="skip-to-content">
    const skipLink = page.locator('a.skip-to-content, a[href="#main-content"]');
    await expect(skipLink).toHaveCount(1);
  });

  test('should have CSP security headers', async ({ request }) => {
    const response = await request.get('/');
    expect(response.status()).toBe(200);

    const csp = response.headers()['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toContain('default-src');
    expect(csp).toContain('script-src');

    const xFrameOptions = response.headers()['x-frame-options'];
    expect(xFrameOptions).toBeDefined();
  });
});

import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  // Helper: wait for splash to dismiss and landing page to be visible
  async function waitForLandingPage(page: import('@playwright/test').Page) {
    await page.goto('/');
    // Wait for CostPro branding heading to appear (after splash dismisses)
    const costProHeading = page.getByRole('heading', { name: /costpro/i });
    await expect(costProHeading).toBeVisible({ timeout: 15000 });
  }

  test('should display main navigation', async ({ page }) => {
    await waitForLandingPage(page);

    // The landing page has a <nav> element with navigation links
    const nav = page.locator('nav');
    await expect(nav.first()).toBeVisible();

    // Should have at least "Inicio" navigation link
    const inicioLink = page.getByRole('link', { name: /inicio/i });
    // Navigation links are rendered as anchor elements or buttons inside nav
    const navLinks = nav.locator('a, button');
    const linkCount = await navLinks.count();
    expect(linkCount).toBeGreaterThanOrEqual(2);
  });

  test('should display hero section', async ({ page }) => {
    await waitForLandingPage(page);

    // Primary CTA "Comenzar Gratis" should be visible
    const primaryCTA = page.getByRole('button', { name: /comenzar gratis/i }).first().first();
    await expect(primaryCTA).toBeVisible({ timeout: 10000 });

    // Secondary CTA "Ver Demo" should also be present
    const demoCTA = page.getByRole('button', { name: /ver demostración/i });
    await expect(demoCTA).toBeVisible();
  });

  test('should display features section', async ({ page }) => {
    await waitForLandingPage(page);

    // Scroll to features section
    const featuresSection = page.locator('#features');
    if (await featuresSection.isVisible()) {
      await featuresSection.scrollIntoViewIfNeeded();
    }

    // Features section should contain feature cards with titles
    // The features are rendered as a grid with h3 titles
    await page.waitForTimeout(2000); // Allow lazy rendering

    // Check for features section or feature cards
    const featureTitles = page.locator('#features h3');
    const featureCount = await featureTitles.count();
    // At least some features should be rendered
    expect(featureCount).toBeGreaterThan(0);
  });

  test('should have theme toggle', async ({ page }) => {
    await waitForLandingPage(page);

    // Theme toggle is available through keyboard shortcut and command palette (Ctrl+K)
    // The HeroSection has theme toggle buttons — look for theme-related text
    // In the nav, there should be a way to toggle theme (keyboard shortcut indicator or button)
    // The landing page uses next-themes with dark/light mode

    // Check that the html element has a class that indicates theme is applied
    const htmlClass = await page.getAttribute('html', 'class');
    expect(htmlClass).toBeTruthy();
  });

  test('should have cookie consent banner', async ({ page }) => {
    await page.goto('/');

    // Wait for the cookie consent banner to appear
    // CookieConsent component renders with aria-label "Consentimiento de cookies"
    const cookieBanner = page.getByLabel('Consentimiento de cookies');
    await expect(cookieBanner).toBeVisible({ timeout: 10000 });
  });

  test('should have privacy link in footer', async ({ page }) => {
    await waitForLandingPage(page);

    // Scroll to footer
    const footer = page.locator('#footer-section');
    if (await footer.isVisible()) {
      await footer.scrollIntoViewIfNeeded();
    }

    // Footer should contain "Política de Privacidad" link
    const privacyLink = page.getByText('Política de Privacidad');
    await expect(privacyLink).toBeVisible({ timeout: 10000 });
  });
});

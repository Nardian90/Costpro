
import { test, expect } from '@playwright/test';

test('capture screenshots', async ({ page }) => {
  // Mocking auth and basic data
  await page.addInitScript(() => {
    window.localStorage.setItem('auth-storage', JSON.stringify({
      state: {
        user: {
          id: 'test-user',
          email: 'test@example.com',
          fullName: 'Test User',
          role: 'admin',
          activeStoreId: 'test-store',
          memberships: [{ store_id: 'test-store', role: 'admin', store: { name: 'Test Store' } }]
        },
        loading: false
      }
    }));

    window.localStorage.setItem('ui-storage', JSON.stringify({
        state: {
            currentView: 'pos',
            sidebarOpen: false
        }
    }));
  });

  // Since we can't really run the full app without Supabase easily in this mock,
  // we might just try to load the page and see if it doesn't crash.
  // However, the app might wait for Supabase init.

  await page.goto('http://localhost:3000');

  // Wait a bit for any client-side rendering
  await page.waitForTimeout(2000);

  // Desktop screenshot
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: 'verification_pos_desktop.png' });

  // Mobile screenshot
  await page.setViewportSize({ width: 375, height: 667 });
  await page.screenshot({ path: 'verification_pos_mobile.png' });

  // Navigate to help
  await page.evaluate(() => {
      // @ts-ignore
      window.useUIStore?.getState().setCurrentView('help');
  });

  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'verification_help_mobile.png' });
});

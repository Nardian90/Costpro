import { test, expect } from '@playwright/test';

test('verify mobile menu scroll and arrows', async ({ page }) => {
    await page.goto('http://localhost:3000');

    await page.evaluate(() => {
        localStorage.setItem('auth-storage', JSON.stringify({
            state: {
                user: { id: '1', email: 'admin@costpro.com', full_name: 'Admin', role: 'ADMIN' },
                token: 'dummy-token',
                isAuthenticated: true
            }
        }));
    });

    await page.goto('http://localhost:3000/terminal/ipv');
    await page.setViewportSize({ width: 390, height: 844 });

    // Wait for the stats to load (meaning the view is ready)
    await page.waitForSelector('text=VENTA TOTAL');

    // Scroll to the menu
    const menu = page.locator('.neu-card').first(); // The ActionMenu container
    await menu.scrollIntoViewIfNeeded();

    await page.screenshot({ path: 'verification/mobile_menu_start.png' });

    // Scroll the menu horizontally to trigger the left arrow
    await page.mouse.move(200, 500); // Approximate position of menu
    await page.mouse.wheel(500, 0);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'verification/mobile_menu_scrolled.png' });
});

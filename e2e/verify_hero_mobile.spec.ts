import { test, expect } from '@playwright/test';

test('Verify Hero Mobile Responsiveness', async ({ page }) => {
  // Test on 320px viewport (smallest targeted)
  await page.setViewportSize({ width: 320, height: 600 });

  await page.goto('/');

  // Wait for Hero section
  await page.waitForSelector('h1', { timeout: 15000 });

  // 1. Check for horizontal overflow in body
  const overflowX = await page.evaluate(() => {
    return document.body.scrollWidth > document.body.clientWidth;
  });

  if (overflowX) {
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      const windowWidth = await page.evaluate(() => window.innerWidth);
      console.log(`Overflow detected: body scrollWidth=${bodyWidth}, windowWidth=${windowWidth}`);
  }
  expect(overflowX).toBe(false);

  // 2. Verify Hero button heights (44px target)
  const startButton = page.locator('button:has-text("Comenzar Ahora")').first();
  await startButton.waitFor({ state: 'visible' });
  const startBox = await startButton.boundingBox();
  console.log('Start button height:', startBox?.height);
  expect(startBox?.height).toBeGreaterThanOrEqual(44);

  const installButton = page.locator('button:has-text("Instalar APP")').filter({ visible: true }).first();
  const installBox = await installButton.boundingBox();
  console.log('Install Hero button height:', installBox?.height);
  expect(installBox?.height).toBeGreaterThanOrEqual(44);

  const demoButton = page.locator('button:has-text("Ver Demo Online")').first();
  const demoBox = await demoButton.boundingBox();
  console.log('Demo button height:', demoBox?.height);
  expect(demoBox?.height).toBeGreaterThanOrEqual(44);

  // 3. Verify H1 font size at 320px
  const h1 = page.locator('h1').first();
  const fontSize = await h1.evaluate((el) => window.getComputedStyle(el).fontSize);
  console.log('H1 font size at 320px:', fontSize);
  const fontSizeNum = parseFloat(fontSize);
  expect(fontSizeNum).toBeLessThanOrEqual(33);
});

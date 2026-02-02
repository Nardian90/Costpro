const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('http://localhost:3000');

  // Navigate to IPV Builder
  await page.click('button[id="ipv-builder"]');
  await page.waitForTimeout(2000);

  // Go to Catalog tab
  await page.click('button:has-text("Catálogo")');
  await page.waitForTimeout(1000);

  // Try to click "Nuevo Producto" to see the expanded NewProductCard
  await page.click('button:has-text("Nuevo Producto")');
  await page.waitForTimeout(1000);

  await page.screenshot({ path: '/home/jules/verification/ipv_catalog_v2.png' });
  await browser.close();
})();

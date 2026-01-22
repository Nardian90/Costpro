import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/login');
  await page.waitForTimeout(2000); // Wait for splash or load
  await page.screenshot({ path: 'verification_login.png' });
  await browser.close();
  console.log('Screenshot captured: verification_login.png');
})();

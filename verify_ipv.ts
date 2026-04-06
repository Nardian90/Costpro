import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    console.log('Navigating to login...');
    await page.goto('http://localhost:3000/login');
    await page.screenshot({ path: 'login.png' });

    // Assuming there's a way to bypass login or use a demo account if applicable
    // For now, we just check if the page loads and contains expected elements
    const title = await page.title();
    console.log('Page title:', title);

    // Try to navigate directly to terminal if it's client-side routed
    // This might fail if auth is strictly enforced server-side
    // But we can check if there are buttons or links

  } catch (e) {
    console.error('Error during verification:', e);
  } finally {
    await browser.close();
  }
})();

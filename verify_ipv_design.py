import asyncio
import re
from playwright.async_api import async_playwright

async def run():
    async_playwright_obj = await async_playwright().start()
    browser = await async_playwright_obj.chromium.launch(headless=True)
    page = await browser.new_page()

    print("Navigating to app...")
    await page.goto("http://localhost:3000")
    await asyncio.sleep(5) # Wait for potential redirects

    print("Current URL:", page.url)
    if "/login" in page.url:
        print("At login page, attempting login...")
        # Use more generic locators
        await page.locator("input[type='email'], input[placeholder*='email'], input[placeholder*='nombre']").first.fill("admin@costpro.com")
        await page.locator("input[type='password'], input[placeholder*='password'], input[placeholder*='••••']").first.fill("demo1234")
        await page.get_by_role("button", name=re.compile("ACCESO|ENTRAR|LOGIN", re.IGNORECASE)).click()
        await asyncio.sleep(5)

    print("Final URL:", page.url)

    # Try to set the state directly in the browser
    await page.evaluate("""
        try {
            // Find the UI store and set the view
            const uiState = JSON.parse(localStorage.getItem('ui-storage') || '{}');
            uiState.state = uiState.state || {};
            uiState.state.currentView = 'ipv';
            localStorage.setItem('ui-storage', JSON.stringify(uiState));
            location.reload();
        } catch(e) {}
    """)
    await asyncio.sleep(5)

    # Click "Comenzar" if visible
    comenzar = page.get_by_role("button", name=re.compile("Comenzar", re.IGNORECASE))
    if await comenzar.is_visible():
        await comenzar.click()
        await asyncio.sleep(2)

    # Click "FLUJO" if visible
    flujo = page.get_by_role("tab", name=re.compile("FLUJO", re.IGNORECASE))
    if await flujo.is_visible():
        await flujo.click()
        await asyncio.sleep(2)

    await page.screenshot(path="/home/jules/verification/ipv_final.png", full_page=True)
    print("Screenshot saved.")

    # Check for components
    content = await page.content()
    if "IPV Builder" in content:
        print("MATCH: IPV Builder found in HTML.")
    if "Flujo de Trabajo Profesional" in content:
        print("MATCH: Flujo de Trabajo Profesional found in HTML.")

    await browser.close()
    await async_playwright_obj.stop()

if __name__ == "__main__":
    asyncio.run(run())

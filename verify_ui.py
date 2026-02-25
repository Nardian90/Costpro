import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # 1. Landing Page
        await page.goto("http://localhost:3000", timeout=60000)
        await page.wait_for_timeout(2000)
        await page.click("text=ACCESO AL SISTEMA")
        print("Clicked Acceso al Sistema")

        # 2. Login
        await page.wait_for_timeout(2000)
        await page.fill("input[placeholder='admin@costpro.com']", "admin")
        await page.fill("input[placeholder='••••••••']", "demo1234")
        await page.click("text=ENTRAR AL SISTEMA")
        print("Login form submitted")

        # 3. Wait for redirect
        # It might go to dashboard or stay on / but with terminal
        await page.wait_for_timeout(5000)
        print("Current URL:", page.url)

        # 4. Navigate to Cost Sheet
        # Based on previous knowledge, I'll try to find 'Costo' link
        try:
            # Look for sidebar items
            await page.click("text=Costo", timeout=10000)
        except:
            print("Could not find 'Costo' text, trying alternatives")
            # Maybe it's in uppercase in the sidebar
            await page.click("text=COSTO", timeout=5000)

        await page.wait_for_timeout(5000)
        print("At view:", page.url)

        # Take screenshot of the horizontal menu
        await page.screenshot(path="cost_sheet_nav.png")
        print("Screenshot of nav taken")

        # Check Ficha dropdown
        ficha_btn = await page.query_selector("button:has-text('Ficha')")
        if ficha_btn:
            await ficha_btn.click()
            await page.wait_for_timeout(1000)
            await page.screenshot(path="ficha_dropdown.png")
            print("Screenshot of Ficha dropdown taken")
            await page.mouse.click(0, 0)

        # Check Opciones Darian
        opciones_btn = await page.query_selector("button:has-text('Opciones Darian')")
        if opciones_btn:
            await opciones_btn.click()
            await page.wait_for_timeout(1000)
            await page.screenshot(path="opciones_darian_dropdown.png")
            print("Screenshot of Opciones Darian dropdown taken")
            await page.mouse.click(0, 0)

        # Check Ayuda dropdown
        ayuda_btn = await page.query_selector("button:has-text('Ayuda')")
        if ayuda_btn:
            await ayuda_btn.click()
            await page.wait_for_timeout(1000)
            await page.screenshot(path="ayuda_dropdown.png")
            print("Screenshot of Ayuda dropdown taken")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())

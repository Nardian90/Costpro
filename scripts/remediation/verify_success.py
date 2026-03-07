import asyncio
from playwright.async_api import async_playwright
import json

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        auth_state = {
            "state": {
                "user": { "id": "u", "fullName": "Admin", "role": "admin" },
                "token": "t", "loading": False, "status": "authenticated_valid", "isMocked": True
            },
            "version": 0
        }
        ui_state = { "state": { "currentView": "pos" }, "version": 0 }

        await page.goto("http://localhost:3000")
        await page.evaluate(f"""
            localStorage.setItem('auth-storage', '{json.dumps(auth_state)}');
            localStorage.setItem('ui-storage', '{json.dumps(ui_state)}');
        """)
        await page.reload()

        # We need to make sure POSCart is rendered.
        # By default in my change, POSCart is rendered if (showCart || lastSale).
        # Since I forced lastSale check to true, it should show success view if POSCart is rendered.
        # But POSCart is only rendered in POSView if (showCart || lastSale).
        # So I should also force POSView to always render POSCart.

        await page.set_viewport_size({"width": 320, "height": 600})
        await page.wait_for_timeout(3000)
        await page.screenshot(path="/home/jules/verification/pos_mobile_success.png")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())

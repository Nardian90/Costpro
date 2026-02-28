import asyncio
from playwright.async_api import async_playwright
import json

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={'width': 1280, 'height': 2000})
        page = await context.new_page()

        # Inject auth
        auth_state = {
            "state": {
                "user": {
                    "email": "admin@costpro.com",
                    "role": "admin"
                },
                "isAuthenticated": True
            },
            "version": 0
        }

        await page.goto("http://localhost:3000")
        await page.evaluate(f"window.localStorage.setItem('auth-storage', '{json.dumps(auth_state)}')")
        await page.reload()
        await asyncio.sleep(2)

        # Check for specific UI elements that were fixed
        # Hamburger menu
        hamburger = page.locator("button:has(svg.lucide-menu), button:has(i.lucide-menu)").first
        is_hamburger = await hamburger.is_visible()
        print(f"Hamburger visible: {is_hamburger}")
        if is_hamburger:
            await hamburger.screenshot(path="/home/jules/verification/hamburger_final.png")

        # Chat AI button
        chat_btn = page.locator("button:has-text('CHAT AI')").first
        is_chat = await chat_btn.is_visible()
        print(f"Chat AI visible: {is_chat}")
        if is_chat:
            await chat_btn.screenshot(path="/home/jules/verification/chat_ai_final.png")

        await browser.close()

asyncio.run(run())

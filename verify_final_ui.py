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

        # Go to Cost Sheets
        await page.goto("http://localhost:3000/terminal?view=cost-sheets")
        await asyncio.sleep(5)

        # Ensure Expert mode
        mode_btn = page.get_by_role("button", name="MODO:").first
        if await mode_btn.is_visible():
            await mode_btn.click()
            await asyncio.sleep(1)
            experto = page.get_by_text("EXPERTO")
            if await experto.is_visible():
                await experto.click()
                await asyncio.sleep(2)

        # Check Hamburger contrast (should be visible now)
        hamburger = page.locator("button:has(svg.lucide-menu)").first
        if await hamburger.is_visible():
            await hamburger.screenshot(path="/home/jules/verification/hamburger_fixed.png")

        # Check Chat AI contrast
        chat_btn = page.locator("button:has-text('CHAT AI')").first
        if await chat_btn.is_visible():
            await chat_btn.screenshot(path="/home/jules/verification/chat_ai_fixed.png")

        # Scroll to table and find icons
        await page.evaluate("window.scrollTo(0, 1000)")
        await asyncio.sleep(1)

        # Try to expand a section if found
        section_toggle = page.locator("button:has-text('Sección')").first
        if await section_toggle.is_visible():
            await section_toggle.click()
            await asyncio.sleep(1)

            # Look for the new icons
            help_icon = page.locator("svg.lucide-help-circle").first
            note_icon = page.locator("svg.lucide-sticky-note").first
            wand_icon = page.locator("svg.lucide-wand2").first

            if await help_icon.is_visible():
                print("Help icon found")
                await help_icon.screenshot(path="/home/jules/verification/help_icon.png")
            if await note_icon.is_visible():
                print("Note icon found")
                await note_icon.screenshot(path="/home/jules/verification/note_icon.png")
            if await wand_icon.is_visible():
                print("Wand icon found")
                await wand_icon.screenshot(path="/home/jules/verification/wand_icon.png")

        await page.screenshot(path="/home/jules/verification/final_summary.png", full_page=True)
        await browser.close()

asyncio.run(run())

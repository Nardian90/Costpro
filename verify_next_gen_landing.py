import asyncio
from playwright.async_api import async_playwright
import os

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        # Set viewport to a standard desktop size
        page = await browser.new_page(viewport={'width': 1280, 'height': 800})

        # Navigate to the login page (which is now the landing)
        print("Navigating to /login...")
        try:
            await page.goto("http://localhost:3000/login", wait_until="networkidle")
        except Exception as e:
            print(f"Navigation failed: {e}")
            await browser.close()
            return

        # Take screenshot of the Hero section
        print("Capturing Hero section...")
        await page.screenshot(path="/home/jules/verification/next_gen_hero.png")

        # Scroll to Sectors and Bento Grid
        print("Scrolling to Bento Grid...")
        await page.evaluate("window.scrollTo(0, 800)")
        await asyncio.sleep(1) # Wait for animations
        await page.screenshot(path="/home/jules/verification/next_gen_bento.png")

        # Scroll to Case Study
        print("Scrolling to Case Study...")
        await page.evaluate("window.scrollTo(0, 1800)")
        await asyncio.sleep(2) # Wait for diagram animations
        await page.screenshot(path="/home/jules/verification/next_gen_case_study.png")

        # Verify Sticky Header by scrolling more
        print("Scrolling more to verify Sticky Header...")
        await page.evaluate("window.scrollTo(0, 2500)")
        await page.screenshot(path="/home/jules/verification/next_gen_sticky_header.png")

        # Test Theme Toggle
        print("Testing Theme Toggle...")
        theme_toggle = page.get_by_label("Toggle theme")
        if await theme_toggle.is_visible():
            await theme_toggle.click()
            await asyncio.sleep(1)
            await page.screenshot(path="/home/jules/verification/next_gen_light_mode.png")
        else:
            print("Theme toggle not found or not visible.")

        await browser.close()
        print("Verification complete. Screenshots saved to /home/jules/verification/")

if __name__ == "__main__":
    asyncio.run(main())

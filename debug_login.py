import asyncio
from playwright.async_api import async_playwright

async def run():
    async_playwright_obj = await async_playwright().start()
    browser = await async_playwright_obj.chromium.launch(headless=True)
    page = await browser.new_page()
    await page.goto("http://localhost:3000/login")
    await asyncio.sleep(2)
    await page.screenshot(path="/home/jules/verification/login_page.png")
    print("Login page saved to /home/jules/verification/login_page.png")
    print("Page content:", await page.content())
    await browser.close()
    await async_playwright_obj.stop()

if __name__ == "__main__":
    asyncio.run(run())

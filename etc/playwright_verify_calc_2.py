import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        try:
            await page.goto("http://localhost:3000/cost-sheets")
            await page.wait_for_timeout(5000)

            # Click the first icon in the left sidebar
            # The left sidebar is likely a div with fixed position
            await page.click("aside button >> nth=0")
            await page.wait_for_timeout(2000)
            await page.screenshot(path="verify_calc_open.png")

        except Exception as e:
            print(f"Error during playwright: {e}")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())

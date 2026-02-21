import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        try:
            await page.goto("http://localhost:3000/cost-sheets")
            await page.wait_for_timeout(5000)

            # Click the calculator icon in the sidebar
            # The sidebar has IDs like 'calculator-panel-trigger' or similar?
            # Let's try to find it by icon or role.
            # In CostSheetSidePanel it's a button with Calculator icon.
            # In FloatingCalculator it's triggered by setIsCalculatorOpen.
            # Let's try to click the first button in the sidebar.
            await page.click("button >> nth=5") # Guestimate
            await page.wait_for_timeout(2000)
            await page.screenshot(path="verify_calc.png")

        except Exception as e:
            print(f"Error during playwright: {e}")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())

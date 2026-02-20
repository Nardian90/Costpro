import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        # Navigate to a URL that renders the CostSheetView
        # Since I am in a test environment, maybe /cost-sheets
        try:
            await page.goto("http://localhost:3000/cost-sheets")
            await page.wait_for_timeout(5000) # Wait for hydration
            await page.screenshot(path="verify_cost_view.png")

            # Try to click on the AI Chat tab if possible
            # Based on the code, it has label "Cospi IA"
            await page.click("text=Cospi IA")
            await page.wait_for_timeout(2000)
            await page.screenshot(path="verify_ai_chat.png")

        except Exception as e:
            print(f"Error during playwright: {e}")
            await page.screenshot(path="error_verify.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())

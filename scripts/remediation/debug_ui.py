import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        print("Navigating to localhost:3000...")
        await page.goto("http://localhost:3000", timeout=60000)
        await page.wait_for_timeout(5000)

        print("Page title:", await page.title())

        inputs = await page.query_selector_all("input")
        print(f"Found {len(inputs)} inputs")
        for i, inp in enumerate(inputs):
            placeholder = await inp.get_attribute("placeholder")
            name = await inp.get_attribute("name")
            type_attr = await inp.get_attribute("type")
            print(f"Input {i}: placeholder='{placeholder}', name='{name}', type='{type_attr}'")

        buttons = await page.query_selector_all("button")
        print(f"Found {len(buttons)} buttons")
        for i, btn in enumerate(buttons):
            text = await btn.inner_text()
            print(f"Button {i}: text='{text}'")

        await page.screenshot(path="debug_login.png")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())

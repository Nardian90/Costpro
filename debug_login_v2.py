import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.goto("http://localhost:3000", timeout=60000)
        await page.wait_for_timeout(2000)
        await page.click("text=ACCESO AL SISTEMA")
        await page.wait_for_timeout(3000)

        print("After clicking ACCESO AL SISTEMA:")
        inputs = await page.query_selector_all("input")
        print(f"Found {len(inputs)} inputs")
        for i, inp in enumerate(inputs):
            placeholder = await inp.get_attribute("placeholder")
            print(f"Input {i}: placeholder='{placeholder}'")

        buttons = await page.query_selector_all("button")
        print(f"Found {len(buttons)} buttons")
        for i, btn in enumerate(buttons):
            text = await btn.inner_text()
            print(f"Button {i}: text='{text}'")

        await page.screenshot(path="debug_after_click.png")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())

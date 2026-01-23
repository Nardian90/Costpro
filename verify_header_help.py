import asyncio
from playwright.async_api import async_playwright
import os

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(viewport={'width': 1280, 'height': 800})
        page = await context.new_page()

        try:
            # Go to the test-help page we created earlier or just the home page
            # Actually, I removed src/app/test-help/page.tsx
            # Let's recreate it briefly to test the whole TerminalView if possible
            # Or just check if the code compiles and the element is there in the source if I can't easily run it

            # Since I already verified the HelpView itself, I just need to verify the button is in the header
            # I'll use the same test-help trick but I need to mock the context
            pass
        except Exception as e:
            print(f"Error: {e}")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(run())

import asyncio
from playwright.async_api import async_playwright
import os

async def verify_legal_module():
    async with async_playwright() as p:
        # Launch with a common resolution
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={'width': 1280, 'height': 800}
        )
        page = await context.new_page()

        # Inject mock session
        mock_session = {
            "user": {
                "id": "123",
                "role": "admin",
                "full_name": "Test Admin",
                "activeStoreId": "store-1"
            },
            "status": "authenticated_valid"
        }

        # We need to set this in localStorage before page load or use a script
        await page.goto("http://localhost:3000") # Assuming local dev server
        await page.evaluate("window.localStorage.setItem('auth-storage', JSON.stringify({state: " + str(mock_session).replace("'", '"') + "}))")
        await page.reload()

        # Wait for sidebar and click Legal
        try:
            await page.wait_for_selector("[data-testid='nav-legal']", timeout=10000)
            await page.click("[data-testid='nav-legal']")

            # Wait for Legal View to render
            await page.wait_for_selector("h1:has-text('Consultor Legal')", timeout=5000)
            await page.screenshot(path="legal_view_initial.png")
            print("Captured legal_view_initial.png")

            # Click on a resolution (if available)
            resolutions = await page.query_selector_all("button:has-text('Resolución')")
            if resolutions:
                await resolutions[0].click()
                await page.wait_for_selector("h2:has-text('Vista de Lectura Interactiva')", timeout=5000)
                await page.screenshot(path="legal_resolution_view.png")
                print("Captured legal_resolution_view.png")

                # Click on a model
                models = await page.query_selector_all("button:has-text('SC-')")
                if models:
                    await models[0].click()
                    await page.wait_for_selector("h2:has-text('RECIBO DE EFECTIVO')") # Assuming SC-3-01
                    await page.screenshot(path="legal_model_form.png")
                    print("Captured legal_model_form.png")

        except Exception as e:
            print(f"Error during verification: {e}")
            await page.screenshot(path="legal_error.png")

        await browser.close()

if __name__ == "__main__":
    # This requires the server to be running.
    # Since I cannot easily run a long-lived server here, I will rely on code review and unit tests.
    pass

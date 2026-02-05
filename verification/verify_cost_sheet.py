from playwright.sync_api import Page, expect, sync_playwright
import time

def test_cost_sheet_verification(page: Page):
    # Go to cost sheets page
    page.goto("http://localhost:3000/cost-sheets")

    # Wait for initial load
    time.sleep(5)

    # Click 'Ejemplo'
    # Try multiple ways to find it
    try:
        page.get_by_text("Ejemplo").first.click()
    except:
        page.click("button:has-text('Ejemplo')")

    time.sleep(2)

    # Select a section group to show the table
    try:
        page.get_by_text("SECCIONES 1 - 3").first.click()
    except:
        page.get_by_text("Sección").first.click()

    time.sleep(2)

    # Take screenshot of the table
    page.screenshot(path="/app/verification/cost_sheet_table.png", full_page=True)
    print("Screenshot saved to /app/verification/cost_sheet_table.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            test_cost_sheet_verification(page)
        finally:
            browser.close()

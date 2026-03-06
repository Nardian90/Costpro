from playwright.sync_api import Page, expect, sync_playwright
import time

def test_health_view_ui(page: Page):
    # 1. Login
    page.goto("http://localhost:3000/terminal?view=health")

    # Wait for splash or login
    time.sleep(5)

    # If login page, fill it
    if page.get_by_placeholder("tu@email.com").is_visible():
        page.get_by_placeholder("tu@email.com").fill("admin")
        page.get_by_placeholder("••••••••").fill("demo1234")
        page.get_by_role("button", name="Iniciar Sesión").click()
        time.sleep(5)

    # Navigate to health view if not already there
    page.goto("http://localhost:3000/terminal?view=health")
    time.sleep(5)

    # 2. Check for the new component
    # The component has text "AI System Observer: Historial de Hallazgos"
    expect(page.get_by_text("AI System Observer: Historial de Hallazgos")).to_be_visible(timeout=20000)

    # 3. Take screenshot
    page.screenshot(path="verification/health_view_verified.png", full_page=True)
    print("Screenshot saved to verification/health_view_verified.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()
        try:
            test_health_view_ui(page)
        finally:
            browser.close()

from playwright.sync_api import Page, expect, sync_playwright
import time

def debug_health_view(page: Page):
    # 1. Start at root
    page.goto("http://localhost:3000")
    time.sleep(5)

    # Take screenshot of whatever is there
    page.screenshot(path="verification/debug_start.png")

    # Try to skip splash
    if page.get_by_role("button", name="ENTRAR").is_visible():
         page.get_by_role("button", name="ENTRAR").click()
         time.sleep(2)

    # Try to login
    if page.get_by_placeholder("tu@email.com").is_visible():
        page.get_by_placeholder("tu@email.com").fill("admin")
        page.get_by_placeholder("••••••••").fill("demo1234")
        page.get_by_role("button", name="Iniciar Sesión").click()
        time.sleep(5)

    # Go directly to health view
    page.goto("http://localhost:3000/terminal?view=health")
    time.sleep(10)

    # Take screenshot
    page.screenshot(path="verification/debug_health_view.png")

    # Print page content
    print(page.content())

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            debug_health_view(page)
        finally:
            browser.close()

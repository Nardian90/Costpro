from playwright.sync_api import sync_playwright, expect
import time
import os

def verify_receipts():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use a larger viewport to see the preview clearly
        context = browser.new_context(viewport={'width': 1280, 'height': 1200})
        page = context.new_page()

        # 1. Login
        try:
            page.goto("http://localhost:3010", timeout=60000)
        except Exception as e:
            print(f"Error navigating to localhost:3010: {e}")
            return

        # Wait for splash screen
        time.sleep(5)

        # Click "ACCESO AL SISTEMA"
        try:
            btn = page.get_by_role("button", name="ACCESO AL SISTEMA")
            if btn.is_visible():
                btn.click()
                # Fill login
                page.get_by_label("USUARIO").fill("admin@costpro.com")
                page.get_by_label("CONTRASEÑA").fill("demo1234")
                page.get_by_role("button", name="ENTRAR AL SISTEMA").click()
        except:
            pass

        # Wait for terminal to load
        page.wait_for_timeout(15000)

        # 2. Navigate to IPV
        try:
            page.goto("http://localhost:3010/terminal/ipv", timeout=60000)
        except:
            pass

        page.wait_for_timeout(15000)

        # 3. Start IPV if in dashboard
        try:
            comenzar_btn = page.get_by_role("button", name="COMENZAR")
            if comenzar_btn.is_visible():
                comenzar_btn.click()
        except:
            pass

        page.wait_for_timeout(10000)

        # 4. Go to Recibos tab
        try:
            # Look for the Ticket icon which we added
            page.click("button:has(svg.lucide-ticket)")
            print("Clicked Recibos tab via Ticket icon")
        except:
            try:
                page.click("button:has-text('RECIBOS')")
                print("Clicked Recibos tab via text 'RECIBOS'")
            except:
                try:
                    page.click("button:has-text('Recibos')")
                    print("Clicked Recibos tab via text 'Recibos'")
                except:
                    print("Could not find Recibos tab button")

        # 5. Take screenshot
        page.wait_for_timeout(10000)
        page.screenshot(path="verification/ipv_receipts_initial.png")
        print("Saved ipv_receipts_initial.png")

        # 6. Open Settings
        try:
            page.click("button:has(svg.lucide-settings)")
            page.wait_for_timeout(5000)
            page.screenshot(path="verification/ipv_receipts_settings.png")
            print("Saved ipv_receipts_settings.png")
        except:
            print("Could not find settings button")

        browser.close()

if __name__ == "__main__":
    verify_receipts()

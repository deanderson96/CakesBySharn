"""End-to-end checks for the static Cakes by Sharn website.

Run: pip install playwright && python -m playwright install chromium webkit
     python tests/smoke.py
"""
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from datetime import date, timedelta
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

def run():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}/"
    try:
        with sync_playwright() as p:
            for engine in os.environ.get("CAKES_TEST_BROWSERS", "chromium,webkit").split(","):
                browser = getattr(p, engine).launch(**(
                    {"channel": "chrome"} if engine == "chromium" and os.environ.get("CAKES_USE_SYSTEM_CHROME") == "1" else {}
                ))
                try:
                    for width, height in ((320, 700), (390, 844), (430, 932), (1280, 900)):
                        page = browser.new_page(viewport={"width": width, "height": height})
                        page.add_init_script("""
                            Object.defineProperty(navigator, 'clipboard', {
                                configurable: true,
                                value: { writeText: async text => { window.__lastCopied = text; } }
                            });
                        """)
                        errors = []
                        page.on("pageerror", lambda error: errors.append(str(error)))
                        page.goto(url, wait_until="load")
                        # WebKit may still be settling fonts and responsive layout after DOM ready.
                        page.evaluate("""async () => {
                            await document.fonts.ready;
                            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                        }""")
                        # Mock the submission endpoint; browser checks must not create real enquiries.
                        page.route("**/functions/v1/submit-enquiry", lambda route: route.fulfill(
                            status=201, content_type="application/json",
                            body='{"reference":"CBS-TEST123456","acknowledgmentEmailSent":false}'
                        ))
                        assert page.locator("#email-enquiry").count() == 0
                        assert page.locator("#whatsapp-enquiry").count() == 0
                        assert page.locator("#copy-enquiry").count() == 0
                        assert page.locator("#submit-online-enquiry").is_visible()
                        assert page.locator("#enquiry").is_visible(), (engine, width, "enquiry hidden")
                        layout = page.evaluate("""() => ({
                            documentWidth: document.documentElement.scrollWidth,
                            viewportWidth: window.innerWidth,
                            overflowing: [...document.querySelectorAll('body *')]
                                .filter(el => el.getBoundingClientRect().right > innerWidth + 2)
                                .slice(0, 5).map(el => el.tagName.toLowerCase() + '.' + el.className)
                        })""")
                        assert layout["documentWidth"] <= layout["viewportWidth"] + 2, (engine, width, "horizontal overflow", layout)
                        page.locator('[data-add="loaves:0"]').click()
                        page.locator('[data-add="loaves:0"]').click()
                        assert page.locator("#basket-count").text_content() == "2", (engine, width, "basket count")
                        assert "£10.00" in page.locator("#basket-total").inner_text(), (engine, width, "estimated total")
                        page.locator("#basket-trigger").click()
                        assert "#enquiry" in page.url, (engine, width, "enquiry navigation")
                        assert page.locator("#contact-email-field").is_visible()
                        assert page.locator("#contact-mobile-field").is_visible()
                        assert page.locator("#contact-method").count() == 0
                        page.locator("#customer-email").fill("not-an-email")
                        page.locator("#customer-mobile").fill("07123")
                        page.locator("#customer-name").fill("Test customer")
                        page.locator("#order-notes").fill("Chocolate drip cake with pink decoration")
                        page.locator("#submit-online-enquiry").click()
                        assert page.locator("#enquiry-error").is_visible(), (engine, width, "invalid email accepted")
                        page.locator("#customer-email").fill("customer@example.com")
                        page.locator("#submit-online-enquiry").click()
                        assert "UK mobile" in page.locator("#enquiry-error").inner_text(), (engine, width, "invalid UK mobile accepted")
                        page.locator("#customer-mobile").fill("07700 900123")
                        page.locator("#preferred-date").fill((date.today() + timedelta(days=21)).isoformat())
                        page.locator("#submit-online-enquiry").click()
                        page.wait_for_function("document.querySelector('#online-enquiry-result').textContent.includes('CBS-TEST123456')")
                        receipt = page.locator("#online-enquiry-result").inner_text()
                        assert "Enquiry received!" in receipt, (engine, width, "receipt missing")
                        assert "details provided" in receipt, (engine, width, "contact wording missing")
                        assert "could not confirm" in receipt, (engine, width, "manual email wording missing")
                        assert "not yet a confirmed order" in receipt, (engine, width, "order disclaimer missing")
                        page.locator("#clear-enquiry").click()
                        assert page.locator("#submit-online-enquiry").is_enabled(), (engine, width, "new enquiry blocked after clearing")
                        assert page.locator("#online-enquiry-result").inner_text() == "", (engine, width, "old reference still visible")
                        assert page.locator("#basket-count").text_content() == "0"
                        assert page.locator("#basket-items .basket-empty").is_visible(), (engine, width, "items not cleared")
                        assert page.locator("#basket-total").is_hidden(), (engine, width, "estimate not cleared")
                        assert page.locator("#customer-email").input_value() == ""
                        assert page.locator("#customer-mobile").input_value() == ""
                        assert page.locator("#contact-mobile-field").is_visible()
                        assert page.locator("#customer-name").input_value() == ""
                        assert page.locator("#order-notes").input_value() == ""
                        page.locator("#submit-online-enquiry").click()
                        assert page.locator("#enquiry-error").is_visible(), (engine, width, "empty enquiry allowed")
                        page.locator("#order-notes").fill("A custom cake enquiry, please")
                        page.locator("#preferred-date").fill("2020-01-01")
                        page.locator("#submit-online-enquiry").click()
                        assert page.locator("#enquiry-error").is_visible(), (engine, width, "past date allowed")
                        page.reload(wait_until="domcontentloaded")
                        # The floating shortcut is intentionally hidden over the enquiry section.
                        # inner_text() returns an empty string for hidden elements in browsers.
                        # text_content() reads the actual count regardless of visibility.
                        assert page.locator("#basket-count").text_content() == "0", (engine, width, "basket persisted")
                        assert page.locator("#basket-items .basket-empty").is_visible(), (engine, width, "basket not cleared after reload")
                        assert page.locator("#basket-total").is_hidden(), (engine, width, "estimate survived reload")
                        assert page.evaluate("localStorage.getItem('cakes-by-sharn-enquiry-v1') === null")
                        assert not errors, (engine, width, errors)
                        page.close()
                        print(f"PASS {engine}: {width}x{height}")
                finally:
                    browser.close()
    finally:
        server.shutdown()

if __name__ == "__main__":
    run()

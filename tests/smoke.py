"""End-to-end checks for the static Cakes by Sharn website.

Run: pip install playwright && python -m playwright install chromium webkit
     python tests/smoke.py
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
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
            for engine in ("chromium", "webkit"):
                browser = getattr(p, engine).launch()
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
                        page.goto(url, wait_until="domcontentloaded")
                        assert page.locator("#enquiry").is_visible(), (engine, width, "enquiry hidden")
                        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 2"), (engine, width, "horizontal overflow")
                        page.locator('[data-add="loaves:0"]').click()
                        page.locator('[data-add="loaves:0"]').click()
                        assert page.locator("#basket-count").inner_text() == "2", (engine, width, "basket count")
                        page.locator("#basket-trigger").click()
                        assert "#enquiry" in page.url, (engine, width, "enquiry navigation")
                        page.locator("#customer-name").fill("Test customer")
                        page.locator("#order-notes").fill("Chocolate drip cake with pink decoration")
                        page.locator("#copy-enquiry").click()
                        page.wait_for_function("Boolean(window.__lastCopied)")
                        assert "Banana loaf" in page.evaluate("window.__lastCopied")
                        page.locator("#clear-enquiry").click()
                        assert page.locator("#basket-count").inner_text() == "0"
                        assert page.locator("#customer-name").input_value() == ""
                        assert page.locator("#order-notes").input_value() == ""
                        page.locator("#copy-enquiry").click()
                        assert page.locator("#enquiry-error").is_visible(), (engine, width, "empty enquiry allowed")
                        page.locator("#order-notes").fill("A custom cake enquiry, please")
                        page.locator("#preferred-date").fill("2020-01-01")
                        page.locator("#copy-enquiry").click()
                        assert page.locator("#enquiry-error").is_visible(), (engine, width, "past date allowed")
                        page.reload(wait_until="domcontentloaded")
                        assert page.locator("#basket-count").inner_text() == "0", (engine, width, "basket persisted")
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

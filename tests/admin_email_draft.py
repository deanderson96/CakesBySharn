"""Check real browser-generated admin order-confirmation drafts without sending email."""
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import parse_qs, urlsplit
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
TEST_ID = "11111111-1111-4111-8111-111111111111"

FAKE_SUPABASE_MODULE = """
export function createClient() {
  return {
    auth: {
      getSession: async () => ({data: {session: {access_token: 'test-token'}}}),
      signInWithPassword: async () => ({error: null}),
      signOut: async () => ({error: null}),
    }
  };
}
"""

FAKE_LIST = {
    "administrator": "Test Administrator",
    "enquiries": [{
        "id": TEST_ID,
        "reference": "CBS-1234567890",
        "status": "confirmed",
        "customer_name": "Test Customer",
        "customer_email": "test@example.invalid",
        "contact_method": "email",
        "customer_mobile": None,
        "fulfilment": "collection",
        "preferred_date": "2026-12-20",
        "notes": "",
        "items": [
            {"quantity": 1, "name": "Iced lemon loaf"},
            {"quantity": 1, "name": "Afternoon tea for 2"}
        ],
        "replies": [],
    }],
    "orders": [{
        "enquiry_id": TEST_ID,
        "order_reference": "CBS-ORD-1234567890",
        "total_pence": 2150,
        "agreed_date": "2026-12-20",
        "agreed_time": "3-4PM",
        "fulfilment": "collection",
        "notes": "",
        "customer_notified_at": None,
        "contact_method": "email",
    }],
}

def test():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}/admin.html"
    try:
        with sync_playwright() as playwright:
            for engine in ("chromium", "webkit"):
                browser = getattr(playwright, engine).launch()
                try:
                    page = browser.new_page()
                    page.route("https://esm.sh/**", lambda route: route.fulfill(
                        status=200, content_type="application/javascript",
                        headers={"Access-Control-Allow-Origin": "*"},
                        body=FAKE_SUPABASE_MODULE))
                    page.route("**/functions/v1/manage-enquiries", lambda route: route.fulfill(
                        status=200, content_type="application/json",
                        headers={
                            "Access-Control-Allow-Origin": "*",
                            "Access-Control-Allow-Headers": "authorization, apikey, content-type",
                            "Access-Control-Allow-Methods": "POST, OPTIONS",
                        },
                        body=json.dumps(FAKE_LIST)))
                    errors = []
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    page.goto(url, wait_until="load")
                    page.locator(".admin-record-summary").click()
                    link = page.get_by_role("link", name="Open order confirmation via Email")
                    link.wait_for(state="visible", timeout=15000)
                    href = link.get_attribute("href")
                    parts = urlsplit(href)
                    assert parts.scheme == "mailto", (engine, "wrong protocol", href)
                    assert parts.path == "test%40example.invalid", (engine, "wrong email recipient", href)
                    params = parse_qs(parts.query)
                    body = params["body"][0]
                    assert "\r\n" in body, (engine, "missing real line breaks", body)
                    assert "\\n" not in body, (engine, "literal escaped newlines found", body)
                    assert "Hello Test Customer,\r\n\r\nYour Cakes by Sharn order" in body
                    assert "Order reference: CBS-ORD-1234567890\r\nEnquiry reference:" in body
                    assert "Items:\r\n- 1 × Iced lemon loaf\r\n- 1 × Afternoon tea for 2" in body
                    assert "Total: £21.50\r\nCollection: 2026-12-20 — 3-4PM" in body
                    assert "Notes:" not in body, (engine, "empty notes displayed", body)
                    assert page.locator(".admin-record").count() == 1
                    assert page.locator(".admin-state-confirmed").inner_text() == "Approved"
                    assert not errors, (engine, errors)
                    page.close()
                    print(f"PASS {engine}: admin order email uses proper line breaks")
                finally:
                    browser.close()
    finally:
        server.shutdown()

if __name__ == "__main__":
    test()

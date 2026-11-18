"""Check real browser-generated admin order-confirmation drafts without sending email."""
import json
import os
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
    "adminRole": "operator",
    "total": 1,
    "counts": {"pending":0,"confirmed":1,"declined":0},
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
            {"quantity": 1, "name": "Iced lemon loaf", "estimatedUnitPence": 500, "priceType": "fixed"},
            {"quantity": 1, "name": "Afternoon tea for 2", "estimatedUnitPence": 1600, "priceType": "fixed"}
        ],
        "replies": [],
    }],
    "orders": [{
        "id":"22222222-2222-4222-8222-222222222222",
        "status":"approved",
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
            for engine in os.environ.get("CAKES_TEST_BROWSERS", "chromium,webkit").split(","):
                browser = getattr(playwright, engine).launch(**(
                    {"channel": "chrome"} if engine == "chromium" and os.environ.get("CAKES_USE_SYSTEM_CHROME") == "1" else {}
                ))
                try:
                    page = browser.new_page()
                    page.route("https://esm.sh/**", lambda route: route.fulfill(
                        status=200, content_type="application/javascript",
                        headers={"Access-Control-Allow-Origin": "*"},
                        body=FAKE_SUPABASE_MODULE))
                    fixture = {"list": FAKE_LIST}
                    def admin_response(route):
                        action = json.loads(route.request.post_data or "{}").get("action")
                        if action == "statistics":
                            data = {"statistics": {
                                "periods": [
                                    {"months": n, "enquiries": 5, "pending": 2, "approved": 2,
                                     "declined": 1, "email": 3, "sms": 1, "whatsapp": 1,
                                     "orders": 2, "approved_value_pence": 4250,
                                     "estimated_pence": 3900, "notified": 1,
                                     "awaiting_notification": 1}
                                    for n in (1, 3, 6, 9, 12)],
                                "monthly": [
                                    {"month": "2026-%02d" % m, "enquiries": 3,
                                     "orders": 2, "approved": 2, "value_pence": 4250}
                                    for m in range(1, 13)]}}
                        elif action == "tax-year-report":
                            year = json.loads(route.request.post_data or "{}").get("startYear",2025)
                            data = {"report": {"start_year": year, "order_count": 1,
                                "agreed_order_total_pence": 2500,
                                "recorded_receipts_pence":1000,"recorded_refunds_pence":0,
                                "recorded_expenses_pence":200,"recorded_cash_difference_pence":800,
                                "payment_entries":[{"paid_on":"2025-05-12","order_reference":"CBS-TAX-1",
                                    "event_type":"receipt","method":"bank","amount_pence":1000}],
                                "expense_entries":[{"spent_on":"2025-05-13","category":"ingredients",
                                    "supplier":"Shop","description":"Flour","amount_pence":200}],
                                "orders": [{"order_reference": "CBS-TAX-1",
                                            "ordered_at": "2025-05-12T11:00:00Z",
                                            "customer_name": "Test <Customer>",
                                            "items": [{"quantity": 2, "name": "Lemon loaf"}],
                                            "total_pence": 2500}],
                                "enquiries": [{"reference": "CBS-ENQ-1",
                                               "created_at": "2025-05-12T11:00:00Z",
                                               "status": "confirmed"}]}}
                        elif action == "payment-summary":
                            data = {"summary": {"agreed_pence":2150,"received_pence":1000,
                                                "refunded_pence":0,"net_received_pence":1000,
                                                "outstanding_pence":1150}}
                        elif action == "financial-export":
                            data = {"ledger": {"payments":[{"event_type":"receipt",
                                "paid_on":"2026-11-13","order_reference":"CBS-ORD-1234567890",
                                "payment_method":"bank","external_reference":"BANK123",
                                "amount_pence":1000}], "expenses":[{"spent_on":"2026-11-13",
                                "category":"ingredients","supplier":"Shop","description":"Flour",
                                "evidence_reference":"INV123","amount_pence":200}]}}
                        elif action in ("record-expense","record-payment"):
                            data = {"recorded":True}
                        elif action in ("confirm", "decline"):
                            data = {"status": "confirmed" if action == "confirm" else "declined",
                                    "orderReference": "CBS-ORD-1234567890"}
                        elif action == "accounting-export":
                            data = {"orders": [{
                                "order_reference": "CBS-ORD-ARCHIVED",
                                "order_created_at": "2024-01-05T12:00:00Z",
                                "customer_name": "=2+2",
                                "items": [{"quantity": 2, "name": "Lemon loaf"}],
                                "agreed_total_pence": 2500,
                                "fulfilment": "collection",
                                "agreed_date": "2024-01-10",
                                "archived": True
                            }]}
                        else:
                            data = fixture["list"]
                        route.fulfill(status=200, content_type="application/json",
                                      headers={"Access-Control-Allow-Origin": "*",
                                               "Access-Control-Allow-Headers": "authorization, apikey, content-type",
                                               "Access-Control-Allow-Methods": "POST, OPTIONS"},
                                      body=json.dumps(data))
                    page.route("**/functions/v1/manage-enquiries", admin_response)
                    errors = []
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    page.goto(url, wait_until="load")
                    page.wait_for_timeout(1000)
                    assert page.locator(".admin-record-summary").count() > 0, {
                        "page_errors": errors,
                        "status": page.locator("#admin-status").inner_text(),
                        "login_visible": page.locator("#admin-login").is_visible(),
                        "dashboard_visible": page.locator("#admin-dashboard").is_visible(),
                    }
                    assert not errors, ("unexpected JavaScript errors", engine, errors)
                    page.locator(".admin-record-summary").click()
                    assert page.locator(".admin-order-payment-form").count() == 1
                    assert page.locator(".admin-order-payment-form select").count() == 2
                    assert page.locator(".admin-order-payment-form label").filter(has_text="Payment method").count() == 1
                    assert page.locator(".admin-order-payment-form select").nth(1).input_value() == "bank"

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
                    assert page.locator(".admin-price-table tbody tr").count() == 2
                    assert "£5.00" in page.locator(".admin-price-table tbody tr").nth(0).inner_text()
                    assert "£16.00" in page.locator(".admin-price-table tbody tr").nth(1).inner_text()
                    assert "£21.00" in page.locator(".admin-estimate-title").inner_text()
                    assert "£21.50" in page.locator(".admin-order-section").inner_text()
                    assert page.locator(".admin-analytics-stat").count() == 8
                    assert "£42.50" in page.locator("#admin-analytics-cards").inner_text()
                    assert page.locator(".admin-chart-month").count() == 6
                    assert page.locator("#admin-period").count() == 0
                    page.locator("#admin-record-dialog-close").click()
                    with page.expect_download() as download_info:
                        page.locator("#admin-export-accounting").click()
                    download = download_info.value
                    assert download.suggested_filename.startswith("cakes-by-sharn-accounting-")
                    with open(download.path(), "r", encoding="utf-8-sig") as exported:
                        csv_text = exported.read()
                    assert "CBS-ORD-ARCHIVED" in csv_text
                    assert "'=2+2" in csv_text, "CSV formula injection was not escaped"
                    assert "25.00" in csv_text
                    with page.expect_download() as tax_download_info:
                        page.locator("#admin-tax-report").click()
                    tax_download = tax_download_info.value
                    assert tax_download.suggested_filename.startswith("cakes-by-sharn-tax-year-")
                    with open(tax_download.path(), "r", encoding="utf-8") as tax_file:
                        tax_html = tax_file.read()
                    assert "6 April" in tax_html and "5 April" in tax_html
                    assert "£25.00" in tax_html
                    assert "Recorded cash activity" in tax_html
                    assert "£10.00" in tax_html and "£2.00" in tax_html
                    assert "Test &lt;Customer&gt;" in tax_html
                    with page.expect_download() as finance_download_info:
                        page.locator("#admin-export-ledger").click()
                    finance_download = finance_download_info.value
                    with open(finance_download.path(), "r", encoding="utf-8-sig") as financial_file:
                        ledger_csv = financial_file.read()
                    assert "BANK123" in ledger_csv and "INV123" in ledger_csv
                    assert "10.00" in ledger_csv and "-2.00" in ledger_csv
                    assert page.locator(".admin-record").count() == 1
                    assert page.locator(".admin-state-confirmed").inner_text() == "Approved"

                    # Approval must require explicit customer-agreement attestation.
                    pending = json.loads(json.dumps(FAKE_LIST))
                    pending["enquiries"][0]["status"] = "pending"
                    pending["orders"] = []
                    pending["counts"] = {"pending": 1, "confirmed": 0, "declined": 0}
                    fixture["list"] = pending
                    page.locator("#admin-refresh").click()
                    page.locator(".admin-state-pending").wait_for(state="visible")
                    page.locator(".admin-record-summary").click()
                    form = page.locator(".admin-decision-form")
                    checkboxes = form.locator("input[type=checkbox]")
                    assert checkboxes.count() == 2
                    assert not checkboxes.nth(0).is_checked()
                    assert not checkboxes.nth(1).is_checked()
                    assert "agreed all order details" in form.inner_text()
                    form.locator("input[type=text]").first.fill("3-4PM")
                    assert not form.evaluate("(form) => form.checkValidity()"), "unchecked agreement should block approval"
                    page.on("dialog", lambda dialog: dialog.accept())
                    page.get_by_role("button", name="Approve & create order").click()
                    assert not checkboxes.nth(0).is_checked()
                    checkboxes.nth(0).check()
                    assert not form.evaluate("(form) => form.checkValidity()"), "customer contact confirmation required"
                    checkboxes.nth(1).check()
                    assert form.evaluate("(form) => form.checkValidity()"), "confirmed agreement and contact should allow approval"
                    with page.expect_request(lambda req: req.url.endswith("/functions/v1/manage-enquiries") and
                                             json.loads(req.post_data or "{}").get("action") == "confirm") as approved_request:
                        page.get_by_role("button", name="Approve & create order").click()
                    assert json.loads(approved_request.value.post_data)["detailsConfirmed"] is True
                    assert json.loads(approved_request.value.post_data)["customerContacted"] is True
                    page.locator(".admin-decision-form").wait_for(state="hidden")
                    page.locator(".admin-state-pending").wait_for(state="visible")
                    page.locator(".admin-record-summary").click()
                    assert not page.locator(".admin-decision-form input[type=checkbox]").nth(0).is_checked()
                    page.locator(".admin-decision-form input[type=text]").last.fill("Unfortunately we cannot fulfil this date.")
                    with page.expect_request(lambda req: req.url.endswith("/functions/v1/manage-enquiries") and
                                             json.loads(req.post_data or "{}").get("action") == "decline") as declined_request:
                        page.get_by_role("button", name="Decline enquiry").click()
                    assert json.loads(declined_request.value.post_data)["detailsConfirmed"] is False
                    assert "cannot fulfil" in json.loads(declined_request.value.post_data)["notes"]
                    assert not errors, (engine, errors)
                    page.close()
                    print(f"PASS {engine}: admin order email uses proper line breaks")
                finally:
                    browser.close()
    finally:
        server.shutdown()

if __name__ == "__main__":
    test()

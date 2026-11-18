"""Owner-only single/bulk deletion, restoration and operator isolation (mocked API)."""
import copy
import json
import os
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright, expect
from admin_email_draft import FAKE_SUPABASE_MODULE, FAKE_LIST, TEST_ID

ROOT = Path(__file__).resolve().parents[1]
SECOND_ID = "33333333-3333-4333-8333-333333333333"


def test():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    Thread(target=server.serve_forever, daemon=True).start()
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
                        body=FAKE_SUPABASE_MODULE
                    ))
                    data = copy.deepcopy(FAKE_LIST)
                    data["adminRole"] = "owner"
                    other = copy.deepcopy(data["enquiries"][0])
                    other.update({
                        "id": SECOND_ID, "reference": "CBS-SECOND-TEST", "status": "pending",
                        "customer_name": "Second Customer", "created_at": "2026-11-18T09:00:00Z",
                    })
                    data["enquiries"][0]["created_at"] = "2026-11-18T08:00:00Z"
                    data["enquiries"].append(other)
                    data["total"] = 2
                    data["counts"] = {"pending": 1, "confirmed": 1, "declined": 0}
                    deleted = []
                    actions = []

                    def update_counts():
                        data["total"] = len(data["enquiries"])
                        data["counts"] = {s: sum(e["status"] == s for e in data["enquiries"])
                                          for s in ("pending", "confirmed", "declined")}

                    def respond(route):
                        body = json.loads(route.request.post_data or "{}")
                        action = body.get("action")
                        actions.append(body)
                        if action == "list":
                            result = data
                        elif action == "statistics":
                            result = {"statistics": {"periods": [], "monthly": []}}
                        elif action == "owner-admins":
                            result = {"admins": []}
                        elif action == "owner-audit":
                            result = {"events": []}
                        elif action == "owner-list-deleted":
                            result = {"records": [
                                {"id": item["enquiry"]["id"], "reference": item["enquiry"]["reference"],
                                 "customer_name": item["enquiry"]["customer_name"],
                                 "status": item["enquiry"]["status"],
                                 "deleted_at": "2026-11-18T21:00:00Z",
                                 "order_reference": item["order"]["order_reference"] if item["order"] else None}
                                for item in deleted
                            ]}
                        elif action == "owner-delete-records":
                            assert body["confirmation"] == "DELETE " + str(len(body["ids"]))
                            assert len(body["reason"]) >= 10
                            removed_orders = 0
                            for identifier in body["ids"]:
                                enquiry = next(e for e in data["enquiries"] if e["id"] == identifier)
                                order = next((o for o in data["orders"] if o["enquiry_id"] == identifier), None)
                                deleted.append({"enquiry": enquiry, "order": order})
                                data["enquiries"].remove(enquiry)
                                if order:
                                    data["orders"].remove(order)
                                    removed_orders += 1
                            update_counts()
                            result = {"result": {"deleted_enquiries": len(body["ids"]),
                                                 "deleted_orders": removed_orders,
                                                 "preserved_for_audit": True}}
                        elif action == "owner-restore-records":
                            assert body["confirmation"] == "RESTORE " + str(len(body["ids"]))
                            for identifier in body["ids"]:
                                obj = next(x for x in deleted if x["enquiry"]["id"] == identifier)
                                data["enquiries"].append(obj["enquiry"])
                                if obj["order"]:
                                    data["orders"].append(obj["order"])
                                deleted.remove(obj)
                            update_counts()
                            result = {"result": {"restored_enquiries": len(body["ids"])}}
                        else:
                            result = {"summary": {"agreed_pence": 2150, "net_received_pence": 0,
                                                  "outstanding_pence": 2150}}
                        route.fulfill(status=200, content_type="application/json",
                                      headers={"Access-Control-Allow-Origin": "*",
                                               "Access-Control-Allow-Headers": "authorization, apikey, content-type",
                                               "Access-Control-Allow-Methods": "POST, OPTIONS"},
                                      body=json.dumps(result))

                    page.route("**/functions/v1/manage-enquiries", respond)
                    errors = []
                    page.on("pageerror", lambda error: errors.append(str(error)))

                    def dialog_handler(dialog):
                        if dialog.type == "prompt":
                            if dialog.message.startswith("Reason for deletion"):
                                dialog.accept("Removing duplicate test record")
                            elif "RESTORE 1" in dialog.message:
                                dialog.accept("RESTORE 1")
                            else:
                                m = re.search(r"Type (DELETE \d+) to continue", dialog.message)
                                assert m, dialog.message
                                dialog.accept(m.group(1))
                        else:
                            dialog.accept()

                    page.on("dialog", dialog_handler)
                    page.goto(f"http://127.0.0.1:{server.server_port}/admin.html", wait_until="load")
                    expect(page.locator(".admin-record-summary")).to_have_count(2)
                    assert page.locator("#admin-owner-delete-tools").is_visible()
                    expect(page.locator(".admin-record-delete-check")).to_have_count(2)

                    # Single deletion: approved enquiry + linked order removed together.
                    page.locator(".admin-record-summary").first.click()
                    with page.expect_request(lambda r: r.url.endswith("/manage-enquiries") and
                        json.loads(r.post_data or "{}").get("action") == "owner-delete-records") as req:
                        page.get_by_role("button", name="Delete enquiry and linked order").click()
                    assert json.loads(req.value.post_data)["ids"] == [TEST_ID]
                    expect(page.locator(".admin-record-summary")).to_have_count(1)
                    assert deleted[0]["order"] is not None, "Linked order not included in deletion"

                    # Owner can restore from the private deleted-records panel.
                    page.get_by_role("button", name="Deleted records / Restore").click()
                    expect(page.locator(".admin-deleted-row")).to_have_count(1)
                    page.get_by_role("button", name="Restore", exact=True).click()
                    expect(page.locator(".admin-record-summary")).to_have_count(2)
                    expect(page.locator(".admin-deleted-row")).to_have_count(0)

                    # Select-all bulk deletion includes a linked order and standalone enquiry.
                    page.locator("#admin-select-page").check()
                    assert "2 selected" in page.locator("#admin-selected-count").inner_text()
                    with page.expect_request(lambda r: r.url.endswith("/manage-enquiries") and
                        json.loads(r.post_data or "{}").get("action") == "owner-delete-records") as req:
                        page.locator("#admin-delete-selected").click()
                    body = json.loads(req.value.post_data)
                    assert len(body["ids"]) == 2 and set(body["ids"]) == {TEST_ID, SECOND_ID}
                    assert body["confirmation"] == "DELETE 2"
                    expect(page.locator(".admin-record-summary")).to_have_count(0)
                    expect(page.locator(".admin-deleted-row")).to_have_count(2)

                    # An operator can neither see selection/deletion controls nor restore.
                    data["adminRole"] = "operator"
                    page.locator("#admin-refresh").click()
                    expect(page.locator("#admin-owner-delete-tools")).to_be_hidden()
                    expect(page.locator("#admin-deleted-panel")).to_be_hidden()
                    expect(page.locator(".admin-record-delete-check")).to_have_count(0)
                    assert not errors, (engine, errors)
                    print(f"PASS {engine}: owner single/bulk delete and restore; operator controls hidden")
                    page.close()
                finally:
                    browser.close()
    finally:
        server.shutdown()


if __name__ == "__main__":
    test()

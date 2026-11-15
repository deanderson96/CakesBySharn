"""One-off hosted enquiry API test. Creates one synthetic enquiry; clean up afterwards.

Triggered in CI only when the commit message includes [live-enquiry-test].
"""
import json
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

config = (Path(__file__).resolve().parents[1] / "order-config.js").read_text()
url_match = re.search(r"supabaseUrl:\s*'([^']+)'", config)
key_match = re.search(r"supabaseAnonKey:\s*'([^']+)'", config)
assert url_match and key_match, "Missing public Supabase configuration"
endpoint = url_match.group(1) + "/functions/v1/submit-enquiry"
run_id = os.environ.get("GITHUB_RUN_ID", "manual")
payload = {
    "name": "Automated Cakes by Sharn integration test",
    "email": f"cbs-test-{run_id}@example.invalid",
    "preferredDate": (datetime.now(timezone.utc) + timedelta(days=28)).date().isoformat(),
    "fulfilment": "collection",
    "deliveryAddress": None,
    "notes": "Automated integration test, safe for administrators to delete.",
    "website": "",
    "items": [{"key": "loaves:0", "quantity": 1}],
}
headers = {"apikey": key_match.group(1), "Content-Type": "application/json",
           "Origin": "https://deanderson96.github.io"}

# Verify CORS preflight just as a real browser would.
preflight = Request(endpoint, method="OPTIONS", headers={
    "Origin": headers["Origin"],
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "apikey,content-type",
})
with urlopen(preflight, timeout=25) as response:
    assert response.status == 200, f"Unexpected preflight status: {response.status}"
    assert response.headers.get("Access-Control-Allow-Origin") in (
        headers["Origin"], "*"), "CORS origin not allowed"
print("PASS public API CORS preflight", flush=True)

request = Request(endpoint, data=json.dumps(payload).encode("utf-8"),
                  headers=headers, method="POST")
try:
    with urlopen(request, timeout=30) as response:
        code = response.status
        raw = response.read().decode("utf-8")
except HTTPError as error:
    detail = error.read().decode("utf-8")
    raise AssertionError(f"Public enquiry API returned HTTP {error.code}: {detail}") from error

print("Public API response:", code, raw, flush=True)
assert code == 201, f"Expected HTTP 201, got {code}"
result = json.loads(raw)
assert re.fullmatch(r"CBS-[A-F0-9]{10}", result.get("reference", "")), result
assert result.get("acknowledgmentEmailSent") is False, result
print("PASS hosted enquiry submission; remove synthetic reference:",
      result["reference"], flush=True)

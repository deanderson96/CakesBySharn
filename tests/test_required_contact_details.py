"""Static regression checks for mandatory email and UK mobile enquiries."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / "index.html").read_text()
js = (ROOT / "app.js").read_text()
api = (ROOT / "supabase/functions/submit-enquiry/index.ts").read_text()

assert 'id="contact-method"' not in html, "Contact preference selector must be removed"
assert re.search(r'id="customer-email"[^>]*required', html)
assert re.search(r'id="customer-mobile"[^>]*required', html)
assert 'id="contact-mobile-field" hidden' not in html
assert "const contactMethodField" not in js
assert "body: JSON.stringify({ name, email, mobile, preferredDate" in js
assert "customer_email: email" in api and "customer_mobile: mobile" in api
assert "const contactMethod = 'email'" in api
assert "if (rawMobile.length > 40 ||" in api
print("Mandatory contact details contract passed")

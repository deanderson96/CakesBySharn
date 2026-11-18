"""Ensure order details open in an accessible dialog instead of expanding rows."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
html=(root/'admin.html').read_text()
js=(root/'admin.js').read_text()
css=(root/'styles.css').read_text()
assert '<dialog id="admin-record-dialog"' in html
assert 'aria-labelledby="admin-record-dialog-title"' in html
assert 'id="admin-record-dialog-close"' in html
assert "recordDialog.showModal()" in js
assert "recordDialog.addEventListener('close'" in js
assert "lastRecordTrigger.focus()" in js
assert "event.preventDefault();" in js
assert "summary.setAttribute('aria-haspopup','dialog')" in js
assert "panel.dispatchEvent(new Event('admin-record-open'))" in js
assert "panel.addEventListener('admin-record-open',loadPaymentSummary)" in js
assert "recordDialogContent.replaceChildren(panel)" in js
assert ".admin-record-dialog::backdrop" in css
assert ".admin-dialog-content .admin-record-panel" in css
print("PASS order details modal, focus restore and payment summary refresh")

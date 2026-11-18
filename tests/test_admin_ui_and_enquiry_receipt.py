"""Visual and accessibility contract for the refreshed admin and enquiry experience."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
admin=(root/'admin.html').read_text()
index=(root/'index.html').read_text()
app=(root/'app.js').read_text()
css=(root/'styles.css').read_text()
assert 'admin-session-indicator' in admin
assert 'Private operations workspace' in admin
assert 'admin.js?v=20261118modal1' in admin
assert 'styles.css?v=20261118modal1' in admin
assert 'id="online-enquiry-result" class="enquiry-result" role="status" aria-live="polite" aria-atomic="true"' in index
assert 'app.js?v=20261118enquiry1' in index
assert "status.replaceChildren(heading,description,referenceLabel,reference,emailMessage,disclaimer)" in app
assert "result.acknowledgmentEmailSent === true" in app
assert "This is an enquiry, not a confirmed order." in app
assert ".enquiry-result--success" in css
assert ".admin-page .admin-list-head" in css
print("PASS enterprise admin UI and accessible enquiry confirmation contract")

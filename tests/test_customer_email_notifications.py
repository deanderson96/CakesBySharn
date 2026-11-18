"""Regression contracts for transactional customer notifications."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
submit = (root / "supabase/functions/submit-enquiry/index.ts").read_text()
manage = (root / "supabase/functions/manage-enquiries/index.ts").read_text()
admin = (root / "admin.js").read_text()
templates = (root / "supabase/functions/_shared/customer-email.ts").read_text()
delivery = (root / "supabase/functions/_shared/deliver-notification.ts").read_text()
migration = (root / "supabase/migrations/20261117222822_customer_email_notifications.sql").read_text()

assert "acknowledgmentEmailSent: acknowledged" in submit
assert "deliverNotification(database, data.id" in submit
assert "input.customerContacted !== true" in manage
assert "notes.length < 10" in manage
assert "notifyDecision(id)" in manage
assert "retry-decision-email" in manage and "retry-decision-email" in admin
assert "customerContacted.type = 'checkbox'" in admin
assert "Reason for declining" in admin
assert "escapeHtml(info.reason" in templates
assert "hello@cakesbysharn.co.uk" in templates
assert "RESEND_API_KEY" in templates
assert "Idempotency-Key" in templates
assert "reply_to" in templates
assert "unique(enquiry_id,kind)" in migration
assert "enable row level security" in migration
assert "status: 'failed'" in delivery
print("Transactional email contracts passed")

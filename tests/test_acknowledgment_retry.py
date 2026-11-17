"""Guard against email audit privilege regressions and duplicate acknowledgment retries."""
from pathlib import Path
base = Path(__file__).resolve().parents[1]
migration = (base / 'supabase/migrations/20261117230016_grant_email_notification_audit_service_role.sql').read_text().lower()
manage = (base / 'supabase/functions/manage-enquiries/index.ts').read_text()
admin = (base / 'admin.js').read_text()
delivery = (base / 'supabase/functions/_shared/deliver-notification.ts').read_text()
assert 'grant select, insert, update on table public.customer_email_notifications to service_role' in migration
assert 'retry-acknowledgment-email' in manage
assert "existing && existing.status !== 'failed'" in manage
assert "existing?.status === 'failed'" in manage
assert "kind: 'acknowledgment'" in manage
assert 'retry-acknowledgment-email' in admin
assert "error.code === '23505'" in delivery
print('Email audit permission and acknowledgment retry contracts passed')

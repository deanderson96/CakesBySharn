"""Non-destructive structural checks for CI (no production credentials required)."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
migrations = sorted((ROOT / 'supabase' / 'migrations').glob('*.sql'))
assert len(migrations) >= 20, 'Committed Supabase migration history is incomplete'
versions = [path.name[:14] for path in migrations]
assert len(versions) == len(set(versions)), 'Duplicate migration versions'
assert all(re.fullmatch(r'\d{14}', version) for version in versions)

config = (ROOT / 'order-config.js').read_text()
assert 'SUPABASE_SERVICE_ROLE_KEY' not in config
assert 'service_role' not in config
shared = (ROOT / 'supabase/functions/_shared/common.ts').read_text()
assert "Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')" in shared
submit = (ROOT / 'supabase/functions/submit-enquiry/index.ts').read_text()
assert "new TextEncoder().encode(raw).byteLength > 16000" in submit, 'Check actual request bytes'
assert "todayInLondon" in submit, 'Require UK business date'
assert "input.items.some(" in submit, 'Reject malformed items with 400'
manage = (ROOT / 'supabase/functions/manage-enquiries/index.ts').read_text()
assert 'getAuthenticatorAssuranceLevel(jwt)' not in manage
assert "user.email_confirmed_at" in manage
assert ".from('admin_accounts')" in manage
assert "requireOwner();" in manage
assert ".from('admin_accounts')" in manage
assert "p_details_confirmed" in manage
legacy_revoke = next((x for x in migrations if 'revoke_legacy_unattested_order_decision' in x.name), None)
assert legacy_revoke and 'revoke' in legacy_revoke.read_text().lower()
assert (ROOT / 'catalog.js').exists()
assert 'catalog.js' in (ROOT / 'index.html').read_text()
print(f'PASS: {len(migrations)} migrations, admin password authentication and owner RBAC, backend validation and catalogue linkage')

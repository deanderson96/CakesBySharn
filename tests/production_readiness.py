"""Source-level production readiness contracts. No customer data or emails sent."""
from pathlib import Path
root = Path(__file__).resolve().parents[1]
index = (root / "index.html").read_text()
admin = (root / "admin.html").read_text()
policy = (root / "privacy.html").read_text()
admin_js = (root / "admin.js").read_text()
manage = (root / "supabase/functions/manage-enquiries/index.ts").read_text()
email = (root / "supabase/functions/_shared/customer-email.ts").read_text()
assert '<link rel="canonical" href="https://www.cakesbysharn.co.uk/">' in index
assert 'https://www.cakesbysharn.co.uk/assets/social-preview.png' in index
assert 'href="privacy.html"' in index
assert 'privacy notice' in index.lower()
assert '<meta name="robots" content="noindex,nofollow">' in admin
assert '<section id="admin-dashboard" hidden>' in admin
assert 'id="admin-email-health"' in admin
assert "emailHealth.hidden=data.emailSecretConfigured!==false" in admin_js
assert "emailSecretConfigured: Boolean(Deno.env.get('RESEND_API_KEY')?.trim())" in manage
assert "user.email_confirmed_at" in manage
assert "currentLevel !== 'aal2'" not in manage
assert "getAuthenticatorAssuranceLevel" not in manage
assert 'id="admin-mfa"' not in admin
assert "signInWithPassword" in admin_js
assert "administrator" in manage and "active" in manage
assert 'Cakes by Sharn is responsible' in policy
assert "cakesbysharnx@hotmail.com" in policy
assert "How long do we keep it?" in policy
assert "Information Commissioner's Office" in policy
assert 'https://www.cakesbysharn.co.uk/privacy.html' in policy
assert "Deno.env.get('RESEND_API_KEY')" in email
assert "idempotencyKey" in email
print("PASS: published metadata, privacy, verified-admin password access and email readiness warning contracts")

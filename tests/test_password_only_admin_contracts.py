"""Guardrails for password-only admin access and preserved owner authorisation."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
migration=(root/"supabase/migrations/20261118223000_password_only_admin_access.sql").read_text()
backend=(root/"supabase/functions/manage-enquiries/index.ts").read_text()
admin=(root/"admin.js").read_text()
html=(root/"admin.html").read_text()
for value in ("currentLevel !== 'aal2'","getAuthenticatorAssuranceLevel","auth.mfa","Multi-factor authentication required"):
    assert value not in backend, value
assert "user.email_confirmed_at" in backend
assert ".eq('active', true)" in backend
assert "requireOwner();" in backend
assert "auth.signInWithPassword" in admin
assert "auth.mfa" not in admin and "mfaFactorId" not in admin
assert "id=\"admin-mfa\"" not in html
assert "Administrator access unavailable:" in admin
assert "join auth.users u" in migration
assert "a.active = true" in migration
assert "u.email_confirmed_at is not null" in migration
assert "p_owner_only" in migration and "v_role is distinct from 'owner'" in migration
assert "is_verified_admin_member()" in migration
for name in ("admins_read_enquiries","admins_read_orders","admins_read_replies"):
    assert "create policy "+name in migration
assert "'aal2'" not in migration
assert "revoke all on function public.is_verified_admin_member() from public, anon" in migration
print("PASS: no MFA requirement, verified active membership and owner-only controls")

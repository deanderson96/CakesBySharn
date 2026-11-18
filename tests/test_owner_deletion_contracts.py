"""Deletion is owner-only, reversible, audited and never physically erases business records."""
from pathlib import Path
root = Path(__file__).resolve().parents[1]
migration = (root / "supabase/migrations/20261118213816_owner_only_reversible_bulk_deletion.sql").read_text()
api = (root / "supabase/functions/manage-enquiries/index.ts").read_text()
ui = (root / "admin.js").read_text()
html = (root / "admin.html").read_text()
assert "perform public.assert_admin_mfa(true)" in migration
assert migration.count("perform public.assert_admin_mfa(true)") >= 3
assert "security definer" in migration
assert "v_total > 100" in migration
assert "count(distinct x.id)" in migration
assert "deleted_at=now()" in migration
assert "deleted_by=auth.uid()" in migration
assert "insert into audit.admin_events" in migration
assert "owner_deleted_enquiry" in migration and "owner_restored_enquiry" in migration
assert "deleted_at is null" in migration and "deleted_at is not null" in migration
assert "revoke all on function public.owner_archive_enquiries(uuid[],text) from public,anon" in migration
assert "revoke all on function public.owner_restore_enquiries(uuid[]) from public,anon" in migration
assert "grant execute on function public.owner_archive_enquiries(uuid[],text) to authenticated" in migration
assert "delete from public.orders" not in migration.lower()
assert "delete from public.enquiries" not in migration.lower()
assert "delete from accounting." not in migration.lower()
assert "action === 'owner-delete-records'" in api
assert "action === 'owner-restore-records'" in api
assert "action === 'owner-list-deleted'" in api
assert "requireOwner();" in api
assert "new Set(ids.map(value => value.toLowerCase())).size !== ids.length" in api
assert "DELETE" in ui and "RESTORE 1" in ui
assert "selectedForDeletion" in ui and "Delete enquiry and linked order" in ui
assert 'id="admin-owner-delete-tools"' in html
assert 'id="admin-deleted-panel"' in html
print("PASS: owner-only reversible deletion, audit and bulk constraints")

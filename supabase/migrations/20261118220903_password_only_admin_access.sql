-- Remove mandatory TOTP/MFA from the application.
-- Access remains limited to an authenticated, email-verified, active administrator.
-- The legacy assert_admin_mfa name is retained because existing RPCs call it.
-- Owner-only administrative and bulk-delete actions remain owner-only.
create or replace function public.is_verified_admin_member()
returns boolean
language sql stable security definer
set search_path to ''
as $function$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.admin_accounts a
      join auth.users u on u.id = a.user_id
      where a.user_id = (select auth.uid())
        and a.active = true
        and u.email_confirmed_at is not null
    );
$function$;

revoke all on function public.is_verified_admin_member() from public, anon;
grant execute on function public.is_verified_admin_member() to authenticated;

create or replace function public.assert_admin_mfa(p_owner_only boolean default false)
returns void
language plpgsql stable security definer
set search_path to ''
as $function$
declare v_role text;
begin
  if not public.is_verified_admin_member() then
    raise exception 'Verified administrator account required' using errcode = '42501';
  end if;
  if p_owner_only then
    select a.role into v_role from public.admin_accounts a
      where a.user_id = auth.uid() and a.active;
    if v_role is distinct from 'owner' then
      raise exception 'Owner access required' using errcode = '42501';
    end if;
  end if;
end
$function$;

-- Customer tables remain inaccessible to all other authenticated users.
drop policy if exists admins_read_enquiries on public.enquiries;
create policy admins_read_enquiries on public.enquiries
for select to authenticated
using ((select public.is_verified_admin_member()));

drop policy if exists admins_read_orders on public.orders;
create policy admins_read_orders on public.orders
for select to authenticated
using ((select public.is_verified_admin_member()));

drop policy if exists admins_read_replies on public.enquiry_replies;
create policy admins_read_replies on public.enquiry_replies
for select to authenticated
using ((select public.is_verified_admin_member()));

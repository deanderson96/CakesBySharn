create extension if not exists pg_cron with schema pg_catalog;
alter table public.enquiries add column if not exists auto_declined_at timestamptz;
create table if not exists public.enquiry_retention_runs (
 id bigint generated always as identity primary key,
 executed_at timestamptz not null default now(),
 auto_declined integer not null,
 auto_declined_deleted integer not null,
 manually_declined_deleted integer not null,
 orders_deleted integer not null,
 approved_enquiries_deleted integer not null
);
alter table public.enquiry_retention_runs enable row level security;
revoke all on public.enquiry_retention_runs from public,anon,authenticated;
create or replace function public.run_enquiry_retention(p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_auto integer; v_auto_delete integer; v_manual integer; v_orders integer; v_approved integer;
begin
 if current_user <> 'postgres' and session_user <> 'postgres' then
   raise exception 'Restricted maintenance operation';
 end if;
 if p_dry_run then
   select count(*) into v_auto from public.enquiries where status='pending' and created_at < now()-interval '28 days';
   select count(*) into v_auto_delete from public.enquiries where status='declined' and auto_declined_at is not null and created_at < now()-interval '3 months';
   select count(*) into v_manual from public.enquiries where status='declined' and auto_declined_at is null and created_at < now()-interval '6 months';
   select count(*) into v_orders from public.orders where created_at < now()-interval '1 year';
   select count(*) into v_approved from public.enquiries e where e.status='confirmed' and exists(select 1 from public.orders o where o.enquiry_id=e.id and o.created_at < now()-interval '1 year');
 else
   update public.enquiries set status='declined',auto_declined_at=now()
    where status='pending' and created_at < now()-interval '28 days';
   get diagnostics v_auto=row_count;
   delete from public.enquiries where status='declined' and auto_declined_at is not null and created_at < now()-interval '3 months';
   get diagnostics v_auto_delete=row_count;
   delete from public.enquiries where status='declined' and auto_declined_at is null and created_at < now()-interval '6 months';
   get diagnostics v_manual=row_count;
   with old_orders as (delete from public.orders where created_at < now()-interval '1 year' returning enquiry_id)
   select count(*) into v_orders from old_orders;
   delete from public.enquiries e where e.status='confirmed'
    and not exists(select 1 from public.orders o where o.enquiry_id=e.id)
    and e.created_at < now()-interval '1 year';
   get diagnostics v_approved=row_count;
   insert into public.enquiry_retention_runs(auto_declined,auto_declined_deleted,manually_declined_deleted,orders_deleted,approved_enquiries_deleted)
   values(v_auto,v_auto_delete,v_manual,v_orders,v_approved);
 end if;
 return jsonb_build_object('dry_run',p_dry_run,'auto_declined',v_auto,'auto_declined_deleted',v_auto_delete,'manually_declined_deleted',v_manual,'orders_deleted',v_orders,'approved_enquiries_deleted',v_approved);
end $$;
revoke all on function public.run_enquiry_retention(boolean) from public,anon,authenticated;
select cron.schedule('cakes-by-sharn-enquiry-retention','15 2 * * *',$job$select public.run_enquiry_retention(false);$job$);

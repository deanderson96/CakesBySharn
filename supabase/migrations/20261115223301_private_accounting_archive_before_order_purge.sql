create schema if not exists accounting;
revoke all on schema accounting from public,anon,authenticated;
create table if not exists accounting.order_archive (
 order_id uuid primary key,
 order_reference text not null unique,
 order_created_at timestamptz not null,
 customer_name text not null,
 items jsonb not null,
 agreed_total_pence integer not null,
 fulfilment text not null,
 agreed_date date not null,
 archived_at timestamptz not null default now()
);
revoke all on accounting.order_archive from public,anon,authenticated;
create or replace function public.admin_accounting_export()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $$
declare result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.admin_accounts where user_id=auth.uid() and active=true) then
   raise exception 'Not authorised' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.order_created_at desc), '[]'::jsonb) into result from (
  select o.order_reference,o.created_at as order_created_at,o.customer_name,o.items,o.total_pence as agreed_total_pence,
   o.fulfilment,o.agreed_date,false as archived from public.orders o
  union all
  select a.order_reference,a.order_created_at,a.customer_name,a.items,a.agreed_total_pence,
   a.fulfilment,a.agreed_date,true as archived from accounting.order_archive a
 ) x;
 return result;
end $$;
revoke all on function public.admin_accounting_export() from public,anon;
grant execute on function public.admin_accounting_export() to authenticated;
create or replace function public.run_enquiry_retention(p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
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
   insert into accounting.order_archive(order_id,order_reference,order_created_at,customer_name,items,agreed_total_pence,fulfilment,agreed_date)
   select id,order_reference,created_at,customer_name,items,total_pence,fulfilment,agreed_date
   from public.orders where created_at < now()-interval '1 year'
   on conflict(order_id) do nothing;
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

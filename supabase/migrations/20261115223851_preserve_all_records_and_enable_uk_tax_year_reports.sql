create or replace function public.run_enquiry_retention(p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_auto integer;
begin
 if current_user <> 'postgres' and session_user <> 'postgres' then raise exception 'Restricted maintenance operation'; end if;
 select count(*) into v_auto from public.enquiries where status='pending' and created_at < now()-interval '28 days';
 if not p_dry_run then
   update public.enquiries set status='declined',auto_declined_at=now()
    where status='pending' and created_at < now()-interval '28 days';
   get diagnostics v_auto=row_count;
   insert into public.enquiry_retention_runs(auto_declined,auto_declined_deleted,manually_declined_deleted,orders_deleted,approved_enquiries_deleted)
   values(v_auto,0,0,0,0);
 end if;
 return jsonb_build_object('dry_run',p_dry_run,'auto_declined',v_auto,'deleted',0,'policy','retain_all_records');
end $$;
revoke all on function public.run_enquiry_retention(boolean) from public,anon,authenticated;
create or replace function public.admin_tax_year_report(p_start_year integer)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_start timestamptz; v_end timestamptz; v_orders jsonb; v_enquiries jsonb; v_total bigint; v_count bigint;
begin
 if auth.uid() is null or not exists(select 1 from public.admin_accounts where user_id=auth.uid() and active=true) then
   raise exception 'Not authorised' using errcode='42501';
 end if;
 if p_start_year < 2020 or p_start_year > extract(year from now())::integer then
   raise exception 'Invalid tax year' using errcode='22023';
 end if;
 v_start := (make_date(p_start_year,4,6)::timestamp at time zone 'Europe/London');
 v_end := (make_date(p_start_year+1,4,6)::timestamp at time zone 'Europe/London');
 with all_orders as (
  select order_reference,created_at as ordered_at,customer_name,items,total_pence,fulfilment,agreed_date,false as archived
   from public.orders
  union all
  select order_reference,order_created_at,customer_name,items,agreed_total_pence,fulfilment,agreed_date,true
   from accounting.order_archive
 ), filtered as (
  select * from all_orders where ordered_at>=v_start and ordered_at<v_end
 )
 select coalesce(jsonb_agg(to_jsonb(f) order by ordered_at,order_reference),'[]'::jsonb),
        coalesce(sum(total_pence),0),count(*) into v_orders,v_total,v_count from filtered f;
 select coalesce(jsonb_agg(jsonb_build_object('reference',e.reference,'created_at',e.created_at,
  'customer_name',e.customer_name,'status',e.status,'items',e.items,'contact_method',e.contact_method,
  'auto_declined_at',e.auto_declined_at) order by e.created_at),'[]'::jsonb)
 into v_enquiries from public.enquiries e where e.created_at>=v_start and e.created_at<v_end;
 return jsonb_build_object('start_year',p_start_year,'period_start',make_date(p_start_year,4,6),
 'period_end',make_date(p_start_year+1,4,5),'order_count',v_count,
 'agreed_order_total_pence',v_total,'orders',v_orders,'enquiries',v_enquiries,
 'payments_recorded',false,'expenses_recorded',false,'tax_basis','order_creation_date_not_receipt_date');
end $$;
revoke all on function public.admin_tax_year_report(integer) from public,anon;
grant execute on function public.admin_tax_year_report(integer) to authenticated;
select cron.alter_job(job_id := (select jobid from cron.job where jobname='cakes-by-sharn-enquiry-retention'),active:=true);

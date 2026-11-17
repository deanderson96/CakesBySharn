
create or replace function public.check_enquiry_rate_limit_dynamic(p_key text,p_max_attempts integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare allowed boolean;
begin
 if p_key is null or length(p_key)<>64 or p_key !~ '^[a-f0-9]{64}$' or
  p_max_attempts is null or p_max_attempts not between 2 and 100 then return false; end if;
 insert into public.enquiry_rate_limits(rate_key,window_started_at,attempt_count)
 values(p_key,now(),1)
 on conflict(rate_key) do update set
  window_started_at=case when public.enquiry_rate_limits.window_started_at<now()-interval '1 hour'
    then now() else public.enquiry_rate_limits.window_started_at end,
  attempt_count=case when public.enquiry_rate_limits.window_started_at<now()-interval '1 hour'
    then 1 else public.enquiry_rate_limits.attempt_count+1 end
 returning attempt_count<=p_max_attempts into allowed;
 return allowed;
end $$;
revoke all on function public.check_enquiry_rate_limit_dynamic(text,integer) from public,anon,authenticated;
grant execute on function public.check_enquiry_rate_limit_dynamic(text,integer) to service_role;

alter table public.enquiry_retention_runs add column if not exists expired_rate_limit_keys integer not null default 0;

create or replace function public.run_enquiry_retention(p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_auto integer;v_expired integer;
begin
 if current_user <> 'postgres' and session_user <> 'postgres' then raise exception 'Restricted maintenance operation'; end if;
 if p_dry_run then
  select count(*) into v_auto from public.enquiries where status='pending' and created_at<now()-interval '28 days';
  select count(*) into v_expired from public.enquiry_rate_limits where window_started_at<now()-interval '7 days';
 else
  with changed as (
    update public.enquiries set status='declined',auto_declined_at=now()
    where status='pending' and created_at<now()-interval '28 days'
    returning id
  ), logged as (
    insert into audit.admin_events(actor_id,action,enquiry_id,details)
    select null,'enquiry_auto_declined',id,jsonb_build_object('rule','28_days') from changed
    returning id
  ) select count(*) into v_auto from logged;
  delete from public.enquiry_rate_limits where window_started_at<now()-interval '7 days';
  get diagnostics v_expired=row_count;
  insert into public.enquiry_retention_runs(auto_declined,auto_declined_deleted,
    manually_declined_deleted,orders_deleted,approved_enquiries_deleted,expired_rate_limit_keys)
   values(v_auto,0,0,0,0,v_expired);
 end if;
 return jsonb_build_object('dry_run',p_dry_run,'auto_declined',v_auto,
  'expired_technical_rate_limit_keys',v_expired,'deleted_business_records',0,
  'policy','retain_all_business_records');
end $$;
revoke all on function public.run_enquiry_retention(boolean) from public,anon,authenticated;

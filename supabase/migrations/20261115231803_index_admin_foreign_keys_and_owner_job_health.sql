
create index if not exists enquiries_reviewed_by_idx on public.enquiries(reviewed_by);
create index if not exists enquiry_replies_recorded_by_idx on public.enquiry_replies(recorded_by);
create index if not exists orders_approved_by_idx on public.orders(approved_by);
create index if not exists orders_notified_by_idx on public.orders(customer_notified_by);

create or replace function public.owner_system_health()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare last_run timestamptz;last_success timestamptz;last_status text; job_active boolean;old_pending integer;records integer;
begin
 perform public.assert_admin_mfa(true);
 select active into job_active from cron.job where jobname='cakes-by-sharn-enquiry-retention';
 select started,status into last_run,last_status from (
  select start_time as started,status from cron.job_run_details
  where jobid=(select jobid from cron.job where jobname='cakes-by-sharn-enquiry-retention')
  order by start_time desc limit 1
 ) x;
 select max(start_time) into last_success from cron.job_run_details
  where jobid=(select jobid from cron.job where jobname='cakes-by-sharn-enquiry-retention')
  and status='succeeded';
 select count(*) into old_pending from public.enquiries where status='pending' and created_at<now()-interval '28 days';
 select count(*) into records from audit.admin_events;
 return jsonb_build_object('daily_automation_enabled',coalesce(job_active,false),
  'last_run',last_run,'last_success',last_success,'last_status',last_status,
  'overdue_pending_enquiries',old_pending,'audit_event_count',records,
  'business_record_deletion_enabled',false);
end $$;
revoke all on function public.owner_system_health() from public,anon;
grant execute on function public.owner_system_health() to authenticated;

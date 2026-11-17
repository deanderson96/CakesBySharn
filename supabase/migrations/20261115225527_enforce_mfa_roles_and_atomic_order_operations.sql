
alter table public.admin_accounts add column if not exists role text not null default 'operator' check (role in ('owner','operator'));
update public.admin_accounts set role='owner' where user_id='cca318e8-ca01-4d58-b56b-a8eb0c5502ca';
update public.admin_accounts set role='operator' where user_id='5b54c6e9-946e-47aa-8f5e-646617ba1bb3';

create schema if not exists audit;
revoke all on schema audit from public,anon,authenticated;
create table if not exists audit.admin_events(
 id bigint generated always as identity primary key,
 occurred_at timestamptz not null default now(),
 actor_id uuid,
 action text not null,
 enquiry_id uuid,
 order_id uuid,
 details jsonb not null default '{}'::jsonb
);
revoke all on audit.admin_events from public,anon,authenticated;

create or replace function public.assert_admin_mfa(p_owner_only boolean default false)
returns void language plpgsql stable security definer set search_path='' as $$
declare v_role text;
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then
   raise exception 'MFA verification required for administration' using errcode='42501';
 end if;
 select a.role into v_role from public.admin_accounts a where a.user_id=auth.uid() and a.active;
 if v_role is null then raise exception 'Not authorised' using errcode='42501'; end if;
 if p_owner_only and v_role <> 'owner' then raise exception 'Owner access required' using errcode='42501'; end if;
end $$;
revoke all on function public.assert_admin_mfa(boolean) from public,anon;
grant execute on function public.assert_admin_mfa(boolean) to authenticated;

drop policy if exists "admins_read_enquiries" on public.enquiries;
create policy "admins_read_enquiries" on public.enquiries for select to authenticated using(
 coalesce((select auth.jwt()->>'aal'),'aal1')='aal2'
 and exists(select 1 from public.admin_accounts a where a.user_id=(select auth.uid()) and a.active)
);
drop policy if exists "admins_read_orders" on public.orders;
create policy "admins_read_orders" on public.orders for select to authenticated using(
 coalesce((select auth.jwt()->>'aal'),'aal1')='aal2'
 and exists(select 1 from public.admin_accounts a where a.user_id=(select auth.uid()) and a.active)
);
drop policy if exists "admins_read_replies" on public.enquiry_replies;
create policy "admins_read_replies" on public.enquiry_replies for select to authenticated using(
 coalesce((select auth.jwt()->>'aal'),'aal1')='aal2'
 and exists(select 1 from public.admin_accounts a where a.user_id=(select auth.uid()) and a.active)
);

revoke update on public.enquiries from authenticated;
revoke insert,update,delete on public.orders from authenticated;
revoke insert on public.enquiry_replies from authenticated;
drop policy if exists "admins_update_enquiries" on public.enquiries;
drop policy if exists "admins_insert_orders" on public.orders;
drop policy if exists "admins_update_orders" on public.orders;
drop policy if exists "admins_delete_orders" on public.orders;
drop policy if exists "admins_insert_replies" on public.enquiry_replies;

alter table public.orders add column if not exists status text not null default 'approved' check (status in ('approved','completed','cancelled'));
alter table public.orders add column if not exists completed_at timestamptz;
alter table public.orders add column if not exists cancelled_at timestamptz;
alter table public.orders add column if not exists cancellation_reason text;
create index if not exists enquiries_created_at_desc_idx on public.enquiries(created_at desc);
create index if not exists orders_status_date_idx on public.orders(status,agreed_date);

create or replace function public.admin_decide_enquiry(
 p_id uuid,p_action text,p_date date default null,p_time text default null,
 p_total_pence integer default null,p_notes text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.enquiries%rowtype; o public.orders%rowtype;
begin
 perform public.assert_admin_mfa();
 if p_action not in ('confirm','decline') then raise exception 'Invalid decision'; end if;
 if char_length(coalesce(p_notes,'')) > 1500 then raise exception 'Notes too long'; end if;
 select * into e from public.enquiries where id=p_id for update;
 if not found then raise exception 'Enquiry not found'; end if;
 if e.status <> 'pending' then raise exception 'Enquiry already processed'; end if;
 if p_action='confirm' then
  if p_date is null or p_date < (now() at time zone 'Europe/London')::date or
   p_time is null or char_length(btrim(p_time)) not between 1 and 100 or
   p_total_pence is null or p_total_pence not between 0 and 100000000 then
   raise exception 'Valid confirmed date, time and final price required';
  end if;
  insert into public.orders(enquiry_id,customer_name,customer_email,customer_mobile,contact_method,
   fulfilment,delivery_address,items,total_pence,agreed_date,agreed_time,notes,approved_by)
  values(e.id,e.customer_name,e.customer_email,e.customer_mobile,e.contact_method,
   e.fulfilment,e.delivery_address,e.items,p_total_pence,p_date,p_time,coalesce(p_notes,''),auth.uid())
  returning * into o;
  update public.enquiries set status='confirmed',confirmed_date=p_date,confirmed_time=p_time,
   final_total_pence=p_total_pence,sharn_notes=p_notes,reviewed_by=auth.uid(),confirmed_at=now()
   where id=e.id;
  insert into audit.admin_events(actor_id,action,enquiry_id,order_id,details)
   values(auth.uid(),'order_approved',e.id,o.id,jsonb_build_object('price_pence',p_total_pence,'agreed_date',p_date));
  return jsonb_build_object('status','confirmed','orderReference',o.order_reference,'customerNotified',false);
 else
  update public.enquiries set status='declined',sharn_notes=p_notes,reviewed_by=auth.uid() where id=e.id;
  insert into audit.admin_events(actor_id,action,enquiry_id) values(auth.uid(),'enquiry_declined',e.id);
  return jsonb_build_object('status','declined','customerNotified',false);
 end if;
end $$;
revoke all on function public.admin_decide_enquiry(uuid,text,date,text,integer,text) from public,anon;
grant execute on function public.admin_decide_enquiry(uuid,text,date,text,integer,text) to authenticated;

create or replace function public.admin_record_reply(p_id uuid,p_message text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 perform public.assert_admin_mfa();
 if p_message is null or char_length(btrim(p_message)) not between 1 and 2000 then
  raise exception 'Write a message of up to 2000 characters';
 end if;
 if not exists(select 1 from public.enquiries where id=p_id) then raise exception 'Enquiry not found'; end if;
 insert into public.enquiry_replies(enquiry_id,message,recorded_by)
 values(p_id,btrim(p_message),auth.uid()) returning id into v_id;
 insert into audit.admin_events(actor_id,action,enquiry_id,details)
 values(auth.uid(),'reply_recorded',p_id,jsonb_build_object('reply_id',v_id));
 return jsonb_build_object('recorded',true);
end $$;
revoke all on function public.admin_record_reply(uuid,text) from public,anon;
grant execute on function public.admin_record_reply(uuid,text) to authenticated;

create or replace function public.admin_mark_notified(p_enquiry_id uuid,p_method text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.enquiries%rowtype; o public.orders%rowtype;
begin
 perform public.assert_admin_mfa();
 if p_method not in ('email','sms','whatsapp') then raise exception 'Invalid method'; end if;
 select * into e from public.enquiries where id=p_enquiry_id for update;
 if not found or e.status<>'confirmed' then raise exception 'Approved enquiry required'; end if;
 if p_method<>e.contact_method then raise exception 'Contact preference mismatch'; end if;
 select * into o from public.orders where enquiry_id=p_enquiry_id for update;
 if not found then raise exception 'Approved order not found'; end if;
 if o.customer_notified_at is not null then raise exception 'Customer already marked notified'; end if;
 update public.orders set customer_notified_at=now(),notification_method=p_method,customer_notified_by=auth.uid()
 where id=o.id;
 update public.enquiries set notified_at=now() where id=e.id;
 insert into audit.admin_events(actor_id,action,enquiry_id,order_id,details)
 values(auth.uid(),'customer_notified',e.id,o.id,jsonb_build_object('method',p_method));
 return jsonb_build_object('notified',true,'orderReference',o.order_reference);
end $$;
revoke all on function public.admin_mark_notified(uuid,text) from public,anon;
grant execute on function public.admin_mark_notified(uuid,text) to authenticated;

create or replace function public.admin_set_order_status(p_order_id uuid,p_status text,p_reason text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;
begin
 perform public.assert_admin_mfa();
 if p_status not in ('completed','cancelled') then raise exception 'Invalid status'; end if;
 if p_status='cancelled' and char_length(btrim(coalesce(p_reason,''))) < 5 then raise exception 'Cancellation reason required'; end if;
 if char_length(coalesce(p_reason,'')) > 500 then raise exception 'Reason too long'; end if;
 select * into o from public.orders where id=p_order_id for update;
 if not found then raise exception 'Order not found'; end if;
 if o.status <> 'approved' then raise exception 'Only active approved orders can be completed or cancelled'; end if;
 update public.orders set status=p_status,completed_at=case when p_status='completed' then now() else null end,
  cancelled_at=case when p_status='cancelled' then now() else null end,
  cancellation_reason=case when p_status='cancelled' then btrim(p_reason) else null end where id=p_order_id;
 insert into audit.admin_events(actor_id,action,enquiry_id,order_id,details)
 values(auth.uid(),'order_'||p_status,o.enquiry_id,o.id,
  case when p_status='cancelled' then jsonb_build_object('reason',left(btrim(p_reason),250)) else '{}'::jsonb end);
 return jsonb_build_object('status',p_status,'orderReference',o.order_reference);
end $$;
revoke all on function public.admin_set_order_status(uuid,text,text) from public,anon;
grant execute on function public.admin_set_order_status(uuid,text,text) to authenticated;

create or replace function public.owner_list_admins()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
 perform public.assert_admin_mfa(true);
 select coalesce(jsonb_agg(jsonb_build_object('user_id',a.user_id,'display_name',a.display_name,
  'email',u.email,'active',a.active,'role',a.role) order by a.display_name),'[]'::jsonb) into v_result
 from public.admin_accounts a join auth.users u on u.id=a.user_id;
 return v_result;
end $$;
revoke all on function public.owner_list_admins() from public,anon;
grant execute on function public.owner_list_admins() to authenticated;

create or replace function public.owner_set_admin(p_user_id uuid,p_active boolean,p_role text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.admin_accounts%rowtype;
begin
 perform public.assert_admin_mfa(true);
 if p_user_id=auth.uid() then raise exception 'Cannot modify your own administrator access'; end if;
 if p_role not in ('owner','operator') then raise exception 'Invalid role'; end if;
 update public.admin_accounts set active=p_active,role=p_role where user_id=p_user_id returning * into a;
 if not found then raise exception 'Administrator does not exist'; end if;
 insert into audit.admin_events(actor_id,action,details) values(auth.uid(),'admin_access_changed',
  jsonb_build_object('target_user_id',p_user_id,'active',p_active,'role',p_role));
 return jsonb_build_object('user_id',a.user_id,'active',a.active,'role',a.role);
end $$;
revoke all on function public.owner_set_admin(uuid,boolean,text) from public,anon;
grant execute on function public.owner_set_admin(uuid,boolean,text) to authenticated;

create or replace function public.owner_audit_log(p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
 perform public.assert_admin_mfa(true);
 select coalesce(jsonb_agg(to_jsonb(e) order by occurred_at desc),'[]'::jsonb) into v_result
 from (select id,occurred_at,actor_id,action,enquiry_id,order_id,details
  from audit.admin_events order by id desc limit least(greatest(coalesce(p_limit,100),1),250)) e;
 return v_result;
end $$;
revoke all on function public.owner_audit_log(integer) from public,anon;
grant execute on function public.owner_audit_log(integer) to authenticated;

alter function public.admin_tax_year_report(integer) rename to admin_tax_year_report_impl;
revoke all on function public.admin_tax_year_report_impl(integer) from public,anon,authenticated;
create function public.admin_tax_year_report(p_start_year integer)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.assert_admin_mfa();
 return public.admin_tax_year_report_impl(p_start_year);
end $$;
revoke all on function public.admin_tax_year_report(integer) from public,anon;
grant execute on function public.admin_tax_year_report(integer) to authenticated;

alter function public.admin_accounting_export() rename to admin_accounting_export_impl;
revoke all on function public.admin_accounting_export_impl() from public,anon,authenticated;
create function public.admin_accounting_export()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.assert_admin_mfa();
 return public.admin_accounting_export_impl();
end $$;
revoke all on function public.admin_accounting_export() from public,anon;
grant execute on function public.admin_accounting_export() to authenticated;

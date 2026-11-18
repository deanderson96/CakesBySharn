-- Dean/owner-only reversible deletion from the active Orders screen.
-- Never erase orders, enquiries, customer correspondence, payment or audit records.
-- Archive and restore are transactional and independently MFA/owner checked in PostgreSQL.
alter table public.enquiries
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;
alter table public.orders
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;
create index if not exists enquiries_active_created_idx on public.enquiries(created_at desc,id desc) where deleted_at is null;
create index if not exists enquiries_archived_idx on public.enquiries(deleted_at desc) where deleted_at is not null;
create index if not exists orders_active_enquiry_idx on public.orders(enquiry_id) where deleted_at is null;

-- Ordinary admin listings and operational analytics exclude deleted records.
-- Historic accounting / tax-year exports intentionally retain these records.
CREATE OR REPLACE FUNCTION public.admin_paginated_enquiries(p_offset integer DEFAULT 0, p_limit integer DEFAULT 25, p_status text DEFAULT 'all'::text, p_search text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_records jsonb; v_orders jsonb; v_total bigint; v_pending bigint; v_confirmed bigint; v_declined bigint;
begin
 perform public.assert_admin_mfa();
 if p_offset is null or p_offset < 0 or p_offset > 10000000 then raise exception 'Invalid offset'; end if;
 if p_limit is null or p_limit < 1 or p_limit > 100 then raise exception 'Invalid page size'; end if;
 if p_status not in ('all','pending','confirmed','declined') then raise exception 'Invalid filter'; end if;
 if char_length(coalesce(p_search,''))>100 then raise exception 'Search too long'; end if;
 select count(*),count(*) filter(where status='pending'),count(*) filter(where status='confirmed'),count(*) filter(where status='declined')
 into v_total,v_pending,v_confirmed,v_declined from public.enquiries
 where deleted_at is null and (p_status='all' or status=p_status)
 and (coalesce(p_search,'')='' or customer_name ilike '%'||p_search||'%' or reference ilike '%'||p_search||'%');
 with pg as (
  select * from public.enquiries e
  where e.deleted_at is null and (p_status='all' or e.status=p_status)
  and (coalesce(p_search,'')='' or e.customer_name ilike '%'||p_search||'%' or e.reference ilike '%'||p_search||'%')
  order by e.created_at desc,e.id desc limit p_limit offset p_offset
 )
 select coalesce(jsonb_agg(to_jsonb(pg) || jsonb_build_object('replies',coalesce((
  select jsonb_agg(jsonb_build_object('sent_at',r.sent_at,'message',r.message) order by r.sent_at)
   from public.enquiry_replies r where r.enquiry_id=pg.id),'[]'::jsonb)) order by pg.created_at desc,pg.id desc),'[]'::jsonb)
 into v_records from pg;
 select coalesce(jsonb_agg(to_jsonb(o) order by o.created_at desc),'[]'::jsonb) into v_orders
 from public.orders o where o.deleted_at is null and o.enquiry_id in (
   select e.id from public.enquiries e
    where e.deleted_at is null and (p_status='all' or e.status=p_status)
    and (coalesce(p_search,'')='' or e.customer_name ilike '%'||p_search||'%' or e.reference ilike '%'||p_search||'%')
    order by e.created_at desc,e.id desc limit p_limit offset p_offset
 );
 return jsonb_build_object('enquiries',v_records,'orders',v_orders,'total',v_total,
  'counts',jsonb_build_object('pending',v_pending,'confirmed',v_confirmed,'declined',v_declined),
  'offset',p_offset,'limit',p_limit);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_business_statistics()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
with access as (
 select exists(select 1 from public.admin_accounts where user_id=auth.uid() and active=true) as allowed
),
periods as (
 select * from (values (1,'1 month'),(3,'3 months'),(6,'6 months'),(9,'9 months'),(12,'12 months')) v(months,label)
),
enquiry_totals as (
 select p.months,
 count(e.id) as enquiries,
 count(e.id) filter (where e.status='pending') as pending,
 count(e.id) filter (where e.status='confirmed') as approved,
 count(e.id) filter (where e.status='declined') as declined,
 count(e.id) filter (where e.contact_method='email') as email,
 count(e.id) filter (where e.contact_method='sms') as sms,
 count(e.id) filter (where e.contact_method='whatsapp') as whatsapp,
 coalesce(sum(coalesce((select sum(case when x.value->>'priceType' in ('fixed','from') and (x.value->>'estimatedUnitPence') ~ '^[0-9]{1,9}$' and (x.value->>'quantity') ~ '^[0-9]{1,4}$' then (x.value->>'estimatedUnitPence')::bigint * (x.value->>'quantity')::bigint else 0 end) from jsonb_array_elements(case when jsonb_typeof(e.items)='array' then e.items else '[]'::jsonb end) x),0)),0) as estimated_pence
 from periods p left join public.enquiries e on e.deleted_at is null and e.created_at >= now() - make_interval(months=>p.months)
 group by p.months
),
order_totals as (
 select p.months, count(o.id) as orders,
 coalesce(sum(o.total_pence),0) as approved_value_pence,
 count(o.id) filter(where o.customer_notified_at is not null) as notified,
 count(o.id) filter(where o.customer_notified_at is null) as awaiting_notification
 from periods p left join public.orders o on o.deleted_at is null and o.created_at >= now() - make_interval(months=>p.months)
 group by p.months
),
monthly as (
 select gs.month_start,
 count(e.id) as enquiries,
 count(e.id) filter(where e.status='confirmed') as approved
 from generate_series(date_trunc('month',now()) - interval '11 months',date_trunc('month',now()),interval '1 month') gs(month_start)
 left join public.enquiries e on e.deleted_at is null and e.created_at >= gs.month_start and e.created_at < gs.month_start + interval '1 month'
 group by gs.month_start
),
monthly_orders as (
 select gs.month_start, count(o.id) as orders, coalesce(sum(o.total_pence),0) as value_pence
 from generate_series(date_trunc('month',now()) - interval '11 months',date_trunc('month',now()),interval '1 month') gs(month_start)
 left join public.orders o on o.deleted_at is null and o.created_at >= gs.month_start and o.created_at < gs.month_start + interval '1 month'
 group by gs.month_start
)
select case when (select allowed from access) then jsonb_build_object(
 'periods', (select jsonb_agg(jsonb_build_object(
 'months',p.months,'label',p.label,'enquiries',e.enquiries,'pending',e.pending,'approved',e.approved,'declined',e.declined,
 'email',e.email,'sms',e.sms,'whatsapp',e.whatsapp,'estimated_pence',e.estimated_pence,
 'orders',o.orders,'approved_value_pence',o.approved_value_pence,'notified',o.notified,'awaiting_notification',o.awaiting_notification
 ) order by p.months) from periods p join enquiry_totals e using(months) join order_totals o using(months)),
 'monthly', (select jsonb_agg(jsonb_build_object('month',to_char(m.month_start,'YYYY-MM'),'enquiries',m.enquiries,'approved',m.approved,'orders',o.orders,'value_pence',o.value_pence) order by m.month_start) from monthly m join monthly_orders o using(month_start))
) else null end
$function$;

create or replace function public.owner_archive_enquiries(p_ids uuid[], p_reason text)
returns jsonb
language plpgsql security definer
set search_path to ''
as $function$
declare v_total integer; v_found integer; v_order_count integer := 0; v_row record;
begin
  perform public.assert_admin_mfa(true);
  v_total := coalesce(cardinality(p_ids),0);
  if v_total < 1 or v_total > 100
     or (select count(distinct x.id) from unnest(p_ids) as x(id)) <> v_total
     or exists (select 1 from unnest(p_ids) as x(id) where x.id is null) then
    raise exception 'Select 1–100 distinct valid records' using errcode='22023';
  end if;
  if char_length(btrim(coalesce(p_reason,''))) not between 10 and 500 then
    raise exception 'Deletion reason must be 10–500 characters' using errcode='22023';
  end if;
  -- Lock selected rows. Any missing/already-deleted item aborts the entire batch.
  perform 1 from public.enquiries e where e.id = any(p_ids) and e.deleted_at is null
    order by e.id for update;
  select count(*) into v_found from public.enquiries e where e.id = any(p_ids) and e.deleted_at is null;
  if v_found <> v_total then
    raise exception 'A selected enquiry is missing or already deleted. Refresh and retry.'
      using errcode='22023';
  end if;
  for v_row in
    select e.id, e.reference, o.id as order_id, o.order_reference
      from public.enquiries e left join public.orders o on o.enquiry_id=e.id
      where e.id = any(p_ids) order by e.id
  loop
    if v_row.order_id is not null then
      update public.orders set deleted_at=now(), deleted_by=auth.uid()
      where id=v_row.order_id and deleted_at is null;
      v_order_count := v_order_count + 1;
    end if;
    update public.enquiries set deleted_at=now(), deleted_by=auth.uid() where id=v_row.id;
    insert into audit.admin_events(actor_id,action,enquiry_id,order_id,details)
      values(auth.uid(),'owner_deleted_enquiry',v_row.id,v_row.order_id,
        jsonb_build_object('enquiry_reference',v_row.reference,
          'order_reference',v_row.order_reference,'reason',btrim(p_reason),
          'reversible',true));
  end loop;
  return jsonb_build_object('deleted_enquiries',v_total,'deleted_orders',v_order_count,
    'preserved_for_audit',true);
end
$function$;

create or replace function public.owner_restore_enquiries(p_ids uuid[])
returns jsonb
language plpgsql security definer
set search_path to ''
as $function$
declare v_total integer; v_found integer; v_row record; v_orders integer := 0;
begin
  perform public.assert_admin_mfa(true);
  v_total := coalesce(cardinality(p_ids),0);
  if v_total < 1 or v_total > 100
    or (select count(distinct x.id) from unnest(p_ids) as x(id)) <> v_total
    or exists(select 1 from unnest(p_ids) as x(id) where x.id is null) then
    raise exception 'Select 1–100 distinct valid records' using errcode='22023';
  end if;
  perform 1 from public.enquiries e where e.id=any(p_ids) and e.deleted_at is not null
    order by e.id for update;
  select count(*) into v_found from public.enquiries e where e.id=any(p_ids) and e.deleted_at is not null;
  if v_found <> v_total then
    raise exception 'A selected enquiry is missing or already active. Refresh and retry.'
      using errcode='22023';
  end if;
  for v_row in
    select e.id,e.reference,o.id as order_id,o.order_reference
    from public.enquiries e left join public.orders o on o.enquiry_id=e.id
    where e.id=any(p_ids) order by e.id
  loop
    update public.orders set deleted_at=null,deleted_by=null
       where enquiry_id=v_row.id and deleted_at is not null;
    if v_row.order_id is not null then v_orders := v_orders + 1; end if;
    update public.enquiries set deleted_at=null,deleted_by=null where id=v_row.id;
    insert into audit.admin_events(actor_id,action,enquiry_id,order_id,details)
       values(auth.uid(),'owner_restored_enquiry',v_row.id,v_row.order_id,
         jsonb_build_object('enquiry_reference',v_row.reference,
          'order_reference',v_row.order_reference));
  end loop;
  return jsonb_build_object('restored_enquiries',v_total,'restored_orders',v_orders);
end
$function$;

create or replace function public.owner_list_deleted_enquiries()
returns jsonb
language plpgsql stable security definer
set search_path to ''
as $function$
declare v_data jsonb;
begin
  perform public.assert_admin_mfa(true);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.deleted_at desc),'[]'::jsonb)
    into v_data from (
      select e.id,e.reference,e.customer_name,e.status,e.deleted_at,
        o.order_reference
      from public.enquiries e left join public.orders o on o.enquiry_id=e.id
      where e.deleted_at is not null
      order by e.deleted_at desc limit 100
    ) as x;
  return v_data;
end
$function$;

revoke all on function public.owner_archive_enquiries(uuid[],text) from public,anon;
revoke all on function public.owner_restore_enquiries(uuid[]) from public,anon;
revoke all on function public.owner_list_deleted_enquiries() from public,anon;
grant execute on function public.owner_archive_enquiries(uuid[],text) to authenticated;
grant execute on function public.owner_restore_enquiries(uuid[]) to authenticated;
grant execute on function public.owner_list_deleted_enquiries() to authenticated;

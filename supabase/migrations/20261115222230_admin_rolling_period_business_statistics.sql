create or replace function public.admin_business_statistics()
returns jsonb language sql stable security invoker set search_path = public
as $$
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
 from periods p left join public.enquiries e on e.created_at >= now() - make_interval(months=>p.months)
 group by p.months
),
order_totals as (
 select p.months, count(o.id) as orders,
 coalesce(sum(o.total_pence),0) as approved_value_pence,
 count(o.id) filter(where o.customer_notified_at is not null) as notified,
 count(o.id) filter(where o.customer_notified_at is null) as awaiting_notification
 from periods p left join public.orders o on o.created_at >= now() - make_interval(months=>p.months)
 group by p.months
),
monthly as (
 select gs.month_start,
 count(e.id) as enquiries,
 count(e.id) filter(where e.status='confirmed') as approved
 from generate_series(date_trunc('month',now()) - interval '11 months',date_trunc('month',now()),interval '1 month') gs(month_start)
 left join public.enquiries e on e.created_at >= gs.month_start and e.created_at < gs.month_start + interval '1 month'
 group by gs.month_start
),
monthly_orders as (
 select gs.month_start, count(o.id) as orders, coalesce(sum(o.total_pence),0) as value_pence
 from generate_series(date_trunc('month',now()) - interval '11 months',date_trunc('month',now()),interval '1 month') gs(month_start)
 left join public.orders o on o.created_at >= gs.month_start and o.created_at < gs.month_start + interval '1 month'
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
$$;
revoke all on function public.admin_business_statistics() from public,anon;
grant execute on function public.admin_business_statistics() to authenticated;

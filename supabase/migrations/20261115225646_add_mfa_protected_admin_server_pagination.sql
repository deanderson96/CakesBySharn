
create or replace function public.admin_paginated_enquiries(
 p_offset integer default 0,p_limit integer default 25,p_status text default 'all',p_search text default ''
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_records jsonb; v_orders jsonb; v_total bigint; v_pending bigint; v_confirmed bigint; v_declined bigint;
begin
 perform public.assert_admin_mfa();
 if p_offset is null or p_offset < 0 or p_offset > 10000000 then raise exception 'Invalid offset'; end if;
 if p_limit is null or p_limit < 1 or p_limit > 100 then raise exception 'Invalid page size'; end if;
 if p_status not in ('all','pending','confirmed','declined') then raise exception 'Invalid filter'; end if;
 if char_length(coalesce(p_search,''))>100 then raise exception 'Search too long'; end if;
 select count(*),count(*) filter(where status='pending'),count(*) filter(where status='confirmed'),count(*) filter(where status='declined')
 into v_total,v_pending,v_confirmed,v_declined from public.enquiries
 where (p_status='all' or status=p_status)
 and (coalesce(p_search,'')='' or customer_name ilike '%'||p_search||'%' or reference ilike '%'||p_search||'%');
 with pg as (
  select * from public.enquiries e
  where (p_status='all' or e.status=p_status)
  and (coalesce(p_search,'')='' or e.customer_name ilike '%'||p_search||'%' or e.reference ilike '%'||p_search||'%')
  order by e.created_at desc,e.id desc limit p_limit offset p_offset
 )
 select coalesce(jsonb_agg(to_jsonb(pg) || jsonb_build_object('replies',coalesce((
  select jsonb_agg(jsonb_build_object('sent_at',r.sent_at,'message',r.message) order by r.sent_at)
   from public.enquiry_replies r where r.enquiry_id=pg.id),'[]'::jsonb)) order by pg.created_at desc,pg.id desc),'[]'::jsonb)
 into v_records from pg;
 select coalesce(jsonb_agg(to_jsonb(o) order by o.created_at desc),'[]'::jsonb) into v_orders
 from public.orders o where o.enquiry_id in (
   select e.id from public.enquiries e
    where (p_status='all' or e.status=p_status)
    and (coalesce(p_search,'')='' or e.customer_name ilike '%'||p_search||'%' or e.reference ilike '%'||p_search||'%')
    order by e.created_at desc,e.id desc limit p_limit offset p_offset
 );
 return jsonb_build_object('enquiries',v_records,'orders',v_orders,'total',v_total,
  'counts',jsonb_build_object('pending',v_pending,'confirmed',v_confirmed,'declined',v_declined),
  'offset',p_offset,'limit',p_limit);
end $$;
revoke all on function public.admin_paginated_enquiries(integer,integer,text,text) from public,anon;
grant execute on function public.admin_paginated_enquiries(integer,integer,text,text) to authenticated;

-- Require explicit customer-agreement attestation for approved orders.
-- Legacy six-argument function is revoked after the Edge Function rollout.
CREATE OR REPLACE FUNCTION public.admin_decide_enquiry(p_id uuid, p_action text, p_date date, p_time text, p_total_pence integer, p_notes text, p_details_confirmed boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.enquiries%rowtype; o public.orders%rowtype;
begin
  perform public.assert_admin_mfa();
  if p_action not in ('confirm','decline') then raise exception 'Invalid decision'; end if;
  if char_length(coalesce(p_notes,'')) > 1500 then raise exception 'Notes too long'; end if;
  if p_action = 'confirm' and p_details_confirmed is distinct from true then
    raise exception 'Customer agreement attestation required';
  end if;
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
      values(auth.uid(),'order_approved',e.id,o.id,
        jsonb_build_object('price_pence',p_total_pence,'agreed_date',p_date,
          'customer_details_agreed',true));
    return jsonb_build_object('status','confirmed','orderReference',o.order_reference,'customerNotified',false);
  else
    update public.enquiries set status='declined',sharn_notes=p_notes,reviewed_by=auth.uid() where id=e.id;
    insert into audit.admin_events(actor_id,action,enquiry_id) values(auth.uid(),'enquiry_declined',e.id);
    return jsonb_build_object('status','declined','customerNotified',false);
  end if;
end $function$


revoke all on function public.admin_decide_enquiry(uuid,text,date,text,integer,text,boolean) from public, anon, authenticated;
grant execute on function public.admin_decide_enquiry(uuid,text,date,text,integer,text,boolean) to authenticated;

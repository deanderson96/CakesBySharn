-- The seven-argument RPC now requires the customer's agreed details to be
-- explicitly attested. Prevent bypass through the legacy six-argument RPC.
revoke execute on function public.admin_decide_enquiry(uuid,text,date,text,integer,text)
  from public, anon, authenticated;

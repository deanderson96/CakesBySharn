-- Private notification audit must be writable by Supabase service-role Edge Functions.
-- No privileges are granted to anon or authenticated roles.
grant select, insert, update on table public.customer_email_notifications to service_role;

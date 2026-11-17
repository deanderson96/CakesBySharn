create table if not exists public.enquiry_rate_limits (
 rate_key text primary key,
 window_started_at timestamptz not null default now(),
 attempt_count integer not null default 0
);
alter table public.enquiry_rate_limits enable row level security;
revoke all on public.enquiry_rate_limits from anon, authenticated;
create or replace function public.check_enquiry_rate_limit(p_key text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare permitted boolean;
begin
 if p_key is null or length(p_key) <> 64 then return false; end if;
 insert into public.enquiry_rate_limits (rate_key, window_started_at, attempt_count)
 values (p_key, now(), 1)
 on conflict (rate_key) do update set
   window_started_at = case when public.enquiry_rate_limits.window_started_at < now() - interval '1 hour' then now() else public.enquiry_rate_limits.window_started_at end,
   attempt_count = case when public.enquiry_rate_limits.window_started_at < now() - interval '1 hour' then 1 else public.enquiry_rate_limits.attempt_count + 1 end
 returning attempt_count <= 3 into permitted;
 return permitted;
end; $$;
revoke all on function public.check_enquiry_rate_limit(text) from public, anon, authenticated;
grant execute on function public.check_enquiry_rate_limit(text) to service_role;

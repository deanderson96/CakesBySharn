-- Apply in Supabase SQL editor before enabling online submissions.
create table if not exists public.enquiries (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null default ('CBS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  created_at timestamptz not null default now(),
  customer_name text not null check (char_length(customer_name) between 1 and 120),
  customer_email text not null check (char_length(customer_email) between 3 and 254),
  preferred_date date not null,
  fulfilment text not null check (fulfilment in ('collection', 'delivery')),
  delivery_address text,
  notes text not null default '',
  items jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined')),
  confirmed_date date,
  confirmed_time text,
  final_total_pence integer check (final_total_pence >= 0),
  final_items jsonb,
  sharn_notes text,
  confirmed_at timestamptz,
  notified_at timestamptz
);
alter table public.enquiries enable row level security;
-- No browser-accessible policies: only service-role Edge Functions access customer data.
revoke all on public.enquiries from anon, authenticated;
create index if not exists enquiries_status_date_idx on public.enquiries(status, preferred_date);

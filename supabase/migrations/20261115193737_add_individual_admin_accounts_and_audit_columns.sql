create table if not exists public.admin_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check (char_length(trim(display_name)) between 1 and 100),
 created_at timestamptz not null default now(),
 active boolean not null default true
);
alter table public.admin_accounts enable row level security;
revoke all on public.admin_accounts from anon, authenticated;
alter table public.enquiries add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table public.enquiry_replies add column if not exists recorded_by uuid references auth.users(id) on delete set null;
alter table public.orders add column if not exists approved_by uuid references auth.users(id) on delete set null;
alter table public.orders add column if not exists customer_notified_by uuid references auth.users(id) on delete set null;
create index if not exists admin_accounts_active_idx on public.admin_accounts(active) where active = true;

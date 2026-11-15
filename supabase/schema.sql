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

-- Private audit trail of Sharn's replies to customers.
create table if not exists public.enquiry_replies (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries(id) on delete cascade,
  sent_at timestamptz not null default now(),
  message text not null check (char_length(message) between 1 and 2000)
);
alter table public.enquiry_replies enable row level security;
revoke all on public.enquiry_replies from anon, authenticated;
create index if not exists enquiry_replies_enquiry_date_idx
  on public.enquiry_replies(enquiry_id, sent_at);

-- Approved enquiries become distinct private orders, never merely a status flag.
create table if not exists public.orders (
 id uuid primary key default gen_random_uuid(),
 enquiry_id uuid not null unique references public.enquiries(id) on delete restrict,
 order_reference text unique not null default ('CBS-ORD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
 created_at timestamptz not null default now(),
 customer_name text not null,
 customer_email text not null,
 fulfilment text not null check (fulfilment in ('collection','delivery')),
 delivery_address text,
 items jsonb not null,
 total_pence integer not null check (total_pence between 0 and 100000000),
 agreed_date date not null,
 agreed_time text not null,
 notes text not null default '',
 customer_notified_at timestamptz,
 notification_method text check (notification_method in ('email','whatsapp')),
 notification_note text
);
alter table public.orders enable row level security;
revoke all on public.orders from anon, authenticated;
create index if not exists orders_created_idx on public.orders(created_at desc);

-- Explicit allowlist for individually authenticated administrators.
-- Add administrators only after creating and verifying their Supabase Auth accounts.
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

-- The management Edge Function uses the authenticated user's JWT and RLS.
-- The allowlist is readable only by its own active member; anon has no grants.
grant usage on schema public to authenticated;
grant select on public.admin_accounts to authenticated;
create policy "admins_read_own_membership" on public.admin_accounts for select to authenticated using (user_id = (select auth.uid()) and active = true);
grant select, update on public.enquiries to authenticated;
create policy "admins_read_enquiries" on public.enquiries for select to authenticated using (exists (select 1 from public.admin_accounts a where a.user_id = (select auth.uid()) and a.active));
create policy "admins_update_enquiries" on public.enquiries for update to authenticated using (exists (select 1 from public.admin_accounts a where a.user_id = (select auth.uid()) and a.active)) with check (exists (select 1 from public.admin_accounts a where a.user_id = (select auth.uid()) and a.active));
grant select, insert on public.enquiry_replies to authenticated;
create policy "admins_read_replies" on public.enquiry_replies for select to authenticated using (exists (select 1 from public.admin_accounts a where a.user_id = (select auth.uid()) and a.active));
create policy "admins_insert_replies" on public.enquiry_replies for insert to authenticated with check (recorded_by = (select auth.uid()) and exists (select 1 from public.admin_accounts a where a.user_id = (select auth.uid()) and a.active));
grant select, insert, update, delete on public.orders to authenticated;
create policy "admins_read_orders" on public.orders for select to authenticated using (exists (select 1 from public.admin_accounts a where a.user_id = (select auth.uid()) and a.active));
create policy "admins_insert_orders" on public.orders for insert to authenticated with check (approved_by = (select auth.uid()) and exists (select 1 from public.admin_accounts a where a.user_id = (select auth.uid()) and a.active));
create policy "admins_update_orders" on public.orders for update to authenticated using (exists (select 1 from public.admin_accounts a where a.user_id = (select auth.uid()) and a.active)) with check (exists (select 1 from public.admin_accounts a where a.user_id = (select auth.uid()) and a.active));
create policy "admins_delete_orders" on public.orders for delete to authenticated using (exists (select 1 from public.admin_accounts a where a.user_id = (select auth.uid()) and a.active));

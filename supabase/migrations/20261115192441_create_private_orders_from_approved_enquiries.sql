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

-- Service-role-only email delivery audit. No customer data or provider secrets in public APIs.
create table if not exists public.customer_email_notifications (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries(id) on delete cascade,
  kind text not null check (kind in ('acknowledgment','approved','declined')),
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  provider_message_id text,
  failure_reason text,
  attempted_at timestamptz not null default now(),
  sent_at timestamptz,
  unique(enquiry_id,kind)
);
alter table public.customer_email_notifications enable row level security;
revoke all on public.customer_email_notifications from anon,authenticated;
create index if not exists customer_email_notifications_status_idx on public.customer_email_notifications(status,attempted_at);

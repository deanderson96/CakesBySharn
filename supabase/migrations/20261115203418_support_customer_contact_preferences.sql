-- Existing enquiries and orders retain email as their preferred contact method.
alter table public.enquiries add column if not exists contact_method text not null default 'email';
alter table public.enquiries add column if not exists customer_mobile text;
alter table public.enquiries alter column customer_email drop not null;
alter table public.enquiries add constraint enquiries_contact_method_check check (contact_method in ('email','sms','whatsapp'));
alter table public.enquiries add constraint enquiries_contact_details_check check (
  (contact_method='email' and customer_email is not null and customer_mobile is null)
  or (contact_method in ('sms','whatsapp') and customer_email is null and customer_mobile ~ '^\+447[1-57-9][0-9]{8}$')
);
alter table public.orders add column if not exists contact_method text not null default 'email';
alter table public.orders add column if not exists customer_mobile text;
alter table public.orders alter column customer_email drop not null;
alter table public.orders add constraint orders_contact_method_check check (contact_method in ('email','sms','whatsapp'));
alter table public.orders add constraint orders_contact_details_check check (
  (contact_method='email' and customer_email is not null and customer_mobile is null)
  or (contact_method in ('sms','whatsapp') and customer_email is null and customer_mobile ~ '^\+447[1-57-9][0-9]{8}$')
);
alter table public.orders drop constraint orders_notification_method_check;
alter table public.orders add constraint orders_notification_method_check check (notification_method in ('email','sms','whatsapp'));

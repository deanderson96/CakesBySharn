-- Orders must retain both contact channels collected by the enquiry form.
-- Legacy orders with only their original contact channel remain valid.
alter table public.orders drop constraint orders_contact_details_check;
alter table public.orders add constraint orders_contact_details_check
check (
  (contact_method = 'email' and customer_email is not null and btrim(customer_email) <> ''
    and (customer_mobile is null or customer_mobile ~ '^\\+447[1-57-9][0-9]{8}$'))
  or
  (contact_method in ('sms','whatsapp') and customer_mobile ~ '^\\+447[1-57-9][0-9]{8}$'
    and (customer_email is null or btrim(customer_email) <> ''))
);

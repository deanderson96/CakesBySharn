-- Allow both contact channels on new enquiries while retaining historical
-- email-only and mobile-only records. The public submit-enquiry function
-- requires and validates both fields for every new submission.
alter table public.enquiries drop constraint enquiries_contact_details_check;
alter table public.enquiries add constraint enquiries_contact_details_check check (
  (
    contact_method = 'email'
    and customer_email is not null
    and (customer_mobile is null or customer_mobile ~ '^[+]447[1-57-9][0-9]{8}$')
  )
  or (
    contact_method in ('sms', 'whatsapp')
    and customer_mobile ~ '^[+]447[1-57-9][0-9]{8}$'
  )
);

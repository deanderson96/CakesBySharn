# Deployment checklist

## Before merge
- [ ] CI browser and static checks green
- [ ] Review catalogue parity and UK date handling
- [ ] Review customer-facing wording, menu prices and allergens
- [ ] Review changes against the latest applied Supabase migration
- [ ] Verify no secrets, contact information or production customer records committed
- [ ] Verify active owner/operator password login, unconfirmed-email, disabled-admin, ordinary-user and anonymous authorization tests in staging

## Database
- [ ] Back up production before DDL changes
- [ ] Verify any new migration is present in source control and not already applied
- [ ] Inspect RLS and EXECUTE grants; do not expose privileged functions without confirmed-email, active-admin and owner-role guards
- [ ] Run Supabase security and performance advisors; document intentional exceptions
- [ ] Verify scheduled job remains active and business records are preserved

## Edge Functions and Pages
- [ ] Deploy compatible Edge Functions before publishing dependent frontend changes
- [ ] Keep `submit-enquiry` public and `manage-enquiries` JWT-protected
- [ ] Verify public submission size/date/catalogue rejection paths in staging
- [ ] Deploy static website from reviewed `main`
- [ ] Smoke-test mobile browser, password-only admin login, owner-only deletion, order approval and reporting
- [ ] Confirm actual acknowledgement behaviour; do not imply automated email if unavailable

## Follow-up
- [ ] Monitor API failures and spam for 24 hours after deployment
- [ ] Reconcile financial entries with external receipts/invoices
- [ ] Update documentation for user-visible behaviour

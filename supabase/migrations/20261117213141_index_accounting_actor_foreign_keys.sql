-- Performance-only indexes for administrator actor FK checks and joins.
-- Applied to production via Supabase migration on 2026-11-17.
create index if not exists expenses_recorded_by_idx
  on accounting.expenses (recorded_by);
create index if not exists order_payments_recorded_by_idx
  on accounting.order_payments (recorded_by);

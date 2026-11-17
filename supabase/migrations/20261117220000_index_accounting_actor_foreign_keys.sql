-- Performance-only indexes for administrator actor FK checks and joins.
-- This migration is proposed for review; it is not yet applied to production.
create index if not exists expenses_recorded_by_idx
  on accounting.expenses (recorded_by);
create index if not exists order_payments_recorded_by_idx
  on accounting.order_payments (recorded_by);

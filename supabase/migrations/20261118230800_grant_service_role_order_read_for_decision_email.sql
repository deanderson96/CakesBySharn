-- The authenticated admin RPC creates an order, then the privileged
-- notification worker reads the order to prepare the approval email.
-- RLS bypass does not override table-level GRANT permissions.
grant select on table public.orders to service_role;

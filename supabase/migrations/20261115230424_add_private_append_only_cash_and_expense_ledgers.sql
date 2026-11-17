
create table if not exists accounting.order_payments(
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete restrict,
 recorded_at timestamptz not null default now(),
 paid_on date not null,
 event_type text not null check(event_type in ('receipt','refund')),
 amount_pence integer not null check(amount_pence between 1 and 100000000),
 payment_method text not null check(payment_method in ('bank','cash','card','other')),
 external_reference text not null default '' check(char_length(external_reference)<=120),
 recorded_by uuid references auth.users(id) on delete set null
);
create index if not exists accounting_payments_order_date on accounting.order_payments(order_id,paid_on);
create index if not exists accounting_payments_paid_on on accounting.order_payments(paid_on);
revoke all on accounting.order_payments from public,anon,authenticated;
create table if not exists accounting.expenses(
 id uuid primary key default gen_random_uuid(),
 spent_on date not null,
 category text not null check(category in ('ingredients','packaging','delivery','equipment','marketing','utilities','other')),
 supplier text not null check(char_length(trim(supplier)) between 1 and 120),
 description text not null check(char_length(trim(description)) between 3 and 500),
 amount_pence integer not null check(amount_pence between 1 and 100000000),
 evidence_reference text not null default '' check(char_length(evidence_reference)<=120),
 recorded_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
create index if not exists accounting_expenses_spent_on on accounting.expenses(spent_on);
revoke all on accounting.expenses from public,anon,authenticated;

create or replace function public.admin_payment_summary(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.orders%rowtype; v_received bigint;v_refunds bigint;
begin
 perform public.assert_admin_mfa();
 select * into o from public.orders where id=p_order_id;
 if not found then raise exception 'Order not found'; end if;
 select coalesce(sum(amount_pence) filter(where event_type='receipt'),0),
  coalesce(sum(amount_pence) filter(where event_type='refund'),0)
 into v_received,v_refunds from accounting.order_payments where order_id=p_order_id;
 return jsonb_build_object('order_id',o.id,'agreed_pence',o.total_pence,'received_pence',v_received,
  'refunded_pence',v_refunds,'net_received_pence',v_received-v_refunds,
  'outstanding_pence',greatest(0,o.total_pence-v_received+v_refunds));
end $$;
revoke all on function public.admin_payment_summary(uuid) from public,anon;
grant execute on function public.admin_payment_summary(uuid) to authenticated;

create or replace function public.admin_record_payment(
 p_order_id uuid,p_event_type text,p_amount_pence integer,p_paid_on date,
 p_method text,p_reference text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; v_received bigint;v_refunds bigint;v_payment_id uuid;
begin
 perform public.assert_admin_mfa();
 if p_event_type not in ('receipt','refund') or p_amount_pence is null or p_amount_pence not between 1 and 100000000
  or p_paid_on is null or p_paid_on > (now() at time zone 'Europe/London')::date
  or p_method not in ('bank','cash','card','other') or char_length(coalesce(p_reference,''))>120 then
  raise exception 'Invalid payment entry';
 end if;
 select * into o from public.orders where id=p_order_id for update;
 if not found then raise exception 'Order not found'; end if;
 select coalesce(sum(amount_pence) filter(where event_type='receipt'),0),
  coalesce(sum(amount_pence) filter(where event_type='refund'),0)
 into v_received,v_refunds from accounting.order_payments where order_id=p_order_id;
 if p_event_type='receipt' and v_received-v_refunds+p_amount_pence>o.total_pence then
  raise exception 'Receipts cannot exceed the agreed order total';
 end if;
 if p_event_type='refund' and p_amount_pence>v_received-v_refunds then
  raise exception 'Refund exceeds the recorded net receipts';
 end if;
 insert into accounting.order_payments(order_id,event_type,amount_pence,paid_on,payment_method,external_reference,recorded_by)
 values(o.id,p_event_type,p_amount_pence,p_paid_on,p_method,coalesce(p_reference,''),auth.uid())
 returning id into v_payment_id;
 insert into audit.admin_events(actor_id,action,enquiry_id,order_id,details)
 values(auth.uid(),'payment_'||p_event_type,o.enquiry_id,o.id,
  jsonb_build_object('payment_id',v_payment_id,'amount_pence',p_amount_pence,'date',p_paid_on));
 return jsonb_build_object('recorded',true,'payment_id',v_payment_id,'orderReference',o.order_reference);
end $$;
revoke all on function public.admin_record_payment(uuid,text,integer,date,text,text) from public,anon;
grant execute on function public.admin_record_payment(uuid,text,integer,date,text,text) to authenticated;

create or replace function public.admin_record_expense(
 p_spent_on date,p_category text,p_supplier text,p_description text,p_amount_pence integer,
 p_evidence_reference text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_expense_id uuid;
begin
 perform public.assert_admin_mfa();
 if p_spent_on is null or p_spent_on>(now() at time zone 'Europe/London')::date or
  p_category not in ('ingredients','packaging','delivery','equipment','marketing','utilities','other') or
  char_length(btrim(coalesce(p_supplier,''))) not between 1 and 120 or
  char_length(btrim(coalesce(p_description,''))) not between 3 and 500 or
  p_amount_pence is null or p_amount_pence not between 1 and 100000000 or
  char_length(coalesce(p_evidence_reference,''))>120 then raise exception 'Invalid expense entry'; end if;
 insert into accounting.expenses(spent_on,category,supplier,description,amount_pence,evidence_reference,recorded_by)
 values(p_spent_on,p_category,btrim(p_supplier),btrim(p_description),p_amount_pence,coalesce(p_evidence_reference,''),auth.uid())
 returning id into v_expense_id;
 insert into audit.admin_events(actor_id,action,details)
 values(auth.uid(),'expense_recorded',jsonb_build_object('expense_id',v_expense_id,
  'category',p_category,'amount_pence',p_amount_pence,'spent_on',p_spent_on));
 return jsonb_build_object('recorded',true,'expense_id',v_expense_id);
end $$;
revoke all on function public.admin_record_expense(date,text,text,text,integer,text) from public,anon;
grant execute on function public.admin_record_expense(date,text,text,text,integer,text) to authenticated;

create or replace function public.admin_tax_year_report(p_start_year integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare base jsonb; v_start date;v_end date;v_receipts bigint;v_refunds bigint;v_expenses bigint;
 v_payments jsonb; v_expense_lines jsonb;
begin
 perform public.assert_admin_mfa();
 base:=public.admin_tax_year_report_impl(p_start_year);
 v_start:=make_date(p_start_year,4,6);v_end:=make_date(p_start_year+1,4,6);
 select coalesce(sum(amount_pence) filter(where event_type='receipt'),0),
  coalesce(sum(amount_pence) filter(where event_type='refund'),0),
  coalesce(jsonb_agg(jsonb_build_object('order_reference',o.order_reference,
    'paid_on',p.paid_on,'event_type',p.event_type,'amount_pence',p.amount_pence,
    'method',p.payment_method,'reference',p.external_reference) order by p.paid_on,p.recorded_at),'[]'::jsonb)
 into v_receipts,v_refunds,v_payments
 from accounting.order_payments p join public.orders o on o.id=p.order_id
 where p.paid_on>=v_start and p.paid_on<v_end;
 select coalesce(sum(amount_pence),0),
  coalesce(jsonb_agg(jsonb_build_object('spent_on',e.spent_on,'category',e.category,
   'supplier',e.supplier,'description',e.description,'amount_pence',e.amount_pence,
   'evidence_reference',e.evidence_reference) order by e.spent_on,e.created_at),'[]'::jsonb)
 into v_expenses,v_expense_lines from accounting.expenses e
 where e.spent_on>=v_start and e.spent_on<v_end;
 return base || jsonb_build_object('recorded_receipts_pence',v_receipts,
   'recorded_refunds_pence',v_refunds,'recorded_expenses_pence',v_expenses,
   'recorded_cash_difference_pence',v_receipts-v_refunds-v_expenses,
   'payment_entries',v_payments,'expense_entries',v_expense_lines,
   'payments_recorded',true,'expenses_recorded',true);
end $$;
revoke all on function public.admin_tax_year_report(integer) from public,anon;
grant execute on function public.admin_tax_year_report(integer) to authenticated;

create or replace function public.admin_financial_export()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare payments jsonb;expenses jsonb;
begin
 perform public.assert_admin_mfa();
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'order_id',p.order_id,'order_reference',o.order_reference,
  'paid_on',p.paid_on,'event_type',p.event_type,'amount_pence',p.amount_pence,'payment_method',p.payment_method,
  'external_reference',p.external_reference) order by p.paid_on),'[]'::jsonb)
 into payments from accounting.order_payments p join public.orders o on o.id=p.order_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'spent_on',e.spent_on,'category',e.category,
  'supplier',e.supplier,'description',e.description,'amount_pence',e.amount_pence,
  'evidence_reference',e.evidence_reference) order by e.spent_on),'[]'::jsonb)
 into expenses from accounting.expenses e;
 return jsonb_build_object('payments',payments,'expenses',expenses);
end $$;
revoke all on function public.admin_financial_export() from public,anon;
grant execute on function public.admin_financial_export() to authenticated;

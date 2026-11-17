import { cors, respond, withSiteCors } from '../_shared/common.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { deliverNotification } from '../_shared/deliver-notification.ts';

const handleRequest = async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
  try {
    const bearer = request.headers.get('authorization') || '';
    if (!bearer.startsWith('Bearer ')) return respond({ error: 'Sign in required' }, 401);
    const jwt = bearer.slice(7);
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: { user }, error: identityError } = await authClient.auth.getUser(jwt);
    if (identityError || !user?.id || !user.email_confirmed_at) return respond({ error: 'Not authorised' }, 403);
    const { data: assurance, error: assuranceError } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel(jwt);
    if (assuranceError || assurance?.currentLevel !== 'aal2') return respond({ error: 'Multi-factor authentication required' }, 403);

    // Every database query runs with the verified caller's JWT; RLS and RPCs
    // independently check active administrator membership and AAL2.
    const database = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: bearer } }
    });
    const { data: administrator, error: adminError } = await database.from('admin_accounts')
      .select('user_id,display_name,role').eq('user_id', user.id).eq('active', true).maybeSingle();
    if (adminError) throw adminError;
    if (!administrator) return respond({ error: 'Not authorised' }, 403);

    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 20000) return respond({ error: 'Request too large' }, 413);
    let input: Record<string, unknown>;
    try { input = JSON.parse(raw); } catch { return respond({ error: 'Invalid JSON' }, 400); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return respond({ error: 'Invalid request' }, 400);
    const action = String(input.action || '');
    const rpc = async (name: string, args: Record<string, unknown> = {}) => {
      const { data, error } = await database.rpc(name, args);
      if (error) { console.error('Admin RPC error', name, error.code, error.message); throw new Error('Unable to complete this action. Refresh and check the current record state.'); }
      return data;
    };
    const requireOwner = () => {
      if (administrator.role !== 'owner') throw new Error('Owner permissions required');
    };
    // Service-role client is used only after verifying user identity, AAL2 and
    // active administrator membership; it is never exposed to the browser.
    const service = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const notifyDecision = async (enquiryId: string, retry = false) => {
      const privileged = service();
      const { data: enquiry, error } = await privileged.from('enquiries')
        .select('id,reference,customer_name,customer_email,status,sharn_notes,fulfilment')
        .eq('id', enquiryId).single();
      if (error || !enquiry || !['confirmed','declined'].includes(enquiry.status))
        throw new Error('No completed decision found');
      if (enquiry.status === 'declined') {
        return deliverNotification(privileged, enquiryId, enquiry.customer_email || '', {
          kind: 'declined', name: enquiry.customer_name, reference: enquiry.reference,
          reason: enquiry.sharn_notes || ''
        }, retry);
      }
      const { data: order, error: orderError } = await privileged.from('orders')
        .select('order_reference,agreed_date,agreed_time,total_pence,fulfilment')
        .eq('enquiry_id', enquiryId).single();
      if (orderError || !order) throw new Error('Approved order unavailable for email');
      const delivery = await deliverNotification(privileged, enquiryId, enquiry.customer_email || '', {
        kind: 'approved', name: enquiry.customer_name, reference: enquiry.reference,
        orderReference: order.order_reference, date: order.agreed_date, time: order.agreed_time,
        amountPence: order.total_pence, fulfilment: order.fulfilment
      }, retry);
      if (delivery.sent) {
        try { await rpc('admin_mark_notified', { p_enquiry_id: enquiryId, p_method: 'email' }); }
        catch (auditError) { console.error('Email sent, but order notification audit update failed', auditError); }
      }
      return delivery;
    };
    const id = String(input.id || '');
    if (action === 'list') {
      const offset = Number(input.offset || 0), limit = Number(input.limit || 25);
      const selected = String(input.status || 'all'), search = String(input.search || '').trim();
      if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100 ||
        !['all','pending','confirmed','declined'].includes(selected) || search.length > 100) return respond({ error: 'Invalid listing parameters' }, 400);
      const data = await rpc('admin_paginated_enquiries', {
        p_offset: offset, p_limit: limit, p_status: selected, p_search: search
      });
      // Only after JWT, AAL2 and active admin checks. Report configuration
      // presence only; never expose API keys or connection secrets.
      return respond({ ...data, administrator: administrator.display_name, adminRole: administrator.role,
        emailSecretConfigured: Boolean(Deno.env.get('RESEND_API_KEY')?.trim()) });
    }
    if (action === 'statistics') return respond({ statistics: await rpc('admin_business_statistics') });
    if (action === 'tax-year-report') {
      const year = Number(input.startYear);
      if (!Number.isInteger(year) || year < 2020 || year > new Date().getUTCFullYear()) return respond({ error: 'Invalid tax year' }, 400);
      return respond({ report: await rpc('admin_tax_year_report', { p_start_year: year }) });
    }
    if (action === 'accounting-export') return respond({ orders: await rpc('admin_accounting_export') || [] });
    if (action === 'financial-export') {
      return respond({ ledger: await rpc('admin_financial_export') });
    }
    if (action === 'record-expense') {
      const date=String(input.date||''),category=String(input.category||''),
        supplier=String(input.supplier||''),description=String(input.description||''),
        amount=Number(input.amountPence),reference=String(input.evidenceReference||'');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !['ingredients','packaging','delivery','equipment','marketing','utilities','other'].includes(category) ||
        !supplier.trim() || supplier.length>120 || description.trim().length<3 || description.length>500 ||
        !Number.isSafeInteger(amount) || amount<=0 || amount>100000000 || reference.length>120)
        return respond({error:'Invalid expense entry'},400);
      return respond(await rpc('admin_record_expense',{
        p_spent_on:date,p_category:category,p_supplier:supplier.trim(),p_description:description.trim(),
        p_amount_pence:amount,p_evidence_reference:reference
      }));
    }
    if (action === 'payment-summary' || action === 'record-payment') {
      const orderId=String(input.id||'');
      if (!/^[0-9a-f-]{36}$/i.test(orderId)) return respond({error:'Invalid order ID'},400);
      if (action === 'payment-summary') return respond({ summary:await rpc('admin_payment_summary',{p_order_id:orderId}) });
      const date=String(input.date||''),eventType=String(input.eventType||''),method=String(input.method||''),
        reference=String(input.reference||''),amount=Number(input.amountPence);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !['receipt','refund'].includes(eventType) ||
        !['bank','cash','card','other'].includes(method) || reference.length>120 ||
        !Number.isSafeInteger(amount) || amount<1 || amount>100000000)
        return respond({error:'Invalid payment entry'},400);
      return respond(await rpc('admin_record_payment',{
        p_order_id:orderId,p_event_type:eventType,p_amount_pence:amount,p_paid_on:date,
        p_method:method,p_reference:reference
      }));
    }
    if (action === 'owner-admins') { requireOwner(); return respond({ admins: await rpc('owner_list_admins') }); }
    if (action === 'owner-audit') { requireOwner(); return respond({ events: await rpc('owner_audit_log', { p_limit: 100 }) }); }
    if (action === 'owner-set-admin') {
      requireOwner();
      const target = String(input.userId || ''), role = String(input.role || '');
      if (!/^[0-9a-f-]{36}$/i.test(target) || typeof input.active !== 'boolean' || !['owner','operator'].includes(role))
        return respond({ error: 'Invalid administrator update' }, 400);
      return respond({ administrator: await rpc('owner_set_admin', {
        p_user_id: target, p_active: input.active, p_role: role
      }) });
    }
    if (!/^[0-9a-f-]{36}$/i.test(id)) return respond({ error: 'Invalid enquiry or order reference' }, 400);
    // MFA-protected backfill for acknowledgments that failed before the
    // service-role audit permissions were corrected. Never re-send if already
    // sent or currently in progress; uniqueness is also enforced in the DB.
    if (action === 'retry-acknowledgment-email') {
      const privileged = service();
      const { data: enquiry, error: enquiryError } = await privileged.from('enquiries')
        .select('id,reference,customer_name,customer_email')
        .eq('id', id).single();
      if (enquiryError || !enquiry) return respond({ error: 'Enquiry not found.' }, 404);
      const { data: existing, error: auditError } = await privileged.from('customer_email_notifications')
        .select('status').eq('enquiry_id', id).eq('kind', 'acknowledgment').maybeSingle();
      if (auditError) throw auditError;
      if (existing && existing.status !== 'failed')
        return respond({ error: 'Acknowledgment is already queued or sent.' }, 409);
      const notification = await deliverNotification(privileged, id, enquiry.customer_email || '', {
        kind: 'acknowledgment', name: enquiry.customer_name, reference: enquiry.reference
      }, existing?.status === 'failed');
      return respond({ notification });
    }
    if (action === 'retry-decision-email') {
      const { data: previous, error } = await service().from('customer_email_notifications')
        .select('status').eq('enquiry_id', id).in('kind', ['approved','declined']).maybeSingle();
      if (error || !previous || previous.status !== 'failed')
        return respond({ error: 'Only failed decision emails can be retried.' }, 409);
      return respond({ notification: await notifyDecision(id, true) });
    }
    if (action === 'confirm' || action === 'decline') {
      const date = String(input.confirmedDate || ''), time = String(input.confirmedTime || '');
      const total = Number(input.finalTotalPence), notes = String(input.notes || '').trim();
      if (notes.length > 1500 || (action === 'confirm' && (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        time.length > 100 || !Number.isSafeInteger(total) || total < 0 || total > 100000000)))
        return respond({ error: 'Invalid order details' }, 400);
      if (action === 'confirm' && (input.detailsConfirmed !== true || input.customerContacted !== true))
        return respond({ error: 'Confirm you have contacted the customer and agreed all order details before approving.' }, 400);
      if (action === 'decline' && (notes.length < 10 || notes.length > 500))
        return respond({ error: 'Provide a clear decline reason (10–500 characters) for the customer email.' }, 400);
      const decision = await rpc('admin_decide_enquiry', {
        p_id: id, p_action: action, p_date: action === 'confirm' ? date : null,
        p_time: action === 'confirm' ? time : null,
        p_total_pence: action === 'confirm' ? total : null, p_notes: notes,
        p_details_confirmed: action === 'confirm'
      });
      let notification = { sent: false, status: 'failed' };
      try { notification = await notifyDecision(id); }
      catch (deliveryError) { console.error('Decision notification queue error', deliveryError); }
      return respond({ ...decision, notification });
    }
    if (action === 'log-reply') {
      const message = String(input.message || '').trim();
      if (!message || message.length > 2000) return respond({ error: 'Invalid reply' }, 400);
      return respond(await rpc('admin_record_reply', { p_id: id, p_message: message }));
    }
    if (action === 'mark-notified') {
      const method = String(input.method || '');
      if (!['email','sms','whatsapp'].includes(method)) return respond({ error: 'Invalid contact method' }, 400);
      return respond(await rpc('admin_mark_notified', { p_enquiry_id: id, p_method: method }));
    }
    if (action === 'set-order-status') {
      const status = String(input.orderStatus || ''), reason = String(input.reason || '').trim();
      if (!['completed','cancelled'].includes(status) || reason.length > 500) return respond({ error: 'Invalid order status' }, 400);
      return respond(await rpc('admin_set_order_status', { p_order_id: id, p_status: status, p_reason: reason }));
    }
    return respond({ error: 'Invalid action' }, 400);
  } catch (error) {
    console.error('manage-enquiries error', error);
    return respond({ error: 'Unable to process your request. Please try again or contact the site owner.' }, 500);
  }
};
Deno.serve(async request => withSiteCors(request, await handleRequest(request)));

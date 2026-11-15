import { cors, respond, db } from '../_shared/common.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
  try {
    const bearer = request.headers.get('authorization') || '';
    if (!bearer.startsWith('Bearer ')) return respond({ error: 'Sign in required' }, 401);
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: { user }, error } = await client.auth.getUser(bearer.slice(7));
    if (error || !user?.id || !user.email || !user.email_confirmed_at) return respond({ error: 'Not authorised' }, 403);
    const database = db();
    // A verified Supabase Auth session is necessary but not sufficient:
    // membership in this private, server-only allowlist is mandatory.
    const { data: administrator, error: adminError } = await database.from('admin_accounts')
      .select('user_id,display_name').eq('user_id', user.id).eq('active', true).maybeSingle();
    if (adminError) throw adminError;
    if (!administrator) return respond({ error: 'Not authorised' }, 403);
    const input = await request.json();
    if (input.action === 'list') {
      const { data, error } = await database.from('enquiries').select('*').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      const records = data || [];
      if (!records.length) return respond({ enquiries: [], orders: [], administrator: administrator.display_name });
      const { data: replies, error: repliesError } = await database.from('enquiry_replies')
        .select('enquiry_id,sent_at,message')
        .in('enquiry_id', records.map(enquiry => enquiry.id))
        .order('sent_at', { ascending: true });
      if (repliesError) throw repliesError;
      const { data: orders, error: orderError } = await database.from('orders').select('*').order('created_at', { ascending: false }).limit(100);
      if (orderError) throw orderError;
      return respond({ administrator: administrator.display_name, orders: orders || [], enquiries: records.map(enquiry => ({
        ...enquiry,
        replies: (replies || []).filter(reply => reply.enquiry_id === enquiry.id)
      })) });
    }
    if (!['log-reply', 'confirm', 'decline', 'mark-notified'].includes(input.action)) return respond({ error: 'Invalid action' }, 400);
    const id = String(input.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return respond({ error: 'Invalid reference' }, 400);
    const { data: enquiry, error: readError } = await database.from('enquiries').select('*').eq('id', id).single();
    if (readError || !enquiry) return respond({ error: 'Enquiry not found' }, 404);
    if (input.action === 'log-reply') {
      const reply = String(input.message || '').trim();
      if (reply.length < 1 || reply.length > 2000) return respond({ error: 'Write a message of up to 2,000 characters' }, 400);
      const { error: logError } = await database.from('enquiry_replies').insert({ enquiry_id: enquiry.id, message: reply, recorded_by: user.id });
      if (logError) throw logError;
      // The email/WhatsApp message was sent outside this system; never claim automated delivery.
      return respond({ recorded: true });
    }
    if (input.action === 'mark-notified') {
      if (enquiry.status !== 'confirmed') return respond({ error: 'Only confirmed orders can be marked notified' }, 409);
      const method = String(input.method || '');
      if (!['email', 'whatsapp'].includes(method)) return respond({ error: 'Choose email or WhatsApp' }, 400);
      const { data: order, error: orderError } = await database.from('orders').update({
        customer_notified_at: new Date().toISOString(), notification_method: method, customer_notified_by: user.id
      }).eq('enquiry_id', id).select('order_reference').single();
      if (orderError) throw orderError;
      const { error: notifiedError } = await database.from('enquiries').update({ notified_at: new Date().toISOString() }).eq('id', id);
      if (notifiedError) throw notifiedError;
      return respond({ notified: true, orderReference: order.order_reference });
    }
    if (enquiry.status !== 'pending') return respond({ error: 'Enquiry already processed' }, 409);
    const confirm = input.action === 'confirm';
    const confirmedDate = String(input.confirmedDate || '');
    const confirmedTime = String(input.confirmedTime || '').trim();
    const total = Number(input.finalTotalPence);
    const notes = String(input.notes || '').trim();
    if (notes.length > 1500) return respond({ error: 'Notes too long' }, 400);
    if (confirm && (!/^\d{4}-\d{2}-\d{2}$/.test(confirmedDate) || Number.isNaN(Date.parse(confirmedDate)) || confirmedDate < new Date().toISOString().slice(0,10) || !confirmedTime || confirmedTime.length > 100 || !Number.isSafeInteger(total) || total < 0 || total > 100000000)) return respond({ error: 'Valid confirmed date, time and final price required' }, 400);
    if (confirm) {
      // The unique enquiry_id on orders prevents creating duplicate orders.
      const { data: order, error: orderError } = await database.from('orders').insert({
        enquiry_id: id, customer_name: enquiry.customer_name, customer_email: enquiry.customer_email,
        fulfilment: enquiry.fulfilment, delivery_address: enquiry.delivery_address,
        items: enquiry.items, total_pence: total, agreed_date: confirmedDate,
        agreed_time: confirmedTime, notes, approved_by: user.id
      }).select('order_reference').single();
      if (orderError) return respond({ error: 'Could not create order; it may already exist. Refresh before retrying.' }, 409);
      const { data: changed, error: writeError } = await database.from('enquiries').update({
        status: 'confirmed', confirmed_date: confirmedDate, confirmed_time: confirmedTime,
        final_total_pence: total, sharn_notes: notes, reviewed_by: user.id, confirmed_at: new Date().toISOString()
      }).eq('id', id).eq('status', 'pending').select('id').maybeSingle();
      if (writeError || !changed) {
        const { error: rollbackError } = await database.from('orders').delete().eq('enquiry_id', id);
        if (rollbackError) console.error('Manual reconciliation needed for', id);
        return respond({ error: 'Order status update failed. Refresh and contact support before retrying.' }, 409);
      }
      return respond({ status: 'confirmed', orderReference: order.order_reference, customerNotified: false });
    }
    const { data: changed, error: writeError } = await database.from('enquiries').update({
      status: 'declined', sharn_notes: notes, reviewed_by: user.id
    }).eq('id', id).eq('status', 'pending').select('id').maybeSingle();
    if (writeError) throw writeError;
    if (!changed) return respond({ error: 'Already processed; please refresh' }, 409);
    return respond({ status: 'declined', customerNotified: false });
  } catch (error) {
    console.error(error);
    return respond({ error: 'Unable to process request; check status before retrying' }, 500);
  }
});

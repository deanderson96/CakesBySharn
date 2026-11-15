import { cors, respond, db, sendEmail } from '../_shared/common.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
  try {
    const bearer = request.headers.get('authorization') || '';
    if (!bearer.startsWith('Bearer ')) return respond({ error: 'Sign in required' }, 401);
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: { user }, error } = await client.auth.getUser(bearer.slice(7));
    if (error || !user || user.email?.toLowerCase() !== Deno.env.get('ADMIN_EMAIL')?.toLowerCase()) return respond({ error: 'Not authorised' }, 403);
    const input = await request.json();
    const database = db();
    if (input.action === 'list') {
      const { data, error } = await database.from('enquiries').select('*').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return respond({ enquiries: data });
    }
    if (input.action !== 'confirm' && input.action !== 'decline') return respond({ error: 'Invalid action' }, 400);
    const id = String(input.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return respond({ error: 'Invalid reference' }, 400);
    const { data: enquiry, error: readError } = await database.from('enquiries').select('*').eq('id', id).single();
    if (readError || !enquiry) return respond({ error: 'Enquiry not found' }, 404);
    if (enquiry.status !== 'pending') return respond({ error: 'Enquiry already processed' }, 409);
    const confirm = input.action === 'confirm';
    const confirmedDate = String(input.confirmedDate || '');
    const confirmedTime = String(input.confirmedTime || '').trim();
    const total = Number(input.finalTotalPence);
    const notes = String(input.notes || '').trim();
    if (notes.length > 1500) return respond({ error: 'Notes too long' }, 400);
    if (confirm && (!/^\d{4}-\d{2}-\d{2}$/.test(confirmedDate) || Number.isNaN(Date.parse(confirmedDate)) || confirmedDate < new Date().toISOString().slice(0,10) || !confirmedTime || confirmedTime.length > 100 || !Number.isSafeInteger(total) || total < 0 || total > 100000000)) return respond({ error: 'Valid confirmed date, time and final price required' }, 400);
    const newStatus = confirm ? 'confirmed' : 'declined';
    const message = confirm
      ? 'Your Cakes by Sharn order is confirmed!\n\nOrder: ' + enquiry.reference + '\nItems:\n' + enquiry.items.map((i: {quantity: number; name: string}) => '- ' + i.quantity + ' × ' + i.name).join('\n') + '\nFinal agreed total: £' + (total / 100).toFixed(2) + '\n' + (enquiry.fulfilment === 'delivery' ? 'Delivery' : 'Collection') + ' date: ' + confirmedDate + '\nTime: ' + confirmedTime + (enquiry.fulfilment === 'delivery' ? '\nDelivery address: ' + enquiry.delivery_address : '') + '\nSharn’s notes: ' + notes + '\n\nPlease contact Sharn if any details need changing.'
      : 'Cakes by Sharn enquiry ' + enquiry.reference + '\n\nUnfortunately Sharn cannot accept this enquiry.\n' + notes;
    // Send before committing the status; if delivery fails, leave pending for safe retry.
    await sendEmail(enquiry.customer_email, 'Cakes by Sharn: ' + (confirm ? 'Order confirmed' : 'Enquiry update') + ' ' + enquiry.reference, message);
    const { data: changed, error: writeError } = await database.from('enquiries').update({
      status: newStatus, confirmed_date: confirm ? confirmedDate : null,
      confirmed_time: confirm ? confirmedTime : null, final_total_pence: confirm ? total : null,
      sharn_notes: notes, confirmed_at: confirm ? new Date().toISOString() : null,
      notified_at: new Date().toISOString()
    }).eq('id', id).eq('status', 'pending').select('id').maybeSingle();
    if (writeError) throw writeError;
    if (!changed) return respond({ error: 'Already processed; please refresh' }, 409);
    return respond({ status: newStatus });
  } catch (error) {
    console.error(error);
    return respond({ error: 'Unable to process request; check status before retrying' }, 500);
  }
});

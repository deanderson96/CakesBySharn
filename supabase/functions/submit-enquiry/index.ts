import { cors, respond, db, sendEmail } from '../_shared/common.ts';
const catalog: Record<string, { name: string; price: number | null; type: string }> = {
  'afternoon-tea:0': { name: 'Individual afternoon tea', price: 900, type: 'fixed' },
  'afternoon-tea:1': { name: 'Afternoon tea for 2', price: 1600, type: 'fixed' },
  'loaves:0': { name: 'Banana loaf', price: 500, type: 'fixed' },
  'loaves:1': { name: 'Iced lemon loaf', price: 500, type: 'fixed' },
  'loaves:2': { name: 'Iced carrot loaf', price: 550, type: 'fixed' },
  'loaves:3': { name: 'Iced ginger loaf', price: 500, type: 'fixed' },
  'traditional-bakes:0': { name: 'Plain scones (Pack of 6)', price: 500, type: 'fixed' },
  'traditional-bakes:1': { name: 'Fruit scones (Pack of 6)', price: 550, type: 'fixed' },
  'traditional-bakes:2': { name: 'Chocolate fudge cake slices (Pack of 4)', price: 600, type: 'fixed' },
  'traditional-bakes:3': { name: 'Chocolate brownies (Pack of 4)', price: 600, type: 'fixed' },
  'traditional-bakes:4': { name: 'Chocolate orange brownies (Pack of 4)', price: 800, type: 'fixed' },
  'traditional-bakes:5': { name: 'Rolo brownies (Pack of 4)', price: 800, type: 'fixed' },
  'traditional-bakes:6': { name: 'Baileys & Nutella brownies (Pack of 4)', price: 900, type: 'fixed' },
  'traditional-bakes:7': { name: 'Chocolate chip cookies (Pack of 5)', price: 350, type: 'fixed' },
  'cupcakes:0': { name: 'Vanilla cupcakes (Box of 6)', price: 1000, type: 'fixed' },
  'cupcakes:1': { name: 'Red velvet cupcakes (Box of 6)', price: 1000, type: 'fixed' },
  'cupcakes:2': { name: 'Chocolate cupcakes (Box of 6)', price: 1000, type: 'fixed' },
  'cupcakes:3': { name: 'Personalised cupcakes', price: null, type: 'quote' },
  'celebration-cakes:0': { name: '7-inch buttercream cake (Three layers)', price: 4500, type: 'from' }
};
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
  try {
    if (Number(request.headers.get('content-length') || 0) > 16000) return respond({ error: 'Request too large' }, 413);
    const input = await request.json();
    const name = String(input.name || '').trim(), email = String(input.email || '').trim();
    const date = String(input.preferredDate || '');
    const notes = String(input.notes || '').trim();
    const fulfilment = input.fulfilment;
    const address = String(input.deliveryAddress || '').trim();
    if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return respond({ error: 'Valid name and email required' }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || date < new Date().toISOString().slice(0, 10)) return respond({ error: 'A future date is required' }, 400);
    if (!['collection', 'delivery'].includes(fulfilment) || (fulfilment === 'delivery' && (address.length < 10 || address.length > 500))) return respond({ error: 'Valid collection or delivery details required' }, 400);
    if (notes.length > 3000 || !Array.isArray(input.items) || input.items.length > 40) return respond({ error: 'Invalid enquiry' }, 400);
    const items = input.items.map((entry: { key: string; quantity: number }) => {
      const product = catalog[entry.key];
      if (!product || !Number.isInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > 50) throw Error('Invalid item');
      return { key: entry.key, name: product.name, quantity: entry.quantity, estimatedUnitPence: product.price, priceType: product.type };
    });
    if (!items.length && notes.length < 10) return respond({ error: 'Select items or describe your request' }, 400);
    const { data, error } = await db().from('enquiries').insert({
      customer_name: name, customer_email: email, preferred_date: date, fulfilment,
      delivery_address: fulfilment === 'delivery' ? address : null, notes, items
    }).select('reference').single();
    if (error) throw error;
    // The enquiry remains stored if mail delivery fails. Never claim it is confirmed.
    const details = items.map((i: { quantity: number; name: string }) => '- ' + i.quantity + ' × ' + i.name).join('\n') || 'Custom request';
    const body = 'Reference: ' + data.reference + '\nName: ' + name + '\nEmail: ' + email + '\nPreferred date: ' + date + '\nFulfilment: ' + fulfilment + '\nAddress: ' + (fulfilment === 'delivery' ? address : 'Collection') + '\nItems:\n' + details + '\nNotes: ' + notes;
    const notifications = await Promise.allSettled([
      sendEmail(Deno.env.get('SHARN_EMAIL')!, 'New enquiry ' + data.reference, body),
      sendEmail(email, 'Cakes by Sharn enquiry received: ' + data.reference, 'Thanks for your enquiry!\n\n' + body + '\n\nSharn will confirm availability, date and final price. This is not a confirmed order.')
    ]);
    if (notifications.some(x => x.status === 'rejected')) console.error('Enquiry email delivery failed', data.reference);
    return respond({ reference: data.reference, acknowledgmentEmailSent: notifications[1].status === 'fulfilled' }, 201);
  } catch (error) {
    console.error(error);
    return respond({ error: 'Unable to submit enquiry right now' }, 500);
  }
});

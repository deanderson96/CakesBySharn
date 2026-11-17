import { cors, respond, db, withSiteCors } from '../_shared/common.ts';
import { deliverNotification } from '../_shared/deliver-notification.ts';
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
const handleRequest = async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
  try {
    // Content-Length can be absent or misleading; enforce the limit on the actual body.
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 16000) return respond({ error: 'Request too large' }, 413);
    let input: Record<string, any>;
    try { input = JSON.parse(raw); } catch { return respond({ error: 'Invalid JSON' }, 400); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return respond({ error: 'Invalid request' }, 400);
    // Invisible field catches simple form-filling bots without exposing an error.
    if (String(input.website || '').trim()) return respond({ error: 'Unable to submit enquiry right now' }, 400);
    const name = String(input.name || '').trim();
    const contactMethod = 'email';
    const email = String(input.email || '').trim();
    const rawMobile = String(input.mobile || '').trim();
    const compactMobile = rawMobile.replace(/[\s().-]/g, '');
    const mobile = compactMobile.startsWith('07') ? '+44' + compactMobile.slice(1) : compactMobile;
    if (name.length < 1 || name.length > 120) return respond({ error: 'Enter your name (up to 120 characters).' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      return respond({ error: 'Enter a valid email address.' }, 400);
    if (rawMobile.length > 40 || !/^\+447[1-57-9]\d{8}$/.test(mobile))
      return respond({ error: 'Enter a valid UK mobile number, e.g. 07700 900123.' }, 400);
    const date = String(input.preferredDate || '');
    const notes = String(input.notes || '').trim();
    const fulfilment = input.fulfilment;
    const address = String(input.deliveryAddress || '').trim();
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00Z') : new Date(NaN);
    const todayInLondon = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date || date < todayInLondon)
      return respond({ error: 'A valid current or future date is required' }, 400);
    if (!['collection', 'delivery'].includes(fulfilment) || (fulfilment === 'delivery' && (address.length < 10 || address.length > 500))) return respond({ error: 'Valid collection or delivery details required' }, 400);
    if (notes.length > 3000 || !Array.isArray(input.items) || input.items.length > 40) return respond({ error: 'Invalid enquiry' }, 400);
    if (input.items.some((entry: unknown) => !entry || typeof entry !== 'object' || Array.isArray(entry) ||
      typeof (entry as { key?: unknown }).key !== 'string' ||
      !catalog[(entry as { key: string }).key] ||
      !Number.isInteger((entry as { quantity?: unknown }).quantity) ||
      Number((entry as { quantity: number }).quantity) < 1 ||
      Number((entry as { quantity: number }).quantity) > 50))
      return respond({ error: 'Invalid item' }, 400);
    const items = input.items.map((entry: { key: string; quantity: number }) => {
      const product = catalog[entry.key];
      if (!product || !Number.isInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > 50) throw Error('Invalid item');
      return { key: entry.key, name: product.name, quantity: entry.quantity, estimatedUnitPence: product.price, priceType: product.type };
    });
    if (!items.length && notes.length < 10) return respond({ error: 'Select items or describe your request' }, 400);
    // A rolling per-email limit provides basic abuse mitigation. No raw email is stored in the limiter.
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('email:' + email.toLowerCase()));
    const key = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
    const database = db();
    const { data: permitted, error: rateError } = await database.rpc('check_enquiry_rate_limit', { p_key: key });
    if (rateError) throw rateError;
    if (!permitted) return respond({ error: 'Too many enquiries from this contact address or number. Please try again later.' }, 429);
    const { data, error } = await database.from('enquiries').insert({
      customer_name: name, contact_method: contactMethod,
      customer_email: email,
      customer_mobile: mobile,
      preferred_date: date, fulfilment,
      delivery_address: fulfilment === 'delivery' ? address : null, notes, items
    }).select('id,reference').single();
    if (error) throw error;
    let acknowledged = false;
    try {
      const delivery = await deliverNotification(database, data.id, email, {
        kind: 'acknowledgment', name, reference: data.reference
      });
      acknowledged = delivery.sent;
    } catch (deliveryError) {
      console.error('Acknowledgment queue error', deliveryError);
    }
    return respond({ reference: data.reference, acknowledgmentEmailSent: acknowledged }, 201);
  } catch (error) {
    console.error(error);
    return respond({ error: 'Unable to submit enquiry right now' }, 500);
  }
};
Deno.serve(async request => withSiteCors(request, await handleRequest(request)));

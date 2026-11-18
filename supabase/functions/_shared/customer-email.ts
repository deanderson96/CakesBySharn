// Transactional customer emails. Never import this module in a browser bundle.
// All customer-supplied strings are HTML-escaped before rendering.
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

type Kind = 'acknowledgment' | 'approved' | 'declined';
export type EmailDetails = {
  kind: Kind; name: string; reference: string; orderReference?: string;
  date?: string; time?: string; amountPence?: number; fulfilment?: string; reason?: string;
};
export function renderCustomerEmail(info: EmailDetails): { subject: string; html: string; text: string } {
  const name = escapeHtml(info.name);
  const reference = escapeHtml(info.reference);
  const site = 'https://www.cakesbysharn.co.uk/';
  const heading = info.kind === 'acknowledgment' ? 'We’ve received your enquiry'
    : info.kind === 'approved' ? 'Your order is approved' : 'An update about your enquiry';
  const subject = info.kind === 'acknowledgment'
    ? 'Cakes by Sharn — enquiry received (' + info.reference + ')'
    : info.kind === 'approved'
    ? 'Cakes by Sharn — order approved (' + info.orderReference + ')'
    : 'Cakes by Sharn — enquiry update (' + info.reference + ')';
  const details = info.kind === 'approved'
    ? [
      ['Order reference', info.orderReference || ''],
      ['Agreed date', info.date || ''],
      ['Agreed time', info.time || ''],
      ['Collection / delivery', info.fulfilment === 'delivery' ? 'Delivery' : 'Collection'],
      ['Agreed total', typeof info.amountPence === 'number' ? '£' + (info.amountPence / 100).toFixed(2) : '']
    ]
    : [['Enquiry reference', info.reference]];
  const intro = info.kind === 'acknowledgment'
    ? 'Thank you for contacting us. Your enquiry is in our queue. We’ll review availability and pricing before confirming an order.'
    : info.kind === 'approved'
    ? 'Thank you for discussing your order with us. We’re pleased to confirm the agreed details below.'
    : 'Thank you for your enquiry. Unfortunately, we’re unable to accept this request.';
  const rows = details.filter(([,v]) => v).map(([k,v]) =>
    '<tr><td style="padding:11px 12px;border-bottom:1px solid #e2ece7;color:#50635b">' + escapeHtml(k) +
    '</td><td style="padding:11px 12px;border-bottom:1px solid #e2ece7;font-weight:700;color:#163c34">' +
    escapeHtml(v) + '</td></tr>').join('');
  const reason = info.kind === 'declined' ? '<p style="margin:18px 0 6px;font-weight:700">Reason</p><p style="margin:0 0 18px;white-space:pre-line">' +
    escapeHtml(info.reason || '') + '</p>' : '';
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;background:#f5f5ef;font-family:Arial,Helvetica,sans-serif;color:#193d35">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5ef;padding:32px 12px"><tr><td align="center">' +
    '<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#fff;border-radius:18px;overflow:hidden">' +
    '<tr><td style="background:#0a7773;padding:32px;text-align:center;color:#fff">' +
    '<p style="font-size:12px;letter-spacing:3px;text-transform:uppercase;margin:0 0 10px">Made with love</p>' +
    '<h1 style="font-size:29px;line-height:1.2;margin:0;font-family:Georgia,serif">Cakes by Sharn</h1></td></tr>' +
    '<tr><td style="padding:34px 30px;font-size:15px;line-height:1.75">' +
    '<h2 style="font-family:Georgia,serif;font-size:25px;line-height:1.25;margin:0 0 20px;color:#0a7773">' + escapeHtml(heading) + '</h2>' +
    '<p>Hi ' + name + ',</p><p>' + escapeHtml(intro) + '</p>' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;background:#f1f8f5;border-radius:10px;font-size:14px">' + rows + '</table>' +
    reason + '<p>If you have any questions, simply reply to this email and we’ll be happy to help.</p>' +
    '<p style="margin:28px 0"><a href="' + site + '" style="display:inline-block;background:#0a7773;color:#fff;text-decoration:none;border-radius:9px;padding:12px 22px;font-weight:700">Visit Cakes by Sharn</a></p>' +
    '<p>With love,<br><strong>Sharn</strong></p></td></tr>' +
    '<tr><td style="background:#eaf3ed;padding:20px 30px;text-align:center;font-size:12px;color:#526b60">' +
    'Cakes by Sharn · <a href="' + site + '" style="color:#0a7773">www.cakesbysharn.co.uk</a><br>' +
    'This is a service email about your enquiry or order. Please do not reply with payment card details.' +
    '</td></tr></table></td></tr></table></body></html>';
  const text = ['Cakes by Sharn', heading, 'Hi ' + info.name + ',', intro,
    ...details.filter(([,v]) => v).map(([k,v]) => k + ': ' + v),
    ...(info.kind === 'declined' ? ['Reason: ' + (info.reason || '')] : []),
    'Questions? Reply to this email.', site].join('\n\n');
  return { subject, html, text };
}
export async function sendCustomerEmail(to: string, details: EmailDetails, idempotencyKey: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');
  const email = renderCustomerEmail(details);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({
      from: 'Cakes by Sharn <hello@cakesbysharn.co.uk>',
      reply_to: 'cakesbysharnx@hotmail.com',
      to: [to], subject: email.subject, html: email.html, text: email.text
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.id !== 'string') throw new Error('Email provider rejected the message (' + response.status + ')');
  return payload.id as string;
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
export const cors = {
  'Access-Control-Allow-Origin': 'https://www.cakesbysharn.co.uk',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};
export const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
export const db = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
export async function sendEmail(to: string, subject: string, message: string) {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM');
  if (!key || !from) throw new Error('Email provider not configured');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text: message })
  });
  if (!response.ok) throw new Error('Email delivery failed: ' + response.status);
}

// Match CORS to the requesting production origin, rather than the obsolete
// GitHub Pages hostname. Never reflect arbitrary origins or use credentials.
const allowedSiteOrigins = new Set([
  'https://www.cakesbysharn.co.uk',
  'https://cakesbysharn.co.uk',
  'https://deanderson96.github.io'
]);
export function withSiteCors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  const origin = request.headers.get('Origin');
  if (origin && allowedSiteOrigins.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
  } else {
    headers.delete('Access-Control-Allow-Origin');
  }
  headers.set('Vary', 'Origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

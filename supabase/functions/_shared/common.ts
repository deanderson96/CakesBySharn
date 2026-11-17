import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
export const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('SITE_ORIGIN') || 'https://deanderson96.github.io',
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

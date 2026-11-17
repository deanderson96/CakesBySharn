import { sendCustomerEmail, type EmailDetails } from './customer-email.ts';

type DbClient = any;
export async function deliverNotification(database: DbClient, enquiryId: string, to: string,
  details: EmailDetails, retry = false): Promise<{ sent: boolean; status: string }> {
  const kind = details.kind;
  if (retry) {
    const { data, error } = await database.from('customer_email_notifications')
      .update({ status: 'pending', attempted_at: new Date().toISOString(), failure_reason: null })
      .eq('enquiry_id', enquiryId).eq('kind', kind).eq('status', 'failed').select('id').maybeSingle();
    if (error) throw error;
    if (!data) return { sent: false, status: 'Not retryable: notification is pending or already sent' };
  } else {
    const { error } = await database.from('customer_email_notifications').insert({
      enquiry_id: enquiryId, kind, status: 'pending'
    });
    if (error) {
      if (error.code === '23505') return { sent: false, status: 'Already queued or sent' };
      throw error;
    }
  }
  try {
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error('Customer email unavailable');
    const providerId = await sendCustomerEmail(to, details, enquiryId + ':' + kind);
    const { error } = await database.from('customer_email_notifications')
      .update({ status: 'sent', provider_message_id: providerId, sent_at: new Date().toISOString(), failure_reason: null })
      .eq('enquiry_id', enquiryId).eq('kind', kind);
    if (error) throw error;
    return { sent: true, status: 'sent' };
  } catch (error) {
    // Do not log the email address or full provider response (which may contain PII).
    console.error('Customer email delivery failed', kind, enquiryId, error instanceof Error ? error.message : 'unknown');
    await database.from('customer_email_notifications')
      .update({ status: 'failed', failure_reason: 'Delivery failed; administrator retry required' })
      .eq('enquiry_id', enquiryId).eq('kind', kind);
    return { sent: false, status: 'failed' };
  }
}

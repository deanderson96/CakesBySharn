(async () => {
  const config = window.CAKES_ORDER_CONFIG || {};
  const status = document.querySelector('#admin-status');
  if (!config.supabaseUrl || !config.supabaseAnonKey) { status.textContent = 'Order backend is not configured yet.'; return; }
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const client = createClient(config.supabaseUrl, config.supabaseAnonKey);
  const login = document.querySelector('#admin-login');
  const dashboard = document.querySelector('#admin-dashboard');
  const orders = document.querySelector('#admin-orders');
  async function api(input) {
    const { data: { session } } = await client.auth.getSession();
    if (!session) throw Error('Please sign in again.');
    const res = await fetch(config.supabaseUrl + '/functions/v1/manage-enquiries', {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: config.supabaseAnonKey, Authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify(input)
    });
    const json = await res.json();
    if (!res.ok) throw Error(json.error || 'Request failed');
    return json;
  }
  function emailDraftHref(recipient, subject, body) {
    // mailto bodies use CRLF line endings, encoded as %0D%0A.
    const message = body.replace(/\r?\n/g, '\r\n');
    return 'mailto:' + encodeURIComponent(recipient) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(message);
  }
  function field(label, type, required = true) {
    const wrap = document.createElement('label');
    wrap.textContent = label + ' ';
    const input = document.createElement('input');
    input.type = type; input.required = required;
    wrap.append(input);
    return [wrap, input];
  }
  async function refresh() {
    status.textContent = 'Loading…';
    try {
      const data = await api({ action: 'list' });
      orders.replaceChildren();
      const signedInAs = data.administrator || 'Administrator';
      const orderMap = new Map((data.orders || []).map(order => [order.enquiry_id, order]));
      for (const enquiry of data.enquiries) {
        const section = document.createElement('section');
        section.style.cssText = 'border:1px solid #ddd;border-radius:12px;padding:20px;margin:20px 0';
        const existingOrder = orderMap.get(enquiry.id);
        const heading = document.createElement('h2');
        heading.textContent = enquiry.reference + ' — ' + enquiry.status;
        section.append(heading);
        const summary = document.createElement('p');
        summary.textContent = enquiry.customer_name + ' (' + enquiry.customer_email + ') — ' + enquiry.fulfilment + ' — requested ' + enquiry.preferred_date;
        section.append(summary);
        const items = document.createElement('p');
        items.textContent = enquiry.items.map(i => i.quantity + ' × ' + i.name).join('; ') || 'Custom enquiry';
        section.append(items);
        const notes = document.createElement('p');
        notes.textContent = 'Requirements: ' + enquiry.notes + (enquiry.delivery_address ? ' | Address: ' + enquiry.delivery_address : '');
        section.append(notes);
        const contact = document.createElement('p');
        contact.textContent = 'Correspondence is handled manually via Hotmail or WhatsApp. An email draft does not send itself.';
        section.append(contact);
        if (Array.isArray(enquiry.replies) && enquiry.replies.length) {
          const history = document.createElement('details');
          const summary = document.createElement('summary');
          summary.textContent = 'Replies sent (' + enquiry.replies.length + ')';
          history.append(summary);
          for (const entry of enquiry.replies) {
            const sent = document.createElement('p');
            sent.textContent = new Date(entry.sent_at).toLocaleString('en-GB') + ': ' + entry.message;
            history.append(sent);
          }
          section.append(history);
        }
        const replyForm = document.createElement('form');
        replyForm.className = 'admin-reply-form';
        const replyLabel = document.createElement('label');
        replyLabel.textContent = 'Compose a reply (opens Hotmail or your email app)';
        const replyText = document.createElement('textarea');
        replyText.rows = 3;
        replyText.maxLength = 2000;
        replyText.required = true;
        replyText.placeholder = 'Ask a question or reply to the customer…';
        replyLabel.append(replyText);
        const replyButton = document.createElement('button');
        replyButton.type = 'submit';
        replyButton.textContent = 'Open email draft';
        replyButton.className = 'button button-outline';
        replyForm.append(replyLabel, replyButton);
        replyForm.addEventListener('submit', event => {
          event.preventDefault();
          if (!replyForm.reportValidity()) return;
          const subject = 'Cakes by Sharn enquiry ' + enquiry.reference;
          const body = 'Hello ' + enquiry.customer_name + ',\n\n' + replyText.value.trim() + '\n\nReference: ' + enquiry.reference + '\nCakes by Sharn';
          window.location.href = emailDraftHref(enquiry.customer_email, subject, body);
          status.textContent = 'Email draft opened. Send it from Hotmail, then record the reply if sent.';
        });
        const logReply = document.createElement('button');
        logReply.type = 'button';
        logReply.className = 'button button-outline';
        logReply.textContent = 'Record reply sent';
        logReply.addEventListener('click', async () => {
          const message = replyText.value.trim();
          if (!message) { status.textContent = 'Write the reply before recording it.'; return; }
          if (!window.confirm('Have you actually sent this reply to the customer?')) return;
          logReply.disabled = true;
          try { await api({ action: 'log-reply', id: enquiry.id, message }); await refresh(); }
          catch (error) { status.textContent = error.message; logReply.disabled = false; }
        });
        replyForm.append(logReply);
        section.append(replyForm);
        if (existingOrder) {
          const orderInfo = document.createElement('p');
          orderInfo.textContent = 'ORDER CREATED: ' + existingOrder.order_reference + ' — £' + (existingOrder.total_pence / 100).toFixed(2) + ' — ' + existingOrder.agreed_date + ' (' + existingOrder.agreed_time + ').';
          section.append(orderInfo);
          const orderItems = enquiry.items.map(i => '- ' + i.quantity + ' × ' + i.name);
          const orderMessage = [
            'Hello ' + enquiry.customer_name + ',',
            '',
            'Your Cakes by Sharn order has been created and approved.',
            '',
            'Order reference: ' + existingOrder.order_reference,
            'Enquiry reference: ' + enquiry.reference,
            '',
            'Items:',
            ...(orderItems.length ? orderItems : ['Custom request']),
            '',
            'Total: £' + (existingOrder.total_pence / 100).toFixed(2),
            (existingOrder.fulfilment === 'delivery' ? 'Delivery' : 'Collection') +
              ': ' + existingOrder.agreed_date + ' — ' + existingOrder.agreed_time,
            ...(existingOrder.notes ? ['', 'Notes: ' + existingOrder.notes] : []),
            '',
            'Cakes by Sharn'
          ].join('\n');
          const notifyLink = document.createElement('a');
          notifyLink.className = 'button button-outline';
          notifyLink.textContent = 'Open order confirmation email';
          notifyLink.href = emailDraftHref(enquiry.customer_email, 'Cakes by Sharn — order ' + existingOrder.order_reference, orderMessage);
          section.append(notifyLink);
          const notified = document.createElement('p');
          notified.textContent = existingOrder.customer_notified_at ? 'Customer notification recorded: ' + new Date(existingOrder.customer_notified_at).toLocaleString('en-GB') + ' (' + existingOrder.notification_method + ')' : 'Customer has not yet been marked notified.';
          section.append(notified);
          if (!existingOrder.customer_notified_at) {
            for (const method of ['email', 'whatsapp']) {
              const mark = document.createElement('button');
              mark.type = 'button';
              mark.className = 'button button-outline';
              mark.textContent = 'Mark notified via ' + method;
              mark.addEventListener('click', async () => {
                if (!window.confirm('Confirm you have sent the order details to the customer via ' + method + '?')) return;
                mark.disabled = true;
                try { await api({ action: 'mark-notified', id: enquiry.id, method }); await refresh(); }
                catch (error) { status.textContent = error.message; mark.disabled = false; }
              });
              section.append(mark);
            }
          }
        }
        if (enquiry.status === 'pending') {
          const form = document.createElement('form');
          const [dateWrap, date] = field('Confirmed date', 'date');
          date.value = enquiry.preferred_date;
          const [timeWrap, time] = field('Collection/delivery time or window', 'text');
          const [priceWrap, price] = field('Final total (£)', 'number');
          price.min = '0'; price.step = '0.01';
          const [noteWrap, note] = field('Message to customer', 'text', false);
          form.append(dateWrap, timeWrap, priceWrap, noteWrap);
          const confirm = document.createElement('button');
          confirm.type = 'submit'; confirm.textContent = 'Approve & create order'; confirm.className = 'button button-primary';
          const decline = document.createElement('button');
          decline.type = 'button'; decline.textContent = 'Decline enquiry'; decline.className = 'button button-outline';
          form.append(confirm, decline);
          async function action(kind) {
            if (kind === 'confirm' && !form.reportValidity()) return;
            if (!window.confirm(kind === 'confirm' ? 'Approve this enquiry and create a real order? You must notify the customer separately.' : 'Decline this enquiry? You must notify the customer separately.')) return;
            confirm.disabled = decline.disabled = true;
            status.textContent = 'Processing ' + enquiry.reference + '…';
            try {
              await api({ action: kind, id: enquiry.id, confirmedDate: date.value, confirmedTime: time.value,
                finalTotalPence: Math.round(Number(price.value) * 100), notes: note.value });
              await refresh();
            } catch (error) { status.textContent = error.message; confirm.disabled = decline.disabled = false; }
          }
          form.addEventListener('submit', event => { event.preventDefault(); action('confirm'); });
          decline.addEventListener('click', () => action('decline'));
          section.append(form);
        }
        orders.append(section);
      }
      status.textContent = signedInAs + ': ' + data.enquiries.length + ' enquiries loaded; ' + (data.orders || []).length + ' orders created.';
    } catch (error) { status.textContent = error.message; }
  }
  document.querySelector('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    status.textContent = 'Signing in…';
    const { error } = await client.auth.signInWithPassword({
      email: document.querySelector('#admin-email').value,
      password: document.querySelector('#admin-password').value
    });
    if (error) { status.textContent = error.message; return; }
    login.hidden = true; dashboard.hidden = false; await refresh();
  });
  document.querySelector('#admin-refresh').addEventListener('click', refresh);
  document.querySelector('#admin-signout').addEventListener('click', async () => {
    await client.auth.signOut(); dashboard.hidden = true; login.hidden = false; orders.replaceChildren();
  });
  const { data: { session } } = await client.auth.getSession();
  if (session) { login.hidden = true; dashboard.hidden = false; await refresh(); }
})();
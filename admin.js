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

  const metrics = document.querySelector('#admin-metrics');
  const empty = document.querySelector('#admin-empty');
  const search = document.querySelector('#admin-search');
  const filter = document.querySelector('#admin-filter');
  const sessionActions = document.querySelector('#admin-session-actions');
  let records = [];
  let orderMap = new Map();
  let administrator = 'Administrator';
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function formatDate(value) {
    if (!value) return 'Not specified';
    const date = new Date(value + 'T12:00:00');
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
  }
  function contactMethod(enquiry) { return enquiry.contact_method || 'email'; }
  function contactLabel(method) { return method === 'sms' ? 'Text message' : method === 'whatsapp' ? 'WhatsApp' : 'Email'; }
  function contactValue(enquiry) { return contactMethod(enquiry) === 'email' ? enquiry.customer_email : enquiry.customer_mobile; }
  function statusLabel(value) { return value === 'confirmed' ? 'Approved' : value === 'declined' ? 'Declined' : 'Pending'; }
  function messageLink(enquiry, message, subject) {
    const method = contactMethod(enquiry);
    if (method === 'email') return emailDraftHref(enquiry.customer_email, subject, message);
    if (method === 'whatsapp') return 'https://wa.me/' + enquiry.customer_mobile.replace(/\D/g, '') + '?text=' + encodeURIComponent(message);
    return 'sms:' + enquiry.customer_mobile + '?body=' + encodeURIComponent(message);
  }
  function messageAction(enquiry, message, subject, label) {
    const link = el('a', 'button button-outline admin-action-link', label || 'Open ' + contactLabel(contactMethod(enquiry)));
    link.href = messageLink(enquiry, message, subject);
    if (contactMethod(enquiry) === 'whatsapp') { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    return link;
  }
  function copyAction(message) {
    const button = el('button', 'button button-outline', 'Copy message');
    button.type = 'button';
    button.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(message); status.textContent = 'Message copied. Paste it into your messaging app and send it manually.'; }
      catch { status.textContent = 'Unable to copy automatically. Select and copy the message from the text box.'; }
    });
    return button;
  }
  function detailLine(label, value) {
    const wrap = el('div', 'admin-detail-field');
    wrap.append(el('span', 'admin-detail-label', label), el('span', '', value || '—'));
    return wrap;
  }
  function renderRecord(enquiry) {
    const order = orderMap.get(enquiry.id);
    const method = contactMethod(enquiry);
    const details = el('details', 'admin-record');
    const summary = el('summary', 'admin-record-summary');
    const customer = el('span', 'admin-record-customer');
    customer.append(el('strong', '', enquiry.customer_name), el('small', '', enquiry.reference));
    const requested = el('span', 'admin-record-date', formatDate(enquiry.preferred_date));
    const contact = el('span', 'admin-record-contact', contactLabel(method));
    const state = el('span', 'admin-state admin-state-' + enquiry.status, statusLabel(enquiry.status));
    summary.append(customer, requested, contact, state, el('span', 'admin-record-chevron', '⌄'));
    details.append(summary);
    const panel = el('div', 'admin-record-panel');
    const info = el('div', 'admin-detail-grid');
    info.append(
      detailLine('Customer', enquiry.customer_name),
      detailLine('Preferred contact', contactLabel(method)),
      detailLine(method === 'email' ? 'Email address' : 'UK mobile number', contactValue(enquiry)),
      detailLine('Requested date', formatDate(enquiry.preferred_date)),
      detailLine('Fulfilment', enquiry.fulfilment === 'delivery' ? 'Delivery' : 'Collection'),
      detailLine('Received', new Date(enquiry.created_at).toLocaleString('en-GB'))
    );
    if (enquiry.delivery_address) info.append(detailLine('Delivery address', enquiry.delivery_address));
    panel.append(info);
    const items = el('div', 'admin-detail-section');
    items.append(el('h3', '', 'Order request'));
    const ul = el('ul', 'admin-item-list');
    (enquiry.items || []).forEach(item => ul.append(el('li', '', item.quantity + ' × ' + item.name)));
    if (!ul.children.length) ul.append(el('li', '', 'Custom request'));
    items.append(ul);
    if (enquiry.notes) items.append(detailLine('Customer requirements', enquiry.notes));
    panel.append(items);
    if (enquiry.replies && enquiry.replies.length) {
      const history = el('div', 'admin-detail-section');
      history.append(el('h3', '', 'Correspondence history'));
      enquiry.replies.forEach(reply => history.append(el('p', 'admin-history-entry', new Date(reply.sent_at).toLocaleString('en-GB') + ' — ' + reply.message)));
      panel.append(history);
    }
    const reply = el('div', 'admin-detail-section');
    reply.append(el('h3', '', 'Reply to customer'));
    reply.append(el('p', 'admin-muted', 'Messages open in your chosen app; they are not sent automatically. Record the reply only after sending it.'));
    const replyForm = el('form', 'admin-reply-form');
    const replyLabel = el('label', '', 'Your message');
    const replyText = document.createElement('textarea');
    replyText.rows = 3; replyText.maxLength = 2000; replyText.required = true;
    replyText.placeholder = 'Write a reply for ' + enquiry.customer_name + '…';
    replyLabel.append(replyText);
    const replyActions = el('div', 'admin-actions');
    const draft = messageAction(enquiry, '', 'Cakes by Sharn enquiry ' + enquiry.reference, 'Open ' + contactLabel(method));
    const recordReply = el('button', 'button button-outline', 'Record reply sent');
    recordReply.type = 'button';
    const copy = copyAction('');
    function composedReply() {
      return ['Hello ' + enquiry.customer_name + ',', '', replyText.value.trim(), '', 'Enquiry reference: ' + enquiry.reference, 'Cakes by Sharn'].join('\n');
    }
    draft.addEventListener('click', event => {
      if (!replyText.value.trim()) { event.preventDefault(); replyText.reportValidity(); return; }
      draft.href = messageLink(enquiry, composedReply(), 'Cakes by Sharn enquiry ' + enquiry.reference);
      status.textContent = 'Draft opened. Send the message, then record it here.';
    });
    copy.addEventListener('click', event => {
      event.stopImmediatePropagation();
      if (!replyText.value.trim()) { replyText.reportValidity(); return; }
      navigator.clipboard.writeText(composedReply()).then(() => { status.textContent = 'Reply copied. Send it manually.'; }).catch(() => { status.textContent = 'Copy unavailable in this browser.'; });
    }, true);
    recordReply.addEventListener('click', async () => {
      const message = replyText.value.trim();
      if (!message) { replyText.reportValidity(); return; }
      if (!window.confirm('Have you already sent this reply via ' + contactLabel(method) + '?')) return;
      recordReply.disabled = true;
      try { await api({action:'log-reply', id:enquiry.id, message}); await refresh(); }
      catch(error) { status.textContent = error.message; recordReply.disabled = false; }
    });
    replyActions.append(draft, copy, recordReply);
    replyForm.append(replyLabel, replyActions);
    reply.append(replyForm); panel.append(reply);
    if (order) {
      const box = el('div', 'admin-detail-section admin-order-section');
      box.append(el('h3', '', 'Approved order'));
      const orderInfo = el('div', 'admin-detail-grid');
      orderInfo.append(
        detailLine('Order reference', order.order_reference),
        detailLine('Agreed total', '£' + (order.total_pence / 100).toFixed(2)),
        detailLine('Agreed date', formatDate(order.agreed_date)),
        detailLine('Agreed time', order.agreed_time),
        detailLine('Customer notification', order.customer_notified_at ? 'Recorded · ' + new Date(order.customer_notified_at).toLocaleString('en-GB') : 'Awaiting manual confirmation')
      );
      box.append(orderInfo);
      const orderMessage = [
        'Hello ' + enquiry.customer_name + ',', '',
        'Your Cakes by Sharn order has been created and approved.', '',
        'Order reference: ' + order.order_reference,
        'Enquiry reference: ' + enquiry.reference, '',
        'Items:', ...(enquiry.items.length ? enquiry.items.map(i => '- ' + i.quantity + ' × ' + i.name) : ['Custom request']), '',
        'Total: £' + (order.total_pence / 100).toFixed(2),
        (order.fulfilment === 'delivery' ? 'Delivery' : 'Collection') + ': ' + order.agreed_date + ' — ' + order.agreed_time,
        ...(order.notes ? ['', 'Notes: ' + order.notes] : []), '',
        'Cakes by Sharn'
      ].join('\n');
      const actions = el('div', 'admin-actions');
      actions.append(messageAction(enquiry, orderMessage, 'Cakes by Sharn — order ' + order.order_reference, 'Open order confirmation via ' + contactLabel(method)));
      const copyOrder = el('button', 'button button-outline', 'Copy confirmation');
      copyOrder.type = 'button';
      copyOrder.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(orderMessage); status.textContent = 'Order confirmation copied.'; }
        catch { status.textContent = 'Unable to copy message automatically.'; }
      });
      actions.append(copyOrder);
      if (!order.customer_notified_at) {
        const notified = el('button', 'button button-primary', 'Mark customer notified');
        notified.type = 'button';
        notified.addEventListener('click', async () => {
          if (!window.confirm('Have you sent this order confirmation via ' + contactLabel(method) + '?')) return;
          notified.disabled = true;
          try { await api({action:'mark-notified',id:enquiry.id,method}); await refresh(); }
          catch(error) { status.textContent = error.message; notified.disabled = false; }
        });
        actions.append(notified);
      }
      box.append(actions); panel.append(box);
    }
    if (enquiry.status === 'pending') {
      const actionBox = el('div', 'admin-detail-section admin-decision-section');
      actionBox.append(el('h3', '', 'Review & decide'));
      const form = el('form', 'admin-decision-form');
      const [dateWrap,date] = field('Agreed date','date');
      date.value = enquiry.preferred_date;
      date.min = new Date().toISOString().slice(0,10);
      const [timeWrap,time] = field('Collection / delivery time','text');
      const [priceWrap,price] = field('Final price (£)','number');
      price.min='0'; price.step='0.01';
      const [noteWrap,note] = field('Internal order notes','text',false);
      const approve = el('button','button button-primary','Approve & create order');
      approve.type='submit';
      const decline = el('button','button button-outline','Decline enquiry');
      decline.type='button';
      const actions = el('div','admin-actions');
      actions.append(approve,decline);
      form.append(dateWrap,timeWrap,priceWrap,noteWrap,actions);
      async function decide(action) {
        if (action === 'confirm' && !form.reportValidity()) return;
        if (!window.confirm(action === 'confirm' ? 'Approve this enquiry and create an order? You must notify the customer separately.' : 'Decline this enquiry? You must notify the customer separately.')) return;
        approve.disabled=decline.disabled=true;
        status.textContent='Processing ' + enquiry.reference + '…';
        try {
          await api({action,id:enquiry.id,confirmedDate:date.value,confirmedTime:time.value,
            finalTotalPence:Math.round(Number(price.value)*100),notes:note.value});
          await refresh();
        } catch(error) { status.textContent=error.message; approve.disabled=decline.disabled=false; }
      }
      form.addEventListener('submit', event => { event.preventDefault(); decide('confirm'); });
      decline.addEventListener('click', () => decide('decline'));
      actionBox.append(form); panel.append(actionBox);
    }
    details.append(panel);
    return details;
  }
  function renderRecords() {
    const term = search.value.trim().toLowerCase();
    const selected = filter.value;
    orders.replaceChildren();
    const matching = records.filter(enquiry => (selected === 'all' || enquiry.status === selected) &&
      [enquiry.customer_name, enquiry.reference, enquiry.customer_email, enquiry.customer_mobile, enquiry.items.map(i => i.name).join(' ')]
        .some(value => String(value || '').toLowerCase().includes(term)));
    matching.forEach(enquiry => orders.append(renderRecord(enquiry)));
    empty.hidden = matching.length > 0;
    document.querySelector('#admin-list-caption').textContent = matching.length + ' of ' + records.length + ' enquiries · Select a row to see details and actions';
  }
  function renderMetrics() {
    const stats = [
      ['Total enquiries',records.length,'all'],
      ['Awaiting review',records.filter(e => e.status === 'pending').length,'pending'],
      ['Approved orders',records.filter(e => e.status === 'confirmed').length,'confirmed'],
      ['Declined',records.filter(e => e.status === 'declined').length,'declined']
    ];
    metrics.replaceChildren();
    stats.forEach(([label,value,target]) => {
      const tile = el('button','admin-metric');
      tile.type = 'button';
      tile.append(el('span','admin-metric-label',label),el('strong','admin-metric-value',String(value)));
      tile.addEventListener('click', () => { filter.value=target; renderRecords(); });
      metrics.append(tile);
    });
  }
  async function refresh() {
    status.textContent='Loading enquiries…';
    try {
      const data = await api({action:'list'});
      records=data.enquiries || [];
      administrator=data.administrator || 'Administrator';
      orderMap=new Map((data.orders || []).map(order => [order.enquiry_id,order]));
      renderMetrics(); renderRecords();
      status.textContent=administrator + ' · ' + records.length + ' enquiries · ' + (data.orders || []).length + ' orders';
    } catch(error) { status.textContent=error.message; }
  }
  search.addEventListener('input',renderRecords);
  filter.addEventListener('change',renderRecords);
  document.querySelector('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    status.textContent = 'Signing in…';
    const { error } = await client.auth.signInWithPassword({
      email: document.querySelector('#admin-email').value,
      password: document.querySelector('#admin-password').value
    });
    if (error) { status.textContent = error.message; return; }
    login.hidden = true; dashboard.hidden = false; sessionActions.hidden = false; await refresh();
  });
  document.querySelector('#admin-refresh').addEventListener('click', refresh);
  document.querySelector('#admin-signout').addEventListener('click', async () => {
    await client.auth.signOut(); dashboard.hidden = true; sessionActions.hidden = true; login.hidden = false; orders.replaceChildren();
  });
  const { data: { session } } = await client.auth.getSession();
  if (session) { login.hidden = true; dashboard.hidden = false; await refresh(); }
})();
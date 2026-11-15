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
      for (const enquiry of data.enquiries) {
        const section = document.createElement('section');
        section.style.cssText = 'border:1px solid #ddd;border-radius:12px;padding:20px;margin:20px 0';
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
          confirm.type = 'submit'; confirm.textContent = 'Confirm and email customer'; confirm.className = 'button button-primary';
          const decline = document.createElement('button');
          decline.type = 'button'; decline.textContent = 'Decline and email customer'; decline.className = 'button button-outline';
          form.append(confirm, decline);
          async function action(kind) {
            if (kind === 'confirm' && !form.reportValidity()) return;
            if (!window.confirm('Email customer and ' + kind + ' this enquiry?')) return;
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
      status.textContent = data.enquiries.length + ' enquiries loaded.';
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
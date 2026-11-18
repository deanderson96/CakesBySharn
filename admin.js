(async () => {
  const config = window.CAKES_ORDER_CONFIG || {};
  const status = document.querySelector('#admin-status');
  if (!config.supabaseUrl || !config.supabaseAnonKey) { status.textContent = 'Order backend is not configured yet.'; return; }
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const client = createClient(config.supabaseUrl, config.supabaseAnonKey);
  const login = document.querySelector('#admin-login');
  const magicLink = document.querySelector('#admin-magic-link');
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

  const taxYearSelect = document.querySelector('#admin-tax-year');
  const taxReportButton = document.querySelector('#admin-tax-report');
  const londonToday = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const [currentYear,currentMonth,currentDay] = londonToday.split('-').map(Number);
  const currentTaxStart = currentMonth < 4 || (currentMonth === 4 && currentDay < 6) ? currentYear - 1 : currentYear;
  for (let year=currentTaxStart;year>=2020;year--) {
    const option = document.createElement('option');
    option.value = String(year);
    option.textContent = year + '–' + String(year+1).slice(-2) + (year===currentTaxStart?' (current)':'');
    taxYearSelect.append(option);
  }
  taxYearSelect.value = String(currentTaxStart-1 >= 2020 ? currentTaxStart-1 : currentTaxStart);
  function htmlEscape(value) {
    return String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }
  function downloadReport(content,filename) {
    const blob = new Blob([content],{type:'text/html;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href=url; link.download=filename; document.body.append(link); link.click(); link.remove();
    URL.revokeObjectURL(url);
  }
  taxReportButton.addEventListener('click',async()=>{
    taxReportButton.disabled=true; status.textContent='Preparing annual tax report…';
    try {
      const {report} = await api({action:'tax-year-report',startYear:Number(taxYearSelect.value)});
      const rows = (report.orders||[]).map(order=>'<tr><td>'+htmlEscape(order.order_reference)+'</td><td>'+htmlEscape(new Date(order.ordered_at).toLocaleDateString('en-GB',{timeZone:'Europe/London'}))+'</td><td>'+htmlEscape(order.customer_name)+'</td><td>'+htmlEscape((Array.isArray(order.items)?order.items:[]).map(item=>String(item.quantity??1)+' × '+String(item.name||'')).join('; '))+'</td><td>£'+(Number(order.total_pence)/100).toFixed(2)+'</td></tr>').join('');
      const enquiries = (report.enquiries||[]).map(item=>'<tr><td>'+htmlEscape(item.reference)+'</td><td>'+htmlEscape(new Date(item.created_at).toLocaleDateString('en-GB',{timeZone:'Europe/London'}))+'</td><td>'+htmlEscape(item.status)+'</td></tr>').join('');
      const year = Number(report.start_year);
      const document = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Cakes by Sharn UK tax-year report '+year+'–'+(year+1)+'</title><style>body{font:14px Arial,sans-serif;color:#173f39;max-width:1100px;margin:36px auto;padding:0 20px}h1,h2{color:#087d7b}table{width:100%;border-collapse:collapse;margin:20px 0}td,th{border-bottom:1px solid #d8e9e5;text-align:left;padding:10px;vertical-align:top}th{background:#e9f7f4}.note{background:#fff4df;padding:15px;line-height:1.6}.summary{font-size:18px;font-weight:bold}@media print{body{margin:10mm}}</style></head><body><h1>Cakes by Sharn — annual tax-year report</h1><p>UK tax year: 6 April '+year+' to 5 April '+(year+1)+' (Europe/London)</p><p>Generated: '+htmlEscape(new Date().toLocaleString('en-GB',{timeZone:'Europe/London'}))+'</p><p class="summary">Orders: '+Number(report.order_count)+' · Total agreed charges: £'+(Number(report.agreed_order_total_pence)/100).toFixed(2)+'</p><div class="note"><strong>Bookkeeping working paper — not a tax return.</strong> These are agreed order charges grouped by order creation date, not confirmed receipts. Receipts and expenses are self-recorded and may be incomplete. VAT is not tracked. Reconcile against invoices, bank statements and expenses, and apply the correct accounting basis before filing.</div><h2>Approved orders</h2><table><thead><tr><th>Reference</th><th>Created</th><th>Customer</th><th>Items</th><th>Agreed charge</th></tr></thead><tbody>'+rows+'</tbody></table><h2>Enquiry audit register</h2><p>'+Number((report.enquiries||[]).length)+' enquiries recorded in this tax year.</p><table><thead><tr><th>Reference</th><th>Received</th><th>Status</th></tr></thead><tbody>'+enquiries+'</tbody></table></body></html>';

      const paymentRows=(report.payment_entries||[]).map(p=>'<tr><td>'+htmlEscape(p.paid_on)+
        '</td><td>'+htmlEscape(p.order_reference)+'</td><td>'+htmlEscape(p.event_type)+
        '</td><td>'+htmlEscape(p.method)+'</td><td>£'+(Number(p.amount_pence)/100).toFixed(2)+'</td></tr>').join('');
      const expenseRows=(report.expense_entries||[]).map(e=>'<tr><td>'+htmlEscape(e.spent_on)+
        '</td><td>'+htmlEscape(e.category)+'</td><td>'+htmlEscape(e.supplier)+
        '</td><td>'+htmlEscape(e.description)+'</td><td>£'+(Number(e.amount_pence)/100).toFixed(2)+'</td></tr>').join('');
      const recordedReceipts=Number(report.recorded_receipts_pence||0);
      const recordedRefunds=Number(report.recorded_refunds_pence||0);
      const recordedExpenses=Number(report.recorded_expenses_pence||0);
      const cashInfo='<h2>Recorded cash activity</h2><p class="summary">Receipts: £'+(recordedReceipts/100).toFixed(2)+
        ' · Refunds: £'+(recordedRefunds/100).toFixed(2)+
        ' · Expenses: £'+(recordedExpenses/100).toFixed(2)+
        ' · Provisional difference: £'+(Number(report.recorded_cash_difference_pence||0)/100).toFixed(2)+'</p>'+
        '<p class="note">Figures cover only entries manually recorded in this application. Missing receipts, expenses or refunds are excluded. This is not verified bank reconciliation, taxable profit or a filed return. Check the chosen accounting basis and underlying evidence.</p>'+
        '<h2>Receipts and refunds register</h2><table><thead><tr><th>Paid on</th><th>Order</th><th>Type</th><th>Method</th><th>Amount</th></tr></thead><tbody>'+
        paymentRows+'</tbody></table>'+
        '<h2>Expense register</h2><table><thead><tr><th>Spent on</th><th>Category</th><th>Supplier</th><th>Description</th><th>Amount</th></tr></thead><tbody>'+
        expenseRows+'</tbody></table>';
      const annualDocument=document.replace('</body></html>',cashInfo+'</body></html>');
      downloadReport(annualDocument,'cakes-by-sharn-tax-year-'+year+'-'+(year+1)+'.html');
      status.textContent='Annual report prepared. Open the downloaded HTML document in a browser to print or save as PDF.';
    } catch(error) {status.textContent='Tax report failed: '+error.message;}
    finally {taxReportButton.disabled=false;}
  });

  const expenseForm=document.querySelector('#admin-expense-form');
  const todayLondon=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  expenseForm.elements.namedItem('spentOn').value=todayLondon();
  expenseForm.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!expenseForm.reportValidity())return;
    const button=expenseForm.querySelector('[type="submit"]');
    if(!window.confirm('Record this expense permanently? Verify the receipt or invoice before continuing.'))return;
    button.disabled=true;
    try{
      const v=name=>expenseForm.elements.namedItem(name).value;
      await api({action:'record-expense',date:v('spentOn'),category:v('category'),
        supplier:v('supplier'),description:v('description'),amountPence:Math.round(Number(v('amount'))*100),
        evidenceReference:v('reference')});
      expenseForm.reset();expenseForm.elements.namedItem('spentOn').value=todayLondon();
      status.textContent='Expense recorded. Keep the supporting evidence securely.';
    }catch(error){status.textContent='Expense not recorded: '+error.message;}
    finally{button.disabled=false;}
  });
  document.querySelector('#admin-export-ledger').addEventListener('click',async event=>{
    const button=event.currentTarget;
    button.disabled=true;status.textContent='Preparing financial ledger…';
    try{
      const {ledger}=await api({action:'financial-export'});
      const header=['Record type','Date','Order','Category','Supplier','Description','Method','Evidence reference','Amount GBP'];
      const rows=[
        ...(ledger.payments||[]).map(p=>[
          p.event_type==='refund'?'Refund':'Receipt',p.paid_on,p.order_reference,
          '','','',p.payment_method,p.external_reference,
          ((p.event_type==='refund'?-1:1)*Number(p.amount_pence)/100).toFixed(2)
        ]),
        ...(ledger.expenses||[]).map(e=>[
          'Expense',e.spent_on,'',e.category,e.supplier,e.description,'',
          e.evidence_reference,(-Number(e.amount_pence)/100).toFixed(2)
        ])
      ];
      const csv='\uFEFF'+[header,...rows].map(row=>row.map(safeCsvCell).join(',')).join('\r\n')+'\r\n';
      const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');link.href=url;
      link.download='cakes-by-sharn-ledger-'+todayLondon()+'.csv';
      document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);
      status.textContent='Financial ledger exported: '+rows.length+' entries. Store the file securely.';
    }catch(error){status.textContent='Ledger export unavailable: '+error.message;}
    finally{button.disabled=false;}
  });
  const accountingExport = document.querySelector('#admin-export-accounting');
  function safeCsvCell(value) {
    let text = String(value ?? '').replace(/\r\n?/g, '\n');
    if (/^[\s]*[=+@\-\t]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }
  accountingExport.addEventListener('click', async () => {
    accountingExport.disabled = true;
    status.textContent = 'Preparing accounting export…';
    try {
      const result = await api({action:'accounting-export'});
      const header = ['Order reference','Order created','Customer','Items','Agreed total GBP','Fulfilment','Agreed date','Archived'];
      const rows = (result.orders || []).map(order => [
        order.order_reference,
        order.order_created_at,
        order.customer_name,
        (Array.isArray(order.items) ? order.items : []).map(item => String(item.quantity ?? 1) + ' x ' + String(item.name || '')).join('; '),
        (Number(order.agreed_total_pence) / 100).toFixed(2),
        order.fulfilment,
        order.agreed_date,
        order.archived ? 'Yes' : 'No'
      ]);
      const csv = '\uFEFF' + [header,...rows].map(row => row.map(safeCsvCell).join(',')).join('\r\n') + '\r\n';
      const blob = new Blob([csv],{type:'text/csv;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'cakes-by-sharn-accounting-' + new Date().toISOString().slice(0,10) + '.csv';
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      status.textContent = 'Accounting CSV prepared with ' + rows.length + ' current and archived orders. Store it securely.';
    } catch(error) { status.textContent = 'Export failed: ' + error.message; }
    finally { accountingExport.disabled = false; }
  });
  const metrics = document.querySelector('#admin-metrics');
  const empty = document.querySelector('#admin-empty');
  const search = document.querySelector('#admin-search');
  const filter = document.querySelector('#admin-filter');
  const sessionActions = document.querySelector('#admin-session-actions');
  let records = [];
  let orderMap = new Map();
  let administrator='Administrator';
  let adminRole='operator';
  let pageOffset=0,matchingTotal=0;
  let pageCounts={pending:0,confirmed:0,declined:0};
  const pageSize=25;
  // Selection persists across paginated pages, but never across sign-outs.
  const selectedForDeletion = new Map();
  const deleteTools = document.querySelector('#admin-owner-delete-tools');
  const selectPage = document.querySelector('#admin-select-page');
  const selectedCount = document.querySelector('#admin-selected-count');
  const deleteSelectedButton = document.querySelector('#admin-delete-selected');
  const showDeletedButton = document.querySelector('#admin-show-deleted');
  const deletedPanel = document.querySelector('#admin-deleted-panel');
  const deletedList = document.querySelector('#admin-deleted-list');

  function updateDeleteSelection() {
    const owner = adminRole === 'owner';
    deleteTools.hidden = !owner;
    if (!owner) selectedForDeletion.clear();
    selectedCount.textContent = selectedForDeletion.size + ' selected across pages';
    deleteSelectedButton.disabled = !owner || selectedForDeletion.size === 0 || selectedForDeletion.size > 100;
    const countOnPage = records.filter(enquiry => selectedForDeletion.has(enquiry.id)).length;
    selectPage.checked = owner && records.length > 0 && countOnPage === records.length;
    selectPage.indeterminate = owner && countOnPage > 0 && countOnPage < records.length;
    selectPage.disabled = !owner || !records.length;
    if (!owner) { deletedPanel.hidden=true; showDeletedButton.setAttribute('aria-expanded','false'); }
  }

  async function deleteRecords(items) {
    if (adminRole !== 'owner' || !items.length || items.length > 100) return;
    const count = items.length;
    const examples = items.slice(0, 4).map(item => item.reference).join(', ');
    const confirmation = 'DELETE ' + count;
    const typed = window.prompt(
      'DEAN-ONLY DELETE: Remove ' + count + ' enquiry record(s) and their linked orders from the active screen?\n' +
      'Examples: ' + examples + (count > 4 ? ', ...' : '') + '\n' +
      'Records and financial history will be retained securely and can be restored.\n' +
      'Type ' + confirmation + ' to continue.'
    );
    if (typed === null) return;
    if (typed.trim() !== confirmation) {
      status.textContent='Deletion cancelled: confirmation text did not match.';
      return;
    }
    const reason = window.prompt('Reason for deletion (10–500 characters; recorded in the owner audit log):');
    if (reason === null) return;
    if (reason.trim().length < 10 || reason.trim().length > 500) {
      status.textContent='Deletion cancelled: enter a reason of 10–500 characters.';
      return;
    }
    if (!window.confirm('Final confirmation: remove ' + count +
      ' enquiry(s) and linked orders from the active screen? This does not erase accounting or audit records.')) return;
    deleteSelectedButton.disabled=true;
    status.textContent='Removing selected records from active Orders…';
    try {
      const result = await api({ action:'owner-delete-records', ids:items.map(item=>item.id),
        confirmation, reason:reason.trim() });
      selectedForDeletion.clear();
      if (pageOffset >= matchingTotal - count) pageOffset = Math.max(0,pageOffset-pageSize);
      await refresh();
      if (!deletedPanel.hidden) await loadDeletedRecords();
      status.textContent='Deleted from active Orders: ' + result.result.deleted_enquiries +
        ' enquiry(s), ' + result.result.deleted_orders + ' linked order(s). Records are recoverable.';
    } catch (error) {
      status.textContent='Deletion failed; no partial batch should be applied: ' + error.message;
      updateDeleteSelection();
    }
  }

  async function loadDeletedRecords() {
    if (adminRole !== 'owner') return;
    deletedList.replaceChildren(el('p','admin-muted','Loading deleted records…'));
    try {
      const result = await api({action:'owner-list-deleted'});
      deletedList.replaceChildren();
      const archived = result.records || [];
      if (!archived.length) {
        deletedList.append(el('p','admin-muted','No deleted enquiries or orders.'));
        return;
      }
      archived.forEach(enquiry => {
        const line = el('div','admin-deleted-row');
        line.setAttribute('role','listitem');
        const identity = el('div','admin-deleted-identity');
        identity.append(el('strong','',enquiry.reference),
          el('span','',enquiry.customer_name + ' · ' + (enquiry.order_reference || 'No linked order')),
          el('small','', 'Deleted ' + new Date(enquiry.deleted_at).toLocaleString('en-GB')));
        const restore = el('button','button button-outline','Restore');
        restore.type='button';
        restore.addEventListener('click',async () => {
          if (adminRole !== 'owner') return;
          const code = window.prompt('Restore ' + enquiry.reference +
            ' and any linked order? Type RESTORE 1 to confirm:');
          if (code === null) return;
          if (code.trim() !== 'RESTORE 1') {
            status.textContent='Restore cancelled: confirmation text did not match.';
            return;
          }
          restore.disabled=true;
          try {
            await api({action:'owner-restore-records',ids:[enquiry.id],confirmation:'RESTORE 1'});
            await refresh();
            await loadDeletedRecords();
            status.textContent='Restored ' + enquiry.reference + ' to active Orders.';
          } catch (error) { status.textContent='Restore failed: ' + error.message; restore.disabled=false; }
        });
        line.append(identity,restore);
        deletedList.append(line);
      });
    } catch(error) {
      deletedList.replaceChildren(el('p','admin-muted','Unable to load deleted records: '+error.message));
    }
  }

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
  const currency = new Intl.NumberFormat('en-GB', {style:'currency',currency:'GBP'});
  function money(pence) { return currency.format(pence / 100); }
  function unitPence(item) {
    return (item.priceType === 'fixed' || item.priceType === 'from') &&
      Number.isSafeInteger(item.estimatedUnitPence) && item.estimatedUnitPence >= 0 ? item.estimatedUnitPence : null;
  }
  function estimatePrices(items) {
    let total = 0, from = false, unpriced = items.length === 0;
    items.forEach(item => {
      const unit = unitPence(item), qty = Number(item.quantity);
      if (unit === null || !Number.isSafeInteger(qty) || qty < 1) { unpriced = true; return; }
      total += unit * qty;
      if (item.priceType === 'from') from = true;
    });
    return {total,from,unpriced};
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
    const summaryEstimate = estimatePrices(enquiry.items || []);
    const estimateBadge = el('span', 'admin-record-estimate', money(summaryEstimate.total) + (summaryEstimate.unpriced ? ' + quote' : summaryEstimate.from ? ' from' : ' est.'));
    if (adminRole === 'owner') {
      const cell = el('span','admin-record-customer-cell');
      const selection = document.createElement('input');
      selection.type='checkbox';
      selection.className='admin-record-delete-check';
      selection.setAttribute('aria-label','Select enquiry ' + enquiry.reference + ' and its linked order for deletion');
      selection.checked=selectedForDeletion.has(enquiry.id);
      selection.addEventListener('click',event=>event.stopPropagation());
      selection.addEventListener('change',() => {
        if (selection.checked) selectedForDeletion.set(enquiry.id, {
          id:enquiry.id,reference:enquiry.reference,orderReference:order?.order_reference||null
        });
        else selectedForDeletion.delete(enquiry.id);
        updateDeleteSelection();
      });
      cell.append(selection,customer);
      summary.append(cell, requested, contact, estimateBadge, state, el('span', 'admin-record-chevron', '⌄'));
    } else {
      summary.append(customer, requested, contact, estimateBadge, state, el('span', 'admin-record-chevron', '⌄'));
    }
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
    const priceSummary = estimatePrices(enquiry.items || []);
    const tableWrap = el('div', 'admin-price-table-wrap');
    const table = el('table', 'admin-price-table');
    const header = el('tr');
    ['Product', 'Qty', 'Unit price', 'Line total'].forEach(value => header.append(el('th', '', value)));
    const head = el('thead'); head.append(header); table.append(head);
    const body = el('tbody');
    (enquiry.items || []).forEach(item => {
      const row = el('tr');
      const name = el('td', 'admin-price-item');
      name.append(el('strong', '', item.name || 'Custom product'));
      if (item.priceType === 'from') name.append(el('small', '', 'Starting price'));
      if (item.priceType === 'quote') name.append(el('small', '', 'Price on request'));
      const unit = unitPence(item);
      const qty = Number(item.quantity);
      const line = unit === null || !Number.isSafeInteger(qty) || qty < 1 ? null : unit * qty;
      row.append(name, el('td', '', String(item.quantity || '—')),
        el('td', 'admin-price-money', unit === null ? 'Quote required' : (item.priceType === 'from' ? 'From ' : '') + money(unit)),
        el('td', 'admin-price-money', line === null ? 'Quote required' : (item.priceType === 'from' ? 'From ' : '') + money(line)));
      body.append(row);
    });
    if (!body.children.length) {
      const row = el('tr'); const cell = el('td', '', 'Custom request — quote required');
      cell.colSpan = 4; row.append(cell); body.append(row);
    }
    table.append(body); tableWrap.append(table); items.append(tableWrap);
    const total = el('div', 'admin-estimate-summary');
    const totalRow = el('div', 'admin-estimate-title');
    totalRow.append(el('span', '', 'Estimated menu subtotal'), el('strong', '', money(priceSummary.total)));
    total.append(totalRow);
    const qualifiers = [];
    if (priceSummary.from) qualifiers.push('Includes starting prices');
    if (priceSummary.unpriced) qualifiers.push('Excludes unpriced/custom items');
    qualifiers.push('Delivery and customisation not included');
    total.append(el('p', 'admin-estimate-note', qualifiers.join(' · ') + '. Not a final quote.'));
    items.append(total);
    if (enquiry.notes) items.append(detailLine('Customer requirements', enquiry.notes));
    if (enquiry.auto_declined_at) items.append(detailLine('Review outcome', 'Automatically declined after 28 days without approval. Customer not automatically notified.'))
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
        detailLine('Order status',order.status==='cancelled'?'Cancelled':
          order.status==='completed'?'Completed':'Approved'),
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
      if (!order.status||order.status==='approved'){
        const complete=el('button','button button-primary','Mark completed');
        complete.type='button';
        complete.addEventListener('click',async()=>{
          if(!window.confirm('Mark this approved order as completed?'))return;
          complete.disabled=true;
          try{await api({action:'set-order-status',id:order.id,orderStatus:'completed'});await refresh();}
          catch(error){status.textContent=error.message;complete.disabled=false;}
        });
        const cancel=el('button','button button-outline','Cancel order');
        cancel.type='button';
        cancel.addEventListener('click',async()=>{
          const reason=window.prompt('Reason for cancelling this approved order:');
          if(reason===null)return;
          if(reason.trim().length<5||reason.length>500){status.textContent='Enter a reason of 5 to 500 characters.';return;}
          if(!window.confirm('Cancel the order? Its records will be preserved for accounting and audit.'))return;
          cancel.disabled=true;
          try{await api({action:'set-order-status',id:order.id,orderStatus:'cancelled',reason:reason.trim()});await refresh();}
          catch(error){status.textContent=error.message;cancel.disabled=false;}
        });
        actions.append(complete,cancel);
      }
      if(order.status==='cancelled'&&order.cancellation_reason)
        box.append(detailLine('Cancellation reason',order.cancellation_reason));
      const ledgerBox=el('div','admin-order-payment');
      ledgerBox.append(el('h4','','Payments and refunds'));
      const paymentSummary=el('p','admin-muted','Expand the enquiry to load recorded payments.');
      ledgerBox.append(paymentSummary);
      async function loadPaymentSummary(){
        if(!order.id)return;
        try{
          const {summary}=await api({action:'payment-summary',id:order.id});
          paymentSummary.textContent='Net received '+money(Number(summary.net_received_pence))+
            ' · Agreed '+money(Number(summary.agreed_pence))+
            ' · Outstanding '+money(Number(summary.outstanding_pence))+
            ' (recorded entries only)';
        }catch(error){paymentSummary.textContent='Payment summary unavailable: '+error.message;}
      }
      details.addEventListener('toggle',()=>{if(details.open)loadPaymentSummary();});
      const paymentForm=el('form','admin-order-payment-form');
      const paymentTypeLabel=el('label','','Entry type');
      const paymentType=document.createElement('select');
      [['receipt','Payment received'],['refund','Refund issued']].forEach(([value,label])=>{
        const option=document.createElement('option');option.value=value;option.textContent=label;paymentType.append(option);
      });
      paymentTypeLabel.append(paymentType);
      const [paidDateWrap,paidDate]=field('Payment date','date');
      paidDate.value=todayLondon();paidDate.max=todayLondon();
      const [amountWrap,amount]=field('Amount (£)','number');
      amount.min='0.01';amount.step='0.01';amount.max='1000000';
      const paymentMethodLabel=el('label','','Payment method');
      const paymentMethod=document.createElement('select');
      [['bank','Bank transfer'],['cash','Cash'],['card','Card'],['other','Other']].forEach(([value,label])=>{
        const option=document.createElement('option');option.value=value;option.textContent=label;paymentMethod.append(option);
      });
      paymentMethodLabel.append(paymentMethod);
      const [referenceWrap,reference]=field('Payment reference','text',false);
      reference.maxLength=120;
      const record=el('button','button button-outline','Record financial entry');
      record.type='submit';
      paymentForm.append(paymentTypeLabel,paidDateWrap,amountWrap,paymentMethodLabel,referenceWrap,record);
      paymentForm.addEventListener('submit',async event=>{
        event.preventDefault();
        if(!paymentForm.reportValidity())return;
        if(!window.confirm('Record this actual payment or refund permanently? Check your bank or receipt evidence first.'))return;
        record.disabled=true;
        try{
          await api({action:'record-payment',id:order.id,eventType:paymentType.value,
            amountPence:Math.round(Number(amount.value)*100),date:paidDate.value,
            method:paymentMethod.value,reference:reference.value.trim()});
          amount.value='';reference.value='';
          await loadPaymentSummary();
          status.textContent='Financial entry recorded and audit-logged.';
        }catch(error){status.textContent='Financial entry not recorded: '+error.message;}
        finally{record.disabled=false;}
      });
      ledgerBox.append(paymentForm);
      box.append(actions,ledgerBox);panel.append(box);
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
      price.value = (estimatePrices(enquiry.items || []).total / 100).toFixed(2);
      const [noteWrap,note] = field('Internal order notes','text',false);
      const agreementLabel = el('label','admin-approval-attestation');
      const agreementConfirmed = document.createElement('input');
      agreementConfirmed.type = 'checkbox';
      agreementConfirmed.required = true;
      agreementLabel.append(agreementConfirmed,document.createTextNode(
        'I confirm that I have discussed and agreed all order details, including the final price, date and collection/delivery arrangements, with the customer.'
      ));
      const contactedLabel = el('label','admin-approval-attestation');
      const customerContacted = document.createElement('input');
      customerContacted.type = 'checkbox';
      customerContacted.required = true;
      contactedLabel.append(customerContacted, document.createTextNode(
        'I confirm that I have personally contacted the customer before approving this order.'
      ));
      const [reasonWrap,declineReason] = field('Reason for declining (sent to customer by email)','text',false);
      declineReason.maxLength = 500;
      declineReason.placeholder = 'Explain why the request cannot be accepted (at least 10 characters)';
      reasonWrap.style.gridColumn = '1 / -1';
      const approve = el('button','button button-primary','Approve & create order');
      approve.type='submit';
      const decline = el('button','button button-outline','Decline enquiry');
      decline.type='button';
      const actions = el('div','admin-actions');
      actions.append(approve,decline);
      form.append(dateWrap,timeWrap,priceWrap,noteWrap,agreementLabel,contactedLabel,reasonWrap,actions);
      async function decide(action) {
        if (action === 'confirm' && !form.reportValidity()) return;
        if (action === 'decline' && declineReason.value.trim().length < 10) {
          status.textContent = 'Enter a decline reason of at least 10 characters before sending the customer email.';
          declineReason.focus();
          return;
        }
        if (!window.confirm(action === 'confirm' ? 'Approve this enquiry and send the customer an order confirmation email?' : 'Decline this enquiry and email the reason to the customer?')) return;
        approve.disabled=decline.disabled=true;
        status.textContent='Processing ' + enquiry.reference + '…';
        try {
          const result = await api({action,id:enquiry.id,confirmedDate:date.value,confirmedTime:time.value,
            finalTotalPence:Math.round(Number(price.value)*100),
            notes:action==='decline' ? declineReason.value.trim() : note.value,
            detailsConfirmed:action==='confirm' && agreementConfirmed.checked,
            customerContacted:action==='confirm' && customerContacted.checked});
          await refresh();
          if (!result.notification || !result.notification.sent) {
            window.alert('Decision saved, but the customer email was not sent. Use Retry decision email on the enquiry to try again.');
          }
        } catch(error) { status.textContent=error.message; approve.disabled=decline.disabled=false; }
      }
      form.addEventListener('submit', event => { event.preventDefault(); decide('confirm'); });
      decline.addEventListener('click', () => decide('decline'));
      actionBox.append(form); panel.append(actionBox);
    }
    // Safe recovery of acknowledgment emails for existing enquiries: the API
    // rejects attempts when the acknowledgment was already sent or queued.
    const retryAcknowledgment = el('button','button button-outline','Send missing acknowledgment email');
    retryAcknowledgment.type='button';
    retryAcknowledgment.addEventListener('click', async () => {
      if (!window.confirm('Send the acknowledgment email for enquiry ' + enquiry.reference +
        '? This option only works if the email was not previously sent.')) return;
      retryAcknowledgment.disabled=true;
      try {
        const result = await api({action:'retry-acknowledgment-email',id:enquiry.id});
        window.alert(result.notification?.sent
          ? 'Acknowledgment email accepted by the email provider.'
          : 'Acknowledgment email was not sent. Check the Supabase email delivery logs.');
      } catch(error) { window.alert(error.message); }
      finally { retryAcknowledgment.disabled=false; }
    });
    panel.append(retryAcknowledgment);
    if (enquiry.status === 'confirmed' || enquiry.status === 'declined') {
      const retry = el('button','button button-outline','Retry failed decision email');
      retry.type='button';
      retry.addEventListener('click', async () => {
        retry.disabled=true;
        try {
          const result = await api({action:'retry-decision-email',id:enquiry.id});
          window.alert(result.notification?.sent ? 'Customer email sent.' : 'Email was not sent. Please try again later.');
        } catch(error) { window.alert(error.message); }
        finally { retry.disabled=false; }
      });
      panel.append(retry);
    }
    if (adminRole === 'owner') {
      const destructive = el('div','admin-owner-single-delete');
      const remove = el('button','button button-outline admin-danger-button',
        order ? 'Delete enquiry and linked order' : 'Delete enquiry');
      remove.type='button';
      remove.addEventListener('click',() => deleteRecords([{
        id:enquiry.id,reference:enquiry.reference,orderReference:order?.order_reference||null
      }]));
      destructive.append(remove,el('p','admin-muted',
        'Dean only. Removes this record from active Orders; retains all accounting and audit history. Restorable.'));
      panel.append(destructive);
    }
    details.append(panel);
    return details;
  }
  function renderRecords(){
    orders.replaceChildren();
    records.forEach(enquiry=>orders.append(renderRecord(enquiry)));
    updateDeleteSelection();
    empty.hidden=records.length>0;
    document.querySelector('#admin-list-caption').textContent=matchingTotal+
      ' matching enquiries · Select a row for details and actions';
    document.querySelector('#admin-pagination').hidden=matchingTotal<=pageSize;
    document.querySelector('#admin-prev-page').disabled=pageOffset===0;
    document.querySelector('#admin-next-page').disabled=pageOffset+records.length>=matchingTotal;
    document.querySelector('#admin-page-label').textContent=matchingTotal?
      (pageOffset+1)+'–'+(pageOffset+records.length)+' of '+matchingTotal:'No matching enquiries';
  }
  const analyticsCards = document.querySelector('#admin-analytics-cards');
  const activityChart = document.querySelector('#admin-activity-chart');
  const pipeline = document.querySelector('#admin-pipeline');
  const contactBreakdown = document.querySelector('#admin-contact-breakdown');
  let businessStatistics = null;
  function statisticCard(label, value, explanation) {
    const card = el('div', 'admin-analytics-stat');
    card.append(el('span', 'admin-analytics-stat-label', label), el('strong', 'admin-analytics-stat-value', value), el('small', '', explanation));
    return card;
  }
  function renderStatistics() {
    if (!businessStatistics) return;
    const period = businessStatistics.periods.find(item => item.months === 6);
    if (!period) return;
    const conversion = period.enquiries ? (period.orders / period.enquiries * 100).toFixed(1) + '%' : '—';
    const average = period.orders ? money(Math.round(period.approved_value_pence / period.orders)) : '—';
    analyticsCards.replaceChildren(
      statisticCard('New enquiries', String(period.enquiries), 'Requests received'),
      statisticCard('Orders created', String(period.orders), 'Approved in this period'),
      statisticCard('Order conversion', conversion, 'Orders created ÷ enquiries received*'),
      statisticCard('Agreed order value', money(period.approved_value_pence), 'Not confirmed payments'),
      statisticCard('Average order value', average, 'Per order created'),
      statisticCard('Menu-price estimate', money(period.estimated_pence), 'May exclude custom items'),
      statisticCard('Awaiting review', String(period.pending), 'Of enquiries received'),
      statisticCard('Customer notifications due', String(period.awaiting_notification), 'Of orders created')
    );
    pipeline.replaceChildren();
    [['Pending',period.pending],['Approved',period.approved],['Declined',period.declined]].forEach(([label,count]) => {
      const row = el('div','admin-breakdown-row');
      const top = el('div','admin-breakdown-top');
      top.append(el('span','',label),el('strong','',String(count)));
      const track = el('div','admin-breakdown-track');
      const fill = el('div','admin-breakdown-fill');
      fill.style.width = (period.enquiries ? count / period.enquiries * 100 : 0) + '%';
      track.append(fill); row.append(top,track); pipeline.append(row);
    });
    contactBreakdown.replaceChildren();
    [['Email',period.email],['Text',period.sms],['WhatsApp',period.whatsapp]].forEach(([label,count]) => {
      const row = el('div','admin-contact-stat');
      row.append(el('span','',label),el('strong','',String(count)));
      contactBreakdown.append(row);
    });
    const months = businessStatistics.monthly.slice(-6);
    activityChart.replaceChildren();
    const max = Math.max(1,...months.flatMap(item => [item.enquiries,item.orders]));
    months.forEach(item => {
      const group = el('div','admin-chart-month');
      const bars = el('div','admin-chart-bars');
      for (const [value,kind] of [[item.enquiries,'enquiries'],[item.orders,'orders']]) {
        const bar = el('div','admin-chart-bar admin-chart-bar-' + kind);
        bar.style.height = (value / max * 100) + '%';
        bar.title = item.month + ': ' + value + ' ' + kind;
        bars.append(bar);
      }
      group.append(bars,el('span','admin-chart-label',new Date(item.month+'-01T12:00:00').toLocaleDateString('en-GB',{month:'short'})));
      activityChart.append(group);
    });
    activityChart.setAttribute('aria-label',months.map(item => item.month + ': ' + item.enquiries + ' enquiries and ' + item.orders + ' orders').join('; '));
  }
  function renderMetrics(){
    const stats=[
      ['Matching enquiries',matchingTotal,'all'],
      ['Awaiting review',pageCounts.pending,'pending'],
      ['Approved enquiries',pageCounts.confirmed,'confirmed'],
      ['Declined enquiries',pageCounts.declined,'declined']
    ];
    metrics.replaceChildren();
    stats.forEach(([label,value,target])=>{
      const tile=el('button','admin-metric');
      tile.type='button';
      tile.append(el('span','admin-metric-label',label),el('strong','admin-metric-value',String(value)));
      tile.addEventListener('click',()=>{filter.value=target;pageOffset=0;refresh();});
      metrics.append(tile);
    });
  }
  const ownerPanel=document.querySelector('#admin-owner-panel');
  const userList=document.querySelector('#admin-user-list');
  const auditList=document.querySelector('#admin-audit-list');
  async function refreshOwner(){
    if(adminRole!=='owner')return;
    try{
      const [accounts,history]=await Promise.all([
        api({action:'owner-admins'}),api({action:'owner-audit'})
      ]);
      userList.replaceChildren();
      (accounts.admins||[]).forEach(account=>{
        const row=el('div','admin-owner-row'),identity=el('div','');
        identity.append(el('strong','',account.display_name+' · '+account.role),
          el('small','',account.email+' · '+(account.active?'Active':'Disabled')));
        row.append(identity);
        if(account.role!=='owner'){
          const button=el('button','button button-outline',account.active?'Disable access':'Enable access');
          button.type='button';
          button.addEventListener('click',async()=>{
            if(!window.confirm((account.active?'Disable':'Enable')+' access for '+account.display_name+'?'))return;
            button.disabled=true;
            try{await api({action:'owner-set-admin',userId:account.user_id,active:!account.active,role:account.role});await refreshOwner();}
            catch(error){status.textContent=error.message;button.disabled=false;}
          });
          row.append(button);
        }
        userList.append(row);
      });
      auditList.replaceChildren();
      (history.events||[]).slice(0,30).forEach(change=>{
        const row=el('div','admin-audit-row');
        row.append(el('time','',new Date(change.occurred_at).toLocaleString('en-GB')),
          el('span','',change.action.replace(/_/g,' ')),
          el('small','',change.enquiry_id||change.order_id||'Access policy'));
        auditList.append(row);
      });
      if(!(history.events||[]).length)auditList.append(el('p','admin-muted','No recorded admin actions yet.'));
    }catch(error){auditList.replaceChildren(el('p','admin-muted','Security overview unavailable: '+error.message));}
  }
  document.querySelector('#admin-owner-refresh').addEventListener('click',refreshOwner);
  selectPage.addEventListener('change',() => {
    if (adminRole !== 'owner') return;
    records.forEach(enquiry => {
      if (selectPage.checked) selectedForDeletion.set(enquiry.id, {
        id:enquiry.id,reference:enquiry.reference,orderReference:orderMap.get(enquiry.id)?.order_reference||null
      });
      else selectedForDeletion.delete(enquiry.id);
    });
    // Re-render checkboxes so the visible page matches the selection state.
    renderRecords();
  });
  deleteSelectedButton.addEventListener('click',() => deleteRecords([...selectedForDeletion.values()]));
  showDeletedButton.addEventListener('click',async () => {
    if (adminRole !== 'owner') return;
    deletedPanel.hidden = !deletedPanel.hidden;
    showDeletedButton.setAttribute('aria-expanded',String(!deletedPanel.hidden));
    if (!deletedPanel.hidden) await loadDeletedRecords();
  });
  async function refresh() {
    status.textContent='Loading enquiries…';
    try {
      const data=await api({action:'list',offset:pageOffset,limit:pageSize,status:filter.value,search:search.value.trim()});
      records=data.enquiries || [];
      administrator=data.administrator||'Administrator';
      adminRole=data.adminRole||'operator';
      // A configured secret is necessary but not proof of inbox delivery.
      const emailHealth=document.querySelector('#admin-email-health');
      emailHealth.hidden=data.emailSecretConfigured!==false;
      matchingTotal=Number(data.total||0);
      pageCounts=data.counts||{pending:0,confirmed:0,declined:0};
      ownerPanel.hidden=adminRole!=='owner';
      orderMap=new Map((data.orders || []).map(order => [order.enquiry_id,order]));
      renderMetrics(); renderRecords();
      try {
        const result = await api({action:'statistics'});
        businessStatistics = result.statistics;
        renderStatistics();
      } catch (statisticsError) {
        analyticsCards.replaceChildren(el('p','admin-muted','Business statistics are temporarily unavailable: ' + statisticsError.message));
      }
      status.textContent=administrator+' ('+(adminRole==='owner'?'Owner':'Operations')+') · '+
        matchingTotal+' matching enquiries';
      if(adminRole==='owner')await refreshOwner();
    } catch(error) { status.textContent=error.message; }
  }
  let searchDebounce;
  search.addEventListener('input',() => {
    clearTimeout(searchDebounce);
    searchDebounce=setTimeout(()=>{pageOffset=0;refresh();},300);
  });
  filter.addEventListener('change',()=>{pageOffset=0;refresh();});
  document.querySelector('#admin-prev-page').addEventListener('click',()=>{
    pageOffset=Math.max(0,pageOffset-pageSize);refresh();
  });
  document.querySelector('#admin-next-page').addEventListener('click',()=>{
    if(pageOffset+pageSize<matchingTotal){pageOffset+=pageSize;refresh();}
  });

  async function proceedAfterSignIn(){
    try {
      const {data:{session},error:sessionError}=await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) {
        login.hidden=false;magicLink.hidden=false;dashboard.hidden=true;sessionActions.hidden=true;
        return;
      }
      // Verify the signed-in account is an active, email-confirmed administrator
      // before displaying any private dashboard. The API and SQL recheck this
      // for every operation; the owner role still gates destructive actions.
      await api({action:'list',offset:0,limit:1,status:'all',search:''});
      login.hidden=true;magicLink.hidden=true;dashboard.hidden=false;sessionActions.hidden=false;
      await refresh();
    } catch(error) {
      dashboard.hidden=true;sessionActions.hidden=true;login.hidden=false;magicLink.hidden=false;
      status.textContent='Administrator access unavailable: '+error.message;
    }
  }
  async function signOut(){
    await client.auth.signOut();
    dashboard.hidden=true;sessionActions.hidden=true;login.hidden=false;magicLink.hidden=false;
    orders.replaceChildren();selectedForDeletion.clear();deleteTools.hidden=true;deletedPanel.hidden=true;
    status.textContent='Signed out.';
  }
  document.querySelector('#login-form').addEventListener('submit',async event=>{
    event.preventDefault();
    status.textContent='Signing in…';
    const {error}=await client.auth.signInWithPassword({
      email:document.querySelector('#admin-email').value,
      password:document.querySelector('#admin-password').value
    });
    if(error){status.textContent=error.message;return;}
    await proceedAfterSignIn();
  });
  document.querySelector('#admin-magic-link-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const email=document.querySelector('#admin-magic-email').value.trim();
    const button=event.currentTarget.querySelector('button[type="submit"]');
    button.disabled=true;
    status.textContent='Requesting sign-in link…';
    try {
      const {error}=await client.auth.signInWithOtp({
        email,
        options:{
          shouldCreateUser:false,
          emailRedirectTo:new URL('admin.html',window.location.href).href
        }
      });
      if(error)throw error;
      status.textContent='If this is a registered administrator email, a one-time sign-in link will arrive shortly. Check your inbox and junk folder.';
    }catch(error){
      status.textContent='Could not request a sign-in link: '+error.message;
    }finally{button.disabled=false;}
  });
  document.querySelector('#admin-refresh').addEventListener('click',refresh);
  document.querySelector('#admin-signout').addEventListener('click',signOut);
  await proceedAfterSignIn();
})();

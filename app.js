/**
 * Cakes by Sharn — menu and enquiry builder.
 * Update the menu, descriptions or prices below. No backend or dependencies required.
 * Price types: "fixed" (known price), "from" (starting price), "quote" (ask for a quote).
 */
const MENU = [
  {
    id: 'afternoon-tea',
    title: 'Afternoon tea',
    icon: '☕',
    note: 'A variety of scones, cakes & savouries. Made to order.',
    items: [
      { name: 'Individual afternoon tea', price: 9, priceType: 'fixed' },
      { name: 'Afternoon tea for 2', price: 16, priceType: 'fixed' },
    ],
  },
  {
    id: 'loaves',
    title: 'Homemade loaves',
    icon: '♧',
    items: [
      { name: 'Banana loaf', price: 5, priceType: 'fixed' },
      { name: 'Iced lemon loaf', price: 5, priceType: 'fixed' },
      { name: 'Iced carrot loaf', price: 5.5, priceType: 'fixed' },
      { name: 'Iced ginger loaf', price: 5, priceType: 'fixed' },
    ],
  },
  {
    id: 'traditional-bakes',
    title: 'Traditional bakes',
    icon: '✳',
    items: [
      { name: 'Plain scones', detail: 'Pack of 6', price: 5, priceType: 'fixed' },
      { name: 'Fruit scones', detail: 'Pack of 6', price: 5.5, priceType: 'fixed' },
      { name: 'Chocolate fudge cake slices', detail: 'Pack of 4', price: 6, priceType: 'fixed' },
      { name: 'Chocolate brownies', detail: 'Pack of 4', price: 6, priceType: 'fixed' },
      { name: 'Chocolate orange brownies', detail: 'Pack of 4', price: 8, priceType: 'fixed' },
      { name: 'Rolo brownies', detail: 'Pack of 4', price: 8, priceType: 'fixed' },
      { name: 'Baileys & Nutella brownies', detail: 'Pack of 4', price: 9, priceType: 'fixed' },
      { name: 'Chocolate chip cookies', detail: 'Milk or white chocolate · Pack of 5', price: 3.5, priceType: 'fixed' },
    ],
  },
  {
    id: 'cupcakes',
    title: 'Cupcakes',
    icon: '✦',
    items: [
      { name: 'Vanilla cupcakes', detail: 'Box of 6', price: 10, priceType: 'fixed' },
      { name: 'Red velvet cupcakes', detail: 'Box of 6', price: 10, priceType: 'fixed' },
      { name: 'Chocolate cupcakes', detail: 'Box of 6', price: 10, priceType: 'fixed' },
      { name: 'Personalised cupcakes', priceType: 'quote' },
    ],
  },
  {
    id: 'celebration-cakes',
    title: 'Celebration cakes',
    icon: '✦',
    note: 'Other celebration cakes and designs are priced on request.',
    items: [
      { name: '7-inch buttercream cake', detail: 'Three layers · starting price', price: 45, priceType: 'from' },
    ],
  },
];

const formatter = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const ENQUIRY_EMAIL = 'cakesbysharnx@hotmail.com';
const ENQUIRY_SUBJECT = 'Cakes by Sharn - Order enquiry';
const filtersElement = document.querySelector('#menu-filters');
const groupsElement = document.querySelector('#menu-groups');
const basketItemsElement = document.querySelector('#basket-items');
const basketCountElement = document.querySelector('#basket-count');
const basketTotalElement = document.querySelector('#basket-total');
const menuToggle = document.querySelector('.mobile-menu-toggle');
const mainNav = document.querySelector('#site-nav');
const toastElement = document.querySelector('#toast');
const enquiryError = document.querySelector('#enquiry-error');
const notesField = document.querySelector('#order-notes');
const dateField = document.querySelector('#preferred-date');
const form = document.querySelector('#enquiry-form');
let activeFilter = 'all';
let toastTimer;
const ITEM_LOOKUP = new Map(MENU.flatMap(group => group.items.map((item, index) => [group.id + ':' + index, { ...item, group: group.title }])));
let cart = {};
// Remove the basket created by older site versions; new enquiries stay in memory only.
try { localStorage.removeItem('cakes-by-sharn-enquiry-v1'); } catch (_) {}
function localToday() {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
function setMinimumDate() { dateField.min = localToday(); }
function clearEnquiryError() {
  enquiryError.hidden = true;
  enquiryError.textContent = '';
  notesField.removeAttribute('aria-invalid');
  dateField.removeAttribute('aria-invalid');
}
function showEnquiryError(message, field) {
  enquiryError.textContent = message;
  enquiryError.hidden = false;
  if (field) field.setAttribute('aria-invalid', 'true');
  enquiryError.focus();
}
function validateEnquiry() {
  clearEnquiryError();
  setMinimumDate();
  if (!Object.keys(cart).length && notesField.value.trim().length < 10) {
    showEnquiryError('Add an item or describe your request in at least 10 characters.', notesField);
    return false;
  }
  if (dateField.value && (dateField.value < dateField.min || Number.isNaN(Date.parse(dateField.value)))) {
    showEnquiryError('Choose today or a future date.', dateField);
    return false;
  }
  return true;
}
function priceText(item) {
  if (item.priceType === 'quote') return 'Ask for price';
  if (item.priceType === 'from') return `From ${formatter.format(item.price)}`;
  return formatter.format(item.price);
}
function renderFilters() {
  const filters = [{ id: 'all', title: 'All the bakes' }, ...MENU];
  filtersElement.innerHTML = filters.map(filter =>
    `<button type="button" class="filter-button ${filter.id === activeFilter ? 'active' : ''}" data-filter="${filter.id}" aria-pressed="${filter.id === activeFilter}">${filter.title}</button>`
  ).join('');
}
function renderMenu() {
  const groups = activeFilter === 'all' ? MENU : MENU.filter(group => group.id === activeFilter);
  groupsElement.innerHTML = groups.map(group => `
    <section class="menu-group" aria-labelledby="menu-${group.id}">
      <div class="menu-group-heading">
        <div class="menu-group-title"><span class="menu-group-icon" aria-hidden="true">${group.icon}</span><h3 id="menu-${group.id}">${group.title}</h3></div>
        <span class="menu-group-count">${group.items.length} ${group.items.length === 1 ? 'option' : 'options'}</span>
      </div>
      ${group.note ? `<p class="menu-group-note">${group.note}</p>` : ''}
      ${group.items.map((item, index) => `
        <div class="menu-item">
          <div class="menu-item-name">${item.name}${item.detail ? `<span class="menu-item-sub">${item.detail}</span>` : ''}</div>
          <span class="menu-item-price">${priceText(item)}</span>
          <button class="menu-add" type="button" data-add="${group.id}:${index}" aria-label="Add ${item.name} to your enquiry" title="Add to enquiry">+</button>
        </div>
      `).join('')}
    </section>
  `).join('');
}
function renderBasket() {
  const entries = Object.entries(cart).filter(([key]) => ITEM_LOOKUP.has(key));
  const totalCount = entries.reduce((count, [, qty]) => count + qty, 0);
  basketCountElement.textContent = totalCount > 99 ? '99+' : String(totalCount);
  basketCountElement.setAttribute('aria-label', `${totalCount} items in enquiry`);

  if (!entries.length) {
    basketItemsElement.innerHTML = '<div class="basket-empty"><span aria-hidden="true">✦</span><strong>No items selected</strong><p><a href="#menu">Choose menu items</a> or describe your custom request in the form.</p></div>';
    basketTotalElement.hidden = true;
    return;
  }
  basketItemsElement.innerHTML = entries.map(([key, qty]) => {
    const item = ITEM_LOOKUP.get(key);
    const linePrice = item.priceType === 'quote'
      ? 'Price on request'
      : `${item.priceType === 'from' ? 'From ' : ''}${formatter.format(item.price * qty)}`;
    return `<div class="basket-line">
      <div class="basket-line-info">
        <div class="basket-line-title">${item.name}</div>
        <div class="basket-line-price">${priceText(item)}${item.priceType === 'quote' ? '' : ' each'}</div>
        <div class="basket-line-estimate">${linePrice} ${item.priceType === 'quote' ? '' : 'for ' + qty}</div>
      </div>
      <div class="quantity-controls">
        <button type="button" data-quantity="${key}" data-delta="-1" aria-label="Remove one ${item.name}">−</button>
        <span>${qty}</span>
        <button type="button" data-quantity="${key}" data-delta="1" aria-label="Add one ${item.name}">+</button>
      </div>
    </div>`;
  }).join('');

  const pricedEntries = entries.filter(([key]) => ITEM_LOOKUP.get(key).priceType !== 'quote');
  const estimatedTotal = pricedEntries.reduce((sum, [key, qty]) => sum + ITEM_LOOKUP.get(key).price * qty, 0);
  const containsStartingPrices = entries.some(([key]) => ITEM_LOOKUP.get(key).priceType === 'from');
  const containsQuotes = entries.some(([key]) => ITEM_LOOKUP.get(key).priceType === 'quote');
  basketTotalElement.hidden = false;
  basketTotalElement.innerHTML = `<span class="estimate-total-label">${containsStartingPrices ? 'Estimated total from' : 'Estimated total'}</span>
    <strong class="estimate-total-amount">${formatter.format(estimatedTotal)}</strong>
    <small>${containsQuotes ? 'Excludes items priced on request. ' : ''}${containsStartingPrices ? 'Includes starting prices; final cake costs may be higher. ' : ''}Indicative only — Sharn will confirm the final price.</small>`;

}
function showToast(message) {
  toastElement.textContent = message;
  toastElement.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastElement.classList.remove('show'), 2900);
}
function addItem(key) {
  if (!ITEM_LOOKUP.has(key)) return;
  cart[key] = Math.min((cart[key] || 0) + 1, 99);
  renderBasket();
  showToast(`${ITEM_LOOKUP.get(key).name} added to your enquiry`);
}
function updateQuantity(key, amount) {
  if (!ITEM_LOOKUP.has(key)) return;
  const newQuantity = Math.max(0, Math.min(99, (cart[key] || 0) + amount));
  if (!newQuantity) delete cart[key];
  else cart[key] = newQuantity;
  renderBasket();
}
function clearEnquiry() {
  cart = {};
  form.reset();
  setMinimumDate();
  clearEnquiryError();
  renderBasket();
  // A successfully submitted enquiry locks its button to prevent duplicates.
  // Clearing the enquiry intentionally starts a fresh submission.
  contactMethodField.value = 'email';
  emailField.value = '';
  mobileField.value = '';
  updateContactFields();
  const submitButton = document.querySelector('#submit-online-enquiry');
  if (submitButton) submitButton.disabled = false;
  const result = document.querySelector('#online-enquiry-result');
  if (result) result.textContent = '';
  showToast('Enquiry cleared.');
}
function buildMessage() {
  const name = document.querySelector('#customer-name').value.trim();
  const date = document.querySelector('#preferred-date').value;
  const notes = document.querySelector('#order-notes').value.trim();
  const lines = ['Hi Sharn! I would like to enquire about an order.', ''];
  const entries = Object.entries(cart).filter(([key]) => ITEM_LOOKUP.has(key));
  if (entries.length) {
    // One readable itemised list is shared by email, WhatsApp and copy-to-clipboard.
    lines.push('My choices:');
    entries.forEach(([key, qty]) => {
      const item = ITEM_LOOKUP.get(key);
      const label = item.name + (item.detail ? ' (' + item.detail + ')' : '');
      lines.push(`- ${qty} × ${label}`);
      if (item.priceType === 'quote') {
        lines.push('  Price: On request');
      } else {
        const prefix = item.priceType === 'from' ? 'From ' : '';
        lines.push(`  Estimated unit price: ${prefix}${formatter.format(item.price)}`);
        lines.push(`  Estimated item total: ${prefix}${formatter.format(item.price * qty)}`);
      }
      lines.push('');
    });
  }
  if (name) lines.push(`Name: ${name}`);
  const contactMethod = contactMethodField.value;
  const email = emailField.value.trim();
  const mobile = normalizedUkMobile(mobileField.value.trim());
  if (email) lines.push(`Email: ${email}`);
  const fulfilment = document.querySelector('#fulfilment-method').value;
  lines.push(`Fulfilment: ${fulfilment === 'delivery' ? 'Delivery' : 'Collection'}`);
  const address = document.querySelector('#delivery-address').value.trim();
  if (fulfilment === 'delivery' && address) lines.push(`Delivery address: ${address}`);
  if (date) {
    const [year, month, day] = date.split('-');
    lines.push(`Preferred date: ${day}/${month}/${year}`);
  }
  if (notes) lines.push(`Extra details: ${notes}`);
  if (name || date || notes) lines.push('');
  lines.push('Could you please confirm availability and pricing? Thank you!');
  return lines.join('\n');
}
// A mailto link opens a draft in the customer's configured email app.
 // No email is sent by this website; the customer must press Send.
function prepareEmailEnquiry(event) {
  if (!validateEnquiry()) {
    event.preventDefault();
    return;
  }
  const query = 'subject=' + encodeURIComponent(ENQUIRY_SUBJECT)
    + '&body=' + encodeURIComponent(buildMessage());
  event.currentTarget.href = 'mailto:' + ENQUIRY_EMAIL + '?' + query;
}
// Without a business phone number or its official shared profile link,
// WhatsApp can prefill the message but cannot automatically select @Cakesbysharnx.
// This documented wa.me form opens the user's recipient picker.
function prepareWhatsAppEnquiry(event) {
  if (!validateEnquiry()) {
    event.preventDefault();
    return;
  }
  event.currentTarget.href = 'https://wa.me/?text=' + encodeURIComponent(buildMessage());
}
async function copyMessage() {
  if (!validateEnquiry()) return;
  const text = buildMessage();
  try {
    if (!navigator.clipboard || !window.isSecureContext) throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(text);
    showToast('Enquiry copied! Paste it into an email to Sharn.');
  } catch (_) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '0';
    textarea.style.top = '0';
    textarea.style.width = '1px';
    textarea.style.height = '1px';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();
    let success = false;
    try { success = document.execCommand('copy'); } catch (_) { /* Browser disallowed copy. */ }
    textarea.remove();
    if (success) showToast('Enquiry copied! Paste it into your message to Sharn.');
    else {
      const preview = window.prompt('Copy this enquiry and paste it into an email to Sharn:', text);
      if (preview !== null) showToast('Your enquiry text is ready to share.');
    }
  }
}
function closeMobileNav() {
  mainNav.classList.remove('open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Open navigation menu');
}

renderFilters();
renderMenu();
renderBasket();
setMinimumDate();
// The floating enquiry shortcut must not cover form controls while ordering.
const enquirySection = document.querySelector('#enquiry');
const enquiryShortcut = document.querySelector('#basket-trigger');
if ('IntersectionObserver' in window) {
  const enquiryVisibility = new IntersectionObserver(entries => {
    enquiryShortcut.classList.toggle('enquiry-in-view', entries[0].isIntersecting);
  }, { threshold: 0 });
  enquiryVisibility.observe(enquirySection);
}
dateField.addEventListener('focus', setMinimumDate);
for (const field of [notesField, dateField]) field.addEventListener('input', clearEnquiryError);
document.querySelector('#clear-enquiry').addEventListener('click', clearEnquiry);
form.addEventListener('submit', event => {
  event.preventDefault();
  if (onlineEnabled) document.querySelector('#submit-online-enquiry').click();
});
document.querySelector('#year').textContent = new Date().getFullYear();

filtersElement.addEventListener('click', event => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  activeFilter = button.dataset.filter;
  renderFilters();
  renderMenu();
});

document.addEventListener('click', event => {
  const addButton = event.target.closest('[data-add]');
  if (addButton) addItem(addButton.dataset.add);
  const quantityButton = event.target.closest('[data-quantity]');
  if (quantityButton) updateQuantity(quantityButton.dataset.quantity, Number(quantityButton.dataset.delta));
  const featureLink = event.target.closest('[data-filter-link]');
  if (featureLink) {
    activeFilter = featureLink.dataset.filterLink;
    renderFilters();
    renderMenu();
  }
});

const orderConfig = window.CAKES_ORDER_CONFIG || {};
const onlineEnabled = Boolean(orderConfig.onlineSubmissionsEnabled === true && orderConfig.supabaseUrl && orderConfig.supabaseAnonKey);
const contactMethodField = document.querySelector('#contact-method');
const emailField = document.querySelector('#customer-email');
const mobileField = document.querySelector('#customer-mobile');
function updateContactFields() {
  const emailSelected = contactMethodField.value === 'email';
  document.querySelector('#contact-email-field').hidden = !emailSelected;
  document.querySelector('#contact-mobile-field').hidden = emailSelected;
  emailField.required = emailSelected;
  mobileField.required = !emailSelected;
  emailField.setAttribute('aria-invalid', 'false');
  mobileField.setAttribute('aria-invalid', 'false');
}
contactMethodField.addEventListener('change', updateContactFields);
updateContactFields();
function normalizedUkMobile(value) {
  const compact = value.replace(/[\s().-]/g, '');
  return compact.startsWith('07') ? '+44' + compact.slice(1) : compact;
}
const fulfilmentField = document.querySelector('#fulfilment-method');
const deliveryAddressField = document.querySelector('#delivery-address-field');
function toggleDeliveryAddress() { deliveryAddressField.hidden = fulfilmentField.value !== 'delivery'; }
fulfilmentField.addEventListener('change', toggleDeliveryAddress);
toggleDeliveryAddress();
if (onlineEnabled) document.querySelector('#online-enquiry-panel').hidden = false;
document.querySelector('#submit-online-enquiry').addEventListener('click', async () => {
  if (!validateEnquiry()) return;
  const name = document.querySelector('#customer-name').value.trim();
  const contactMethod = contactMethodField.value;
  const email = emailField.value.trim();
  const mobile = normalizedUkMobile(mobileField.value.trim());
  const preferredDate = dateField.value;
  const fulfilment = fulfilmentField.value;
  const deliveryAddress = document.querySelector('#delivery-address').value.trim();
  if (!name || name.length > 120) return showEnquiryError('Enter your name (up to 120 characters).', document.querySelector('#customer-name'));
  if (contactMethod === 'email' && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) return showEnquiryError('Enter a valid email address.', emailField);
  if (contactMethod !== 'email' && !/^\+447[1-57-9]\d{8}$/.test(mobile)) return showEnquiryError('Enter a valid UK mobile number, such as 07700 900123.', mobileField);
  if (!preferredDate) return showEnquiryError('Choose a preferred date.', dateField);
  if (fulfilment === 'delivery' && deliveryAddress.length < 10) return showEnquiryError('Enter your delivery address and postcode.', document.querySelector('#delivery-address'));
  const button = document.querySelector('#submit-online-enquiry');
  const status = document.querySelector('#online-enquiry-result');
  button.disabled = true;
  status.textContent = 'Sending enquiry…';
  try {
    const response = await fetch(orderConfig.supabaseUrl + '/functions/v1/submit-enquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: orderConfig.supabaseAnonKey },
      body: JSON.stringify({ name, contactMethod, email: contactMethod === 'email' ? email : null, mobile: contactMethod === 'email' ? null : mobile, preferredDate, fulfilment,
        deliveryAddress: fulfilment === 'delivery' ? deliveryAddress : null,
        notes: notesField.value.trim(), website: document.querySelector('#enquiry-website').value,
        items: Object.entries(cart).filter(([key]) => ITEM_LOOKUP.has(key)).map(([key, quantity]) => ({ key, quantity }))
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to send enquiry.');
    const acknowledgment = result.acknowledgmentEmailSent === true
      ? 'You should receive an acknowledgment email shortly. Please check your junk or spam folder if it does not arrive.'
      : 'Automatic acknowledgments are not available yet. Please save your reference; our team will contact you by ' + (contactMethod === 'email' ? 'email' : contactMethod === 'sms' ? 'text message' : 'WhatsApp') + ' after reviewing your request.';
    status.textContent = 'Enquiry received! Thank you for contacting Cakes by Sharn. Your reference: ' + result.reference + '. ' + acknowledgment + ' This is not yet a confirmed order. Our team will review availability, pricing and the next steps.';
  } catch (error) {
    status.textContent = error.message + ' Please try again later.';
    button.disabled = false;
  }
});

menuToggle.addEventListener('click', () => {
  const isOpen = mainNav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
  menuToggle.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
});
mainNav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMobileNav));

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeMobileNav();
});

/* Progressive enhancement: reveal sections as they enter the viewport. */
if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const revealTargets = document.querySelectorAll('.menu-group, .feature-card, .contact-card, .section-heading');
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px 40px 0px' });
  revealTargets.forEach(target => {
    target.classList.add('reveal-on-scroll');
    revealObserver.observe(target);
  });
}

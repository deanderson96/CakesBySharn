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

const STORAGE_KEY = 'cakes-by-sharn-enquiry-v1';
const formatter = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const filtersElement = document.querySelector('#menu-filters');
const groupsElement = document.querySelector('#menu-groups');
const basketItemsElement = document.querySelector('#basket-items');
const basketCountElement = document.querySelector('#basket-count');
const basketTotalElement = document.querySelector('#basket-total');
const drawer = document.querySelector('#basket-drawer');
const backdrop = document.querySelector('#drawer-backdrop');
const menuToggle = document.querySelector('.mobile-menu-toggle');
const mainNav = document.querySelector('#site-nav');
const toastElement = document.querySelector('#toast');
let activeFilter = 'all';
let toastTimer;
let previousFocus = null;
let enquiryPageScrollY = 0;

const ITEM_LOOKUP = new Map(
  MENU.flatMap(group => group.items.map((item, index) => [`${group.id}:${index}`, { ...item, group: group.title }]))
);

function loadCart() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    return Object.fromEntries(
      Object.entries(data)
        .filter(([key, qty]) => ITEM_LOOKUP.has(key) && Number.isInteger(qty) && qty > 0)
        .map(([key, qty]) => [key, Math.min(qty, 99)])
    );
  } catch (_) {
    return {};
  }
}
let cart = loadCart();

function saveCart() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)); } catch (_) { /* Storage may be unavailable. */ }
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
    basketItemsElement.innerHTML = '<div class="basket-empty"><span aria-hidden="true">✦</span><strong>No items selected yet</strong><p>Browse the menu and tap + to add some treats, or send a general enquiry below.</p></div>';
    basketTotalElement.hidden = true;
    return;
  }
  basketItemsElement.innerHTML = entries.map(([key, qty]) => {
    const item = ITEM_LOOKUP.get(key);
    return `<div class="basket-line">
      <div><div class="basket-line-title">${item.name}</div><div class="basket-line-price">${priceText(item)}</div></div>
      <div class="quantity-controls">
        <button type="button" data-quantity="${key}" data-delta="-1" aria-label="Remove one ${item.name}">−</button>
        <span>${qty}</span>
        <button type="button" data-quantity="${key}" data-delta="1" aria-label="Add one ${item.name}">+</button>
      </div>
    </div>`;
  }).join('');

  const fixedItems = entries.filter(([key]) => ITEM_LOOKUP.get(key).priceType === 'fixed');
  const fixedSubtotal = fixedItems.reduce((sum, [key, qty]) => sum + ITEM_LOOKUP.get(key).price * qty, 0);
  const containsVariable = entries.some(([key]) => ITEM_LOOKUP.get(key).priceType !== 'fixed');
  basketTotalElement.hidden = !fixedItems.length;
  basketTotalElement.innerHTML = `Fixed-price items: ${formatter.format(fixedSubtotal)}${containsVariable ? '<small>Does not include made-to-order cakes or items requiring a quote.</small>' : '<small>Indicative only — all prices to be confirmed.</small>'}`;
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
  saveCart();
  renderBasket();
  showToast(`${ITEM_LOOKUP.get(key).name} added to your enquiry`);
}
function updateQuantity(key, amount) {
  if (!ITEM_LOOKUP.has(key)) return;
  const newQuantity = Math.max(0, Math.min(99, (cart[key] || 0) + amount));
  if (!newQuantity) delete cart[key];
  else cart[key] = newQuantity;
  saveCart();
  renderBasket();
}
// On mobile, iOS/Android keyboards shrink the visual viewport without reliably
// changing fixed-position element sizing. Match the drawer to that visible area.
function syncEnquiryViewport() {
  if (!drawer.classList.contains('open') || !window.matchMedia('(max-width: 600px)').matches) {
    drawer.style.removeProperty('--enquiry-viewport-height');
    return;
  }
  const viewport = window.visualViewport;
  const height = viewport ? viewport.height : window.innerHeight;
  drawer.style.setProperty('--enquiry-viewport-height', `${Math.round(height)}px`);
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncEnquiryViewport);
  window.visualViewport.addEventListener('scroll', syncEnquiryViewport);
}
window.addEventListener('resize', syncEnquiryViewport);
// Keep focus scrolling inside the enquiry panel only, never the document.
drawer.addEventListener('focusin', event => {
  if (!event.target.matches('input, textarea')) return;
  window.setTimeout(() => {
    if (!drawer.classList.contains('open') || !drawer.contains(event.target)) return;
    syncEnquiryViewport();
    const body = drawer.querySelector('.drawer-body');
    const field = event.target.getBoundingClientRect();
    const area = body.getBoundingClientRect();
    if (field.bottom > area.bottom - 16) body.scrollTop += field.bottom - area.bottom + 16;
    else if (field.top < area.top + 12) body.scrollTop -= area.top + 12 - field.top;
  }, 300);
});

function openDrawer() {
  previousFocus = document.activeElement;
  enquiryPageScrollY = window.scrollY;
  if (window.matchMedia('(max-width: 600px)').matches) {
    document.documentElement.classList.add('enquiry-locked');
    document.body.style.top = `-${enquiryPageScrollY}px`;
  }
  backdrop.hidden = false;
  document.body.classList.add('drawer-open');
  drawer.setAttribute('aria-hidden', 'false');
  syncEnquiryViewport();
  requestAnimationFrame(() => { backdrop.classList.add('visible'); drawer.classList.add('open'); });
  document.querySelector('#drawer-close').focus({ preventScroll: true });
}
function closeDrawer() {
  drawer.classList.remove('open');
  drawer.style.removeProperty('--enquiry-viewport-height');
  backdrop.classList.remove('visible');
  drawer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('drawer-open');
  document.documentElement.classList.remove('enquiry-locked');
  document.body.style.removeProperty('top');
  if (window.matchMedia('(max-width: 600px)').matches) window.scrollTo(0, enquiryPageScrollY);
  window.setTimeout(() => { if (!drawer.classList.contains('open')) backdrop.hidden = true; }, 300);
  if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus({ preventScroll: true });
}
function buildMessage() {
  const name = document.querySelector('#customer-name').value.trim();
  const date = document.querySelector('#preferred-date').value;
  const notes = document.querySelector('#order-notes').value.trim();
  const lines = ['Hi Sharn! I would like to enquire about an order.', ''];
  const entries = Object.entries(cart).filter(([key]) => ITEM_LOOKUP.has(key));
  if (entries.length) {
    lines.push('My choices:');
    entries.forEach(([key, qty]) => {
      const item = ITEM_LOOKUP.get(key);
      lines.push(`- ${qty} × ${item.name}${item.detail ? ` (${item.detail})` : ''} — ${priceText(item)}`);
    });
    lines.push('');
  }
  if (name) lines.push(`Name: ${name}`);
  if (date) {
    const [year, month, day] = date.split('-');
    lines.push(`Preferred date: ${day}/${month}/${year}`);
  }
  if (notes) lines.push(`Extra details: ${notes}`);
  if (name || date || notes) lines.push('');
  lines.push('Could you please confirm availability and pricing? Thank you!');
  return lines.join('\n');
}
async function copyMessage() {
  const text = buildMessage();
  try {
    if (!navigator.clipboard || !window.isSecureContext) throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(text);
    showToast('Enquiry copied! Paste it into your message to Sharn.');
  } catch (_) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    let success = false;
    try { success = document.execCommand('copy'); } catch (_) { /* Browser disallowed copy. */ }
    textarea.remove();
    if (success) showToast('Enquiry copied! Paste it into your message to Sharn.');
    else {
      const preview = window.prompt('Copy this enquiry and paste it into Instagram or Facebook:', text);
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

document.querySelector('#basket-trigger').addEventListener('click', openDrawer);
document.querySelector('#drawer-close').addEventListener('click', closeDrawer);
backdrop.addEventListener('click', closeDrawer);
document.querySelector('#copy-enquiry').addEventListener('click', copyMessage);

menuToggle.addEventListener('click', () => {
  const isOpen = mainNav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
  menuToggle.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
});
mainNav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMobileNav));

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (drawer.classList.contains('open')) closeDrawer();
    closeMobileNav();
  }
  if (event.key !== 'Tab' || !drawer.classList.contains('open')) return;
  const focusable = [...drawer.querySelectorAll('button, a[href], input, textarea')].filter(el => !el.disabled);
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

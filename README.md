# Cakes by Sharn

A responsive static website for Cakes by Sharn, using the business's turquoise branding and supplied menu. The public site remains static, with an optional Supabase/Resend Phase 1 enquiry backend. The backend is disabled until configured and deployed; no payment processing is included.

## Site features

- Full menu of afternoon teas, loaves, traditional bakes, cupcakes and celebration cakes.
- Filtering by category, item quantities and an enquiry summary.
- **One-tap Clear enquiry**, which empties both the basket and the enquiry form.
- **Non-persistent basket:** selections are held in JavaScript memory only while the page is open. They are reset when the page is reloaded or reopened. The old localStorage basket key is deleted on load.
- **In-page enquiry section** with normal document scrolling instead of a fixed modal/drawer, to avoid mobile keyboard, scroll-lock and frozen-panel issues.
- Basic enquiry checks: either select a menu item or describe a custom request (at least 10 characters); dates in the past cannot be used.
- **Email enquiry:** opens the customer's default email app with `cakesbysharnx@hotmail.com` pre-addressed, a subject, and a body containing a mobile-friendly itemised list (quantity, product, estimated unit price and estimated per-item line total), name, preferred date and requirements. The email deliberately excludes the estimated total, which remains visible only on the website. A copy-text fallback remains available if no email app is configured.
- **WhatsApp share enquiry:** opens the official `https://wa.me/?text=...` share flow with the same order message populated. Because the only provided WhatsApp identity is the username `@Cakesbysharnx` and no verified direct-chat URL or WhatsApp number has been supplied, **WhatsApp asks customers to select the recipient**. The site displays the intended username to guide them. It does not claim to address the chat automatically. Email remains the direct, pre-addressed option.
- Dynamic prices and explanatory text for items with quoted or starting prices.
- SEO basics including canonical URL, Open Graph metadata, sitemap and robots.txt.

**An enquiry is not a confirmed order.** The site does not take payments or automatically send messages. Clicking **Open email with enquiry** creates a `mailto:` link and asks the customer's email app to open a draft. The customer must review the draft and press **Send**. No data is transmitted to the site or a server by this action.

The WhatsApp share option opens WhatsApp's contact picker with the enquiry text. The customer must select the correct contact (if available) and press Send. A direct username link can be considered when the business supplies an official share link from WhatsApp; do not guess a `wa.me/username` URL.

## Local development

Open `index.html` directly, or serve the project folder:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000. The production site does not require Node, Python or a build step.

## Hosting

This repository is intended for GitHub Pages at:

https://deanderson96.github.io/CakesBySharn/

In GitHub **Settings → Pages**, choose **Deploy from a branch**, then `main` and `/ (root)`. The public address is available when deployment succeeds.

If you change the domain or repository name, update the canonical, Open Graph and sitemap URLs.

## Editing the business website

| What to change | File |
| --- | --- |
| Menu items and prices | `app.js`, `MENU` near the top |
| General text, forms and contact links | `index.html` |
| Appearance, typography and responsive layout | `styles.css` |
| Brand logo | `assets/cakes-by-sharn-logo.jpg` |
| SVG cake illustrations | `assets/*.svg` |
| Search/social-sharing URLs | `index.html`, `sitemap.xml`, `robots.txt` |

The enquiry uses **in-memory state**, not persistent browser storage. The customer's name and notes are only used locally to assemble an email draft or copyable text. The recipient is configured as `ENQUIRY_EMAIL` in `app.js`; update it there and in the static contact link in `index.html` if the business address changes.

## Automated browser tests

Browser regression checks are in `tests/smoke.py`, with an Actions workflow in `.github/workflows/website-checks.yml`. They exercise Chromium and WebKit at mobile and desktop sizes and cover basket quantities, clear-all, date and empty-request validation, pre-populated email recipient/subject/body, WhatsApp share text, the copy-text fallback, reload/reset behaviour, script errors and horizontal overflow.

To run locally:

```sh
python -m pip install playwright==1.57.0
python -m playwright install chromium webkit
python tests/smoke.py
```

Browser automation is **not** a substitute for testing an actual email app on a physical phone, including iOS Safari and in-app browsers. `mailto:` requires a configured mail application or handler; a browser cannot guarantee the draft opens if none is configured.

## Before relying on the site for orders

- Ask Sharn to confirm all menu items, prices and lead times, especially for custom cakes.
- Confirm collection/delivery arrangements and service area before publishing specifics. Do not publish a residential address without consent.
- Confirm ingredient and allergen information and the process for supplying it to customers before orders are agreed.
- Replace or complement the illustrations with business-approved photographs of actual cakes.
- Check the live GitHub Pages deployment and manually test iOS Safari and relevant in-app browsers.

## Social profiles

- Instagram: https://www.instagram.com/cakesbysharnx/
- Facebook: https://www.facebook.com/cakesbysharnx/

## Phase 1 automated enquiries (requires deployment)

**Not live by default.** The website retains its working email/WhatsApp draft options until an administrator configures the backend. No customer data is sent to Supabase while `order-config.js` has empty values.

### Components

- `supabase/schema.sql`: private enquiries table with row-level security and no public read/write grants.
- `supabase/functions/submit-enquiry/index.ts`: validates requests, creates a pending enquiry, sends Sharn an email and sends the customer an acknowledgement. This acknowledgement **does not confirm an order**.
- `supabase/functions/manage-enquiries/index.ts`: authenticates Sharn's Supabase account, restricts access by `ADMIN_EMAIL`, lists enquiries and confirms/declines with an email to the customer.
- `admin.html`: password-protected dashboard for Sharn to review enquiries and enter the actual total, date and collection/delivery time. Do not rely on the URL being secret.
- `order-config.js`: public project URL and **publishable** Supabase key only. Never commit a service-role key or Resend API key.

### Activation checklist

1. Create a Supabase project and apply `supabase/schema.sql` using the SQL editor.
2. Create an email sender domain and verify it with Resend (or adapt `sendEmail` for another transactional provider).
3. In Supabase Auth, create **only Sharn's** admin user with a strong password, and disable open public sign-ups. Use the exact email in `ADMIN_EMAIL`. Consider MFA.
4. Set Edge Function secrets: `RESEND_API_KEY`, `EMAIL_FROM` (verified sender, e.g. `orders@your-verified-domain`), `SHARN_EMAIL=cakesbysharnx@hotmail.com`, `ADMIN_EMAIL`, and `SITE_ORIGIN=https://deanderson96.github.io`. Supabase supplies its own `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in supported deployments.
5. Deploy both Edge Functions with JWT verification **disabled only for `submit-enquiry`** (public form); keep JWT verification enabled for `manage-enquiries`. The manage function additionally verifies the bearer token and exact admin email.
6. Add the Supabase project URL and public anon/publishable key to `order-config.js`, then publish the website.
7. Test submission, acknowledgement, Sharn notification, confirmation and decline using a test customer address, including delivery and collection. Confirm mail delivery and review spam/abuse protections before public launch.
8. Configure rate limiting, CAPTCHA/bot mitigation and monitoring on the public function before enabling it for real customers. Restrict email sender and verify data protection/privacy notices and retention policy for names, addresses and order details.

**Important:** The confirmation sends the final amount entered by Sharn, and the chosen date/time. It does not charge a customer or collect payment. Where the final amount or date differs from the customer's request, Sharn should obtain customer acceptance before confirming. If an email delivery fails, an enquiry remains stored for manual follow-up; check logs and delivery status. The basic prototype does not provide exactly-once notification delivery under simultaneous admin actions; use an outbox/queue before higher-volume production use.

The customer form shows a direct online submit button only when `order-config.js` contains both public settings. The existing email and WhatsApp draft options remain as fallbacks.

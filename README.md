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
- `supabase/functions/manage-enquiries/index.ts`: authenticates individual Supabase accounts, restricts access by the private `admin_accounts` allowlist, lists private enquiries, sends standalone customer replies, and confirms/declines orders with an email to the customer.
- `public.enquiry_replies`: private record of successful replies, visible to Sharn in the dashboard; sending a reply never changes an order's status.
- `supabase/config.toml`: documents function JWT verification settings (public submission endpoint only).
- `admin.html`: password-protected dashboard for Sharn to review enquiries, reply by email, and enter the actual total, date and collection/delivery time. Do not rely on the URL being secret.
- `order-config.js`: public project URL and **publishable** Supabase key only. Never commit a service-role key or Resend API key.

### Activation checklist

1. Create a Supabase project and apply `supabase/schema.sql` using the SQL editor.
2. Create an email sender domain and verify it with Resend (or adapt `sendEmail` for another transactional provider).
3. In Supabase Auth, create **only Sharn's** admin user with a strong password, and disable open public sign-ups. Use the exact email in `ADMIN_EMAIL`. Consider MFA.
4. Set Edge Function secrets: `RESEND_API_KEY`, `EMAIL_FROM` (verified sender, e.g. `orders@your-verified-domain`), `SHARN_EMAIL=cakesbysharnx@hotmail.com`, `ADMIN_EMAIL`, and `SITE_ORIGIN=https://deanderson96.github.io`. Supabase supplies its own `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in supported deployments.
5. Deploy both Edge Functions using the checked-in `supabase/config.toml`: JWT verification **disabled only for `submit-enquiry`** (public form); leave it enabled for `manage-enquiries`. The management function additionally checks the user session and exact configured admin email. No client can read the enquiries table directly.
6. Add the Supabase project URL and public anon/publishable key to `order-config.js`, then publish the website.
7. Test submission, acknowledgement, Sharn notification, **reply without approving**, confirmation and decline using a test customer address, including delivery and collection. Confirm mail delivery and review spam/abuse protections before public launch.
8. Configure rate limiting, CAPTCHA/bot mitigation and monitoring on the public function before enabling it for real customers. Restrict email sender and verify data protection/privacy notices and retention policy for names, addresses and order details.

**Important:** The confirmation sends the final amount entered by Sharn, and the chosen date/time. It does not charge a customer or collect payment. Where the final amount or date differs from the customer's request, Sharn should obtain customer acceptance before confirming. If an email delivery fails, an enquiry remains stored for manual follow-up; check logs and delivery status. The basic prototype does not provide exactly-once notification delivery under simultaneous admin actions; use an outbox/queue before higher-volume production use.

The customer form shows a direct online submit button only when `order-config.js` contains both public settings. The existing email and WhatsApp draft options remain as fallbacks.

### What Sharn can do in the private dashboard

After setup, Sharn will sign in at `/CakesBySharn/admin.html`, see the latest enquiries and their reference numbers, and choose any of:

- **Reply by email**: answer a question or request information; the enquiry remains pending, confirmed or declined as before. The message is saved in the private replies history only after the email provider accepts it.
- **Confirm and email customer**: specify the final price, date, collection/delivery time and any note. The customer receives a confirmation email.
- **Decline and email customer**: send a decline message, without taking a payment.

These actions require the designated Supabase Auth user and the `ADMIN_EMAIL` server secret. The public website never receives private database credentials.

### Customer information and launch safeguards

The online form handles personal data, including names, email addresses, dates, and potentially home addresses. Before activation, Sharn should approve a proper privacy notice with the business identity, purpose and lawful basis of processing, retention/deletion process, third-party processors and data rights contact. The short notice on the site is informative but **is not a complete privacy policy**. Avoid collecting unnecessary personal or sensitive information. Access to customer details must stay limited to the authorised admin.

Do not publish real online submissions until email sender/domain verification, anti-spam protection, function deployment and full end-to-end testing are complete. Do not paste Supabase database passwords, service role keys or email API tokens into GitHub or this site's public configuration. The project URL and *publishable* API key are designed to be public.

## Manual correspondence and separate orders (domain-free interim workflow)

The connected Supabase database contains `public.enquiries`, `public.enquiry_replies`, and `public.orders`. Approving an enquiry creates a **separate order record** with its own `CBS-ORD-` reference and agreed price, date and time. A unique constraint prevents two orders for one enquiry. Orders have a separate `customer_notified_at` field: approving an enquiry does **not** mean an email has been sent.

Until a verified sending domain/provider is configured, the private admin UI uses **manual Hotmail correspondence**:

1. Sharn reviews an enquiry and can open an email draft to the customer. The email is **not sent automatically**; Sharn must send it and explicitly record that reply.
2. Sharn approves the enquiry to create an order (or declines it). This does not contact the customer.
3. The admin dashboard shows the order reference, agreed total and date/time. Sharn opens the prefilled confirmation email, sends it through Hotmail, and then marks the customer notified via email or WhatsApp.
4. Customers submitting through a future online form must see an immediate **on-screen** receipt and reference. **Automatic customer acknowledgement and automatic order-created emails are not available without a configured transactional email sender**; do not describe an on-screen receipt as an email.

The current public online submission feature is deliberately **not activated** while email delivery and anti-bot protections are incomplete. The email/WhatsApp enquiry draft fallback remains available.

**Security:** Keep the `ADMIN_EMAIL` secret set to the exact Sharn login email, disable public Auth sign-ups, and never expose service-role credentials. The admin function must not be considered operational until the admin Auth account and secret are configured and tested. Before production, add CAPTCHA/rate limiting, test the entire customer flow, and publish an approved privacy notice. For reliability at scale, move order creation to a transactional SQL function; the interim function attempts cleanup if the enquiry status update fails.

## Multi-administrator accounts

The admin portal supports multiple **individual** Supabase Auth email/password accounts with equal enquiry/order management permissions. It does **not** use one shared password, an email allowlist or user-editable metadata. Each request is checked server-side against the private `public.admin_accounts` allowlist using the authenticated user's immutable Auth UUID. Only accounts with `active = true` may use the management Edge Function. The public Data API has no direct grants on the private tables.

**Provisioning (project owner only):**

1. In Supabase Dashboard → Authentication → Users, invite or create each administrator using **their own** email address. They must confirm their email and set a strong password. Disable public sign-ups in Auth settings.
2. Find the user's UUID in Authentication → Users, then in SQL Editor add an authorised administrator with:
   ```sql
   insert into public.admin_accounts (user_id, display_name)
   values ('REPLACE-WITH-EXISTING-AUTH-USER-UUID', 'Administrator display name')
   on conflict (user_id) do update set display_name = excluded.display_name, active = true;
   ```
   Never paste an actual password into SQL or GitHub. **Creating an Auth user alone does not grant admin access.**
3. To revoke access immediately, set `active = false` for their UUID; to delete an account, remove the Auth user after revoking access and signing out sessions.
4. Use `admin.html` for each administrator's own email/password sign-in. The server records `reviewed_by`, `approved_by`, `recorded_by`, and `customer_notified_by` Auth UUIDs on the relevant records.

**Limitations:** No account invitation/management UI has been built; an authorised Supabase project owner must provision or revoke admin access. No real administrator has been added yet. The public online enquiry form remains disabled pending spam protection and acknowledgment delivery decisions.

## Hotmail/manual launch mode

The public `submit-enquiry` Edge Function stores a pending enquiry and returns its reference **without sending any email**. The customer sees an on-screen receipt explicitly stating automatic acknowledgment email is unavailable. Sharn's team checks the private dashboard and sends all correspondence manually through Hotmail or WhatsApp. The admin portal records manually sent replies and order notifications.

The public endpoint includes an invisible honeypot and an atomic rolling rate limit of **three attempts per email address per hour**, keyed by a SHA-256 digest rather than raw email. This is basic abuse mitigation, **not** CAPTCHA or comprehensive IP-based anti-bot protection. Monitor spam and consider Turnstile before wider promotion. Enquiries are not orders; admin approval creates a separate order record.

The site is enabled through `order-config.js` once the public Edge Function has been deployed. A live end-to-end browser test with a test customer is still required before relying on submissions.

### Enquiry endpoint integration verification

Run `python tests/live_submission.py` from an environment with internet access to create one **synthetic** enquiry and verify the actual hosted Supabase Edge Function, returning HTTP 201 and a `CBS-` reference. This creates a test database record that must be removed by an administrator after verification. GitHub Actions runs this live check only for push commits whose message includes `[live-enquiry-test]`. Regular browser checks use mocked responses and do not add records.

## Contact preferences and admin dashboard
The customer chooses **email**, **SMS/text** or **WhatsApp**. Email is required and format-checked only for email enquiries; UK mobiles are required and normalized to +447... for SMS/WhatsApp. Server validation and database CHECK constraints enforce this as well. Existing email-only enquiries and orders remain valid. SMS and WhatsApp actions open the administrator's own messaging app; no automatic messages are sent or implied. Administrators must send manually and then explicitly record notification. SMS deep links depend on the device having an SMS app; a copy-message action is available.

The admin dashboard has searchable, filterable compact rows that expand into full enquiry details, reply history, approval/decline controls and order notification actions. The public storefront uses hover and scroll reveal transitions with reduced-motion support.

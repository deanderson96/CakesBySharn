# Cakes by Sharn

A responsive bakery website and private order-management system, hosted on GitHub Pages with Supabase authentication, PostgreSQL and Edge Functions.

## Current architecture (November 2026)

- **Public site:** `index.html`, `app.js`, `catalog.js`, `styles.css`. Customers browse the menu, build a basket and submit an **enquiry** (not a confirmed order).
- **Admin portal:** `admin.html`, `admin.js`. Authorized staff review enquiries, agree orders with customers, record replies, payments and expenses, and view reports.
- **Backend:** `submit-enquiry` is public and validates submissions, checks rate limits and stores enquiries using server credentials. `manage-enquiries` requires a confirmed-email Supabase password session and active admin membership (no mandatory 2FA).
- **Database:** `public` contains enquiries, orders, administrator membership and maintenance records. `accounting` contains payments, expenses and archive entries. `audit` contains administrator activity.
- **Financial records:** This is a bookkeeping aid, not a payment processor or tax filing system. Customer communication and payments are handled outside the website.

The public client uses a **publishable Supabase key**. Never put service-role credentials or email-provider secrets in frontend files.

## Local development

Serve the repository root:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/`. Supabase connectivity requires the configured project and working network access.

## Source of truth

- **Menu and UI pricing:** `catalog.js`; backend must be updated together in `supabase/functions/submit-enquiry/index.ts`. Positional product IDs (`group:index`) must not be reordered independently. `node tests/catalog-parity.cjs` detects mismatches.
- **Database schema:** **`supabase/migrations/`**, recovered verbatim from the linked Supabase project's 20 existing migrations. The root `supabase/schema.sql` is a **legacy snapshot**, not an upgrade script.
- **Edge functions:** `supabase/functions/`, with common helpers in `_shared/`.
- **Config:** `order-config.js` is public and must contain no secrets.
- **Supabase auth / user roles:** The database validates the signed-in admin identity, confirmed email and active membership; owner-only actions require the `owner` role. Dean (`owner`) and Sharn (`operator`) both have active, verified, password-enabled Supabase Auth accounts. Both can use email/password or a one-time email magic link. Magic links use `signInWithOtp({ options: { shouldCreateUser: false, emailRedirectTo: 'https://www.cakesbysharn.co.uk/admin.html' } })` to prevent self-registration. Supabase Auth must allow this redirect URL under Authentication → URL Configuration; the Email provider and magic-link email template must be enabled and an SMTP sender configured for reliable delivery. The former MFA gate was removed at the owner's request; use strong unique passwords and protect email inboxes.

## Checks

```bash
node --check catalog.js
node --check app.js
node --check admin.js
node tests/catalog-parity.cjs
python tests/architecture_contracts.py
python -m pip install playwright==1.57.0
python -m playwright install --with-deps chromium webkit
python tests/smoke.py
python tests/admin_email_draft.py
```

GitHub Actions runs the static checks and browser tests on pushes and pull requests. A hosted API test exists in `tests/live_submission.py`; it creates synthetic records, so the workflow runs it **only** on explicit opt-in commits marked `[live-enquiry-test]`. Clean up those records afterwards.

## Deployment and release process

1. Create a branch and open a pull request. Review source changes and CI results.
2. When changing the database, author a new versioned SQL migration. Never reapply `supabase/schema.sql` or edit historic applied migrations.
3. Review database privileges, RLS, confirmed-email checks and owner/operator permissions for any RPC change.
4. Deploy updated Edge Functions intentionally; note that deployment is **not** automatic from GitHub Pages.
5. Merge tested frontend changes to `main` only after the backend version is compatible, then verify the hosted website.
6. Run the negative-auth, rate-limit and order-approval scenarios before production rollout; see [architecture and controls](docs/architecture.md) and [release checklist](docs/release-checklist.md).

The published site is https://www.cakesbysharn.co.uk/ (admin: https://www.cakesbysharn.co.uk/admin.html).

## Operational safeguards

An enquiry is not an order. A confirmed order requires agreed date, time and final price, plus the customer's agreement recorded by an authorized admin. Manual receipts and expenses must be reconciled with source documents. Do not store payment-card data in this system. Respect UK privacy and allergen-information obligations when handling customer data.

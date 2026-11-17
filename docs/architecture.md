# Architecture and trust boundaries

## Component model
- GitHub Pages delivers public static assets and the admin client.
- `submit-enquiry` is intentionally public. It independently validates products, quantity, customer contact information and UK dates. It checks hashed-contact rate limits and inserts an enquiry via server-only credentials.
- `manage-enquiries` requires a valid Supabase Auth JWT, confirmed identity, AAL2 MFA and active membership in `public.admin_accounts`. It passes the caller JWT to PostgreSQL; administrative business mutations occur via RPCs.
- Business RPCs use database-side `assert_admin_mfa()`, and owner-only RPCs additionally verify the `owner` role.
- RLS is enabled on exposed `public` tables. Private `accounting` and `audit` schemas do not grant schema usage or table SELECT to browser roles.

## Data life cycle
1. Customer creates enquiry; reference is returned, not an order confirmation.
2. Admin reviews details and explicitly attests customer agreement.
3. An atomic database function locks the pending enquiry, creates the order, updates enquiry status and records an audit event.
4. Manual receipt/refund/expense entries use privileged RPCs and business constraints. Retain external supporting evidence.
5. UK tax-year reports are working papers, not official returns.
6. A daily scheduled job performs technical retention/cleanup; business-record deletion is currently disabled.

## Security testing matrix

| Persona | Expected behaviour |
|---|---|
| Anonymous | Public submission only; no customer or financial reads |
| Signed-in non-admin | Denied access to enquiries and all admin RPCs |
| Active admin, AAL1 | Denied until MFA completes |
| Active operator, AAL2 | Permitted operational actions; denied owner-only controls |
| Active owner, AAL2 | Permitted owner operations |
| Disabled admin | Denied despite a valid JWT |
| Malformed public request | 400/413 without inserting records |

Test these against a disposable/staging database rather than modifying production business records.

## Current security findings

Supabase flags 15 authenticated-callable SECURITY DEFINER RPCs. Those APIs are intentional and currently call `assert_admin_mfa()`; do not revoke them indiscriminately or replace the guard without equivalent checks. Keep privilege assertions under test. RLS no-policy notices for internal rate-limit and maintenance tables are intentional (deny-by-default). Leaked-password protection is currently disabled and needs enabling in the Supabase dashboard. Accounting foreign-key indexes were added in migration 20261117213141; remaining performance findings include RLS initplan warnings.

## Known improvement targets

- The backend catalogue and client catalogue must be kept synchronized; CI enforces exact key/type/price parity. A future product management feature could move catalogue administration to a single published source.
- Admin UI remains one large script. Refactor it incrementally behind browser tests, with no functional rewrite during a security release.
- Browser and static tests are present; database/RPC authorization integration tests and a staging deployment remain future work.
- Edge Function deployment is independent of GitHub Pages. Align backend release sequence with frontend code changes.

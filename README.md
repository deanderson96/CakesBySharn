# Cakes by Sharn

A responsive static website for Cakes by Sharn, using the business's turquoise branding and supplied menu. The site contains no payment processing, backend or tracking scripts.

## Site features

- Full menu of afternoon teas, loaves, traditional bakes, cupcakes and celebration cakes.
- Filtering by category, item quantities and an enquiry summary.
- **One-tap Clear enquiry**, which empties both the basket and the enquiry form.
- **Non-persistent basket:** selections are held in JavaScript memory only while the page is open. They are reset when the page is reloaded or reopened. The old localStorage basket key is deleted on load.
- **In-page enquiry section** with normal document scrolling instead of a fixed modal/drawer, to avoid mobile keyboard, scroll-lock and frozen-panel issues.
- Basic enquiry checks: either select a menu item or describe a custom request (at least 10 characters); dates in the past cannot be used.
- **Email enquiry:** opens the customer's default email app with `cakesbysharnx@hotmail.com` pre-addressed, a subject, and a body containing selected items, quantities, estimates, name, preferred date and requirements. A copy-text fallback remains available if no email app is configured.
- Dynamic prices and explanatory text for items with quoted or starting prices.
- SEO basics including canonical URL, Open Graph metadata, sitemap and robots.txt.

**An enquiry is not a confirmed order.** The site does not take payments or automatically send messages. Clicking **Open email with enquiry** creates a `mailto:` link and asks the customer's email app to open a draft. The customer must review the draft and press **Send**. No data is transmitted to the site or a server by this action.

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

Browser regression checks are in `tests/smoke.py`, with an Actions workflow in `.github/workflows/website-checks.yml`. They exercise Chromium and WebKit at mobile and desktop sizes and cover basket quantities, clear-all, date and empty-request validation, pre-populated email recipient/subject/body, the copy-text fallback, reload/reset behaviour, script errors and horizontal overflow.

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

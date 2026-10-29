---
type: prompt
plan: "[[2026-10-29-invoice-v1]]"
id: 18
unit: IG-8
status: todo
model: sonnet
effort: medium
depends_on: [17]
parallel_group: R
files:
  create: [public/privacy.html, public/terms.html]
  modify: [public/js/copy.js, public/css/app.css]
  delete: []
---
# 18 · Privacy and terms pages

## Task
Create the privacy notice (in English and Filipino) and the terms of use, which include the not-a-BIR-invoice explainer. Both are static pages with no scripts.

## Context
Repo: `/home/apa/Code/portfolio/invoice-generator`. Read `docs/SPEC.md` §1 ("What it is not"), §8 ("Disclaimer", "Release rules") and §11. Read `public/js/copy.js`. It exports `DISCLAIMER`, `PRIVACY_LINE`, `PH_FOOTER_NOT_BIR`, `APPROVED_SENTENCES` and `BANNED_PHRASES`.

**Wording rule** (enforced by `tests/wording.test.js`): "BIR-compliant", "BIR-ready", "official receipt(s)" and "official invoice(s)" may appear **only** inside sentences listed in `APPROVED_SENTENCES`. The test normalises whitespace and decodes `&#39;`, `&rsquo;`, `&apos;`, `&quot;` and `&amp;` before matching.
- Where the pages repeat the disclaimer, copy `DISCLAIMER` verbatim.
- If the explainer truly needs another sentence containing a banned phrase, keep it to at most one. Add it as a new exported constant to `copy.js` and append it to `APPROVED_SENTENCES`, then use it verbatim in the page.
- Prefer wording that avoids the phrases.

Other rules:
- No `<script>`, no inline `<style>`, no `style=""` and no `on*=` attributes (`tests/no-innerhtml.test.js` checks HTML).
- Link `css/app.css` and keep the page styles there, under a `.page` class.
- No third-party requests.
- Use `lang="en"` on `<html>` and `lang="fil"` on the Filipino section.

**`privacy.html`** (title "Privacy — Billing Statement Generator"):
- **English:** what is collected (nothing from the form; the hosting provider, Vercel, keeps standard access logs such as IP address, user agent and time). What isn't collected: no analytics, no cookies, no accounts, and no form data sent anywhere. Everything is stored in the browser's localStorage on the user's device, and "Clear all data" or the browser's settings remove it. Include `PRIVACY_LINE`.
- **Filipino section**, with the same content (`<section lang="fil">`). Add an HTML comment `<!-- Filipino text: review by a native speaker before release -->`.
- Contact: "Questions: open an issue at https://github.com/alessandrocruz5/invoice-generator/issues".
- A link back to the app (`./`).

**`terms.html`** (title "Terms of use — Billing Statement Generator"):
- Provided as is, without warranty. It isn't tax or legal advice. Compliance with BIR rules, and with the rules of the user's own jurisdiction, is the user's responsibility.
- **"This is not a BIR invoice" explainer**, from spec §1. A billing statement is a payment request. Under RMC 77-2024, a billing statement issued without an invoice doesn't count as evidence of sale, and the penalty under NIRC Sec. 264(a) applies to failing to issue an invoice. Validity comes only from an Authority to Print or a BIR-registered system, and a TIN on the document doesn't change that. Registered users should also issue their BIR invoice and enter its number in BIR Invoice No. Link the sources from spec §1 (Batas Natin RMC 77-2024 and Respicio & Co.) with `rel="noopener noreferrer"`. Plain links are not requests.
- Outside the Philippines: e-invoicing mandates may mean a PDF doesn't count.
- Include `DISCLAIMER` verbatim.
- A link back to the app.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Add analytics, embeds or external images.
- Reword the existing constants in `copy.js`.
- Create or switch branches, commit, or push.

## Done when
```bash
npm test
node --test tests/wording.test.js tests/no-innerhtml.test.js
```
- Both pages render with `python3 -m http.server 8080 -d public` at `/privacy.html` and `/terms.html`, readable at 375 px, with no console errors.

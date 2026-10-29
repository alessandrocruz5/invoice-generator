---
type: prompt
plan: "[[2026-10-29-invoice-v1]]"
id: 19
unit: IG-8
status: todo
model: sonnet
effort: high
depends_on: [18]
parallel_group: S
files:
  create: [public/support.html, public/favicon.svg, public/img/donate-qr.png]   # donate-qr.png: supplied by the owner; the executor only checks it exists
  modify: [public/index.html, public/css/app.css, public/js/editor.js]
  delete: []
---
# 19 · Footer, support page, meta, a11y pass

## Task
Finish the public page: the app footer, the disclaimer under Download PDF, the support page with the owner's GCash/Maya QR, meta and Open Graph tags, and the favicon. Then do an accessibility pass over the whole app.

## Context
Repo: `/home/apa/Code/portfolio/invoice-generator`. Read `docs/SPEC.md` §7 (wireframe footer), §8 ("Disclaimer", "Accessibility", "Public page basics", "Release rules") and §11 (donation). Read `public/index.html`, `public/css/app.css`, `public/js/editor.js` and `public/js/copy.js` (`DISCLAIMER`, `PRIVACY_LINE` and `TAGLINE`).

**Precondition:** `public/img/donate-qr.png` must exist; the owner supplies it. If it's missing, **stop and report**. Don't create a placeholder image.

**Rules:**
- The CSP is `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:`.
- No inline `<script>`, `<style>`, `style=""` or `on*=` attributes; no HTML sinks in JS.
- Banned phrases appear only inside the verbatim `DISCLAIMER` (see `tests/wording.test.js`).
- The disclaimer **never** appears on the sheet or in the PDF, and the tool's name never appears on the user's document.
- No services, "hire me" or affiliate links (Vercel Hobby rules); the donation QR is the only money-related link.

**index.html:**
- `<head>`:
  - `<title>`: "Free Billing Statement Generator for Filipino Freelancers".
  - `<meta name="description">`: one sentence that mentions withholding tax for Filipino freelancers and invoices for clients abroad (Generic mode).
  - `og:title`, `og:description` and `og:type=website`. No `og:image`, which would need a hosted asset.
  - `<link rel="icon" href="favicon.svg" type="image/svg+xml">`.
  - `<meta name="theme-color">`.
- Under the h1 or in the top bar, show `TAGLINE` as static text.
- Under the Download PDF button in the sidebar, add a `<p class="disclaimer">` with `DISCLAIMER` verbatim (static HTML text, so the wording test can strip it).
- `#app-footer` keeps the Clear all data button from prompt 16. Add "Not tax advice", "Stays in your browser", Privacy (`privacy.html`), Terms (`terms.html`) and "Support this tool" (`support.html`), plus `PRIVACY_LINE` and `DISCLAIMER` as static text.

**support.html** (title "Support — Billing Statement Generator"):
- A short thank-you and "Donations keep this tool free."
- `<img src="img/donate-qr.png" alt="GCash or Maya QR code for donations" width="240" height="240">`. Size it in CSS, not in a `style` attribute.
- A note that donations are optional and buy no service.
- A link back to the app. The same footer links.

**favicon.svg:** a simple, original document-and-peso glyph (≤ 1 KB, no text, no external references).

**Accessibility pass** (WCAG 2.2 AA), fixing what you find in `index.html`, `app.css` and `editor.js` only:
- Every value input has a fixed `aria-label` with its default name, and every icon button has an `aria-label`.
- Focus rings are visible everywhere, and a keyboard-only user can build and download a complete billing statement.
- Text contrast is ≥ 4.5:1, including muted labels, placeholders, warnings and the dark-mode chrome. The sheet stays black on white.
- Remove buttons on items show on focus, and always on touch screens.
- The `<dialog>` traps focus natively and returns it to the opener.
- Add a "Skip to the document" link.
- Target size is ≥ 24 × 24 px for every control (WCAG 2.5.8).
- At 375 px there's no horizontal scroll, and the sticky Download bar doesn't cover the last field: add bottom padding equal to the bar's height.

## Do not
- Touch files outside the `files` list. If you must, stop and report why. (`public/img/donate-qr.png` is the owner's; never modify it.)
- Add analytics, external fonts, or any donation provider widgets or scripts.
- Create or switch branches, commit, or push.

## Done when
```bash
npm test
node --test tests/wording.test.js tests/no-innerhtml.test.js
find public -path public/vendor -prune -o -name '*.js' -print0 | xargs -0 -r -n1 node --check
test -f public/img/donate-qr.png
```
Run `python3 -m http.server 8080 -d public` and check:
- Lighthouse accessibility scores ≥ 95 on `/`.
- A complete P1 billing statement can be made and downloaded with the keyboard alone.
- The disclaimer shows in the footer and under Download PDF, and the downloaded PDF doesn't contain it.
- The footer links to Privacy, Terms and Support all work.
- At 375 px there's no horizontal scroll, and the sticky Download PDF bar works.

---
type: prompt
plan: "[[2026-10-29-invoice-v1]]"
id: 01
unit: U1
status: todo
model: sonnet
effort: low
depends_on: []
parallel_group: A
files:
  create: [package.json, vercel.json, CLAUDE.md, docs/SPEC.md, public/index.html, public/css/app.css]
  modify: []
  delete: ["docs/Invoice Generator — Build Spec.md"]
---
# 01 · Scaffold and profile

## Task
Create the static-site scaffold and the repo profile, and move the spec to `docs/SPEC.md` with a decisions addendum.

## Context
Repo root: `/home/apa/Code/portfolio/invoice-generator`. The repo holds only `README.md` and the spec. There is no code yet.

1. **Move the spec:** `mv "docs/Invoice Generator — Build Spec.md" docs/SPEC.md`. The file is untracked, so a plain `mv` is enough. Then append this section at the end of `docs/SPEC.md`, exactly:

```markdown

## 11. Implementation decisions (2026-10-29)

These refine the sections above. Where they differ, this section wins.

- **Base branch.** Work merges into `develop` (Vercel preview). Production is one `develop` → `main` merge after the section 10 checklist passes.
- **Banned wording.** "BIR-compliant", "BIR-ready", "official receipt" and "official invoice" may appear only inside the approved disclaimer sentences exported from `public/js/copy.js`. `tests/wording.test.js` removes those sentences, then scans `public/` (except `vendor/`) for the phrases.
- **Donation.** A `support.html` page shows the owner's GCash/Maya QR image (`public/img/donate-qr.png`), linked from the footer.
- **Document shape additions.** `withholding_preset` (preset id or `"custom"`, default `""`); label key `ship_to_title` ("Ship To"). `fields.discounts` and `fields.tax` are `false` (off), `"%"` (percent) or `true` (flat), as in invoice-generator.com's API.
- **Numbers.** State holds canonical `.`-decimal strings only. Text that fails to parse stays in the editor's memory with its error, is never saved, and counts as 0 until fixed.
- **Flat amounts** (flat discount, flat tax, shipping, amount paid) accept up to 4 decimals and round half up to the currency's places, so changing currency never makes them invalid. Discount % accepts up to 3 decimals.
- **Negative intermediates** (reachable only with input that validation blocks) round half away from zero.
- **Paper default** follows the browser language when a document is created: Letter for en-US, en-CA, en-PH and es-MX, otherwise A4.
- **PDF filename** uses the title in title case: `Billing Statement BS-0007.pdf`.
- **History CSV** is UTF-8 with a BOM and CRLF line endings; text cells starting with `=`, `+`, `-`, `@`, a tab or a carriage return are prefixed with `'`.
- **Extra test files.** `tests/withholding.test.js`, `tests/state.test.js` and `tests/pdf-glyphs.test.js` exist beside the section 9 list.
- **Browser floor.** Chrome/Edge 99+, **Firefox 98+** (native `<dialog>`, which section 6 requires; this also covers `structuredClone` and `crypto.randomUUID`), Safari 15.4+.
- **Not-saving banner.** It appears only when storage actually fails. Current browsers give private windows working (temporary) storage, so the section 10 check is done with site data blocked for the origin.
- **Previews.** The Vercel project's production branch is `main`. Preview checks need Deployment Protection turned off for previews, or a Protection Bypass for Automation secret sent as the `x-vercel-protection-bypass` header.
```

2. **`package.json`**, exactly:
```json
{
  "name": "invoice-generator",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

3. **`vercel.json`**, exactly as spec §8 (copy it from `docs/SPEC.md` §8 "Security headers"; reproduced here):
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "outputDirectory": "public",
  "cleanUrls": true,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Content-Security-Policy", "value": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "no-referrer" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=()" },
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains" }
      ]
    }
  ]
}
```

4. **`CLAUDE.md`**, exactly :
````markdown
# Invoice Generator

## Rules
- Read `docs/SPEC.md` before changing anything. Section 11 records the implementation decisions.
- Add no dependencies and no third-party requests (scripts, styles, fonts, analytics, fetches).
- Never edit files in `public/vendor/`.
- Run `npm test` before every commit.

## Project
- Jira key: IG
- Free, public billing statement generator for Filipino freelancers, with a Generic invoice mode. Static site:
  plain HTML, CSS and ES modules in `public/`, served by Vercel with no build step. pdfmake 0.3.11 is vendored
  in `public/vendor/pdfmake/` and loaded on the first PDF download. Data stays in the browser (localStorage).

## Workflow
- Base branch: develop
- Release: merge `develop` → `main` after the `docs/SPEC.md` section 10 checklist passes on the preview. `main` deploys to production.

## Commands
```sh
npm test
TZ=America/Los_Angeles npm test
TZ=Asia/Manila npm test
find public -path public/vendor -prune -o -name '*.js' -print0 | xargs -0 -r -n1 node --check
```

## Review constraints
- No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval` or `new Function` in `public/js/`. Build the DOM with `createElement` and `textContent`.
- No inline `<script>`, inline `<style>` or `style=""` attributes in HTML. Setting `element.style.*` from JS is fine.
- Never use "BIR-compliant", "BIR-ready", "official receipt" or "official invoice", except inside the approved sentences in `public/js/copy.js`.
- Money math only in `public/js/calc.js`, on BigInt scaled integers. No floats, `parseFloat`, `Number()` or `toFixed` on money.
- Never call `new Date('YYYY-MM-DD')`; use `public/js/dates.js`.
- Every `localStorage` access is inside try/catch.
- Pure modules (all of `public/js/` except `main.js` and `editor.js`) never touch `document`, `window`, `navigator` or `localStorage` at import time.
- The tool's own name or branding never appears on the user's document (sheet or PDF).

## High-stakes paths
- `public/js/calc.js`
- `public/js/storage.js`
- `public/js/copy.js`
- `vercel.json`

## Hidden coupling
- Saved document shape: `state.js` (defaults, `migrate`) ↔ `storage.js` (`sanitizeImport`, history, CSV) ↔ `editor.js` ↔ `pdf.js`.
- Totals: `calc.js` `computeTotals` output ↔ `modes.js` `totalsRows` ↔ `editor.js`, `pdf.js`, `validate.js`, the history CSV.
- Label keys: `state.js` `DEFAULT_LABELS` ↔ `editor.js` ↔ `pdf.js`.
- localStorage keys `invoicegen:v1:*` live only in `storage.js`.
- CSP in `vercel.json` ↔ the no-inline rules ↔ pdfmake's lazy `<script>` loading.
- Approved sentences in `copy.js` ↔ `tests/wording.test.js` ↔ `index.html`, `terms.html`, `privacy.html`, `pdf.js`.
- Font allowlist in `pdf-glyphs.js` ↔ `validate.js` warning ↔ `pdf.js` money formatting.
````

5. **`public/index.html`**, a placeholder (later prompts replace the body):
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Free Billing Statement Generator for Filipino Freelancers</title>
  <link rel="stylesheet" href="css/app.css">
</head>
<body>
  <main>
    <h1>Billing Statement Generator</h1>
    <p>Coming soon.</p>
  </main>
</body>
</html>
```

6. **`public/css/app.css`**: only a base rule, `body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; background: #fff; }`.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Add dependencies, `node_modules`, a lockfile or a `build` script.
- Create or switch branches, commit, or push.

## Done when
```bash
npm test                                   # exits 0 (no tests yet)
node --input-type=module -e "import fs from 'node:fs'; for (const f of ['vercel.json','package.json']) JSON.parse(fs.readFileSync(f,'utf8'))"
test -f docs/SPEC.md && ! test -e "docs/Invoice Generator — Build Spec.md"
grep -c '^## 11. Implementation decisions' docs/SPEC.md   # 1
! grep -q 'style=' public/index.html
```

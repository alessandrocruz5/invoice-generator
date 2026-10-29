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

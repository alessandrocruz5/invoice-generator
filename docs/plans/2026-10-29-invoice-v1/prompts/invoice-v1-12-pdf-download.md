---
type: prompt
plan: "[[2026-10-29-invoice-v1]]"
id: 12
unit: U5
status: todo
model: sonnet
effort: medium
depends_on: [11]
parallel_group: L
files:
  create: []
  modify: [public/js/pdf.js, public/js/main.js, public/index.html]
  delete: []
---
# 12 · PDF lazy load and download

## Task
Add the pdfmake lazy loader and the download function to `public/js/pdf.js`, and wire the sidebar's Download PDF button in `main.js`.

## Context
Repo: `/home/apa/Code/portfolio/invoice-generator`. Read `docs/SPEC.md` §2 (lazy loading) and §6 ("PDF generation"). Read `public/js/pdf.js` (the pure `buildDocDefinition`, `pdfMoneyFormatter`, `pdfFilename` and `fitBox` from prompt 11) and `public/js/main.js` (`app`, `computeView`, `refresh` and the `#download` button from prompt 09). Rules: no inline scripts, no HTML sinks, no third-party requests. Load pdfmake only from same-origin `vendor/pdfmake/`.

Add to `pdf.js`. **Keep all DOM access inside function bodies**, so `tests/pdf.test.js` can still import the module in Node:
```js
let pdfMakePromise = null;
export function loadPdfMake()
  // cached promise: append <script src="vendor/pdfmake/pdfmake.min.js">, on load append <script src="vendor/pdfmake/vfs_fonts.js">,
  // on load resolve globalThis.pdfMake. On error reset pdfMakePromise = null and reject with Error('Could not load the PDF tool. Check your connection and try again.')
export async function downloadPdf(def, filename)
  // const pdfMake = await loadPdfMake(); await pdfMake.createPdf(def).download(filename)
```
Before relying on it, check how 0.3.11's `vfs_fonts.js` registers fonts: read its first ~20 lines and pdfmake's README in the vendored folder if one exists. If it needs `pdfMake.addVirtualFileSystem(...)` or similar, do that in `loadPdfMake`.

In `main.js`, the Download button click handler:
1. Prompt 14 inserts validation here. Leave a clearly marked `// validation gate (prompt 14)` comment where it goes.
2. Measure the natural sizes of `doc.logo` and `doc.payment_qr` by loading each data URL into `new Image()` and awaiting `decode()`. Use `{ width: naturalWidth, height: naturalHeight }`, or null when absent.
3. `formatters = { money: pdfMoneyFormatter({ locale, currency: doc.currency, currencyDisplay: doc.settings.currencyDisplay }), date: (iso) => formatDate(iso, locale), label: (k) => labelFor(doc, k), images }`.
4. `def = buildDocDefinition(doc, view.totals, formatters)`, then `await downloadPdf(def, pdfFilename(labelFor(doc,'header'), doc.number))`.
5. Prompt 17 records the download in History and lastNumber. Leave a marked `// after download (prompt 17)` comment.
6. While the PDF is loading or building, set `aria-busy="true"` and `disabled` on the button and restore them in `finally`. Show load errors in `#messages` as text (`textContent`), not with `alert()`.

`index.html`: add only what's needed (for example `aria-describedby` on the button for the busy state). No inline scripts.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Load pdfmake on page load, or from a CDN.
- Use `window.print()`, html2canvas or similar.
- Create or switch branches, commit, or push.

## Done when
```bash
npm test
find public -path public/vendor -prune -o -name '*.js' -print0 | xargs -0 -r -n1 node --check
```
Run `python3 -m http.server 8080 -d public` and check:
- DevTools Network shows no `vendor/pdfmake` request on page load; the first Download fetches both files, and a second Download fetches nothing new.
- The P1 document downloads `Billing Statement BS-0001.pdf` directly, with no print dialog. The text is selectable, ₱ renders, and the PH footer is on the last page.
- With 40 items, rows don't split, the header repeats, the totals stay whole, and "Page X of Y" appears.
- A THB document prints "THB".
- An fr-FR EUR document shows a plain space as the thousands separator.
- Both A4 and Letter fit.
- The console shows no errors.

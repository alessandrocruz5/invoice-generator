---
type: prompt
plan: "[[2026-10-29-invoice-v1]]"
id: 11
unit: U5
status: todo
model: sonnet
effort: high
depends_on: [10]
parallel_group: K
files:
  create: [public/js/pdf.js, tests/pdf.test.js]
  modify: []
  delete: []
---
# 11 · PDF document definition

## Task
Create `public/js/pdf.js` with a pure `buildDocDefinition(state, totals, formatters)` and its helpers, and `tests/pdf.test.js`. Prompt 12 adds the lazy loader and download to the same file, so keep this prompt's code free of `document` and `window`.

## Context
Repo: `/home/apa/Code/portfolio/invoice-generator`. Read `docs/SPEC.md` §5 ("Totals block"), §6 ("PDF generation", "PDF font limits") and §11 (filename, QR scaling). pdfmake 0.3.11 is vendored at `public/vendor/pdfmake/`. Use its document-definition format (`content`, `styles`, `defaultStyle`, `pageSize`, `pageMargins`, `footer: (currentPage, pageCount) => …`, `table` with `headerRows` and `dontBreakRows`, `stack` with `unbreakable: true`, `image` with `width`/`height` or `fit`). Don't import pdfmake. The module must import cleanly in Node.

**Modules** (pure, existing):
- `modes.js`: `totalsRows(doc, totals, label)` returns `[{ key, label, value, negative, iso, emphasis }]`, plus `modeConfig(mode)` with `{ isPh, sellerTinPrefix, show:{…} }`.
- `state.js`: `labelFor(doc, key)`.
- `currency.js`: `makeMoneyFormatter`, `isoSuffix`, `minorUnits`.
- `pdf-glyphs.js`: `sanitizeForPdf(str)` and `symbolOrCode(formatted, reformatAsCode)`.
- `dates.js`: `formatDate(iso, locale)`.
- `copy.js`: `PH_FOOTER_NOT_BIR`, `PH_FOOTER_NO_INPUT_TAX`, `FORM_2307_NOTE` and `QR_LABEL`.
- `calc.js`: `isZero`.

**API:**
```js
export function pdfMoneyFormatter({ locale, currency, currencyDisplay })
  // -> (decimalString, opts) => symbolOrCode(symFmt(str, opts), () => codeFmt(str, opts))
  //    symFmt uses the chosen display; codeFmt uses currencyDisplay 'code'. THB -> 'THB 1,500.00'.
export function pdfFilename(title, number)
  // `${titleCase(title)} ${number}.pdf`, replacing each of / \ : * ? " < > | with '-'; titleCase('BILLING STATEMENT') = 'Billing Statement'
export function fitBox(natural, box)   // natural {width,height} in CSS px -> {width,height} in pt (px * 0.75), scaled by min(1, box.w/w, box.h/h); never upscales
export function buildDocDefinition(state, totals, formatters)
  // state = the document (see docs/SPEC.md §3 shape + §11 additions)
  // totals = computeTotals output (strings)
  // formatters = { money(str, opts), date(iso), label(key), images: { logo: {width,height}|null, qr: {width,height}|null } }
```

**Layout** (follow the sheet; margins 40 pt; `pageSize` = `state.settings.paper`, which is `'A4'` or `'LETTER'`):
- Row 1: the logo on the left (`fit` inside 150 × 60 pt, via `fitBox` when the natural size is known), and on the right the title (`label('header')`, large, bold) with `# {number}` under it.
- From (multi-line), then a seller TIN line in PH modes when filled: `${sellerTinPrefix} ${seller_tin}` (the prefix is fixed, never a label).
- Two columns:
  - Left: `label('to_title')` and Bill To, a client TIN line (`label('client_tin_title')`) in PH modes when filled, and Ship To (generic, only when filled).
  - Right: a meta table of Date (`formatters.date`), Payment Terms, Due Date, PO Number and BIR Invoice No. (PH only), then the custom fields. **Omit any meta row whose value is empty.**
- Items table: columns `item_header`, `quantity_header`, `unit_cost_header` and `amount_header`; `headerRows: 1` and `dontBreakRows: true`. Show the name in bold and the description under it. Iterate `doc.items` with its **original** index `i` and skip blank rows (`state.js` `isBlankItem`) inside the loop. Never filter first, because `totals.amounts[i]` is aligned with `doc.items`. Rate uses `money(unit_cost, { maxFractionDigits: min(4, typed decimals) })`; amount is `money(totals.amounts[i])`.
- Bottom: two columns.
  - Left: Notes (with `FORM_2307_NOTE` appended on its own line when `fields.withholding && form_2307_note`), Terms, and Payment Details. Then the QR: `QR_LABEL` above the image, sized with `fitBox(images.qr, {w:120,h:120})`, never upscaled. Skip any empty block.
  - Right: the totals as one `stack` with `unbreakable: true`, from `totalsRows`. Each row has its label, plus `isoSuffix(currency)` when `iso`, and `money(value)` prefixed with '−' (U+2212) when `negative`. A row with `value === null` is text only. `emphasis` means bold and the largest size.
- `footer(currentPage, pageCount)`:
  - When `pageCount > 1`, "Page X of Y".
  - On the **last page only**, in PH modes: `PH_FOOTER_NOT_BIR` when `footer.not_bir_invoice`, and `PH_FOOTER_NO_INPUT_TAX` when `footer.not_valid_input_tax`, in small type.
  - Never in generic mode.
- Pass every user string through `sanitizeForPdf`. Render multi-line text as plain strings with `\n` (pdfmake honours it).
- `info: { title: \`${label('header')} ${number}\` }`. The tool's own name never appears anywhere in the PDF.
- Images: pass `state.logo` and `state.payment_qr` data URLs directly (they were validated on upload or import).

**Tests** (`tests/pdf.test.js`; build state with `createDefaultDocument` from `state.js` and totals with `computeTotals`):
- The definition has `content`, `pageSize` and `pageMargins` = 40, and its items table has `headerRows === 1` and `dontBreakRows === true`.
- A THB document renders money containing 'THB' and no '฿'. A PHP document keeps '₱'.
- The PH footer appears in `footer(2, 2)` and not in `footer(1, 2)`. It's absent when `footer.not_bir_invoice` is false, and absent in generic.
- "Page 1 of 2" appears only when `pageCount > 1`.
- `fitBox({width:100,height:100},{w:120,h:120})` gives 75 × 75 pt (no upscale); `fitBox({width:400,height:200},{w:120,h:120})` gives 120 × 60.
- `pdfFilename('BILLING STATEMENT','BS-0007')` is 'Billing Statement BS-0007.pdf'; `pdfFilename('Invoice','A/B:1')` is 'Invoice A-B-1.pdf'.
- With empty Ship To, PO, BIR Invoice No., discount off, amount paid 0 and no withholding, none of those labels appear anywhere in the JSON-stringified definition (§10 "Empty optional parts").
- A renamed label (`labels.to_title = 'Client'`) appears in the definition.
- Items `[blank row, 2 × 100]`: the table has one item row, and its amount is the formatted '200.00' (index alignment).
- The JSON-stringified definition never contains 'Billing Statement Generator'.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Reference `document`, `window` or `pdfMake` at module top level, or import vendor files.
- Do arithmetic other than `fitBox` sizing; money comes from `totals`.
- Create or switch branches, commit, or push.

## Done when
```bash
npm test
node --test tests/pdf.test.js
find public -path public/vendor -prune -o -name '*.js' -print0 | xargs -0 -r -n1 node --check
```

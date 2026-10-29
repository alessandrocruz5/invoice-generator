---
type: prompt
plan: "[[2026-10-29-invoice-v1]]"
id: 10
unit: U4
status: todo
model: sonnet
effort: high
depends_on: [09]
parallel_group: J
files:
  create: []
  modify: [public/js/editor.js, public/js/main.js, public/css/app.css]
  delete: []
---
# 10 · Items, totals, adjustments, payment block

## Task
Fill the empty sheet sections from prompt 09: line items, the totals block with adjustment rows, notes and terms, the payment block with the QR upload, the logo upload, and the PH footer toggles.

## Context
Repo: `/home/apa/Code/portfolio/invoice-generator`. Read `docs/SPEC.md` §3 ("Sheet regions", "Item fields"), §5 ("Totals block", "Withholding presets"), §7 ("Editor behaviour") and §11. **Read `public/js/main.js` and `public/js/editor.js` first, and follow their architecture exactly:**
- `app = { doc, invalid, view }`; `refresh({ structural })`; one delegated `input` and `change` handler, `handleEdit`.
- `data-path` and `data-kind` on every control (`qty`/`rate` maxDecimals 4, `percent` 3, `money` 4, through `parseUserNumber`).
- `renderSheet` rebuilds, `updateComputed` updates text only.
- The empty containers `#logo-slot`, `#items-section`, `#notes-section`, `#payment-section`, `#totals-section` and `#sheet-footer`.

Rules: no `innerHTML` (or other HTML sinks), no inline styles or handlers in HTML, DOM built with `createElement` and `textContent`. Never write the banned phrases. Fixed strings come from `public/js/copy.js`: `PH_FOOTER_NOT_BIR`, `PH_FOOTER_NO_INPUT_TAX`, `FORM_2307_NOTE` and `QR_LABEL`.

**Modules:**
- `calc.js`: `computeTotals(doc,m)` returns `{ amounts[], subtotal, discount, net, vat, tax, shipping, total, withholding, netPayable, amountPaid, balance }`, strings with `m` decimals. Also `LIMITS` and `isZero`.
- `modes.js`: `totalsRows(doc, totals, label)` returns `[{ key, label, value, negative, iso, emphasis }]`, plus `VAT_TREATMENTS` and `modeConfig(mode).show`.
- `withholding.js`: `WITHHOLDING_PRESETS [{id,rate,label}]`, `CUSTOM_PRESET`, `presetById`, `helperText(id)`.
- `state.js`: `newItem()`, `checkImageDataUrl(dataUrl)`, `MAX_IMAGE_BYTES`, `labelFor`.
- `currency.js`: `isoSuffix(code)` and `roundingNote(code)`. `view.fmt(str, { maxFractionDigits })` formats money.

**Items** (`#items-section`):
- A header row with editable labels `item_header`, `quantity_header`, `unit_cost_header` and `amount_header`.
- Per item `i`:
  - Name input (`items.i.name`, maxlength 200, `aria-label="Item i+1 name"`).
  - Description textarea under the name (`items.i.description`, maxlength 1000, `aria-label="Item i+1 description"`).
  - Quantity (`data-kind="qty"`, `inputmode="decimal"`) and Rate (`data-kind="rate"`, `inputmode="decimal"`).
  - Amount: read-only text, `view.fmt(totals.amounts[i])`, with `data-computed="amount-i"`.
  - A remove × button (`aria-label="Remove item i+1"`). It shows on hover and focus, and always on touch (`@media (hover: none)`).
- "+ Line item" appends `newItem()` (structural; disabled at `LIMITS.items`), then focuses the new name input.
- No reordering. Below 900 px each item is a card.

**Totals** (`#totals-section`): render the rows from `totalsRows`, with editable labels where the row has a label key. The editor also needs controls the PDF doesn't print:
- **Discount:** when off, a "+ Discount" button sets `fields.discounts = '%'`. When on: a %/flat toggle (`fields.discounts` `'%'` ↔ `true`), the value input (`discounts`, kind `percent` or `money`), and × to turn it off.
- **VAT** (ph-vat): the row plus a treatment `<select data-path="vat_treatment">` from `VAT_TREATMENTS`.
- **VAT-exempt note** (ph-nonvat): a checkbox `vat_exempt_note`, "Show 'VAT-exempt sale' (8% filers)", off by default.
- **Tax** (generic): "+ Tax" / %·flat toggle / value (`tax`) / ×. `fields.tax` is `false | '%' | true`.
- **Shipping** (generic): "+ Shipping" / value (`shipping`, money) / ×.
- **Withholding:** "+ Withholding" sets `fields.withholding = true`. When on: a preset `<select data-path="withholding_preset">` with the `WITHHOLDING_PRESETS` labels plus "Custom rate". Picking a preset sets `withholding_rate` to its rate. Add a custom rate input (`withholding_rate`, percent; typing in it sets `withholding_preset = 'custom'`), the helper text from `helperText(preset)` in a `<p>` linked by `aria-describedby`, and ×.
- **Amount Paid:** always an input (`amount_paid`, money).
- **ISO code:** rows with `iso: true` append `isoSuffix(doc.currency)` in a separate `<span>` outside the label input, in both display styles. Negative rows show a leading '−' before the formatted value. Balance Due is bold and the largest text in the block.
- Every computed value element gets `data-computed="<row key>"`, so `updateComputed` can set the `textContent` of amounts and totals on every input. Row visibility changes, such as amount paid going from 0 to non-zero, may trigger a structural refresh. Keep that check cheap.
- **Totals are not a live region** (§8).

**Notes and Terms** (`#notes-section`): editable labels `notes_title` and `terms_title`, with auto-growing textareas. When `fields.withholding` is on, a checkbox `form_2307_note` (default on): "Add 'Kindly issue BIR Form 2307 for the tax withheld.'".

**Payment block** (`#payment-section`):
- Editable label `payment_title`, and a textarea `payment_details` (placeholder "Bank, account name and number, GCash or Maya number").
- "+ Add QR image" opens `<input type="file" accept="image/png,image/jpeg">` (visually hidden, triggered by the button). On a file:
  - Check `file.type` is png or jpeg and `file.size ≤ MAX_IMAGE_BYTES`.
  - `FileReader.readAsDataURL`, then `checkImageDataUrl`.
  - If it passes, set `payment_qr` and show the `<img>` with its label "Scan to pay (InstaPay QR)" and a × remove button.
  - Otherwise show the inline error "Use a PNG or JPEG under 500 KB." next to the control, and change nothing.
- The tool never generates or edits QR codes.

**Logo** (`#logo-slot`): the same upload flow. "+ Add your logo" sets `logo`; show the `<img>` (`alt="Logo"`) with ×.

**Footer** (`#sheet-footer`, PH modes only):
- A checkbox `footer.not_bir_invoice` (default on) that shows `PH_FOOTER_NOT_BIR` as text on the sheet when checked.
- A checkbox `footer.not_valid_input_tax` (default off) for `PH_FOOTER_NO_INPUT_TAX`.
- Never in generic mode.

**Currency note:** after a currency change, show `roundingNote(doc.currency)` in `#currency-note` when it isn't null.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Do arithmetic outside `calc.js`.
- Add validation messages beyond the upload error (prompt 14 adds those), or PDF or storage code.
- Create or switch branches, commit, or push.

## Done when
```bash
npm test
find public -path public/vendor -prune -o -name '*.js' -print0 | xargs -0 -r -n1 node --check
```
Run `python3 -m http.server 8080 -d public` and check:
- P1: ph-nonvat, 1 × 25000 and 1 × 5000, withholding preset 5% → Total (PHP) ₱30,000.00, Less: Withholding Tax (5%) −₱1,500.00, Net Amount Payable (PHP) ₱28,500.00, and the 5% helper text is visible.
- Switch to PH – VAT, then back to Non-VAT: no VAT row remains.
- PH – VAT zero-rated shows "Zero-rated sale" at 0.00.
- USD → JPY → BHD leaves the typed values untouched. JPY shows no decimals and the rounding note; BHD shows 3 decimals.
- en-US `1,500` in Rate keeps the text as typed, and the amount shows 0.
- The ISO code appears on Total, Net Amount Payable and Balance Due in both Symbol and Code styles.
- A 600 KB PNG is rejected with the message.
- The console shows no errors, and there's no horizontal scroll at 375 px.

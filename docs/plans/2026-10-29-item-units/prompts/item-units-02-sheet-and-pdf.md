---
type: prompt
plan: "[[2026-10-29-item-units]]"
id: 02
unit: IG-9
status: todo
model: sonnet
effort: medium
depends_on: [01]
parallel_group: B
files:
  create: []
  modify: [public/js/editor.js, public/js/pdf.js, public/css/app.css, tests/pdf.test.js]
  delete: []
---
# 02 · Unit column on the sheet and in the PDF

## Task
Show each item's unit (Qty or Hours) as a select on the editable sheet and as a column in the PDF. The column
order is **Item · Qty / Hrs · Unit · Rate · Amount**. The calculation doesn't change.

## Context
Repo root: `/home/apa/Code/portfolio/invoice-generator`. Read `CLAUDE.md` first. Prompt 01 is already done:
- `public/js/state.js` exports `ITEM_UNITS = [{ id: 'qty', label: 'Qty' }, { id: 'hours', label: 'Hours' }]`.
- Every item has `unit`, either `'qty'` or `'hours'`. `newItem`, `migrate` and `sanitizeImport` guarantee it.
- The label key `unit_header` exists (default 'Unit'), and `quantity_header` defaults to 'Qty / Hrs'.

**`public/js/editor.js`** (DOM only through `createElement`/`textContent`; never `innerHTML`)
- Import `ITEM_UNITS` alongside `DEFAULT_LABELS` from `./state.js` (line 6).
- `itemRow` (line 280-299): between the quantity field (line 289) and the rate field (line 290), add
  `selectField(ctx, \`items.${i}.unit\`, ITEM_UNITS, { class: 'field item-unit', 'aria-label': \`Item ${i + 1} unit\` })`.
  `selectField` (line 99-106) gives it `data-path`, `data-kind="select"` and the id `idFor(path)`.
  `main.js` `handleEdit` already handles `select` (it calls `setPath`, then `refresh({ structural: true })`, and
  focus is restored by id), so **`main.js` needs no change.**
- `itemsSection` (line 301-314): add `columnLabel('unit_header', 'col-unit')` between the `quantity_header`
  and `unit_cost_header` column labels.

**`public/css/app.css`** (items grid at lines 185-201, narrow-screen block at 288-302)
- Desktop: `grid-template-columns: minmax(0, 1fr) 6.5rem 6rem 8rem 8rem 2rem;`. Then
  `.item-unit { grid-column: 3; grid-row: 1; }`, rate → column 4, amount → 5, remove → 6, and
  `.items-head .col-amount { grid-column: 5; }`. Check that every existing `grid-column` number for
  qty/rate/amount/remove moved by one where needed.
- **Move the stacked items layout to a wider breakpoint.** The desktop columns need 528 px (488 px + 5 gaps),
  but from 900 px (where the sidebar appears, `@media (max-width: 899px)` at line 263) the sheet's content box
  is only ~502 px wide, so the name column would collapse and the row would overflow. Cut the items rules
  (lines 288-302: `.items-head, .item` grid through `.item-remove`) out of the `max-width: 899px` block and put
  them, updated as below, in a new `@media (max-width: 1099px) { … }` block placed right after it. Leave every
  other rule in the 899px block where it is.
- Narrow (now ≤ 1099px): use 4 columns, e.g.
  `minmax(0, 0.8fr) minmax(0, 0.9fr) minmax(0, 1.1fr) minmax(0, 1.4fr)`. Header: col-item spans `1 / -1`, then
  qty 1, unit 2, rate 3, amount 4. Row: name and description span `1 / -1`, then qty 1, unit 2, rate 3,
  amount 4 on row 3, with remove at `grid-column: 4; grid-row: 1; justify-self: end`. Give `.item-unit` the
  same 2px side padding as `.item-qty`/`.item-rate`. No horizontal scroll at 360 px wide.
- Don't use inline styles in HTML.

**`public/js/pdf.js`** `itemsTable` (line 71-97)
- Import `ITEM_UNITS` from `./state.js` (line 6 already imports `labelFor`, `isBlankItem`).
- Header row: insert `{ text: t(label('unit_header')), bold: true }` after the quantity header. It's
  left-aligned, like the sheet's `col-unit` label.
- Item row: insert `{ text: t(unitLabel(item.unit)) }` after the quantity cell. Define a
  small module-level helper `unitLabel(id)` that returns the matching `ITEM_UNITS` label, or 'Qty' for an
  unknown id. Text goes through `t()` like every other string.
- `widths`: `['*', 50, 50, 85, 90]`.
- Keep the "original index" logic as it is: `totals.amounts[i]` is aligned with `doc.items`.
- Never print the tool's own name or branding in the PDF.

**`tests/pdf.test.js`**
- Cells are positional: in `:186-213`, amount moves from `[3]` to `[4]` and rate from `[2]` to `[3]`.
  Update them.
- Add tests: the header row texts are `['Item', 'Qty / Hrs', 'Unit', 'Rate', 'Amount']`; an item with
  `unit: 'hours'`, quantity '160' and unit_cost '500' prints 'Hours' at `[2]`, with an amount containing
  '80,000.00'; the same item with `unit: 'qty'` prints 'Qty' and the same amount (R2). The local `item()`
  helper at line 9 builds items without `unit`, so pass it explicitly with a spread, as line 209 does.

Review constraints: no `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`eval` in `public/js/`; no money math
outside `calc.js`; `pdf.js` stays pure at import time.

## Do not
- Touch files outside the `files` list. In particular, leave `main.js`, `calc.js`, `validate.js` and
  `state.js` alone. If you must touch one, stop and report why.
- Restyle anything else in the PDF or the sheet (the banner, meta table, totals and footer are non-goals).
- Add dependencies, abstractions or config that aren't listed here.
- Create or switch branches, commit, or push.

## Done when
```bash
npm test
TZ=America/Los_Angeles npm test
TZ=Asia/Manila npm test
find public -path public/vendor -prune -o -name '*.js' -print0 | xargs -0 -r -n1 node --check
git diff --quiet develop -- public/js/calc.js public/js/main.js public/js/validate.js public/js/modes.js
```
- In a browser (`npx serve public`): every item row has a Qty/Hours select, and new rows default to Qty.
  Switching to Hours keeps the amount and totals the same, and the choice survives a reload. The headers read
  Item · Qty / Hrs · Unit · Rate · Amount. The downloaded PDF shows the Unit column with "Hours"/"Qty".
- Widths: at 360 px there's no horizontal scroll and the select reads "Hours" in full. At 900 px and 1099 px
  the items use the stacked layout with no overflow. At 1100 px and 1280 px the items are one row each and the
  item name stays readable.

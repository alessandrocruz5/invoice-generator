---
type: prompt
plan: "[[2026-10-29-invoice-v1]]"
id: 13
unit: U6
status: todo
model: sonnet
effort: high
depends_on: [12]
parallel_group: M
files:
  create: [public/js/validate.js, tests/validate.test.js]
  modify: []
  delete: []
---
# 13 · Validation rules

## Task
Write `public/js/validate.js`, a pure function from the document and context to `{ errors, warnings }` that covers every rule in spec §7, and `tests/validate.test.js` with one test per rule.

## Context
Repo: `/home/apa/Code/portfolio/invoice-generator`. Read `docs/SPEC.md` §5 (limits, discount and amount-paid errors), §7 ("Validation") and §11. It is pure: no DOM. Tests use `node:test` and `node:assert/strict`.

**Modules:**
- `calc.js`: `computeTotals`, `parseDecimal(str, maxPlaces)`, `compareDecimal(a,b)`, `isZero`, `LIMITS = { items: 100, quantity: '1000000', rate: '1000000000' }`.
- `state.js`: `isBlankItem`, `labelFor`, `DEFAULT_LABELS`.
- `modes.js`: `modeConfig`.
- `tin.js`: `isValidTin`.
- `dates.js`: `isIsoDate`, `compareIso`.
- `pdf-glyphs.js`: `findUnsupportedChars`.

Numeric fields in `doc` are canonical strings or `''`. Text the user typed that failed parsing is **not** in `doc`; it arrives in `ctx.invalid`, a `Map` from path to `{ raw, error: 'thousands'|'decimals'|'format' }`.

```js
export function validate(doc, ctx) -> { errors: Issue[], warnings: Issue[] }
// ctx = { totals, invalid: Map, historyNumbers: string[] }
// Issue = { field: '<data-path>' | null, message: string }   (field = the data-path of the control to focus)
```

**Errors** (messages exactly as below; `{Field}` uses the default label names):
- Required: `from` → "From is required."; `to` → "Bill To is required."; `number` → "Number is required."; `date` → "Date is required." (also if `!isIsoDate`).
- Items:
  - Ignore fully blank rows.
  - If no remaining row has a trimmed name → `{ field: 'items.0.name', message: 'Add at least one line item.' }`.
  - A non-blank row without a name → "Enter an item name." on `items.i.name`.
  - Quantity: `''` or zero → "Enter a quantity above 0."; above `LIMITS.quantity` → "Quantity can be at most 1,000,000."
  - Rate above `LIMITS.rate` → "Rate can be at most 1,000,000,000." (`''` counts as 0 and is allowed).
  - More than 100 items → `{ field: null, message: 'You can add up to 100 items.' }`.
- `ctx.invalid` entries: 'thousands' → "Remove thousands separators."; 'decimals' → "Up to 4 decimals." for qty, rate and money paths, and "Up to 3 decimals." for `discounts` in % mode, `tax` in % mode and `withholding_rate`; 'format' → "Enter a number."
- Discount % (when `fields.discounts === '%'`), tax % (generic, `fields.tax === '%'`) and `withholding_rate` (when `fields.withholding`) must be within 0–100, else "Enter a rate from 0 to 100." An empty withholding rate while withholding is on → "Enter a rate from 0 to 100."
- `compareDecimal(totals.discount, totals.subtotal) > 0` → "Discount is more than the subtotal." on `discounts`.
- Both dates set and `compareIso(due_date, date) < 0` → "Due date can't be before the date." on `due_date`.
- `compareDecimal(totals.amountPaid, totals.netPayable) > 0` → "Amount paid is more than the amount payable." on `amount_paid`.
- In PH modes, a filled `seller_tin` or `client_tin` with `!isValidTin` → "Enter a TIN like 123-456-789-000 or 123-456-789-00000."

**Warnings** (never block):
- PH mode and empty `seller_tin` → "Add your TIN. Clients need it to withhold tax and issue Form 2307."
- PH mode and `/invoice/i.test(labelFor(doc,'header'))` → "In the Philippines, only BIR-registered invoices should be called Invoice. Keep Billing Statement unless this goes to a client abroad."
- Generic, `fields.tax !== false`, and no custom field label matching `/\b(tax|vat|abn|gst|tin|ein|ust|siret|nif|nip|uid)\b/i` → "Tax-registered? Add your tax ID as a custom field."
- `ctx.historyNumbers.includes(doc.number.trim())` → "You already used this number." on `number`.
- `findUnsupportedChars` over all user-typed text (from, to, ship_to, the TINs, number, payment_terms, purchase_order, bir_invoice_no, custom fields, item names and descriptions, notes, terms, payment_details, and every value in `labels`) is non-empty → "Some characters (like X) won't appear in the PDF.", with X the first unsupported character. Field null.
- `isZero(totals.balance)` while at least one named item exists → "This document totals zero."

**Tests:** one per rule, including messages:
- A blank row is ignored.
- de-DE thousands from `ctx.invalid`.
- The §10 "A discount above the subtotal and an amount paid above the net amount payable both block": errors are present.
- An "Invoice" title in PH gives the warning and no error.
- Generic with an "Invoice" title gives no warning.
- `'日'` in Bill To gives the font warning naming 日.
- The P1 document (valid, with seller TIN) gives zero errors.
- TIN `12345678` gives the TIN error.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Touch the DOM; prompt 14 renders these.
- Create or switch branches, commit, or push.

## Done when
```bash
npm test
node --test tests/validate.test.js
find public -path public/vendor -prune -o -name '*.js' -print0 | xargs -0 -r -n1 node --check
```

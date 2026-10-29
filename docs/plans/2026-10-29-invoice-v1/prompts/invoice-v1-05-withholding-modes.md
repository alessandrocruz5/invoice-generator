---
type: prompt
plan: "[[2026-10-29-invoice-v1]]"
id: 05
unit: IG-2
status: done
model: sonnet
effort: medium
depends_on: [04]
parallel_group: E
files:
  create: [public/js/withholding.js, public/js/modes.js, tests/withholding.test.js, tests/modes.test.js]
  modify: []
  delete: []
---
# 05 · Withholding presets and modes

## Task
Write two pure modules: `withholding.js` (the EWT presets and helper text) and `modes.js` (the per-mode config and the ordered totals rows that both the editor and the PDF render). Add their tests.

## Context
Repo: `/home/apa/Code/portfolio/invoice-generator`. Read `docs/SPEC.md` §3 ("Tax modes", "Sheet regions"), §5 ("Withholding presets", "Totals block") and §11. It is pure ES modules with no DOM; tests use `node:test` and `node:assert/strict`.

`public/js/calc.js` exists (prompt 04). `computeTotals(doc, m)` returns strings with exactly `m` decimals: `{ amounts[], subtotal, discount (positive), net, vat, tax, shipping, total, withholding, netPayable, amountPaid, balance }`. Also exported: `isZero(str)` and `compareDecimal(a, b)`. `fields.discounts` and `fields.tax` are `false | '%' | true` (true means flat); `fields.shipping` and `fields.withholding` are booleans.

**`public/js/withholding.js`:**
```js
export const WITHHOLDING_PRESETS = [
  { id: 'prof-ind-5',   rate: '5',  label: 'Professional fee, individual, gross ≤ ₱3M, with sworn declaration (5%)' },
  { id: 'prof-ind-10',  rate: '10', label: 'Professional fee, individual, gross > ₱3M or no sworn declaration (10%)' },
  { id: 'prof-corp-10', rate: '10', label: 'Professional fee, corporation, ≤ ₱720K (10%)' },
  { id: 'prof-corp-15', rate: '15', label: 'Professional fee, corporation, above ₱720K (15%)' },
  { id: 'contractor-2', rate: '2',  label: 'Contractor; services to top withholding agents (2%)' },
  { id: 'goods-1',      rate: '1',  label: 'Goods to top withholding agents (1%)' },
  { id: 'rent-5',       rate: '5',  label: 'Rent (5%)' },
];
export const CUSTOM_PRESET = 'custom';
export function presetById(id)          // preset | null
export function helperText(presetId)    // 'prof-ind-5' -> "5% applies only if you've given this client a sworn declaration. Without one, they'll withhold 10%."; otherwise null
```

**`public/js/modes.js`:**
```js
export const MODES = [
  { id: 'ph-nonvat', label: 'PH – Non-VAT' },
  { id: 'ph-vat',    label: 'PH – VAT-registered' },
  { id: 'generic',   label: 'Generic' },
];
export const DEFAULT_MODE = 'ph-nonvat';
export const VAT_TREATMENTS = [
  { id: 'vatable', label: 'VATable 12%' }, { id: 'zero-rated', label: 'Zero-rated sale' }, { id: 'exempt', label: 'VAT-exempt sale' },
];
export function modeConfig(mode) -> {
  id, isPh,
  defaultTitle,         // 'BILLING STATEMENT' (PH) | 'INVOICE' (generic)
  titlePresets,         // PH: ['BILLING STATEMENT','STATEMENT OF ACCOUNT']; generic: ['INVOICE','TAX INVOICE','BILLING STATEMENT']
  sellerTinPrefix,      // 'Non-VAT Reg. TIN' | 'VAT Reg. TIN' | null
  numberPrefix,         // 'BS-' in PH modes, '' in generic
  firstNumber,          // 'BS-0001' in PH modes, '1' in generic
  show: { tins, birInvoiceNo, footer, vat, vatExemptNote, tax, shipping, shipTo },   // booleans per §3
  customFieldPresets,   // generic: ['Tax ID','VAT No.','ABN','Supply date','Service period']; PH: []
}
// Unknown mode -> the config for DEFAULT_MODE.
export function totalsRows(doc, totals, label) -> Row[]
// label(key) returns the current label text for a label key.
// Row = { key, label, value, negative: bool, iso: bool, emphasis: bool }   (value is a calc string, or null for a text-only row)
```
`totalsRows` follows spec §5 "Totals block, in order", showing **document** rows (what the PDF prints):
1. `subtotal`: `label('subtotal_title')`, always.
2. `discount`: when `fields.discounts !== false`. Label `label('discounts_title')`, plus ` (${doc.discounts}%)` in % mode. Negative.
3. `vat`: ph-vat only, always. Vatable → `label('vat_title')`; zero-rated → 'Zero-rated sale'; exempt → 'VAT-exempt sale'.
4. `vatExemptNote`: ph-nonvat only, when `doc.vat_exempt_note` is true. Label 'VAT-exempt sale', value null. **Never key `vat` in ph-nonvat.**
5. `tax`: generic and `fields.tax !== false`. `label('tax_title')`, plus ` (${doc.tax}%)` in % mode.
6. `shipping`: generic and `fields.shipping`.
7. `total`: always; `iso: true`.
8. `withholding`: when `fields.withholding`. `label('withholding_title')` + ` (${doc.withholding_rate}%)`. Negative.
9. `netPayable`: only when `fields.withholding`; `label('net_payable_title')`, `iso: true`.
10. `amountPaid`: only when `!isZero(totals.amountPaid)`.
11. `balance`: always; `label('balance_title')`, `iso: true`, `emphasis: true`.

The ISO suffix (" (PHP)") is **not** part of `label`; renderers append it outside the editable label (§4).

**Tests:**
- `withholding.test.js`: 7 presets with unique ids; `helperText('prof-ind-5')` returns the spec string; other ids return null.
- `modes.test.js`:
  - Non-VAT never yields a `vat` row, even with `vat_treatment: 'vatable'` and with a `totals.vat` that is non-zero. This simulates switching from ph-vat (§10).
  - ph-vat zero-rated yields a 'Zero-rated sale' row with value '0.00'.
  - The P1 shape (ph-nonvat, withholding 5) gives rows in the order `subtotal, total, withholding, netPayable, balance`, with the withholding label 'Less: Withholding Tax (5%)'.
  - Generic with discount %, tax %, shipping and amount paid gives the full order.
  - `netPayable` is absent when withholding is off; `amountPaid` is absent at 0.
  - The PH title, prefixes and first number are 'BS-0001'; generic is 'INVOICE' and '1'.
  - Use `computeTotals` from `../public/js/calc.js` to build the `totals`, and `(k) => DEFAULTS[k]` with a small local map for `label`.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Do math in `modes.js`; read values from `totals` only.
- Create or switch branches, commit, or push.

## Done when
```bash
npm test
node --test tests/modes.test.js tests/withholding.test.js
find public -path public/vendor -prune -o -name '*.js' -print0 | xargs -0 -r -n1 node --check
```

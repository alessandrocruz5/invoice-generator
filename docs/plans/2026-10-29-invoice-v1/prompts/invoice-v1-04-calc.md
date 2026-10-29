---
type: prompt
plan: "[[2026-10-29-invoice-v1]]"
id: 04
unit: IG-2
status: todo
model: opus
effort: high
depends_on: [03]
parallel_group: D
files:
  create: [public/js/calc.js, tests/calc.test.js]
  modify: []
  delete: []
---
# 04 · BigInt money math

## Task
Write `public/js/calc.js`, a pure module that computes every amount on the document with BigInt scaled integers, and `tests/calc.test.js` with vectors P1–P4, V1–V6 and edge cases. Write the vector tests first.

## Context
Repo: `/home/apa/Code/portfolio/invoice-generator`. Read `docs/SPEC.md` §5 (all of it) and §11. It is plain ES modules (`"type": "module"`), and tests run under `node --test` with `node:test` and `node:assert/strict`, importing `../public/js/calc.js`. The module must be pure: no DOM, no `Intl`, no imports. **No floats anywhere**: never use `Number()`, `parseFloat`, `toFixed` or `Math.*` on money; parse decimal strings straight into BigInt.

**The document fields calc reads** (all numbers are canonical strings with a `.` decimal mark, or `""`):
```js
doc.mode               // 'ph-nonvat' | 'ph-vat' | 'generic'
doc.items              // [{ quantity: '12.5', unit_cost: '800', name, description, id }]
doc.fields             // { discounts: false|'%'|true, tax: false|'%'|true, shipping: bool, withholding: bool }
doc.discounts          // % value or flat amount, per fields.discounts
doc.tax                // generic only: % or flat, per fields.tax
doc.shipping           // generic only, flat
doc.vat_treatment      // ph-vat only: 'vatable' | 'zero-rated' | 'exempt'
doc.withholding_rate   // percent, used when fields.withholding
doc.amount_paid        // flat
```

**Public API (an exact contract: prompts 05, 10, 11, 13 and 15 depend on it):**
```js
export const LIMITS = { items: 100, quantity: '1000000', rate: '1000000000' };
export function parseDecimal(str, maxPlaces)   // -> { value: bigint, places: maxPlaces } | null
                                               //    accepts /^\d+(\.\d+)?$/ or /^\.\d+$/ with ≤ maxPlaces decimals; '' -> null
export function roundHalfUp(value, fromPlaces, toPlaces)  // bigint -> bigint; half away from zero for negatives
export function formatScaled(value, places)    // bigint -> '1234.50' (exactly `places` decimals; '-' for negatives; '1001' when places = 0)
export function compareDecimal(a, b)           // canonical strings -> -1 | 0 | 1 ('' counts as 0)
export function isZero(str)                    // canonical string -> boolean
export function computeTotals(doc, minorUnits) // see below
```

`computeTotals(doc, m)` returns strings with exactly `m` decimal places:
```js
{
  amounts: string[],   // one per doc.items entry, same order
  subtotal, discount,  // discount is a positive magnitude ('0.00' when off)
  net,                 // subtotal - discount
  vat,                 // ph-vat + vatable: round(net × 12%); otherwise '0.00'
  tax,                 // generic + fields.tax: '%' -> round(net × tax/100); true -> flat; else '0.00'
  shipping,            // generic + fields.shipping: flat; else '0.00'
  total,               // net + vat + tax + shipping
  withholding,         // fields.withholding: round(net × rate/100), on net before VAT; else '0.00'
  netPayable,          // total - withholding
  amountPaid,          // flat, rounded to m
  balance              // netPayable - amountPaid
}
```
Rules (spec §5 and §11):
- Quantity and unit_cost parse at 4 decimals. Amount = roundHalfUp(qty × rate, 8, m): multiply the integers and round once.
- Percentages (discount %, tax %, withholding rate) parse at 3 decimals. `x × pct / 100`: compute `x_m × pct_3` at scale `m+3`, then treat dividing by 100 as scale `m+5`, then round half up to `m`.
- Flat amounts (flat discount, flat tax, shipping, amount paid) parse at 4 decimals and round half up to `m`.
- VAT is exactly 12%.
- Mode gating: ph-nonvat ignores `tax`, `shipping` and `vat_treatment`; ph-vat ignores `tax` and `shipping`; generic ignores `vat_treatment`. Withholding applies in every mode when `fields.withholding` is true.
- Empty or unparseable values count as 0 and never throw (amounts update on every keystroke; validation reports bad input elsewhere). Don't clamp: a discount above the subtotal gives a negative net, and validation blocks it.
- `formatScaled` with `places = 0` has no decimal point.

**Test vectors** (`tests/calc.test.js`; assert exact strings). Build a `doc()` helper with defaults: mode `'generic'`, `fields: { discounts: false, tax: false, shipping: false, withholding: false }`, empty strings for the rest.

| Case | Mode, m | Items (qty × rate) | Adjustments | Expect |
|---|---|---|---|---|
| P1 | ph-nonvat, 2 | 1×25000; 1×5000 | withholding 5 | total 30000.00, withholding 1500.00, netPayable 28500.00 |
| P2 | ph-vat, 2 | 3×3333.33 | discount '%' 10, vatable, withholding 2, paid 5000 | subtotal 9999.99, discount 1000.00, net 8999.99, vat 1080.00, total 10079.99, withholding 180.00, netPayable 9899.99, balance 4899.99 |
| P3 | ph-vat, 2 (USD) | 1×1200 | zero-rated | vat 0.00, total 1200.00 |
| P4 | ph-nonvat, 2 | 12.5×800 | discount flat 500, withholding 10 | subtotal 10000.00, net 9500.00, withholding 950.00, netPayable 8550.00 |
| V1 | generic, 2 | 2×1500; 1×999.99; 3×0.3333 | discount '%' 10, tax '%' 12, shipping 150, paid 1000 | subtotal 4000.99, discount 400.10, tax 432.11, total 4183.00, balance 3183.00 |
| V2 | generic, 0 (JPY) | 3×333.5 | tax '%' 10 | amounts ['1001'], tax 100, total 1101 |
| V3 | generic, 3 (BHD) | 1×10.0005 | tax '%' 10 | amounts ['10.001'], tax 1.000, total 11.001 |
| V4 | generic, 2 | 1×1.005; 3×0.1 | none | amounts ['1.01','0.30'], total 1.31 |
| V5 | generic, 2 (EUR) | 10×45 | discount flat 50, tax flat 76, shipping 12.50 | subtotal 450.00, total 488.50 |
| V6 | generic, 2 | 4×19.99 | discount flat 5, tax '%' 8.875 | subtotal 79.96, tax 6.65, total 81.61 |

Edge cases to add:
- ph-nonvat with `vat_treatment: 'vatable'`, `fields.tax: '%'`, `tax: '12'` and `fields.shipping: true` still has vat, tax and shipping all '0.00'.
- Empty items list → every value is '0.00'.
- Invalid strings (`'1,500'`, `'abc'`, `'1.2.3'`) count as 0 without throwing.
- Discount above the subtotal gives a negative `net` (`'-5.00'`).
- Max magnitude: 100 items × 1000000 × 1000000000 gives subtotal `'100000000000000000.00'`.
- `roundHalfUp` cases: 1005 at 3 → 2 = 101; 1004 → 100; -1005 → -101.
- `parseDecimal('1.23456', 4)` is null; `parseDecimal('.5', 4)` is 5000n.
- Source guard: `calc.js` source contains none of `parseFloat`, `Number(`, `toFixed`, `Math.`.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Add dependencies or import other modules into `calc.js`.
- Add validation messages; that's `validate.js` (prompt 13).
- Create or switch branches, commit, or push.

## Done when
```bash
npm test
node --test tests/calc.test.js
node --check public/js/calc.js
```
- All ten vectors pass with exact string equality.

---
type: prompt
plan: "[[2026-10-29-invoice-v1]]"
id: 15
unit: IG-7
status: todo
model: opus
effort: high
depends_on: [14]
parallel_group: O
files:
  create: [public/js/storage.js, tests/storage.test.js]
  modify: []
  delete: []
---
# 15 · Storage module

## Task
Write `public/js/storage.js`, which covers safe localStorage access, the draft, defaults, history and last number, history CSV, export filenames and `sanitizeImport()`, and `tests/storage.test.js`. `sanitizeImport` is the app's only boundary for untrusted input, so treat it as security code.

## Context
Repo: `/home/apa/Code/portfolio/invoice-generator`. Read `docs/SPEC.md` §3 ("Saved document shape"), §6 ("Saving"), §8 and §11 (the shape additions and the CSV rule). Pure module: **never touch `localStorage` at import time**, and take the storage object as a parameter so Node tests can pass a fake. Tests use `node:test` and `node:assert/strict`.

**Modules:**
- `state.js`: `createDefaultDocument`, `DEFAULT_LABELS`, `LABEL_KEYS`, `MAX_CUSTOM_FIELDS`, `checkImageDataUrl`, `pickDefaults`, `migrate`, `DOC_VERSION`, `labelFor`, `cloneDoc`.
- `modes.js`: `MODES`.
- `currency.js`: `isSupportedCurrency`, `NUMBER_FORMATS`.
- `withholding.js`: `WITHHOLDING_PRESETS`, `CUSTOM_PRESET`.
- `dates.js`: `isIsoDate`.
- `calc.js`: `LIMITS`.

The totals shape from `computeTotals` is `{ amounts[], subtotal, discount, net, vat, tax, shipping, total, withholding, netPayable, amountPaid, balance }` (strings).

**API:**
```js
export const KEYS = { draft: 'invoicegen:v1:draft', defaults: 'invoicegen:v1:defaults',
                      history: 'invoicegen:v1:history', lastNumber: 'invoicegen:v1:lastNumber' };
export const HISTORY_MAX = 50;
export const IMPORT_MAX_BYTES = 1024 * 1024;
export function getLocalStorage()          // try { const s = globalThis.localStorage; probe set/remove 'invoicegen:probe'; return s } catch { return null }
export function createStore(storage)       // storage may be null. Every method wraps access in try/catch and returns { ok, value? }.
  // readDraft() / writeDraft(doc) / readDefaults() / writeDefaults(obj) / readHistory() (always an array) / writeHistory(list)
  // readLastNumber() / writeLastNumber(str) / clearAll() (remove every key starting 'invoicegen:')
  // store.available: boolean. JSON parse failures on read -> { ok: false }.
export function toHistoryEntry(doc, totals, savedAt)   // cloneDoc(doc) with logo = null and payment_qr = null, plus { totals, saved_at: savedAt }
export function upsertHistory(list, entry, max = HISTORY_MAX)  // remove any entry with the same trimmed number, put entry first, cap at max (drop the oldest)
export function historyToCsv(entries)      // string; see below
export function exportFilename(doc)        // generic: `invoice-${n}.json`; PH: `billing-statement-${n}.json`; n = number with / \ : * ? " < > | and spaces replaced by '-'
export function csvFilename(today)         // `billing-history-${today}.csv`
export function sanitizeImport(text)       // -> doc; throws Error(userMessage) on rejection
```

**CSV** (§6, §11):
- Columns, in order: Number, BIR Invoice No., Date, Client, Client TIN, Currency, Subtotal, Discount, VAT or tax, Withholding, Net amount payable, Amount paid, Balance due.
- Client is the first non-empty line of `to`. "VAT or tax" is `totals.vat` in ph-vat, `totals.tax` in generic, and `''` in ph-nonvat. Amounts are the canonical strings from `entry.totals`.
- Start with a UTF-8 BOM (`﻿`) and end lines with CRLF.
- Quote every field: wrap it in `"` and double any internal `"`.
- **Formula injection:** a text field (number, BIR no., client, TIN) that starts with `=`, `+`, `-`, `@`, `\t` or `\r` gets a leading `'`. Amount fields never do; they're canonical decimals.

**`sanitizeImport(text)`.** Copy only known keys with type checks, never `eval`, never assign arbitrary keys:
1. If `text.length > IMPORT_MAX_BYTES` → 'This file is too large (1 MB max).' `JSON.parse` in try → 'This file isn't a valid document.' The result must be a plain object (not an array or null).
2. `version` must be the number 1 → else 'This document is from an unsupported version.'
3. Start from `createDefaultDocument({ today: <keep the imported date if valid, else ''>, language: 'en-US' })` and copy over, field by field:
   - **Strings** (≤ 5,000 chars, else truncate): from, seller_tin, to, client_tin, ship_to, number (≤ 100), payment_terms (≤ 200), purchase_order (≤ 200), bir_invoice_no (≤ 100), payment_details, notes, terms.
   - **Dates:** date and due_date pass only if `isIsoDate`, else `''`.
   - **Enums:** mode ∈ `MODES` ids; vat_treatment ∈ vatable, zero-rated, exempt; currency must pass `/^[A-Z]{3}$/` and `isSupportedCurrency`; settings.currencyDisplay ∈ symbol, code; settings.locale ∈ `NUMBER_FORMATS`; settings.paper ∈ A4, LETTER; withholding_preset ∈ preset ids, `CUSTOM_PRESET` or `''`.
   - **Booleans:** vat_exempt_note, form_2307_note, footer.not_bir_invoice, footer.not_valid_input_tax, fields.shipping, fields.withholding.
   - fields.discounts and fields.tax ∈ `false`, `'%'`, `true`.
   - **Canonical numbers:** discounts, tax, shipping, withholding_rate, amount_paid and each item's quantity and unit_cost must match `/^(\d{1,10})(\.\d{1,4})?$/` or be `''`; anything else becomes `''`.
   - **items:** an array of at most `LIMITS.items` plain objects. Name is a string ≤ 200 and description ≤ 1,000 (truncate). Keep the id when it matches `/^[A-Za-z0-9-]{1,64}$/`, else generate a new id with `globalThis.crypto.randomUUID()`. An empty array → one new blank item.
   - **custom_fields:** up to `MAX_CUSTOM_FIELDS` of `{ label: string ≤ 100, value: string ≤ 500 }`.
   - **labels:** iterate `LABEL_KEYS` only (never the input's keys). Copy when `Object.hasOwn(input.labels, key)` and the value is a string; truncate to 100.
   - **logo and payment_qr:** null, or a string passing `checkImageDataUrl`; else null.
4. Never copy `__proto__`, `constructor` or `prototype`, and never use `Object.assign` or spread from the input object. Return a fresh object.

**Tests:**
- A fake storage class (a Map behind `getItem`, `setItem`, `removeItem`, `key`, `length`) and a throwing one (every method throws). With the throwing one, `createStore` reports `available === false` and every method returns `{ ok: false }` without throwing.
- `upsertHistory`: replaces an entry with the same number, keeps newest first, and drops the oldest when the 51st entry arrives.
- `toHistoryEntry` drops logo and payment_qr.
- CSV:
  - Starts with the BOM; the header row matches the column list exactly; uses CRLF.
  - A client `=HYPERLINK("x")` comes out as `"'=HYPERLINK(""x"")"`.
  - P2 amounts appear as canonical strings, and VAT shows for ph-vat.
- `sanitizeImport`:
  - A round trip of a full valid document deep-equals it (export → import, the §10 Saving box).
  - A Bill To of `<img src=x onerror=alert(1)>` is kept verbatim as a string (rendering is textContent-only).
  - `{"version":1,"__proto__":{"polluted":true}}` imports, and `({}).polluted` stays undefined.
  - `labels: {"__proto__": "x", "to_title": "Client"}` keeps only to_title.
  - `version: 2` is rejected; an array is rejected; invalid JSON is rejected; 1 MB + 1 byte is rejected.
  - `logo: 'javascript:alert(1)'` becomes null, and `logo` as an SVG data URL becomes null.
  - quantity `'1e9'` becomes `''`.
  - mode `'evil'` becomes 'ph-nonvat'.
  - 150 items are capped at 100.
- `exportFilename`: 'billing-statement-BS-0001.json', and generic gives 'invoice-1.json'.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Access `localStorage` outside `getLocalStorage`, or at import time.
- Use `eval`, `Function` or HTML parsing.
- Create or switch branches, commit, or push.

## Done when
```bash
npm test
node --test tests/storage.test.js
find public -path public/vendor -prune -o -name '*.js' -print0 | xargs -0 -r -n1 node --check
```

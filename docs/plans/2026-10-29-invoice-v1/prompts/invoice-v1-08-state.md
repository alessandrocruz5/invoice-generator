---
type: prompt
plan: "[[2026-10-29-invoice-v1]]"
id: 08
unit: IG-4
status: todo
model: sonnet
effort: medium
depends_on: [05, 07]
parallel_group: H
files:
  create: [public/js/state.js, tests/state.test.js]
  modify: []
  delete: []
---
# 08 · Document state

## Task
Write `public/js/state.js`, a pure module that owns the saved document shape, the default labels, migration, item and blank-row helpers, and the image data-URL check. Add `tests/state.test.js`.

## Context
Repo: `/home/apa/Code/portfolio/invoice-generator`. Read `docs/SPEC.md` §3 ("Editable labels", "Saved document shape", "Item fields"), §6 (paper default, `defaults` contents) and §11. It is a pure ES module: no DOM, and `navigator` and `crypto` are passed in or read lazily inside functions. Tests use `node:test` and `node:assert/strict`.

Existing modules to import:
- `modes.js`: `DEFAULT_MODE`, `modeConfig(mode)`, which gives `{ defaultTitle, numberPrefix, firstNumber, show, … }`, and `MODES`.
- `currency.js`: `DEFAULT_CURRENCY`, `isSupportedCurrency`.
- `dates.js`: `todayIso`.
- `numbering.js`: `nextNumber`.

**Document shape (version 1)**, with the §11 additions marked:
```json
{ "version": 1, "mode": "ph-nonvat", "logo": null, "from": "", "seller_tin": "", "to": "", "client_tin": "", "ship_to": "",
  "number": "BS-0001", "date": "<today>", "payment_terms": "", "due_date": "", "purchase_order": "", "bir_invoice_no": "",
  "custom_fields": [], "items": [ { "id": "<uuid>", "name": "", "description": "", "quantity": "1", "unit_cost": "0" } ],
  "fields": { "discounts": false, "tax": "%", "shipping": false, "withholding": false },
  "discounts": "", "tax": "", "shipping": "", "vat_treatment": "vatable", "vat_exempt_note": false,
  "withholding_rate": "", "withholding_preset": "",            // withholding_preset: §11 addition
  "form_2307_note": true, "amount_paid": "", "payment_details": "", "payment_qr": null, "notes": "", "terms": "",
  "footer": { "not_bir_invoice": true, "not_valid_input_tax": false },
  "currency": "PHP", "settings": { "currencyDisplay": "symbol", "locale": "auto", "paper": "A4" }, "labels": {} }
```

**API:**
```js
export const DOC_VERSION = 1;
export const DEFAULT_LABELS = {
  header: null,            // per mode: modeConfig(doc.mode).defaultTitle
  to_title: 'Bill To', ship_to_title: 'Ship To', client_tin_title: 'TIN',
  date_title: 'Date', payment_terms_title: 'Payment Terms', due_date_title: 'Due Date',
  purchase_order_title: 'PO Number', bir_invoice_title: 'BIR Invoice No.',
  item_header: 'Item', quantity_header: 'Quantity', unit_cost_header: 'Rate', amount_header: 'Amount',
  subtotal_title: 'Subtotal', discounts_title: 'Discount', tax_title: 'Tax', vat_title: 'VAT 12%',
  shipping_title: 'Shipping', total_title: 'Total', withholding_title: 'Less: Withholding Tax',
  net_payable_title: 'Net Amount Payable', amount_paid_title: 'Amount Paid', balance_title: 'Balance Due',
  notes_title: 'Notes', terms_title: 'Terms', payment_title: 'Payment Details',
};
export const LABEL_KEYS = Object.keys(DEFAULT_LABELS);
export const DEFAULT_KEYS = ['mode','from','seller_tin','logo','payment_details','payment_qr','custom_fields','currency','settings',
  'labels','notes','terms','withholding_preset','withholding_rate','fields.withholding','form_2307_note','footer'];   // what "Save as default" keeps (§6)
export const MAX_CUSTOM_FIELDS = 6;
export const MAX_IMAGE_BYTES = 500 * 1024;
export function labelFor(doc, key)                 // doc.labels[key] (own property, string) ?? (key==='header' ? modeConfig(doc.mode).defaultTitle : DEFAULT_LABELS[key])
export function setLabel(doc, key, text)           // stores only when text !== the default labelFor would return without an override
                                                   // (for 'header' that is modeConfig(doc.mode).defaultTitle); deletes the key otherwise
export function newItem(makeId = () => globalThis.crypto.randomUUID())
export function isBlankItem(item)                  // name and description empty (after trim), quantity '' or '1', unit_cost '' or '0'
export function defaultPaper(language)             // 'LETTER' for en-US, en-CA, en-PH, es-MX (case-insensitive, region match); else 'A4'
export function createDefaultDocument({ today, language, defaults = null, lastNumber = '', makeId } = {})
  // Base shape as above, with date = today, settings.paper = defaultPaper(language).
  // Overlay `defaults` (only the DEFAULT_KEYS; 'fields.withholding' means doc.fields.withholding).
  // number = nextNumber(lastNumber) || modeConfig(mode).firstNumber.
  // One new blank item.
export function pickDefaults(doc)                  // object holding only DEFAULT_KEYS (deep-copied)
export function migrate(obj)                       // version 1 -> fill missing keys from a fresh default, keep known ones; other versions -> throw Error('Unsupported document version.')
export function checkImageDataUrl(dataUrl, maxBytes = MAX_IMAGE_BYTES)
  // true only if /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/, decoded byte length ≤ maxBytes,
  // and magic bytes match the type (PNG 89 50 4E 47 0D 0A 1A 0A; JPEG FF D8 FF). Decode with atob (present in browsers and Node ≥ 16).
export function cloneDoc(doc)                      // structuredClone (browser floor: Firefox 98+, see SPEC §11)
```
Paper values are pdfmake page sizes: `'A4'` and `'LETTER'`. `migrate` does **not** sanitise untrusted input; that is `storage.sanitizeImport` (prompt 15). It only upgrades or fills a trusted saved draft.

**Tests:**
- Defaults: `mode` is 'ph-nonvat', `currency` 'PHP', `number` 'BS-0001', and the date equals the passed `today`.
- `defaultPaper('en-PH')` is 'LETTER'; `defaultPaper('en-GB')` is 'A4'.
- `labelFor` in generic gives header 'INVOICE'. `setLabel(doc, 'to_title', 'Bill To')` leaves `labels` empty; a custom value is stored and survives `migrate`. In ph-nonvat, `setLabel(doc, 'header', 'BILLING STATEMENT')` stores nothing, and the title then follows a switch to generic ('INVOICE'); `setLabel(doc, 'header', 'STATEMENT OF ACCOUNT')` is stored.
- `createDefaultDocument({ lastNumber: 'BS-0001', … })` gives `number` 'BS-0002'. `defaults` with mode 'generic' and seller_tin carry over, while non-default keys such as `to` do not.
- `isBlankItem(newItem())` is true.
- `migrate({ version: 2 })` throws, and `migrate` of a v1 object missing `withholding_preset` adds `''`.
- `checkImageDataUrl`: a real 1×1 PNG data URL (embed one in the test) is true; the same bytes labelled `image/jpeg` are false; `data:image/svg+xml;base64,...` is false; over-size is false.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Touch `localStorage`; that's `storage.js` (prompt 15).
- Create or switch branches, commit, or push.

## Done when
```bash
npm test
find public -path public/vendor -prune -o -name '*.js' -print0 | xargs -0 -r -n1 node --check
```

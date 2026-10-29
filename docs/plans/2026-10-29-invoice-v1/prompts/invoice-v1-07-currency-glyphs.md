---
type: prompt
plan: "[[2026-10-29-invoice-v1]]"
id: 07
unit: U3
status: todo
model: sonnet
effort: high
depends_on: [06]
parallel_group: G
files:
  create: [public/js/currency.js, public/js/pdf-glyphs.js, tests/currency.test.js, tests/pdf-glyphs.test.js]
  modify: []
  delete: []
---
# 07 · Currency and PDF glyphs

## Task
Write `currency.js` (the currency list, minor units, money formatters, decimal mark and user-number parsing) and `pdf-glyphs.js` (the PDF font allowlist and fallbacks), with tests.

## Context
Repo: `/home/apa/Code/portfolio/invoice-generator`. Read `docs/SPEC.md` §4 (all), §6 "PDF font limits" and §11 ("Numbers", "Flat amounts"). It is pure ES modules: no DOM, and nothing read from `navigator` at import time (pass the language in). Tests use `node:test` and `node:assert/strict`.

**`currency.js`:**
```js
export const COMMON_CURRENCIES = ['PHP','USD','EUR','GBP','AUD','CAD','SGD','HKD','JPY','CNY','INR','AED','NZD','CHF'];
export const FALLBACK_CURRENCIES = [/* COMMON_CURRENCIES plus ~40 more ISO codes, used only when Intl.supportedValuesOf is missing */];
export const NUMBER_FORMATS = ['auto','en-US','en-GB','en-PH','de-DE','fr-FR','es-ES','ja-JP','en-IN'];
export const DEFAULT_CURRENCY = 'PHP';
export function currencyList()                 // { common: [{code,label}], all: [{code,label}] }; all = the rest, A→Z
                                               // label: `${code} — ${new Intl.DisplayNames(['en'],{type:'currency'}).of(code)}`, e.g. 'PHP — Philippine Peso'
export function isSupportedCurrency(code)
export function minorUnits(code)               // new Intl.NumberFormat('en',{style:'currency',currency:code}).resolvedOptions().maximumFractionDigits
export function resolveLocale(setting, language)   // 'auto' -> language || 'en-US'; else setting
export function decimalMark(locale)            // from new Intl.NumberFormat(locale).formatToParts(1.5) 'decimal' part
export function groupMark(locale)              // from formatToParts(12345.6) 'group' part ('' if none)
export function makeMoneyFormatter({ locale, currency, currencyDisplay })
  // -> format(decimalString, { maxFractionDigits } = {}) : string
  // Intl.NumberFormat(locale, { style:'currency', currency, currencyDisplay /* 'symbol'|'code' */,
  //   minimumFractionDigits: m, maximumFractionDigits: max(m, maxFractionDigits ?? m) }).format(decimalString)
  // Pass the canonical STRING to format(), never Number(), so large values stay exact in modern engines.
export function roundingNote(code)             // m === 0 -> `${code} has no decimal places. Totals are rounded to whole ${unitName}.`
                                               //   (JPY -> 'yen'; else the DisplayNames name, lower-case); m > 2 -> `${code} uses ${m} decimal places.`; else null
export function parseUserNumber(text, { decimalMark, groupMark, maxDecimals })
  // -> { ok: true, value: canonical } | { ok: false, error: 'thousands' | 'decimals' | 'format' }
  // trims; '' -> { ok: true, value: '' }
  // if text contains groupMark (when groupMark !== decimalMark), or any ',' or '.' that isn't the decimalMark,
  //   or a space, U+00A0, U+202F or "'" between digits -> 'thousands'   (fr-FR users type a plain space; de-CH uses ')
  //   (en-US '1,500' -> thousands; de-DE '1.500' -> thousands; never guess)
  // more than one decimal mark -> 'format'; non-digits -> 'format'; leading '-' -> 'format' (no negatives)
  // decimals > maxDecimals -> 'decimals'
  // value: digits with '.' as the mark, leading zeros trimmed ('007.50' -> '7.50', '.5' -> '0.5')
export function toDisplayNumber(canonical, decimalMark)   // '1.5' -> '1,5' for de-DE; '' -> ''
export function isoSuffix(code)                          // ` (${code})`, appended outside the label on Total, Net Amount Payable and Balance Due
```
`Intl.supportedValuesOf` may be missing (older browsers): fall back to `FALLBACK_CURRENCIES`. Guard with `typeof Intl.supportedValuesOf === 'function'`, and wrap `DisplayNames` in try/catch (label = code).

**`pdf-glyphs.js`.** The bundled Roboto covers Latin, Greek, Cyrillic and Vietnamese.
```js
export const COVERED_SYMBOLS = '₱€£¥₹₩₫₪₺₽₦₼';
export function isPdfSafeChar(ch)      // ASCII printable, \t\n\r, U+00A0–U+00FF (Latin-1), U+0100–U+024F (Latin Ext-A/B), U+0370–U+03FF (Greek),
                                        // U+0400–U+04FF (Cyrillic), U+1EA0–U+1EF9 (Vietnamese), U+0300–U+036F (combining), U+2013, U+2014, U+2018,
                                        // U+2019, U+201C, U+201D, U+2022, U+2026, U+00D7, and COVERED_SYMBOLS
export function sanitizeForPdf(str)    // Rule 1: U+202F -> U+00A0; strip U+200E and U+200F
export function findUnsupportedChars(text)   // unique chars (iterate by code point) failing isPdfSafeChar after sanitizeForPdf, in order
export function symbolOrCode(formatted, reformatAsCode)
  // Rule 2: s = sanitizeForPdf(formatted); if every char is safe return s; else return sanitizeForPdf(reformatAsCode())
```

**Tests** (pin only JPY = 0, BHD = 3 and USD = 2 for minor units; CLDR differs elsewhere):
- `currency.test.js`:
  - `currencyList().common[0].code === 'PHP'`; there's no duplicate between `common` and `all`; `all` is sorted.
  - `minorUnits` for JPY, BHD and USD.
  - en-US: `'1,500'` → thousands; `'1500.5'` → '1500.5'; `'1.23456'` with maxDecimals 4 → decimals.
  - de-DE: `'1,5'` → '1.5'; `'1.500'` → thousands.
  - fr-FR: `'1 500,5'` (plain space), `'1\u202F500'` and `"1'500"` → thousands; `'1500,5'` → '1500.5'.
  - `'abc'` → format; `'-5'` → format.
  - en-US formatter: PHP `'1500'` contains '₱' and '1,500.00'; code display contains 'PHP'.
  - maxFractionDigits 4 on `'0.3333'` shows 4 decimals.
  - `roundingNote('JPY')` is 'JPY has no decimal places. Totals are rounded to whole yen.'
  - `toDisplayNumber('1.5', ',')` is '1,5'.
- `pdf-glyphs.test.js`:
  - `sanitizeForPdf` replaces U+202F with U+00A0 and strips U+200E/F.
  - THB with en-US symbol display goes through `symbolOrCode` to a string containing 'THB' and no '฿'.
  - PHP keeps '₱'.
  - fr-FR EUR has no U+202F after sanitising.
  - `findUnsupportedChars('Café 日本')` is `['日','本']`.
  - `findUnsupportedChars('Tiếng Việt Ωμέγα Привет')` is `[]`.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Do money arithmetic here; that's `calc.js`. Never convert money to Number.
- Create or switch branches, commit, or push.

## Done when
```bash
npm test
TZ=America/Los_Angeles npm test
TZ=Asia/Manila npm test
find public -path public/vendor -prune -o -name '*.js' -print0 | xargs -0 -r -n1 node --check
```

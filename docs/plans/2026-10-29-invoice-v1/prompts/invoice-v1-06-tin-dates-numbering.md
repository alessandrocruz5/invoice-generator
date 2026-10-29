---
type: prompt
plan: "[[2026-10-29-invoice-v1]]"
id: 06
unit: IG-3
status: done
model: sonnet
effort: medium
depends_on: [03]
parallel_group: F
files:
  create: [public/js/tin.js, public/js/dates.js, public/js/numbering.js, tests/tin.test.js, tests/dates.test.js, tests/numbering.test.js]
  modify: []
  delete: []
---
# 06 · TIN, dates, numbering

## Task
Write three small pure modules and their tests: TIN masking and validation, timezone-safe ISO date helpers, and next-number suggestion.

## Context
Repo: `/home/apa/Code/portfolio/invoice-generator`. Read `docs/SPEC.md` §3 (TIN rows), §6 ("Invoice numbering", "Dates") and §7 (the TIN validation message). It is pure ES modules: no DOM, and no `navigator` at import time. Tests use `node:test` and `node:assert/strict` and import `../public/js/<name>.js`. They must pass under `TZ=America/Los_Angeles npm test` and `TZ=Asia/Manila npm test`.

**`tin.js`:**
```js
export function formatTin(input)  // keep digits only (max 14), group 3-3-3 then the rest: '123456789' -> '123-456-789'; '12345678900000' -> '123-456-789-00000'; partial input groups as typed ('1234' -> '123-4')
export function isValidTin(str)   // '' -> true (optional field); else exactly /^\d{3}-\d{3}-\d{3}-(\d{3}|\d{5})$/
export function tinDigits(str)    // digits only
```
Tests: accepts `123-456-789-000` and `123-456-789-00000`; rejects 8 digits (`12345678`) and 13 digits; `formatTin('123 456 789 000')` gives `'123-456-789-000'`; extra digits beyond 14 are dropped.

**`dates.js`.** Never call `new Date('YYYY-MM-DD')` (it parses as UTC and shifts the day west of Greenwich). Construct with `Date.UTC(y, m - 1, d)` and format with `timeZone: 'UTC'`.
```js
export function todayIso(now = new Date())    // local calendar date of `now`, from getFullYear/getMonth/getDate -> 'YYYY-MM-DD'
export function isIsoDate(str)                // strict YYYY-MM-DD and a real calendar date
export function addDays(iso, n)               // via Date.UTC; '2026-10-28' + 30 -> '2026-11-27'; crosses months, years and leap days
export function parseNetTerms(text)           // /net\s*(\d+)/i -> N (integer) | null; 'Net 30' -> 30, 'NET15' -> 15, 'due on receipt' -> null
export function compareIso(a, b)              // -1 | 0 | 1 (string compare after validation)
export function formatDate(iso, locale)       // Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(Date.UTC(...)); '' for invalid
```
Tests: `formatDate('2026-10-28', 'en-US')` contains `28` and `Oct` and `2026`, and is the same in both TZ runs. Add a guard test that reads `process.env.TZ` and asserts the day is unchanged, so it is meaningful in both runs. `todayIso(new Date(2026, 0, 1, 0, 30))` is `'2026-01-01'` (a local-midnight edge). `addDays('2028-02-28', 1)` is `'2028-02-29'`. `addDays('2026-12-31', 1)` is `'2027-01-01'`. Source guard: `dates.js` doesn't match `/new Date\(\s*['"\`]/`.

**`numbering.js`:**
```js
export function nextNumber(str)   // increment the LAST run of digits, keep zero padding, widen on overflow; no digits -> ''
```
Tests: `BS-0009` → `BS-0010`; `2026-099` → `2026-100`; `INV-9` → `INV-10`; `BS-0001` → `BS-0002`; `A12B` → `A13B`; `999` → `1000`; `DRAFT` → `''`; `''` → `''`. Use BigInt or string arithmetic so very long digit runs don't lose precision (`'BS-99999999999999999999'` increments correctly).

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Add dependencies.
- Create or switch branches, commit, or push.

## Done when
```bash
npm test
TZ=America/Los_Angeles npm test
TZ=Asia/Manila npm test
find public -path public/vendor -prune -o -name '*.js' -print0 | xargs -0 -r -n1 node --check
```

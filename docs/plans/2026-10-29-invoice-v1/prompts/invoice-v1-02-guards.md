---
type: prompt
plan: "[[2026-10-29-invoice-v1]]"
id: 02
unit: U1
status: todo
model: sonnet
effort: medium
depends_on: [01]
parallel_group: B
files:
  create: [public/js/copy.js, tests/no-innerhtml.test.js, tests/wording.test.js]
  modify: []
  delete: []
---
# 02 · Copy module and guard tests

## Task
Create `public/js/copy.js`, which holds the approved compliance sentences, and two guard tests that keep the CSP/XSS and wording rules true for every later prompt.

## Context
Repo: `/home/apa/Code/portfolio/invoice-generator`. Read `docs/SPEC.md` §1 (banned wording), §3 (PH footer), §8 (code rules, disclaimer) and §11 (decisions). It is plain ES modules: `package.json` has `"type": "module"` and `"test": "node --test"`. Tests use `node:test` and `node:assert/strict`, and import modules as `../public/js/<name>.js`. Pure modules never touch `document`, `window` or `localStorage`.

**`public/js/copy.js`** is a pure module. Export each string as a named constant, with the text exactly as below:
```js
export const TAGLINE = 'Billing statements for Filipino freelancers, with withholding tax done right. Works alongside your BIR invoice.';
export const PH_FOOTER_NOT_BIR = 'This is a billing statement, not a BIR invoice or official receipt.';
export const PH_FOOTER_NO_INPUT_TAX = 'THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX';
export const DISCLAIMER = "Billing statements made here are payment requests, not BIR-registered invoices or official receipts. If you're BIR-registered, also issue your BIR invoice and enter its number in BIR Invoice No. This tool doesn't give tax advice. Outside the Philippines, check what your invoices must include; where e-invoicing is mandatory, a PDF may not count as a valid business invoice.";
export const PRIVACY_LINE = 'Everything you type stays in this browser. Nothing is sent to a server.';
export const DATA_LOCATION_NOTE = 'Your data lives only in this browser. Export to keep a copy.';
export const STORAGE_BANNER = "Your browser isn't saving this. Use Export to keep a copy.";
export const FORM_2307_NOTE = 'Kindly issue BIR Form 2307 for the tax withheld.';
export const QR_LABEL = 'Scan to pay (InstaPay QR)';
// Sentences allowed to contain banned phrases (they deny being those documents).
export const APPROVED_SENTENCES = [PH_FOOTER_NOT_BIR, DISCLAIMER];
export const BANNED_PHRASES = ['BIR-compliant', 'BIR-ready', 'official receipt', 'official invoice'];
```
Note that the `APPROVED_SENTENCES` entry for `DISCLAIMER` is the whole paragraph.

**`tests/no-innerhtml.test.js`**:
- Walk `public/` recursively with `node:fs`, skipping `public/vendor/`.
- For every `.js` file, fail if the source matches `/\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML|document\.write|\beval\s*\(|new\s+Function\b/`. Report the file and the line number.
- For every `.html` file, fail on an inline script (`<script` without a `src=` attribute), on `<style`, and on any ` style=` attribute (`/\sstyle\s*=/i`). Also fail on `on[a-z]+=` inline handlers (`/\son[a-z]+\s*=/i`).
- One `test()` per rule, so failures are readable. It must pass on the current tree.

**`tests/wording.test.js`**:
- Import `APPROVED_SENTENCES` and `BANNED_PHRASES` from `../public/js/copy.js`.
- Walk `public/` recursively, skipping `public/vendor/`, over files ending `.html`, `.js`, `.css`, `.svg`, `.json`, `.txt`, `.webmanifest`.
- Per file: normalise whitespace (collapse runs of `\s` to one space). Decode `&#39;`, `&rsquo;`, `&apos;`, `&quot;`, `&amp;` and `’` to their ASCII forms so HTML copies of the sentences match. Remove every occurrence of each approved sentence (after the same normalisation). Skip `public/js/copy.js` itself; it is the allowlist. Then search case-insensitively for each banned phrase, also matching a space or hyphen between words (`BIR[ -]compliant`, `official[ -]receipts?`, `official[ -]invoices?`).
- Fail with the file and the phrase.
- Add one self-test: a string that contains `DISCLAIMER` plus the extra text "official receipt" must still fail after stripping, and a string with only `DISCLAIMER` must pass. Factor the strip-and-scan logic into a local function so the self-test can use it.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Add dependencies.
- Reword any string in `copy.js`; the spec owns the copy.
- Create or switch branches, commit, or push.

## Done when
```bash
npm test
node --test tests/no-innerhtml.test.js tests/wording.test.js
find public -path public/vendor -prune -o -name '*.js' -print0 | xargs -0 -r -n1 node --check
```
- Temporarily adding `<p>official receipt</p>` to `public/index.html` makes `wording.test.js` fail. Revert it afterwards.

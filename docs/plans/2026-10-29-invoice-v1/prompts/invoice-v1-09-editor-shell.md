---
type: prompt
plan: "[[2026-10-29-invoice-v1]]"
id: 09
unit: IG-4
status: todo
model: opus
effort: high
depends_on: [08]
parallel_group: I
files:
  create: [public/js/main.js, public/js/editor.js]
  modify: [public/index.html, public/css/app.css]
  delete: []
---
# 09 · Editor shell and sidebar

## Task
Build the app shell: the page layout, the sidebar settings, and the editable sheet's header, parties and meta regions. Also set the render, state and event architecture that every later UI prompt extends. Prompt 10 adds items, totals, adjustments, notes, terms, the payment block, the logo and the footer toggles, so leave clearly named empty containers for those.

## Context
Repo: `/home/apa/Code/portfolio/invoice-generator`. Read `docs/SPEC.md` §3, §4, §7 (the wireframe and "Editor behaviour"), §8 (code rules and accessibility) and §11. `public/index.html` is a placeholder from prompt 01; replace its body. `public/css/app.css` has one base rule.

**Hard rules** (two tests enforce them: `tests/no-innerhtml.test.js` and `tests/wording.test.js`):
- No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval` or `new Function`. Build with `document.createElement`, `textContent`, `append` and `replaceChildren`.
- No inline `<script>`, `<style>`, `style=""` or `on*=` attributes in HTML. Load `<script type="module" src="js/main.js"></script>`. JS may set `el.style.height` (CSSOM, allowed by the CSP).
- Never write "BIR-compliant", "BIR-ready", "official receipt" or "official invoice". Footer copy comes from `public/js/copy.js` in later prompts.
- No third-party requests; use the system font stack.
- Money math only through `calc.js`. Number inputs go through `currency.parseUserNumber`.

**Modules you use** (all exist and are pure):
- `state.js`: `createDefaultDocument({today, language, defaults, lastNumber, makeId})`, `labelFor(doc,key)`, `setLabel(doc,key,text)`, `DEFAULT_LABELS`, `MAX_CUSTOM_FIELDS`, `newItem()`, `cloneDoc`.
- `modes.js`: `MODES`, `modeConfig(mode)` gives `{ isPh, defaultTitle, titlePresets, sellerTinPrefix, numberPrefix, firstNumber, show:{tins,birInvoiceNo,footer,vat,vatExemptNote,tax,shipping,shipTo}, customFieldPresets }`, plus `totalsRows(doc, totals, label)`.
- `currency.js`: `currencyList()`, `NUMBER_FORMATS`, `resolveLocale(setting, language)`, `decimalMark(locale)`, `groupMark(locale)`, `minorUnits(code)`, `makeMoneyFormatter({locale,currency,currencyDisplay})`, `parseUserNumber(text,{decimalMark,groupMark,maxDecimals})`, `toDisplayNumber(canonical, mark)`, `roundingNote(code)`, `isoSuffix(code)`.
- `calc.js`: `computeTotals(doc, minorUnits)`.
- `tin.js`: `formatTin`. `dates.js`: `todayIso`, `addDays`, `parseNetTerms`.

**Architecture (the contract later prompts rely on; keep these names):**
- `main.js` owns `const app = { doc, invalid: new Map() /* path -> { raw, error } */, view: null }` and boots on `DOMContentLoaded`. Boot: `app.doc = createDefaultDocument({ today: todayIso(), language: navigator.language })`. Prompt 16 adds draft restore here; leave a clearly marked `loadInitialDoc()` function.
- `computeView(app)` returns `{ locale, decimalMark, groupMark, minorUnits, fmt /* makeMoneyFormatter */, totals /* computeTotals */, config /* modeConfig */, label: (k) => labelFor(app.doc, k) }`.
- `editor.js` exports:
  - `renderSheet(form, doc, view, invalid)`: rebuilds the whole sheet inside `<form id="sheet" aria-label="Invoice">` with `replaceChildren`.
  - `updateComputed(form, doc, view)`: updates only computed text (amount cells and totals; prompt 10 fills these) via `textContent`.
  - `renderSidebar(sidebarEl, doc, view)`: syncs the select and toggle values.
- **Every editable control** carries `data-path` (a dot path into `doc`, e.g. `from`, `labels.to_title`, `custom_fields.2.value`, `items.0.quantity`) and `data-kind` (one of `text`, `label`, `tin`, `date`, `qty`, `rate`, `percent`, `money`, `select`, `check`). Give each a stable `id` derived from the path (`f-` + path with `.` → `-`).
- `main.js` adds ONE `input` listener and ONE `change` listener on the form (event delegation). The handler, `handleEdit(el)`:
  - `text`: set the value. `label`: `setLabel`. `tin`: reformat the element value with `formatTin`, then set.
  - `qty` / `rate` / `percent` / `money`: `parseUserNumber` with maxDecimals 4 / 4 / 3 / 4. If ok, set the canonical value and `invalid.delete(path)`. Otherwise set `''` and `invalid.set(path, { raw: el.value, error })`. **Never rewrite the element's value while the user is typing.**
  - `check`: set `el.checked` (a boolean). `select`: set `el.value`, and use it only for string-valued paths (mode, vat_treatment, withholding_preset, settings).
  - Then call `refresh()`.
- **Typed toggles never use the generic binding.** Anything whose value isn't a plain string or boolean (`fields.discounts` and `fields.tax`, which are `false | '%' | true`, plus every "+ Row" / "×" control and add or remove buttons) is a `<button type="button" data-action="…">`. One delegated `click` handler maps each action to an explicit assignment, for example `fields.discounts = '%'` or `fields.discounts = true`, then calls `refresh({ structural: true })`. A string such as `'true'` must never reach `doc.fields`.
- Add `form.addEventListener('submit', (e) => e.preventDefault())`. The CSP has `form-action 'none'`, so an implicit Enter-key submit or a stray `<button>` without `type` would otherwise attempt a blocked navigation.
- `refresh({ structural = false } = {})`: recompute `app.view`. If structural, `renderSheet` and then restore focus to the element whose `data-path` was focused, along with its selection range. Otherwise `updateComputed`. Then `renderSidebar`. Structural changes are mode, currency, number format, display style, adding or removing rows or toggles, import and new document.
- When `renderSheet` fills a numeric input, it shows `invalid.get(path)?.raw` if present, else `toDisplayNumber(canonical, view.decimalMark)`.
- Export `refresh` and `app` from `main.js` only if later prompts need them in other modules. Prefer keeping wiring inside `main.js`.

**Layout (index.html + app.css):**
- Top bar with the h1 "Billing Statement Generator". Leave an empty `<nav id="topbar-actions">`; prompts 16 and 17 add History and New document.
- `<main>` holds `<form id="sheet" aria-label="Invoice" novalidate>` (white sheet, always black on white) and `<aside id="sidebar">`. The aside contains:
  - The Download PDF `<button type="button" id="download">`; prompt 12 wires it.
  - `<div id="messages">`; prompt 14 fills it.
  - Mode `<select data-setting="mode">` from `MODES`.
  - Currency `<select data-setting="currency">` with `<optgroup label="Common">` and `<optgroup label="All currencies">` from `currencyList()`, built with `createElement('option')`, and helper text "Changing currency doesn't convert amounts."
  - A display-style toggle (Symbol / Code, two radio buttons, `data-setting="currencyDisplay"`).
  - Format `<select data-setting="locale">` from `NUMBER_FORMATS` ('auto' shows "Browser default").
  - Paper `<select data-setting="paper">` (A4, Letter → `'LETTER'`).
  - `<div id="currency-note">` for `roundingNote` (shown when not null).
  - Empty `<div id="sidebar-actions">` (prompts 16 and 17).
  - The text "Your data lives only in this browser." (prompt 16 replaces it with the copy constant).
  - Sidebar setting changes are structural refreshes.
- `<footer id="app-footer">`, empty for now (prompt 19).
- Desktop ≥ 900 px: sheet plus a narrow right sidebar. Below 900 px: Mode, Currency, Format and Paper form a top bar; Download PDF sits in a sticky bottom bar; header blocks stack. No horizontal scroll at 375 px.
- Inputs look like document text: no border at rest, a light outline on hover and focus, and a visible focus ring. Label inputs use a muted colour that still meets 4.5:1 contrast. Textareas auto-grow (on input set `style.height='auto'`, then `scrollHeight + 'px'`) and use `white-space: pre-wrap`.
- App chrome may follow `prefers-color-scheme: dark`; the sheet stays black on white.

**Sheet regions this prompt renders** (§3 table; hide regions by mode through `view.config.show`):
- Header right: the title is an input bound to `labels.header` (`data-kind="label"`, shows `labelFor(doc,'header')`) with a `<datalist>` of `config.titlePresets`. Then '#' and the number input (`data-path="number"`, `title` attribute: "Numbers aren't checked across devices. Keep your own sequence.").
- Header left: an empty `<div id="logo-slot">` (prompt 10).
- From: a textarea (`aria-label="From"`, placeholder "Who is this from?").
- Seller TIN (PH only): a fixed, non-editable prefix text `config.sellerTinPrefix`, then the TIN input (`data-kind="tin"`, `inputmode="numeric"`, `aria-label="Seller TIN"`, placeholder "000-000-000-00000").
- Bill To: an editable label `labels.to_title`, then a textarea (`aria-label="Bill To"`, placeholder "Who is this to?"). Client TIN (PH only): editable label `client_tin_title` plus a TIN input (`aria-label="Client TIN"`).
- Ship To (generic only): editable label `ship_to_title` plus a textarea.
- Meta column: Date (`type="date"`), Payment Terms (text), Due Date (`type="date"`), PO Number, and BIR Invoice No. (PH only). Each has an editable label (`date_title`, `payment_terms_title`, `due_date_title`, `purchase_order_title`, `bir_invoice_title`) and a fixed `aria-label` with the default name.
- **Net N:** when `payment_terms` changes, `parseNetTerms` returns N and `due_date` is empty, set `due_date = addDays(date, N)` and update that input.
- Custom fields: up to `MAX_CUSTOM_FIELDS` rows, each a label input and a value input (`custom_fields.N.label` / `.value`) with a remove button (`aria-label="Remove custom field N"`). Add a "+ Custom field" button, disabled at 6. In generic, the label input gets a `<datalist>` of `config.customFieldPresets`. Adding or removing is structural.
- Empty containers with ids for prompt 10: `items-section`, `notes-section`, `payment-section`, `totals-section`, `sheet-footer`.
- Every value input has a fixed `aria-label` with its default name (§8): placeholders are examples, never the only label. Every action is a real `<button type="button">`.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Add dependencies, frameworks, CDNs or web fonts.
- Implement items, totals, PDF, validation messages or storage; those are later prompts.
- Create or switch branches, commit, or push.

## Done when
```bash
npm test
find public -path public/vendor -prune -o -name '*.js' -print0 | xargs -0 -r -n1 node --check
grep -rnE 'innerHTML|insertAdjacentHTML|outerHTML' public/js || true   # must print nothing
```
- Run `python3 -m http.server 8080 -d public` and open http://localhost:8080. The console shows no errors.
- Switching Mode swaps the TIN lines, BIR Invoice No. and Ship To in place, and typed values survive the switch.
- Typing in From doesn't lose focus.
- "Net 30" fills an empty Due Date with Date + 30.
- At 375 px wide there's no horizontal scroll.
- Report any architecture choice you made beyond this prompt, so later prompts can follow it.

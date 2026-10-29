---
type: prompt
plan: "[[2026-10-29-invoice-v1]]"
id: 17
unit: IG-7
status: todo
model: sonnet
effort: high
depends_on: [16]
parallel_group: Q
files:
  create: []
  modify: [public/js/main.js, public/index.html, public/css/app.css]
  delete: []
---
# 17 · History dialog, CSV, export and import

## Task
Add the History dialog (Open, Duplicate, Delete, Clear history, Export CSV), JSON Export and Import, the record-on-download step, and the duplicate-number warning feed.

## Context
Repo: `/home/apa/Code/portfolio/invoice-generator`. Read `docs/SPEC.md` §6 ("Invoice numbering", "Saving") and §10 ("Saving"). Read `public/js/main.js`: `app`, `store`, `refresh`, the Download handler's `// after download (prompt 17)` comment, `app.historyNumbers` (an in-memory array, `[]` today, that `validate` reads on every keystroke) and `#topbar-actions` / `#sidebar-actions`.

`public/js/storage.js` provides:
- `store.readHistory()` / `writeHistory(list)` / `writeLastNumber(n)` / `readLastNumber()`.
- `toHistoryEntry(doc, totals, savedAt)`, `upsertHistory(list, entry)`, `historyToCsv(entries)`, `exportFilename(doc)`, `csvFilename(today)`, `sanitizeImport(text)` (throws an Error with a user message) and `IMPORT_MAX_BYTES`.

Other modules: `state.js` (`cloneDoc`, `migrate`), `numbering.js` (`nextNumber`), `dates.js` (`todayIso`, `formatDate`). Rules: no HTML sinks; build tables with `createElement` and `textContent`; no inline scripts, styles or handlers.

**Download helper** (local to `main.js`): `saveFile(blob, filename)` creates `URL.createObjectURL(blob)`, a temporary `<a download>`, clicks it and revokes the URL. That's a navigation, not a fetch, so CSP `connect-src 'none'` allows it.

**Behaviour:**
- **After a successful PDF download:**
  - `writeHistory(upsertHistory(readHistory().value, toHistoryEntry(app.doc, app.view.totals, new Date().toISOString())))`.
  - `writeLastNumber(app.doc.number.trim())`.
  - Then `refresh()`.
- **History numbers cache:** set `app.historyNumbers` once at boot from `readHistory().value` (trimmed numbers), and reset it from the new list after **every** history write: download, Delete, Clear history, and Clear all data (to `[]`). Never read localStorage inside `refresh()` or `validate`.
- **History button** in `#topbar-actions` opens a native `<dialog id="history-dialog">` (`showModal()`; Escape and a Close button both close it; focus returns to the opener).
  - Table columns: Number, BIR Invoice No., Bill To (first line), Date (`formatDate`), Balance due (the entry's currency formatted with `makeMoneyFormatter` from `currency.js`).
  - Each row has Open, Duplicate and Delete buttons (`aria-label="Open BS-0001"` and so on).
  - Note text: "History keeps up to 50 documents without logo or QR images. Opening one uses your current default images."
  - **Open:** `confirm('Replace the current document with this one?')`, then load the entry minus `totals` and `saved_at` through `migrate`. Take logo and payment_qr from the current defaults (`readDefaults().value`). Structural refresh, close the dialog.
  - **Duplicate:** same as Open, but `number = nextNumber(readLastNumber().value) || <entry number>` and `date = todayIso()`.
  - **Delete:** removes the entry.
  - **Clear history:** `confirm`, then `writeHistory([])`.
  - **Export history as CSV:** `saveFile(new Blob([historyToCsv(list)], { type: 'text/csv;charset=utf-8' }), csvFilename(todayIso()))`.
  - An empty history shows "No downloads yet."
- **Export** (sidebar): `saveFile(new Blob([JSON.stringify(app.doc, null, 2)], { type: 'application/json' }), exportFilename(app.doc))`.
- **Import** (sidebar): a visually hidden `<input type="file" accept=".json,application/json">` behind a button.
  - Reject `file.size > IMPORT_MAX_BYTES` with "This file is too large (1 MB max)."
  - Otherwise `await file.text()` → `sanitizeImport` (catch: show `err.message` in `#messages`).
  - On success, `confirm` replacing the current document, set `app.doc`, clear `invalid` and `touched`, and do a structural refresh.
  - Reset the input value afterwards so the same file can be picked again.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Parse imported JSON anywhere except `sanitizeImport`.
- Store images in history.
- Create or switch branches, commit, or push.

## Done when
```bash
npm test
find public -path public/vendor -prune -o -name '*.js' -print0 | xargs -0 -r -n1 node --check
```
Run `python3 -m http.server 8080 -d public` and check:
- Each download adds or updates a History entry. Open, Duplicate and Delete work; the 51st download drops the oldest.
- After BS-0001 is downloaded, New document suggests BS-0002.
- The CSV opens in Google Sheets and in Excel with the right columns, ₱-free canonical amounts, and accents intact.
- Export, then Clear all data, then Import restores an identical document.
- Importing a file whose Bill To is `<img src=x onerror=alert(1)>` shows that string as plain text, and no alert fires.
- DevTools Network shows no requests while exporting or importing.

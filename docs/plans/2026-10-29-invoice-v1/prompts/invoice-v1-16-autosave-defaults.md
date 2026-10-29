---
type: prompt
plan: "[[2026-10-29-invoice-v1]]"
id: 16
unit: IG-7
status: todo
model: sonnet
effort: medium
depends_on: [15]
parallel_group: P
files:
  create: []
  modify: [public/js/main.js, public/index.html, public/js/editor.js]
  delete: []
---
# 16 · Autosave, defaults, new document, banner

## Task
Wire persistence into the app: restore the draft on boot, autosave, Save as default, New document, Clear all data, and the not-saving banner.

## Context
Repo: `/home/apa/Code/portfolio/invoice-generator`. Read `docs/SPEC.md` §6 ("Saving") and §11. Read `public/js/main.js` (`app`, `loadInitialDoc()`, `refresh({structural})`, the `#topbar-actions`, `#sidebar-actions` and `#app-footer` containers) and `public/js/storage.js`:
- `getLocalStorage()`, then `createStore(storage)` gives `{ available, readDraft, writeDraft, readDefaults, writeDefaults, readLastNumber, clearAll, … }`. Each method returns `{ ok, value }` and never throws.

`state.js` provides `createDefaultDocument({ today, language, defaults, lastNumber })`, `pickDefaults(doc)` and `migrate(obj)`. `copy.js` provides `STORAGE_BANNER` and `DATA_LOCATION_NOTE`.

Rules: no HTML sinks, no inline scripts, styles or handlers. Use `textContent`.

**Behaviour:**
- **Boot (`loadInitialDoc`):**
  - `store = createStore(getLocalStorage())`.
  - Try `readDraft()` → `migrate(value)`. On any failure, use `createDefaultDocument({ today: todayIso(), language: navigator.language, defaults: readDefaults().value ?? null, lastNumber: readLastNumber().value ?? '' })`.
  - If `!store.available`, show the banner.
- **Autosave:** after every `refresh()`, debounce 500 ms, then `writeDraft(app.doc)`. If any write returns `ok: false` (quota or blocked), show the banner once and keep working in memory.
- **Banner:** `<div id="storage-banner" role="status">` at the top of the page, with the text `STORAGE_BANNER`. Hidden unless storage fails.
- **Save as default:** a button in `#sidebar-actions` that calls `writeDefaults(pickDefaults(app.doc))`. Confirm with a short status text ("Saved as default.") in `#messages` or beside the button, not with `alert`.
- **New document:** a button in `#topbar-actions`. `confirm('Start a new document? Unsaved changes to this one are kept only if you exported or downloaded it.')`. On OK:
  - `app.doc = createDefaultDocument({ today: todayIso(), language: navigator.language, defaults, lastNumber })`, which suggests the next number.
  - Default currency is "the last one used, else PHP" (spec §4). When the saved defaults have no `currency` (or there are none), set the new doc's `currency` to the previous `app.doc.currency`.
  - Clear `app.invalid` and `app.touched`, then `refresh({ structural: true })`.
- **Clear all data:** a link-styled `<button>` in `#app-footer`. `confirm('Delete every saved draft, default and history entry in this browser? This can't be undone.')`. On OK, `store.clearAll()` and start a blank `createDefaultDocument` (no defaults, no lastNumber).
- Replace the sidebar text "Your data lives only in this browser." with `DATA_LOCATION_NOTE`.
- `editor.js` only if something there needs a hook (for example a re-render on new document). Keep changes minimal.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Access `localStorage` directly; always go through `storage.js`.
- Implement History, CSV or Export/Import (prompt 17).
- Create or switch branches, commit, or push.

## Done when
```bash
npm test
find public -path public/vendor -prune -o -name '*.js' -print0 | xargs -0 -r -n1 node --check
```
Run `python3 -m http.server 8080 -d public` and check:
- Reloading restores the draft exactly, including a renamed label.
- With site data blocked for the origin (Chrome: Settings → Privacy → Site settings → "Don't allow sites to save data" for localhost), the app works and shows the banner. Private windows have working temporary storage in current browsers, so they won't show it (SPEC §11).
- Change the currency to USD, then click New document without saved defaults: the new doc is USD.
- Save as default, then New document, restores the mode, From, seller TIN, logo, payment details and QR, currency and labels.
- Clear all data empties every `invoicegen:` key (check in DevTools → Application).

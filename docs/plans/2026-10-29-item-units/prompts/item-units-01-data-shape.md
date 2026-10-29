---
type: prompt
plan: "[[2026-10-29-item-units]]"
id: 01
unit: IG-9
status: todo
model: opus
effort: high
depends_on: []
parallel_group: A
files:
  create: []
  modify: [public/js/state.js, public/js/storage.js, tests/state.test.js, tests/storage.test.js, docs/SPEC.md]
  delete: []
---
# 01 · Item unit in the document shape

## Task
Add a per-item `unit` field (`'qty'` or `'hours'`, default `'qty'`) to the saved document shape. Make sure
every new, migrated and imported item carries a valid unit. Add the label key `unit_header` and change the
default of `quantity_header`. Record all of this in `docs/SPEC.md`. Leave the UI alone; prompt 02 does it.

## Context
Repo root: `/home/apa/Code/portfolio/invoice-generator`. It's a static site: plain ES modules in `public/js/`,
with tests run by `node --test` (`npm test`). Read `CLAUDE.md` and `docs/SPEC.md` §3 and §11 first.

**`public/js/state.js`** (pure module: no DOM or storage at import time)
- Below `LABEL_KEYS` (line 39), export:
  ```js
  export const ITEM_UNITS = [{ id: 'qty', label: 'Qty' }, { id: 'hours', label: 'Hours' }];
  ```
  The `{ id, label }` shape is the one `editor.js` `selectField(ctx, path, options)` takes, so prompt 02 passes
  it straight in. `pdf.js` will look the label up by id.
- `DEFAULT_LABELS` (lines 11-38): change `quantity_header: 'Quantity'` to `quantity_header: 'Qty / Hrs'`, and add
  `unit_header: 'Unit'` right after it. The order matters: `LABEL_KEYS` is `Object.keys(DEFAULT_LABELS)`.
- `newItem` (line 73-75): return `{ id, name: '', description: '', quantity: '1', unit_cost: '0', unit: 'qty' }`.
- `isBlankItem` (line 77-82): **don't change it.** A row whose only edit is its unit stays blank.
- `migrate` (line 154-168): after the `if (!Array.isArray(doc.items) ...)` line, set `unit = 'qty'` on every
  item whose `unit` isn't one of the `ITEM_UNITS` ids. `doc.items` comes from `saved`, a `structuredClone`, so
  mutating its items is safe. Never mutate the `obj` argument; `tests/state.test.js:140-153` asserts it stays
  unchanged. Skip entries that aren't plain objects (use the file's `plain` helper) rather than throwing.

**`public/js/storage.js`** (high-stakes: `importItems` is part of the app's only boundary for untrusted input)
- Import `ITEM_UNITS` from `./state.js` (the existing import is at line 3-5).
- `importItems` (line 190-206): add `unit` to the pushed object. Keep `get(raw, 'unit')` only when it's
  exactly one of the `ITEM_UNITS` ids, else `'qty'`. Follow the `oneOf` style at line 188, e.g.
  `oneOf(get(raw, 'unit'), ITEM_UNITS.map((u) => u.id)) ? get(raw, 'unit') : 'qty'`. Never copy an
  unchecked value through.
- Nothing else in `storage.js` changes. `importLabels` already iterates `LABEL_KEYS`, so `unit_header` is
  accepted automatically. The history CSV has no item columns. Don't touch the `invoicegen:v1:*` keys.

**Tests**
- `tests/state.test.js`: assert that `newItem().unit === 'qty'`; that `ITEM_UNITS` ids are `['qty', 'hours']`;
  that `DEFAULT_LABELS.quantity_header === 'Qty / Hrs'` and `DEFAULT_LABELS.unit_header === 'Unit'`; that
  `migrate` keeps `unit: 'hours'`, sets a missing unit and `unit: 'days'` to `'qty'`, and doesn't mutate its
  input; and that `isBlankItem({ ...newItem(), unit: 'hours' })` is still `true`. Copy the existing style in
  that file.
- `tests/storage.test.js`:
  - Line 383: the blank imported item deepEqual becomes
    `{ id: '', name: '', description: '', quantity: '1', unit_cost: '0', unit: 'qty' }` (the blank item comes
    from `newItem()`, so it gains `unit` on its own).
  - The `fullDocument()` fixture at lines 52-53: give the first item `unit: 'hours'` and the second
    `unit: 'qty'`. Both are explicit so the exact round-trip `deepEqual(sanitizeImport(JSON.stringify(doc)), doc)`
    at line 267 stays as it is. **Don't weaken or remove that deepEqual.** Add an assertion after it that
    `items[0].unit === 'hours'` survives.
  - In the odd-items test (lines 374-378), add a case: an imported item with no `unit` comes back `'qty'`.
  - Add a case: imported items with `unit: 'days'`, `unit: 5` and `unit: '__proto__'` all come back `'qty'`.

**`docs/SPEC.md`**
- §3 regions table, the Items row (line 104): change "Item, Quantity, Rate, Amount" to
  "Item, Qty / Hrs, Unit (Qty or Hours), Rate, Amount".
- §8 wireframe (line 341): change the header `Item                 Quantity  Rate   Amount` to
  `Item          Qty/Hrs  Unit  Rate  Amount`, padded so the line keeps its exact width and the box borders
  stay aligned.
- §3 "Item fields" (line 110): add "unit (Qty or Hours, default Qty; display only, never used in the
  calculation)".
- §3 "Editable labels" added keys (line 114-115): add `unit_header` (Unit), and note that `quantity_header`
  defaults to "Qty / Hrs".
- §3 saved shape (line 139): the item becomes `{ "id": "b3f1…", "name": "", "description": "", "quantity": "1", "unit_cost": "0", "unit": "qty" }`.
- §11: append one bullet: **Item units (2026-10-29).** Each item has `unit`, `'qty'` or `'hours'` (default
  `'qty'`), shown in a Unit column after Qty / Hrs on the sheet and in the PDF. It's display only:
  `calc.js`, validation and the history CSV ignore it. `migrate` and `sanitizeImport` set a missing or
  unknown unit to `'qty'`, so `DOC_VERSION` stays 1. The `quantity_header` default is now "Qty / Hrs", so
  every saved document that uses the default label shows the new text; a renamed label is kept.

Review constraints: money math only in `calc.js` (don't touch it); every `localStorage` access in try/catch
(you add none); pure modules never touch `document`/`window`/`navigator`/`localStorage` at import time.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Change `calc.js`, `validate.js`, `modes.js`, `DOC_VERSION`, `isBlankItem` or the CSV.
- Add dependencies, abstractions or config that aren't listed here.
- Create or switch branches, commit, or push.

## Done when
```bash
npm test
TZ=America/Los_Angeles npm test
TZ=Asia/Manila npm test
find public -path public/vendor -prune -o -name '*.js' -print0 | xargs -0 -r -n1 node --check
grep -n "ITEM_UNITS" public/js/state.js public/js/storage.js
```
- Every test passes, including the new ones above. The app still loads unchanged in the browser: the sheet
  shows the "Qty / Hrs" header and no unit control yet.

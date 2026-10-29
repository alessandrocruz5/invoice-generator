---
type: plan
kind: feature
status: audited
repo: invoice-generator
delivery: pr
base: develop
sprint: 2
epic:
created: 2026-10-29
risk: medium
prompts: 2
graph_built: none
tags: [plan]
---
# Item units: Qty or Hours per line

## Request
> this should have the option to either make it quantity or hours. keep the calculation still. you can follow this format

(Sample attached: an items table with the columns DESCRIPTION OF SERVICE · QTY / HRS · UNIT · RATE (₱) · AMOUNT (₱), and the row "Manual Functional Testing | 160 | Hours".)

Clarified with the user (2026-10-29): the unit is chosen **per item**, and "follow this format" covers **the items table only**.

| # | Requirement |
|---|---|
| R1 | Each line item has a unit of either Qty or Hours, chosen on the sheet (default Qty). |
| R2 | The calculation is unchanged: amount = quantity × rate, with the same numbers whatever the unit. |
| R3 | The items table follows the sample: the columns Item · Qty / Hrs · Unit · Rate · Amount, on the sheet and in the PDF. |
| R4 | The unit survives autosave, history reopen, export/import, and older saved documents without it. |

## Context used
- Note: `docs/SPEC.md` §3 (item fields, editable labels, saved document shape): item = `{id,name,description,quantity,unit_cost}`, and the label keys follow invoice-generator.com's API.
- Note: `docs/SPEC.md` §11: implementation decisions win over the sections above. This plan adds one entry.
- Note: `CLAUDE.md` `## Hidden coupling`: saved shape `state.js` ↔ `storage.js` ↔ `editor.js` ↔ `pdf.js`; label keys `DEFAULT_LABELS` ↔ `editor.js` ↔ `pdf.js`.
- Note: `TASKS.md` Downstream of IG-4: `refresh({structural, focusId})` is the render entry point; invalid numbers live in `app.invalid` under the paths `items.N.*`.
- Graph: none (no `graphify-out/`); grep used instead.
- Code: `public/js/state.js:11-39` `DEFAULT_LABELS`/`LABEL_KEYS`; `:73-82` `newItem`, `isBlankItem`; `:154-168` `migrate`.
- Code: `public/js/storage.js:190-206` `importItems` (whitelist per item field); `:212-219` `importLabels` (iterates `LABEL_KEYS`, so a new key is accepted automatically); `:99-112` history entries are full doc clones; `:122-158` the CSV has no item columns.
- Code: `public/js/main.js:105` draft → `migrate`; `:654` history reopen → `migrate`; `:643` import → `sanitizeImport`; `:375` a `select` edit does `setPath` then `refresh({structural:true})`; `:430,439` new rows come from `newItem()`.
- Code: `public/js/editor.js:99-106` `selectField`; `:280-314` `itemRow`, `itemsSection`.
- Code: `public/js/pdf.js:71-97` `itemsTable` (widths `['*', 60, 90, 90]`).
- Code: `public/css/app.css:185-201` items grid (5 columns); `:288-302` the narrow-screen items grid.
- Code: `public/js/calc.js:81` amount = quantity × unit_cost. Unit-agnostic, not touched.
- Tests: `tests/pdf.test.js:186-213` index the item cells by position (amount at `[3]`); `tests/storage.test.js:383` deep-equals the blank imported item; `tests/state.test.js:140-153` `migrate`.

## Decisions
- **Field `unit` on each item, `'qty'` or `'hours'`, default `'qty'`.** This is an additive optional field, so there's no `DOC_VERSION` bump. `migrate` and `sanitizeImport` set any missing or unknown value to `'qty'`, so old drafts, history entries and files open unchanged (R4).
- **The unit list lives in `state.js`** as `ITEM_UNITS = [{ id: 'qty', label: 'Qty' }, { id: 'hours', label: 'Hours' }]`, in the `{id,label}` shape `selectField` already takes. The editor, PDF and import read it, so the list exists in one place.
- **The unit is display-only.** `calc.js`, `validate.js`, `modes.js` and the history CSV don't read it (R2). Validation messages stay "Enter a quantity above 0." for hours rows too.
- **`isBlankItem` ignores the unit.** A row whose only change is the unit stays blank: it's skipped in the PDF and in validation, as before.
- **Labels:** the new key `unit_header` defaults to `'Unit'`. `quantity_header` changes its default from `'Quantity'` to `'Qty / Hrs'` to match the sample. Both are editable like every label. A user who renamed the column keeps their own text, because `labels` stores only changed labels.
- **The unit shows as fixed text** ("Qty" or "Hours") on both the sheet's select and the PDF, with no singular/plural switching ("1 Hours" is accepted, as in the sample).
- **Column order** follows the sample: Item · Qty / Hrs · Unit · Rate · Amount.
- **Stacked items layout up to 1099 px** (audit 2026-10-29). The 5-column desktop row needs 528 px, but at 900 px the sheet's content box is ~502 px. So the items rules move out of the `max-width: 899px` block into their own `max-width: 1099px` block, and the rest of the narrow layout keeps its breakpoint.
- **The Unit column is left-aligned** on both the sheet and the PDF (audit 2026-10-29).
- **One unit (one PR), two prompts.** The data prompt ships safely on its own, but a field nobody can set has no user value, so both prompts ship together.

**Non-goals:** restyling the rest of the PDF to match the sample (banner header, boxed meta table, totals block, thank-you line); per-unit validation wording; more units (days, pcs, free text); unit-aware totals or an hours subtotal; a unit column in the history CSV; changing `calc.js`.

## Change list
| File | Action | Why | Req | Prompt |
|---|---|---|---|---|
| `public/js/state.js` | M | Export `ITEM_UNITS`; `newItem` adds `unit: 'qty'`; `migrate` fills invalid/missing item units; `DEFAULT_LABELS` gets `unit_header: 'Unit'` and `quantity_header: 'Qty / Hrs'` | R1, R3, R4 | 01 |
| `public/js/storage.js` | M | `importItems` whitelists `unit` against `ITEM_UNITS`, else `'qty'` | R4 | 01 |
| `tests/state.test.js` | M | `newItem` has `unit`; `migrate` fills a missing/bad unit and keeps `'hours'`; the label defaults | R1, R4 | 01 |
| `tests/storage.test.js` | M | Fixture items get explicit units so the exact round-trip at `:267` stays; a missing or bad unit → `'qty'`; update the blank-item deepEqual at `:383` | R4 | 01 |
| `docs/SPEC.md` | M | §3 regions table (`:104`), item fields and saved shape gain `unit`; §3 label list gains `unit_header`; §8 wireframe header (`:341`); §11 records the decision | traceability (CLAUDE.md rule) | 01 |
| `public/js/editor.js` | M | `itemRow` adds the unit select; `itemsSection` adds the `unit_header` column label | R1, R3 | 02 |
| `public/js/pdf.js` | M | `itemsTable` adds the Unit column (header and cell) and new widths | R3 | 02 |
| `public/css/app.css` | M | Items grid gains the unit column on desktop; the stacked items layout moves to its own `max-width: 1099px` block | R3 | 02 |
| `tests/pdf.test.js` | M | Shift the cell indexes (amount `[3]`→`[4]`, rate `[2]`→`[3]`); assert the Unit header and the "Hours" cell; assert the amount is unchanged for an hours row | R2, R3 | 02 |

Review constraints checked: no `innerHTML` (the select is built with `selectField`/`createElement`); no inline style in HTML; no money math outside `calc.js` (nothing changes there); `state.js`/`storage.js`/`pdf.js` stay pure at import time; `localStorage` keys untouched; no tool branding on the document; no banned wording.

## Blast radius
**Risk:** medium. It touches the high-stakes `public/js/storage.js` (the import sanitiser) and the saved-document shape (hidden coupling); the change is additive and leaves money untouched.

| Affected | Kind | Via | Breaks? | Mitigation |
|---|---|---|---|---|
| `main.js` draft load (`:105`) | Direct | `migrate` | No once `migrate` fills `unit` | 01 fills it |
| `main.js` history reopen (`:654`) | Direct | `migrate` on a full doc clone | No, same path | 01 |
| `main.js` import (`:643`) | Direct | `sanitizeImport` → `importItems` | Without a whitelist the unit would be dropped | 01 adds `unit` to `importItems` |
| `main.js` add/remove item (`:430-439`) | Direct | `newItem()` | No; new rows get `'qty'` | — |
| `main.js` `handleEdit` select case (`:375`) | Direct | `data-kind="select"` → `setPath` + structural refresh | No; same as the other selects; focus is restored by id (`idFor('items.N.unit')`) | 02 uses `selectField` |
| `main.js` `app.invalid` re-index on removal | Direct | paths `items.N.*` | No; a select is never invalid | — |
| `editor.js` `selectField` (`:104`) | Direct | `el.value = getPath(...) ?? ''` | A missing unit would show an empty select | 01 guarantees `unit` on every loaded/new item |
| `pdf.js` `itemsTable` | Direct | new column | Positional tests shift | 02 updates `tests/pdf.test.js` |
| `validate.js` | Transitive | `isBlankItem`, item paths | No; it doesn't read `unit`; `isBlankItem` is unchanged | — |
| `calc.js` `computeTotals` | Transitive | reads `quantity`/`unit_cost` only | No (R2) | Test in 02 asserts the same amount for an hours row |
| History CSV (`storage.js:122-168`) | Non-graph | no item columns | No | — |
| `importLabels` (`storage.js:212`) | Non-graph | iterates `LABEL_KEYS` | No; `unit_header` is accepted automatically | — |
| `pickDefaults`/`DEFAULT_KEYS` | Non-graph | doesn't include items | No | — |
| `pdf-glyphs.js` allowlist | Non-graph | "Qty", "Hours", "Qty / Hrs" are ASCII | No | — |
| `tests/storage.test.js:383` | Test | deep-equals a blank imported item | Yes, it gains `unit` | 01 updates it |
| `tests/state.test.js` `migrate` input-not-mutated test (`:140`) | Test | `migrate` must not mutate | Only if `migrate` writes into `obj` | 01 writes only into the clone |
| Narrow-screen sheet (≤ the `app.css:288` breakpoint) | UI | grid gains a column | Could overflow at 360 px | 02 rearranges the narrow grid; browser check |
| Desktop sheet at 900–~1000 px (audit) | UI | 5-column row needs 528 px; the content box is ~502 px at 900 px | Yes: the name column collapses and the row overflows | 02 moves the stacked items layout to `max-width: 1099px`; browser checks at 900, 1099, 1100 and 1280 px |
| `tests/storage.test.js:267` exact round-trip (audit) | Test | `deepEqual(sanitizeImport(...), fullDocument())` | Yes, if a fixture item has no `unit` | 01 gives both fixture items explicit units; the missing-unit case is tested in the odd-items block |
| `docs/SPEC.md:104`, `:341` column lists (audit) | Doc | "Item, Quantity, Rate, Amount" | Drift, not breakage | 01 updates both |

**Known risks in the touched area:** `storage.js` is the app's only boundary for untrusted input (SPEC §6; `sanitizeImport` comment), so `unit` must be checked against the allowlist and never copied through as-is. The IG-4 note says the title input clips at ~1200 px; that's unrelated, so leave it alone.

## Units
| Unit | Title | Category | Prompts | Depends | High-stakes | Acceptance criteria |
|---|---|---|---|---|---|---|
| U1 | Item units: Qty or Hours | Added | 01, 02 | — | yes (`storage.js`) | R1: every item row on the sheet has a Qty/Hours select, and new rows default to Qty. R2: an item with qty 160 and rate 500 shows an amount of 80,000.00 whether its unit is Qty or Hours; `calc.js` is unchanged. R3: the sheet and PDF items tables read Item · Qty / Hrs · Unit · Rate · Amount, and an hours row prints "Hours" in the Unit column. R4: a draft, history entry or imported file without `unit` opens as Qty; `'hours'` survives reload, export → import and history reopen; an imported `unit: "days"` becomes Qty. |

## Prompts
| # | Title | Unit | Model | Effort | Depends | Group | Files |
|---|---|---|---|---|---|---|---|
| 01 | Item unit in the document shape | U1 | opus | high | — | A | `public/js/state.js`, `public/js/storage.js`, `tests/state.test.js`, `tests/storage.test.js`, `docs/SPEC.md` |
| 02 | Unit column on the sheet and in the PDF | U1 | sonnet | medium | 01 | B | `public/js/editor.js`, `public/js/pdf.js`, `public/css/app.css`, `tests/pdf.test.js` |

- 01 · opus: it edits `public/js/storage.js` (a `## High-stakes paths` glob, the untrusted-input boundary) and the saved-document shape that four modules share.

## End-to-end verification
```bash
npm test
TZ=America/Los_Angeles npm test
TZ=Asia/Manila npm test
find public -path public/vendor -prune -o -name '*.js' -print0 | xargs -0 -r -n1 node --check
git diff --quiet develop -- public/js/calc.js public/js/main.js public/js/validate.js public/js/modes.js   # R2: money and validation untouched
grep -n "ITEM_UNITS" public/js/storage.js                                                # R4: import allowlist in place
```
Browser (Vercel preview or `npx serve public`), proving R1, R3 and R4:
1. A new document: the item row shows a Unit select set to Qty, and the headers read Item · Qty / Hrs · Unit · Rate · Amount.
2. Set qty 160, rate 500 and unit Hours: the amount is 80,000.00 and the totals match the Qty case.
3. Reload: the unit is still Hours. Export JSON → New → Import: still Hours. Download PDF → History → reopen: still Hours.
4. In the PDF, the Unit column prints "Hours"; column order matches the sample.
5. Resize to 360 px wide: no horizontal scroll, every item control can be reached, and the select reads "Hours" in full.
6. At 900 px and 1099 px: the items are stacked, with no overflow. At 1100 px and 1280 px: one row per item, and the item name stays readable.
7. In DevTools, set a stored draft's item `unit` to `"days"`, or delete it, and reload: it shows Qty.

## Rollback
Revert the U1 merge commit on `develop`. Documents saved in the meantime keep an extra `unit` key per item. The pre-change `migrate` copies items as-is and `importItems` drops unknown keys, so old code ignores the key and nothing breaks.

## Log
- 2026-10-29: planned
- 2026-10-29: audited (PASS-WITH-CHANGES), 4 fixes and 3 notes applied

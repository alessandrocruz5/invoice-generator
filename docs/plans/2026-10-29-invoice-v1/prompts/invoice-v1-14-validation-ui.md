---
type: prompt
plan: "[[2026-10-29-invoice-v1]]"
id: 14
unit: IG-6
status: done
model: sonnet
effort: medium
depends_on: [13]
parallel_group: N
files:
  create: []
  modify: [public/js/main.js, public/js/editor.js, public/index.html, public/css/app.css]
  delete: []
---
# 14 · Validation UI

## Task
Show validation in the sidebar and on fields. Validate a field on blur, validate everything on Download, block the download on errors, and never block on warnings.

## Context
Repo: `/home/apa/Code/portfolio/invoice-generator`. Read `docs/SPEC.md` §7 ("Validation") and §8 ("Accessibility"). Read `public/js/main.js` (`app`, `refresh`, `handleEdit` and the Download handler with its `// validation gate (prompt 14)` comment), `public/js/editor.js` (controls carry `data-path` and an `id` of `f-` + the path with `.` → `-`) and `public/js/validate.js`:
- `validate(doc, { totals, invalid, historyNumbers })` returns `{ errors, warnings }`, and each issue is `{ field: data-path|null, message }`.
- `historyNumbers` comes from an in-memory `app.historyNumbers` array (start it as `[]`). `validate` runs on every keystroke, so never read storage there. Prompt 17 fills and maintains the array.

Rules: no HTML sinks; build with `createElement` and `textContent`; no inline styles or handlers in HTML.

**Behaviour:**
- `app.touched = new Set()`. On `focusout` from a control with `data-path`, add the path and re-render the messages. Only touched fields show inline error state, until a Download attempt marks every field touched (`app.showAll = true`).
- On every `refresh()`, recompute `app.issues = validate(...)` and `renderMessages()`.
- `renderMessages()` fills `#messages` in the sidebar:
  - An error summary `<div id="error-summary" role="alert" tabindex="-1">` with a heading ("Fix these before downloading:") and a `<ul>` of links (`<a href="#f-…">`). Clicking a link calls `preventDefault`, focuses the field and scrolls it into view. Issues with `field: null` are plain text.
  - Then a warnings list (heading "Check these:"), without `role="alert"`.
  - Each message `<li>` gets an id (`msg-<n>`).
  - For each errored control currently shown, set `aria-invalid="true"` and `aria-describedby` to its message id. Keep any existing describedby ids, such as the withholding helper text. Clear both when it's fixed.
- **Download gate:** at the marked comment, set `app.showAll = true` and run `validate`. If there are errors, render them, focus `#error-summary` and return without building the PDF. Warnings never block.
- In the mobile layout (< 900 px), messages appear above the sticky Download bar, or at the top of the sheet. They must stay reachable and visible.
- Styles: errors in a red that reaches 4.5:1 contrast, warnings in an amber or dark-yellow text colour that also passes. Give invalid inputs a visible outline that doesn't rely on colour alone (add a thicker border or an icon via CSS `::after` on a wrapper).

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Change any validation rule or message; those live in `validate.js`.
- Make totals a live region.
- Create or switch branches, commit, or push.

## Done when
```bash
npm test
find public -path public/vendor -prune -o -name '*.js' -print0 | xargs -0 -r -n1 node --check
```
Run `python3 -m http.server 8080 -d public` and check:
- On an empty document, Download PDF shows "From is required." and the other errors, focuses the summary, and downloads nothing. Clicking an error focuses its field.
- A discount above the subtotal blocks the download.
- A PH title "Invoice" shows the warning and still downloads.
- A screen reader (or the accessibility tree) shows `aria-invalid` and the described-by message on the From textarea after a failed Download.

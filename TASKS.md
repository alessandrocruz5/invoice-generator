# Invoice Generator — Sprints
Status: [ ] planned · [~] in progress · [x] merged · [-] cancelled (excluded from changelog)

> Each unit's plan, prompts and acceptance criteria are in its `plan:` link. `/build-unit {KEY-id}` runs them.

## Sprint 1 — Invoice Generator v1   (planned 2026-10-29)
Epic: — (no epic ticket) · Branch base: `develop` · Plan: [[2026-10-29-invoice-v1]]

> **Epic:** A free, in-browser billing statement generator for Filipino freelancers that gets withholding tax right,
> with a Generic invoice mode. Static HTML/JS on Vercel with vendored pdfmake 0.3.11; nothing leaves the browser.
> Release is one `develop → main` merge after the `docs/SPEC.md` §10 checklist passes.

- [x] IG-1 — Scaffold, guardrails and vendored pdfmake · Added · plan: [[2026-10-29-invoice-v1]] prompts: 01, 02, 03 · depends: — · model: sonnet (merged 2026-10-29) — scaffold, CLAUDE.md profile, guard tests, pdfmake 0.3.11 vendored. Downstream: no CI on the repo; Vercel not yet connected (F11 open).
- [x] IG-2 — Money core: calc, withholding, modes · Added · plan: [[2026-10-29-invoice-v1]] prompts: 04, 05 · depends: IG-1 · model: opus (merged 2026-10-29) — calc.js (BigInt, P1–P4/V1–V6), withholding.js, modes.js; 42 tests. Downstream: prompt 08 `state.migrate` must default `vat_treatment` to 'vatable' (`totalsRows` labels any other value 'VAT 12%'); prompt 13 must reject empty rates (rows render '()%') and cap input length (calc.js has no length cap).
- [x] IG-3 — Input helpers: TIN, dates, numbering, currency, glyphs · Added · plan: [[2026-10-29-invoice-v1]] prompts: 06, 07 · depends: IG-1 · model: sonnet (merged 2026-10-29) — tin.js, dates.js, numbering.js, currency.js, pdf-glyphs.js; 72 tests. Downstream: `minorUnits` returns 2 for an invalid code (doesn't throw); `isSupportedCurrency` rejects lowercase codes and uses the supported list, not `Intl.NumberFormat`; `parseUserNumber` returns `{ok,value}|{ok:false,error:'thousands'|'decimals'|'format'}` and the language is passed in (no `navigator` read), so `editor.js` must supply it.
- [ ] IG-4 — Editable sheet · Added · plan: [[2026-10-29-invoice-v1]] prompts: 08, 09, 10 · depends: IG-2, IG-3 · model: opus
- [ ] IG-5 — PDF download · Added · plan: [[2026-10-29-invoice-v1]] prompts: 11, 12 · depends: IG-4 · model: sonnet
- [ ] IG-6 — Validation · Added · plan: [[2026-10-29-invoice-v1]] prompts: 13, 14 · depends: IG-5 · model: sonnet
- [ ] IG-7 — Saving, history, import and export · Added · plan: [[2026-10-29-invoice-v1]] prompts: 15, 16, 17 · depends: IG-6 · model: opus
- [ ] IG-8 — Public pages and launch readiness · Added · plan: [[2026-10-29-invoice-v1]] prompts: 18, 19 · depends: IG-7 · model: sonnet

## Hotfixes

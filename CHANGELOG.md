# Changelog — Invoice Generator

## [0.1.0] — 2026-10-29   (Sprint 1: Invoice Generator v1)
### Added
- Scaffold, guardrails and vendored pdfmake 0.3.11 (IG-1)
- Money core: BigInt calc, withholding presets and the PH – Non-VAT, PH – VAT and Generic modes (IG-2)
- Input helpers: TIN mask, timezone-safe dates, document numbering, currency formatting and PDF glyph checks (IG-3)
- Editable sheet: every region of the document is editable, with discount, tax, shipping, withholding, payment QR and logo (IG-4)
- PDF download with a lazily loaded pdfmake (IG-5)
- Validation: errors block download, warnings never do, with an accessible summary (IG-6)
- Autosave, defaults, History with CSV, JSON export and import (IG-7)
- Privacy (English and Filipino), terms and support pages, footer and disclaimer, meta tags, favicon and an accessibility pass (IG-8)

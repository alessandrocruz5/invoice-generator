# invoice-generator
Public Invoice Generator for part-time, individual contractors, or freelance people.

## Development

No build step and no dependencies. Serve `public/` locally with `python3 -m http.server 8080 -d public`, and run tests with `npm test`. The spec is `docs/SPEC.md`.

## Vendored pdfmake

`public/vendor/pdfmake/` holds pdfmake **0.3.11** (MIT), copied from the npm tarball (registry integrity `sha512-Uc49J9hUMyuqJk+U+PxlpBpPr96A4HOOfesGx609EPr2ue82+5/Smq/KTAkEqh0/jUGSi1fumvqZ5yAWijJTJg==`). Never edit these files; to upgrade, repeat the copy and update this table.

| File | SHA-256 |
|---|---|
| pdfmake.min.js | `faaee53f8dcf48b0934553665809d8180e20e435b654f633df2f18f9dbdeaa88` |
| vfs_fonts.js | `1483ed267fe00ad90a3834441b019d856dd41ed079b2614404b2fcef425db6fc` |
| LICENSE | `ab919430421c2e244dbb8694d70916eae16235b75c0ea07e9a6c67cd4265c954` |

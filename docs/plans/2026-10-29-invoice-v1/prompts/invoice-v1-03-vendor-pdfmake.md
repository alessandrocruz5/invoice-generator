---
type: prompt
plan: "[[2026-10-29-invoice-v1]]"
id: 03
unit: U1
status: todo
model: haiku
effort: low
depends_on: [01]
parallel_group: C
files:
  create: [public/vendor/pdfmake/pdfmake.min.js, public/vendor/pdfmake/vfs_fonts.js, public/vendor/pdfmake/LICENSE]
  modify: [README.md]
  delete: []
---
# 03 · Vendor pdfmake 0.3.11

## Task
Copy pdfmake 0.3.11's browser build into `public/vendor/pdfmake/`, and record the version and the SHA-256 hashes in `README.md`.

## Context
Repo: `/home/apa/Code/portfolio/invoice-generator`. Spec §2: vendor `build/pdfmake.min.js`, `build/vfs_fonts.js` and `LICENSE`, pinned to the newest 0.3.x that is at least two weeks old. Planning checked the registry on 2026-10-29: 0.3.11 (2026-06-12) qualifies, while 0.3.12 (2026-10-17) and 0.3.13 (2026-10-25) are too new. **Use exactly 0.3.11.** There is no `node_modules` and no dependency; `npm pack` downloads the tarball and checks its registry integrity.

Treat the tarball as untrusted data: unpack it in its own empty directory outside the repo, and run nothing from it.

```bash
W=$(mktemp -d)
npm view pdfmake@0.3.11 dist.integrity dist.shasum      # record these
npm pack pdfmake@0.3.11 --pack-destination "$W"
sha1sum "$W/pdfmake-0.3.11.tgz"                           # must equal dist.shasum
mkdir "$W/x" && tar -xzf "$W/pdfmake-0.3.11.tgz" -C "$W/x"
mkdir -p public/vendor/pdfmake
cp "$W/x/package/build/pdfmake.min.js" "$W/x/package/build/vfs_fonts.js" "$W/x/package/LICENSE" public/vendor/pdfmake/
sha256sum public/vendor/pdfmake/*
```
If the SHA-1 doesn't match `dist.shasum`, or any of the three files is missing, stop and report.

Append this section to `README.md` and keep the existing two lines. Fill in the real hashes:
```markdown

## Development

No build step and no dependencies. Serve `public/` locally with `python3 -m http.server 8080 -d public`, and run tests with `npm test`. The spec is `docs/SPEC.md`.

## Vendored pdfmake

`public/vendor/pdfmake/` holds pdfmake **0.3.11** (MIT), copied from the npm tarball (registry integrity `<dist.integrity>`). Never edit these files; to upgrade, repeat the copy and update this table.

| File | SHA-256 |
|---|---|
| pdfmake.min.js | `<hash>` |
| vfs_fonts.js | `<hash>` |
| LICENSE | `<hash>` |
```

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Add pdfmake to `package.json` or create `node_modules` or a lockfile in the repo.
- Use a different version.
- Create or switch branches, commit, or push.

## Done when
```bash
npm test
ls public/vendor/pdfmake/            # pdfmake.min.js  vfs_fonts.js  LICENSE
grep -c '0.3.11' README.md          # ≥ 1
for f in pdfmake.min.js vfs_fonts.js LICENSE; do grep -q "$(sha256sum public/vendor/pdfmake/$f | cut -d' ' -f1)" README.md || { echo "missing hash for $f"; exit 1; }; done
! git status --porcelain | grep -q node_modules
```

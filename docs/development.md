# Development

[English](development.md) · [简体中文](zh/development.md)

## Layout

```
index.js            Host entry: name / inject / apply wiring
lib/                Host modules: config reads and writes, credentials, probes, validation, error codes
contract.js         Host ↔ client contract: service name, method table, Typert descriptions
src/client/         Browser-side source (JSX): views/, components/, hooks.js, templates/
client.js           Browser bundle, committed (the plugin loads it directly)
cordis.patch.yml    Bundle patch: inserts this plugin and hides the official Models page
icons/              Logo sources (72 SVG + 112 48×48 WebP); build-time only, not shipped
assets/icons/       Shipped logos, content-hash names, loaded on demand by the /plugins asset route
docs/               Screenshots and docs; shipped so the installed plugin page can render them
locale/             Localized settings section title and description
test/               Host unit tests (node:test)
scripts/            Build, icon generation and release gate scripts
```

## Commands

```bash
npm ci                        # install from package-lock (first run / CI); npm install when deps change
npm run check                 # release gate: version, files, patch, icon assets, client.js parity, size budgets
npm test                      # Host unit tests (node:test)
npm run test:coverage         # tests plus coverage thresholds (lines 87 / branches 82 / functions 91)
npm run build:client          # src/client/ → dist/client.bundle.cjs → client.js
npm run gen:icons             # icons/ → content-hashed assets/icons/ + src/client/icons.js
node scripts/gen-ui-icons.mjs # Lucide glyphs → src/client/ui-icons.jsx
python3 scripts/fetch-favicons.py  # fetch missing vendor favicons (requires Pillow)
```

## Gate and tests

`scripts/check.mjs` writes nothing: it rebuilds `client.js` in memory with the same esbuild configuration and compares it byte for byte with the committed artifact, then checks the manifest (`engines.dsh` upper bound, `files` whitelist, `dsh.bundle` patch), the bundle patch, template ↔ icon orphans, logo asset existence and content hashes, `node --check` on the Host files, install-command tags across the READMEs and docs, and the size budgets (client / icons / assets / docs).

- `--no-build` skips the byte comparison locally (for example without `node_modules`); CI never uses it.
- `npm run test:coverage` enforces the thresholds above; `test/**` is excluded from coverage.
- CI (`.github/workflows/check.yml`) runs `npm ci` → `npm run check` → `npm run test:coverage` on ubuntu Node 22/24 and windows Node 22.

## Release

Tags are immutable once pushed, so the release is two phases:

```bash
node scripts/release.mjs prepare 1.3.2 --notes /tmp/notes.md
# review `git show --stat HEAD` and the tag, then:
node scripts/release.mjs publish          # add --no-npm to skip the npm step
node scripts/release.mjs npm              # publish to npm only (backfill; remote tag must exist)
```

`prepare` checks the version increase and a clean tree, inserts the CHANGELOG section, syncs `package.json`, `package-lock` and the `#vX.Y.Z` install tags, runs the gate, commits and creates the annotated tag. `publish` re-runs the gate, refuses if the remote already has the tag, pushes `main` and the tag atomically, waits for the `check.yml` run to go green, creates the GitHub release from the CHANGELOG section, then publishes the same version to npm (it needs `npm login` and a manifest without `private`; a dirty tree, a missing remote tag, or an already-published version is refused or skipped).

The release title is exactly the tag (`vX.Y.Z`); the CHANGELOG section is the body. `--title` only annotates the git tag itself.

## Icon pipeline

- `client.js` is built by `scripts/build-client.mjs` with esbuild into CJS and wrapped in the `window.__ModuleLoader__.load` factory; React comes from DSH's module table and is not bundled. Node 22 and the esbuild version pinned by `package-lock` (0.28 as of v1.3.1) reproduce it byte for byte; a failed build leaves no half-written `client.js` (temp file + rename).
- `src/client/icons.js`, `src/client/ui-icons.jsx` and `dist/` are generated — do not edit them. `client.js` is the exception: it is a release artifact that must be committed.
- Logos are build-time inputs but no longer inlined into the bundle. `gen-icons.mjs` copies each logo to `assets/icons/<key>.<sha1-12>.<ext>` (content-hash names; the asset route serves them as `immutable`) and generates `src/client/icons.js` holding only key → `require.asset("plugins/<package>/assets/icons/<file>")`. `package.json`'s `"./assets/*": "./assets/*"` export is required for the asset route to resolve files, and `files` ships `assets/`; `icons/` itself is not shipped.
- Adding a vendor logo: prefer the vendor's official touch icon or SVG, run `python3 scripts/fetch-favicons.py` (it skips local and private-network addresses and trims transparent padding), convert to a 48 px WebP, then run `npm run gen:icons`.
- After changing logo formats, measure first: `python3 scripts/icon-frames.py` (transparent padding → optical scale) and `python3 scripts/icon-tones.py` (light/dark classification → backdrop), then `node scripts/gen-icons.mjs`; both Python scripts need Pillow.

## Contributing

```bash
git clone https://github.com/realchendahuang/dsh-provider-studio.git
cd dsh-provider-studio
npm ci                 # install from package-lock
npm run check          # release gate (run npm run build:client first if src/client/ changed)
npm test               # Host unit tests
```

- Run `npm run check` and `npm test` before opening a PR. If `src/client/` changed, commit the regenerated `client.js` — the plugin loads it directly.
- Host changes (`index.js` / `contract.js`) can only be verified after restarting DSH; client-only changes need the window refreshed.
- Write commit messages as English imperatives, for example `Fix key reveal when the secret is empty`.
- Record version changes in [CHANGELOG.md](../CHANGELOG.md).

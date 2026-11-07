/**
 * Pure helpers behind `scripts/check.mjs`.
 *
 * README: the gate itself is a top-level script with side effects, so anything
 * it needs to be *tested* lives here instead: `files` whitelist matching, the
 * README image/tag extractors, and the regexp escaper they share. `check.mjs`
 * imports these; `test/gate.test.mjs` exercises them directly, which keeps the
 * gate's own logic from rotting while the gate keeps reporting green.
 */

/**
 * A workspace path in the `/` form the package manifest uses: Windows separators
 * are folded, so `docs\zh\install.md` compares equal to `docs/zh/install.md`.
 * @param {string} path
 * @returns {string}
 */
export const toPosixPath = (path) => String(path).replace(/\\/g, '/')

/** Escape a literal string for use inside a RegExp. */
export const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Whether a workspace-relative file ships under one `files` entry: an exact
 * name, a directory prefix (`lib/`), or a `*`/`?` pattern (`locale/*.json`).
 * Glob `*` and `?` stay inside one path segment, like npm's packlist.
 * @param {string} relativePath - file path from the package root, `/`-separated.
 * @param {string} entry - one `files[]` entry as written in package.json.
 * @returns {boolean}
 */
export function matchesFileEntry(relativePath, entry) {
  const clean = entry.replace(/^\.\//, '').replace(/\/$/, '')
  if (!/[*?]/.test(clean)) return relativePath === clean || relativePath.startsWith(`${clean}/`)
  const pattern = escapeRegExp(clean).replace(/\\\*/g, '[^/]*').replace(/\\\?/g, '[^/]')
  return new RegExp(`^${pattern}$`, 'u').test(relativePath)
}

/**
 * Relative image destinations a Markdown document references, in order:
 * `![alt](docs/list.png)` yields `docs/list.png`. Absolute URLs (http, https,
 * data) and in-page `#anchors` are ignored — only shipped files matter here.
 * @param {string} markdown
 * @returns {string[]}
 */
export function localImageRefs(markdown) {
  return [...String(markdown).matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)]
    .map((match) => match[1])
    .filter((src) => !/^[a-z]+:/i.test(src) && !src.startsWith('#'))
}

/**
 * Distinct `#vX.Y.Z` install tags a Markdown document pins, in order of
 * appearance. Prerelease suffixes are part of the version (`v1.2.4-rc.1`).
 * @param {string} markdown
 * @returns {string[]} versions without the leading `v`
 */
export function installTagRefs(markdown) {
  return [...new Set(
    [...String(markdown).matchAll(/#v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\b/g)].map((match) => match[1]),
  )]
}

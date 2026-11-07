/**
 * Tests for the release gate's own helpers.
 *
 * README: `scripts/check.mjs` is a top-level script (it prints a report and
 * exits), so its logic is only testable through the pure module it imports.
 * These cases guard the two checks that v1.2.3 added after a shipped-broken
 * detail page: whether a file ships under `files[]`, and whether the README
 * install tag still names the current version.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { escapeRegExp, installTagRefs, localImageRefs, matchesFileEntry } from '../scripts/gate-utils.mjs'

test('matchesFileEntry: exact names, directory prefixes and globs', () => {
  assert.equal(matchesFileEntry('index.js', 'index.js'), true)
  assert.equal(matchesFileEntry('index.js', 'client.js'), false)
  assert.equal(matchesFileEntry('docs/list.webp', 'docs/'), true)
  assert.equal(matchesFileEntry('docs/nested/list.webp', 'docs/'), true)
  assert.equal(matchesFileEntry('docs/list.webp', './docs'), true)
  assert.equal(matchesFileEntry('locale/en.json', 'locale/*.json'), true)
  assert.equal(matchesFileEntry('locale/en.txt', 'locale/*.json'), false)
  assert.equal(matchesFileEntry('locale/en.json', 'locale/*.json'), true)
  assert.equal(matchesFileEntry('lib/service.js', 'lib/'), true)
  assert.equal(matchesFileEntry('libx/service.js', 'lib/'), false)
  // A bare pattern must match the whole path, not a prefix of it.
  assert.equal(matchesFileEntry('assets/logo.webp', 'assets/*.webp'), true)
  assert.equal(matchesFileEntry('assets/sub/logo.webp', 'assets/*.webp'), false)
})

test('localImageRefs: only relative, shippable images count', () => {
  const markdown = [
    '![badge](https://img.shields.io/badge/x-y.svg)',
    '![shot](docs/list.webp)',
    '<img src="docs/inline.png">',
    '![anchor](#preview)',
    '![data](data:image/png;base64,AAAA)',
    '![nested](docs/deep/a.webp "a title")',
  ].join('\n')
  assert.deepEqual(localImageRefs(markdown), ['docs/list.webp', 'docs/deep/a.webp'])
  // Data URLs and absolute URLs must never be treated as shipped files.
  assert.deepEqual(localImageRefs('![a](HTTPS://x/y.png)'), [])
  assert.deepEqual(localImageRefs('no images here'), [])
})

test('installTagRefs: distinct versions, prereleases included', () => {
  const markdown = [
    'dsh plugin --profile desktop add github:realchendahuang/dsh-provider-studio#v1.2.4',
    'dsh plugin --profile web add github:realchendahuang/dsh-provider-studio#v1.2.4',
    'tag v1.2.3 should not match',
    'pre #v1.2.5-rc.1',
  ].join('\n')
  assert.deepEqual(installTagRefs(markdown), ['1.2.4', '1.2.5-rc.1'])
  assert.deepEqual(installTagRefs('no tags'), [])
})

test('escapeRegExp escapes every regexp metacharacter', () => {
  const literal = 'a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o'
  assert.equal(new RegExp(`^${escapeRegExp(literal)}$`, 'u').test(literal), true)
  assert.equal(new RegExp(`^${escapeRegExp(literal)}$`, 'u').test('axb*c+d?e^f$g{h}i(j)k|l[m]n\\o'), false)
})

#!/usr/bin/env node
/**
 * Two-phase release helper.
 *
 * README: a tag that reached the remote can never be re-cut, so this splits the
 * release into a reversible half and an irreversible one:
 *
 *   node scripts/release.mjs prepare 1.2.5 --title "…" --notes notes.md
 *       bump package.json / package-lock / README install tags, insert the
 *       CHANGELOG section, run the gate + tests, commit, create the annotated
 *       tag — nothing is pushed yet, so `git reset --hard HEAD~1 && git tag -d`
 *       still undoes it.
 *
 *   node scripts/release.mjs publish
 *       refuse unless the tree is clean and `main` is at HEAD, re-run the gate,
 *       push main + tag atomically, wait for the CI run to go green, then create
 *       the GitHub release from the CHANGELOG section. It aborts *before* any
 *       push when the remote already has the tag.
 *
 * The release title becomes the tag message subject; `publish` prefixes it with
 * `v<version> · `, matching the existing releases.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [command, ...rest] = process.argv.slice(2)

/** Run a command, inheriting stdio unless `quiet`; exits on failure. */
function run(cmd, args = [], { quiet = false, allowFailure = false } = {}) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  })
  if (result.error !== undefined) fail(`cannot run ${cmd}: ${result.error.message}`)
  if (!allowFailure && result.status !== 0) fail(`${cmd} ${args.join(' ')} exited ${result.status}`)
  return quiet ? { code: result.status, stdout: (result.stdout ?? '').trim(), stderr: (result.stderr ?? '').trim() } : { code: result.status }
}

function fail(message) {
  console.error(`release: ${message}`)
  process.exit(1)
}

const readJson = (name) => JSON.parse(readFileSync(join(ROOT, name), 'utf8'))
const packageVersion = () => readJson('package.json').version

/** `1.10.0` > `1.9.9`: compare numeric segments, prerelease builds last. */
function compareVersions(a, b) {
  const split = (version) => {
    const [core, pre = ''] = version.split('-', 2)
    return { core: core.split('.').map(Number), pre }
  }
  const left = split(a)
  const right = split(b)
  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] !== right.core[index]) return left.core[index] - right.core[index]
  }
  if (left.pre === right.pre) return 0
  if (left.pre === '') return 1
  if (right.pre === '') return -1
  return left.pre < right.pre ? -1 : 1
}

const tagName = (version) => `v${version}`
const today = () => {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function parseFlags(args) {
  const flags = {}
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]
    if (!token.startsWith('--')) fail(`unexpected argument: ${token}`)
    const value = args[index + 1]
    if (value === undefined || value.startsWith('--')) fail(`missing value for ${token}`)
    flags[token.slice(2)] = value
    index += 1
  }
  return flags
}

function readmeTags(readme) {
  return [...readme.matchAll(/#v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\b/g)].map((match) => match[1])
}

function changelogSection(markdown, version) {
  const lines = markdown.split('\n')
  const start = lines.findIndex((line) => new RegExp(`^##\\s+v?${version.replace(/[.]/g, '\\.')}\\b`).test(line))
  if (start === -1) return null
  let end = lines.findIndex((line, index) => index > start && /^##\s/.test(line))
  if (end === -1) end = lines.length
  return lines.slice(start + 1, end).join('\n').trim()
}

function ensureCleanTree() {
  const status = run('git', ['status', '--porcelain'], { quiet: true }).stdout
  if (status !== '') fail(`working tree is dirty:\n${status}`)
}

function ensureRemoteTagAbsent(version) {
  const ref = `refs/tags/${tagName(version)}`
  const remote = run('git', ['ls-remote', '--tags', 'origin', ref], { quiet: true, allowFailure: true }).stdout
  if (remote !== '') fail(`${ref} already exists on origin — tags are immutable; bump the version instead`)
}

function runGate(message = 'release gate') {
  console.log(`\n▸ ${message}`)
  run('npm', ['test'])
  run('npm', ['run', 'check'])
}

// --------------------------------------------------------------------- prepare

function prepare(args) {
  const version = args[0]
  const flags = parseFlags(args.slice(1))
  if (version === undefined || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) fail('usage: prepare <x.y.z> --title "…" --notes file.md')
  if (flags.title === undefined) fail('--title is required')
  if (flags.notes === undefined) fail('--notes <file.md> is required (the release body, inserted into CHANGELOG)')

  const current = packageVersion()
  if (compareVersions(version, current) <= 0) fail(`${version} must be greater than the current ${current}`)
  ensureCleanTree()
  ensureRemoteTagAbsent(version)
  const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { quiet: true }).stdout
  if (branch !== 'main') fail(`prepare must run on main (currently ${branch})`)

  const notesPath = resolve(flags.notes)
  if (!existsSync(notesPath)) fail(`notes file not found: ${notesPath}`)
  const notes = readFileSync(notesPath, 'utf8').trim()
  if (notes === '') fail('notes file is empty')

  // CHANGELOG first: the gate compares its newest heading with package.json.
  const changelogPath = join(ROOT, 'CHANGELOG.md')
  const changelog = readFileSync(changelogPath, 'utf8')
  if (changelogSection(changelog, version) !== null) fail(`CHANGELOG already has a ${version} section`)
  const heading = `## ${version} — ${today()}`
  const nextChangelog = changelog.replace('# Changelog\n\n', `# Changelog\n\n${heading}\n\n${notes}\n\n`)
  if (nextChangelog === changelog) fail('CHANGELOG.md has no `# Changelog` header to insert under')
  writeFileSync(changelogPath, nextChangelog)

  // package.json + lock: `npm install --package-lock-only` rewrites the root
  // version and keeps the dependency tree untouched.
  const manifestPath = join(ROOT, 'package.json')
  const manifest = readJson('package.json')
  manifest.version = version
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  run('npm', ['install', '--package-lock-only', '--ignore-scripts'])

  // README install commands: every `#vX.Y.Z` must name the new tag.
  const readmePath = join(ROOT, 'README.md')
  const readme = readFileSync(readmePath, 'utf8')
  const staleTags = [...new Set(readmeTags(readme))].filter((tag) => tag !== version)
  if (staleTags.length === 0) fail(`README has no #v${current} install tag to update`)
  const nextReadme = readme.replace(/#v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\b/g, `#v${version}`)
  writeFileSync(readmePath, nextReadme)

  runGate('gate before tagging')

  console.log('\n▸ commit + tag')
  run('git', ['add', '-A'])
  run('git', ['commit', '-m', `Release ${version}`])
  run('git', ['tag', '-a', tagName(version), '-m', flags.title])

  console.log(`\nprepared ${tagName(version)} locally — nothing pushed.`)
  console.log('review `git show --stat HEAD`, then run:')
  console.log('  node scripts/release.mjs publish')
}

// --------------------------------------------------------------------- publish

function publish() {
  const version = packageVersion()
  const tag = tagName(version)
  ensureCleanTree()
  ensureRemoteTagAbsent(version)

  const localTag = run('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`], { quiet: true, allowFailure: true })
  if (localTag.code !== 0) fail(`${tag} does not exist locally — run prepare first`)
  const tagCommit = run('git', ['rev-list', '-n', '1', tag], { quiet: true }).stdout
  const head = run('git', ['rev-parse', 'HEAD'], { quiet: true }).stdout
  if (tagCommit !== head) fail(`${tag} does not point at HEAD (${head}); commit or retag first`)

  runGate('gate before pushing')

  console.log(`\n▸ push ${tag}`)
  run('git', ['push', '--atomic', 'origin', 'main', '--follow-tags'])

  console.log('\n▸ wait for CI')
  // The run for a fresh push can take a few seconds to appear; poll briefly
  // instead of failing an already-pushed release.
  let databaseId
  for (let attempt = 0; attempt < 30 && databaseId === undefined; attempt += 1) {
    if (attempt > 0) spawnSync('sleep', ['2'])
    // Only the release gate decides whether the tag is shippable; the tag guard
    // workflow is a second run on the same commit and must not be mistaken for it.
    const runList = run('gh', ['run', 'list', '--workflow', 'check.yml', '--limit', '5', '--json', 'databaseId,headSha,status'], { quiet: true, allowFailure: true })
    try {
      const runs = JSON.parse(runList.stdout)
      const match = runs.find((entry) => entry.headSha === head)
      if (match !== undefined) databaseId = match.databaseId
    } catch {
      /* retry until the run appears */
    }
  }
  if (databaseId === undefined) fail('could not find the CI run for this commit; check `gh run list`')
  run('gh', ['run', 'watch', String(databaseId), '--exit-status'])

  console.log('\n▸ GitHub release')
  const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8')
  const body = changelogSection(changelog, version)
  if (body === null) fail(`CHANGELOG has no ${version} section to publish`)
  const notesPath = join(ROOT, '.git', 'release-notes.md')
  writeFileSync(notesPath, `${body}\n`)
  const subject = run('git', ['tag', '-l', '--format=%(contents:subject)', tag], { quiet: true }).stdout
  const title = subject === '' ? `${tag} · ${version}` : `${tag} · ${subject}`
  run('gh', ['release', 'create', tag, '--verify-tag', '--title', title, '--notes-file', notesPath])

  console.log(`\npublished ${title}`)
  console.log('verify the install path from the tag:')
  console.log(`  DSH_HOME=$(mktemp -d) dsh plugin --profile web add github:realchendahuang/dsh-provider-studio#${tag}`)
}

// ------------------------------------------------------------------------ main

if (command === 'prepare') prepare(rest)
else if (command === 'publish') publish()
else {
  console.error('usage: release.mjs prepare <x.y.z> --title "…" --notes file.md | release.mjs publish')
  process.exit(1)
}

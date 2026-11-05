#!/usr/bin/env node
/**
 * Release gate for dsh-provider-studio — zero new dependencies.
 *
 * Everything here is read-only: `client.js` is rebuilt in memory with the same
 * esbuild options as scripts/build-client.mjs and compared byte for byte with
 * the committed artifact. Nothing is written, so it is safe to run locally, in
 * CI, and while the rest of the repo is being edited.
 *
 * Usage:
 *   node scripts/check.mjs              # every check (needs `npm ci` for yaml + esbuild)
 *   node scripts/check.mjs --no-build   # skip the client.js rebuild compare
 *
 * Exits 1 when any check fails; warnings do not fail the build.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, readdir, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// ---------------------------------------------------------------- environment

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const NO_BUILD = process.argv.includes('--no-build')
const requireFromRoot = createRequire(join(ROOT, 'package.json'))

const BUDGETS = {
  // client.js is shipped to every install; v1.1.2 was 618,437 B with PNG logos,
  // v1.2 moves the rasters to 48px WebP and should land well under 600 KB.
  clientBytes: 600 * 1024,
  // src/client/icons.js is the generated logo table (also inlined into client.js).
  iconsBytes: 300 * 1024,
}

const tty = process.stdout.isTTY === true
const paint = (code, text) => (tty ? `\u001b[${code}m${text}\u001b[0m` : text)
const bold = (text) => paint('1', text)
const dim = (text) => paint('2', text)
const green = (text) => paint('32', text)
const yellow = (text) => paint('33', text)
const red = (text) => paint('31', text)

// ------------------------------------------------------------------- reporting

let packageManifest = null
const rows = []
const section = (title) => rows.push({ kind: 'section', title })
const ok = (label, detail) => rows.push({ kind: 'ok', label, detail })
const warn = (label, detail) => rows.push({ kind: 'warn', label, detail })
const fail = (label, detail) => rows.push({ kind: 'fail', label, detail })
const check = (label, condition, detail) => (condition ? ok(label, detail) : fail(label, detail))

function printRow(row) {
  if (row.kind === 'section') {
    console.log(`\n${bold(row.title)}`)
    return
  }
  const mark = row.kind === 'ok' ? green('✓') : row.kind === 'warn' ? yellow('!') : red('✗')
  const label = row.label.padEnd(34)
  const detail = row.detail === undefined || row.detail === '' ? '' : dim(`  ${row.detail}`)
  console.log(`  ${mark} ${label}${detail}`)
}

function finish() {
  for (const row of rows) printRow(row)

  const failures = rows.filter((row) => row.kind === 'fail')
  const warnings = rows.filter((row) => row.kind === 'warn')
  const passes = rows.filter((row) => row.kind === 'ok')

  console.log('')
  console.log(
    `${green(`${passes.length} passed`)} · ${warnings.length ? yellow(`${warnings.length} warnings`) : '0 warnings'} · ${failures.length ? red(`${failures.length} failed`) : '0 failed'}`,
  )
  if (failures.length > 0) {
    console.log(red('\nFAIL — fix the items marked ✗ above.'))
    process.exitCode = 1
    return
  }
  const label = packageManifest ? `${packageManifest.name}@${packageManifest.version}` : 'package'
  console.log(green(`OK — ${label} is ready to ship.`))
}

/** Print what we have and stop: used when a prerequisite makes the rest meaningless. */
function die(message) {
  fail('check could not run', message)
  finish()
  process.exit(1)
}

async function readJson(path, label) {
  let text
  try {
    text = await readFile(path, 'utf8')
  } catch {
    return { missing: true }
  }
  try {
    return { value: JSON.parse(text), text }
  } catch (error) {
    fail(label, `invalid JSON — ${error.message}`)
    return { missing: false, value: undefined, text }
  }
}

async function walkFiles(dir) {
  const found = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...(await walkFiles(full)))
    else found.push(full)
  }
  return found
}

const rel = (path) => path.slice(ROOT.length + 1)
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`

// -------------------------------------------------------------------- manifest

const pkgResult = await readJson(join(ROOT, 'package.json'), 'package.json')
if (pkgResult.missing) die(`package.json not found under ${ROOT}`)
const pkg = pkgResult.value
if (!pkg) die('package.json could not be parsed')
packageManifest = pkg

let esbuildVersion = null
try {
  esbuildVersion = (await import('esbuild')).version
} catch {
  // Reported in the client section; the other checks do not need esbuild.
}

console.log(bold(`${pkg.name}@${pkg.version}`) + dim(`  ·  node ${process.versions.node}  ·  esbuild ${esbuildVersion ?? 'n/a'}  ·  ${ROOT}`))

section('manifest')

check(
  'name + version',
  typeof pkg.name === 'string' && pkg.name.length > 0 && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version),
  `${pkg.name}@${pkg.version}`,
)

// engines.dsh: DSH runs semver.satisfies(includePrerelease) on this range. Without
// an upper bound the plugin silently claims every future DSH release.
const dshRange = pkg.engines?.dsh
const hasLowerBound = typeof dshRange === 'string' && />=?\s*\d+\.\d+\.\d+/.test(dshRange)
const hasUpperBound = typeof dshRange === 'string' && /<\s*\d+\.\d+\.\d+/.test(dshRange)
check('engines.dsh present', typeof dshRange === 'string' && dshRange.trim() !== '', dshRange ?? 'missing')
check('engines.dsh lower bound', hasLowerBound, dshRange ?? 'missing')
check('engines.dsh upper bound', hasUpperBound, hasUpperBound ? dshRange : 'no `<x.y.z` upper bound — future DSH majors would install blindly')

// `prepare` would force a build-approval prompt on every GitHub install (DSH runs
// pnpm non-interactively), which breaks the "install without a build step" promise.
check(
  'scripts.prepare absent',
  !Object.hasOwn(pkg.scripts ?? {}, 'prepare'),
  Object.hasOwn(pkg.scripts ?? {}, 'prepare') ? 'git installs would need build approval' : 'install stays build-free',
)
for (const script of ['build:client', 'check', 'test', 'gen:icons']) {
  check(`scripts.${script}`, typeof pkg.scripts?.[script] === 'string', pkg.scripts?.[script] ?? 'missing')
}

// The gate itself is intentionally dependency-free: flag test/lint frameworks that
// would mean someone bypassed it.
const bannedDevDeps = ['jest', 'vitest', 'mocha', 'ava', 'tap', 'eslint', 'prettier', 'typescript', 'tsx', 'tsup']
const devDeps = Object.keys(pkg.devDependencies ?? {})
const bannedFound = devDeps.filter((name) => bannedDevDeps.includes(name))
check('devDependencies stay lean', bannedFound.length === 0, bannedFound.length ? bannedFound.join(', ') : devDeps.join(', ') || 'none')

section('version sync')

let changelogText = ''
try {
  changelogText = await readFile(join(ROOT, 'CHANGELOG.md'), 'utf8')
} catch {
  changelogText = ''
}
const latestChangelog = changelogText.match(/^##\s+(\d+\.\d+\.\d+)\b/m)?.[1]
check('CHANGELOG latest version', latestChangelog === pkg.version, `${latestChangelog ?? 'missing'} vs package.json ${pkg.version}`)
check(
  'CHANGELOG date heading',
  /^##\s+\d+\.\d+\.\d+\s+—\s+\d{4}-\d{2}-\d{2}\b/m.test(changelogText),
  changelogText.match(/^##\s+(\d+\.\d+\.\d+[^\n]*)/m)?.[1] ?? 'no `## x.y.z — YYYY-MM-DD` heading',
)

const lockPath = join(ROOT, 'package-lock.json')
if (existsSync(lockPath)) {
  const lock = (await readJson(lockPath, 'package-lock.json')).value
  const rootVersion = lock?.packages?.['']?.version
  check('package-lock root version', lock?.version === pkg.version, `${lock?.version ?? 'missing'} vs ${pkg.version}`)
  check('package-lock packages[""].version', rootVersion === pkg.version, `${rootVersion ?? 'missing'} vs ${pkg.version}`)
  const lockEngines = lock?.packages?.['']?.engines?.dsh
  if (lockEngines === undefined) warn('package-lock engines.dsh', 'not recorded in the lock root')
  else check('package-lock engines.dsh', lockEngines === dshRange, `${lockEngines} vs ${dshRange ?? 'missing'}`)
} else {
  warn('package-lock.json', 'missing — CI `npm ci` would fail')
}

section('files + exports')

// `files` decides what npm pack and git installs actually ship: a filename that
// exists locally but is missing here is a 404 for every user.
const filesEntries = Array.isArray(pkg.files) ? pkg.files : []
if (filesEntries.length === 0) fail('files[]', 'no whitelist — everything would be published')
const normalizedFiles = filesEntries.map((entry) => entry.replace(/^\.\//, ''))

for (const entry of filesEntries) {
  const clean = entry.replace(/^\.\//, '')
  if (/[*?]/.test(clean)) {
    const dirPart = clean.split(/[*?]/)[0].replace(/\/$/, '')
    const suffix = clean.match(/[*?]\.([A-Za-z0-9]+)$/)?.[1]
    if (!existsSync(join(ROOT, dirPart || '.'))) {
      fail(`files[] ${entry}`, 'directory does not exist')
      continue
    }
    const names = await readdir(join(ROOT, dirPart || '.'))
    const hits = suffix ? names.filter((name) => name.endsWith(`.${suffix}`)) : names
    check(`files[] ${entry}`, hits.length > 0, `${hits.length} matching file(s)`)
    continue
  }

  const target = join(ROOT, clean)
  if (!existsSync(target)) {
    fail(`files[] ${entry}`, 'does not exist')
    continue
  }
  const info = await stat(target)
  if (info.isDirectory()) {
    const names = await readdir(target)
    if (names.length === 0) fail(`files[] ${entry}`, 'directory is empty')
    else ok(`files[] ${entry}`, `${names.length} entr${names.length === 1 ? 'y' : 'ies'}`)
  } else {
    ok(`files[] ${entry}`, kb(info.size))
  }
}

const isCovered = (rawTarget) => {
  const target = rawTarget.replace(/^\.\//, '')
  return target === 'package.json' || normalizedFiles.some((entry) => {
    if (entry.endsWith('/*')) return target.startsWith(entry.slice(0, -1))
    if (entry.endsWith('/')) return target.startsWith(entry)
    return target === entry
  })
}

for (const [key, target] of Object.entries(pkg.exports ?? {})) {
  if (typeof target !== 'string') continue
  check(`exports["${key}"] in files[]`, isCovered(target), target)
  if (!target.includes('*')) {
    check(`exports["${key}"] target exists`, existsSync(join(ROOT, target)), target)
  } else {
    const dirPart = target.replace(/^\.\//, '').split(/[*?]/)[0].replace(/\/$/, '')
    check(`exports["${key}"] dir exists`, existsSync(join(ROOT, dirPart || '.')), dirPart || '.')
  }
}

section('bundle patch + locale')

let yaml
try {
  yaml = requireFromRoot('yaml')
} catch {
  fail('yaml module', 'not installed — run `npm ci`')
}
if (yaml) {
  let patches
  try {
    patches = yaml.parse(await readFile(join(ROOT, 'cordis.patch.yml'), 'utf8'))
    ok('cordis.patch.yml parses', 'yaml')
  } catch (error) {
    fail('cordis.patch.yml parses', error.message)
  }
  if (patches !== undefined) {
    check('cordis.patch.yml is a list', Array.isArray(patches), Array.isArray(patches) ? `${patches.length} rows` : typeof patches)
    if (Array.isArray(patches)) {
      const ours = patches.find((row) => row?.insert?.some?.((item) => item?.id === pkg.name))
      check('patch inserts this plugin', ours !== undefined, ours ? `id: ${pkg.name}` : `no insert row with id ${pkg.name}`)
      const hidesOfficial = patches.some((row) => row?.id === 'ui-settings-models' && row?.disabled === true)
      check('patch disables ui-settings-models', hidesOfficial, '官方 Models 页会被本插件替换')
    }
  }
}

const localeDir = join(ROOT, 'locale')
if (!existsSync(localeDir)) {
  fail('locale/', 'directory missing')
} else {
  const localeFiles = (await readdir(localeDir)).filter((name) => name.endsWith('.json')).sort()
  check('locale/en.json', localeFiles.includes('en.json'), 'DSH readPluginMeta 以它作为语言基准')
  const metaKeys = new Map()
  for (const name of localeFiles) {
    const parsed = (await readJson(join(localeDir, name), `locale/${name}`)).value
    if (!parsed) continue
    const title = parsed.meta?.title
    check(`locale/${name} meta.title`, typeof title === 'string' && title.trim() !== '', typeof title === 'string' ? title : 'missing')
    metaKeys.set(name, Object.keys(parsed.meta ?? {}).sort().join(','))
  }
  const shapes = new Set(metaKeys.values())
  if (shapes.size > 1) warn('locale meta keys', `differ between files: ${[...metaKeys].map(([name, keys]) => `${name}{${keys}}`).join(' ')}`)
}

const iconSvg = join(ROOT, 'icon.svg')
if (!existsSync(iconSvg)) fail('icon.svg', 'missing')
else {
  const svg = await readFile(iconSvg, 'utf8')
  check('icon.svg parses', /<svg[\s>]/.test(svg), `${svg.length} B`)
}

section('templates ↔ icons')

/**
 * Load a browser-side data module (templates, icons) in Node. A plain import is
 * tried first; if the split pulls in something Node cannot resolve, the same
 * esbuild that builds client.js bundles it for data extraction instead.
 */
async function loadClientDataModule(candidates, exportName) {
  const path = candidates.map((candidate) => join(ROOT, candidate)).find((candidate) => existsSync(candidate))
  if (!path) return { path: null }

  try {
    const mod = await import(pathToFileURL(path).href)
    return { path, value: mod[exportName] ?? mod.default?.[exportName] }
  } catch (importError) {
    try {
      const { build } = await import('esbuild')
      const result = await build({
        absWorkingDir: ROOT,
        entryPoints: [path],
        bundle: true,
        write: false,
        platform: 'node',
        format: 'cjs',
        logLevel: 'silent',
      })
      const sandbox = { exports: {} }
      // Evaluate our own freshly bundled data module (not user input).
      new Function('module', 'exports', 'require', result.outputFiles[0].text)(sandbox, sandbox.exports, requireFromRoot)
      return { path, value: sandbox.exports[exportName] }
    } catch (bundleError) {
      return { path, error: `${importError.message} / esbuild fallback: ${bundleError.message}` }
    }
  }
}

const templatesModule = await loadClientDataModule(['src/client/templates/index.js', 'src/client/templates.js'], 'PROVIDER_TEMPLATES')
const iconsModule = await loadClientDataModule(['src/client/icons.js'], 'PROVIDER_ICONS')

const TEMPLATE_COUNT = Array.isArray(templatesModule.value) ? templatesModule.value.length : 0
check('PROVIDER_TEMPLATES readable', Array.isArray(templatesModule.value) && TEMPLATE_COUNT > 0,
  templatesModule.error ?? `${TEMPLATE_COUNT} templates from ${templatesModule.path ? rel(templatesModule.path) : 'missing'}`)

const iconMap = iconsModule.value && typeof iconsModule.value === 'object' ? iconsModule.value : null
const iconKeys = iconMap ? Object.keys(iconMap) : []
check('PROVIDER_ICONS readable', iconMap !== null && iconKeys.length > 0,
  iconsModule.error ?? `${iconKeys.length} icons from ${iconsModule.path ? rel(iconsModule.path) : 'missing'}`)

if (Array.isArray(templatesModule.value) && iconKeys.length > 0) {
  const iconSet = new Set(iconKeys)
  const missing = templatesModule.value.filter((template) => template?.icon && !iconSet.has(template.icon))
  check('every template icon exists', missing.length === 0,
    missing.length === 0 ? '0 orphans' : missing.slice(0, 5).map((template) => `${template.id || template.label} → ${template.icon}`).join(', ') + (missing.length > 5 ? ` … +${missing.length - 5}` : ''))

  const referenced = new Set(templatesModule.value.map((template) => template?.icon).filter(Boolean))
  const orphanIcons = iconKeys.filter((key) => !referenced.has(key))
  if (orphanIcons.length > 0) {
    warn('unreferenced icons', `${orphanIcons.slice(0, 8).join(', ')}${orphanIcons.length > 8 ? ` … +${orphanIcons.length - 8}` : ''}`)
  } else {
    ok('no unreferenced icons', `${iconKeys.length} icons, all used`)
  }

  const nonDataUris = iconKeys.filter((key) => typeof iconMap[key] !== 'string' || !iconMap[key].startsWith('data:image/'))
  check('icons are data URLs', nonDataUris.length === 0, nonDataUris.slice(0, 5).join(', ') || `${iconKeys.length} data URLs`)
  const pngIcons = iconKeys.filter((key) => typeof iconMap[key] === 'string' && iconMap[key].startsWith('data:image/png'))
  check('logos are WebP/SVG (no PNG)', pngIcons.length === 0,
    pngIcons.length === 0 ? 'v1.2 keeps rasters as 48px WebP' : `${pngIcons.length} PNG data URL(s): ${pngIcons.slice(0, 5).join(', ')} — run scripts/gen-icons.mjs on WebP sources`)
}

section('client artifact')

const clientPath = join(ROOT, 'client.js')
if (!existsSync(clientPath)) {
  fail('client.js', 'missing — run `npm run build:client`')
} else {
  const clientText = await readFile(clientPath, 'utf8')
  const clientBytes = Buffer.byteLength(clientText)
  check('client.js wrapper header', clientText.startsWith('/** Generated by scripts/build-client.mjs — do not edit by hand. */'), 'generated banner')
  check('client.js loader id', clientText.includes(`id: ${JSON.stringify(pkg.name)}`), pkg.name)
  check('client.js LF newlines', !clientText.includes('\r\n'), 'no CRLF (byte-for-byte rebuild)')

  if (NO_BUILD) {
    warn('client.js rebuild compare', 'skipped by --no-build')
  } else if (!esbuildVersion) {
    fail('client.js rebuild compare', 'esbuild not installed — run `npm ci` first')
  } else {
    let renderClient
    try {
      ;({ renderClient } = await import(pathToFileURL(join(ROOT, 'scripts/build-client.mjs')).href))
    } catch (error) {
      fail('build-client.mjs importable', error.message)
    }
    if (typeof renderClient === 'function') {
      let expected
      try {
        expected = (await renderClient({ pkg, logLevel: 'silent' })).wrapper
      } catch (error) {
        fail('client.js rebuild', `esbuild failed: ${error.message}`)
      }
      if (typeof expected === 'string') {
        if (clientText === expected) {
          ok('client.js matches src/client', `${kb(clientBytes)}, byte-for-byte`)
        } else {
          const actualLines = clientText.split('\n')
          const expectedLines = expected.split('\n')
          let line = 0
          while (line < actualLines.length && line < expectedLines.length && actualLines[line] === expectedLines[line]) line += 1
          fail('client.js matches src/client', `stale artifact at line ${line + 1} — run \`npm run build:client\` and commit client.js`)
        }
      }
    }
  }

  // Size budget keeps the WebP win from silently regressing.
  check('client.js size budget', clientBytes <= BUDGETS.clientBytes, `${kb(clientBytes)} / ${kb(BUDGETS.clientBytes)}`)
  if (clientBytes > BUDGETS.clientBytes * 0.9) warn('client.js size headroom', `${Math.round((clientBytes / BUDGETS.clientBytes) * 100)}% of budget used`)

  const iconsPath = join(ROOT, 'src/client/icons.js')
  if (existsSync(iconsPath)) {
    const iconsBytes = (await stat(iconsPath)).size
    check('icons.js size budget', iconsBytes <= BUDGETS.iconsBytes, `${kb(iconsBytes)} / ${kb(BUDGETS.iconsBytes)}`)
  }

  // Machine-specific paths or secrets must never end up in a shipped artifact.
  const leakPatterns = [/\/Users\/[A-Za-z0-9._-]+\//, /\/home\/[A-Za-z0-9._-]+\//, /file:\/\//]
  const leaked = leakPatterns.filter((pattern) => pattern.test(clientText))
  check('client.js has no build-machine paths', leaked.length === 0, leaked.length ? leaked.join(' ') : 'clean')
}

section('host syntax')

const hostFiles = ['index.js', 'contract.js'].map((name) => join(ROOT, name)).filter(existsSync)
const libDir = join(ROOT, 'lib')
if (existsSync(libDir)) {
  hostFiles.push(...(await walkFiles(libDir)).filter((file) => /\.(?:m?js|cjs)$/.test(file)))
}
if (hostFiles.length === 0) {
  fail('host entry files', 'index.js / contract.js not found')
} else {
  const syntaxErrors = []
  for (const file of hostFiles) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
    if (result.status !== 0) syntaxErrors.push(`${rel(file)}: ${(result.stderr || result.stdout).trim().split('\n')[0]}`)
  }
  check('node --check host files', syntaxErrors.length === 0, syntaxErrors.length ? syntaxErrors.join(' | ') : `${hostFiles.length} file(s)`)
}

if (existsSync(join(ROOT, 'test'))) {
  const testFiles = (await walkFiles(join(ROOT, 'test'))).filter((file) => /\.(?:m?js|cjs)$/.test(file))
  ok('test/ present', `${testFiles.length} test file(s) — run \`npm test\``)
} else {
  warn('test/ present', 'missing — `npm test` has nothing to run')
}

section('docs + notices')

if (existsSync(join(ROOT, 'THIRD_PARTY_NOTICES.md'))) {
  const notices = await readFile(join(ROOT, 'THIRD_PARTY_NOTICES.md'), 'utf8')
  const missingNotices = ['lobe-icons', 'Lucide', 'models.dev'].filter((name) => !notices.includes(name))
  check('third-party notices', missingNotices.length === 0, missingNotices.length ? `missing ${missingNotices.join(', ')}` : 'lobe-icons / Lucide / models.dev')
} else {
  fail('THIRD_PARTY_NOTICES.md', 'missing — upstream MIT/ISC assets must ship their notices')
}

if (existsSync(join(ROOT, 'README.md'))) {
  const readme = await readFile(join(ROOT, 'README.md'), 'utf8')
  const localImages = [...readme.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)]
    .map((match) => match[1])
    .filter((src) => !/^[a-z]+:/i.test(src) && !src.startsWith('#'))
  const missingImages = localImages.filter((src) => !existsSync(join(ROOT, decodeURIComponent(src))))
  check('README local images exist', missingImages.length === 0, missingImages.length ? missingImages.join(', ') : `${localImages.length} image(s)`)
} else {
  fail('README.md', 'missing')
}

if (!existsSync(join(ROOT, '.gitattributes'))) warn('.gitattributes', 'missing — client.js diffs and CRLF risk on Windows')
check('.github/workflows/check.yml', existsSync(join(ROOT, '.github/workflows/check.yml')), 'CI runs this gate')

finish()

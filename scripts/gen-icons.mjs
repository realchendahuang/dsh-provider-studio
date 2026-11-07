/**
 * Package the provider logos as DSH client assets instead of inline data URLs.
 *
 * README: v1.3.0 moves every logo out of `client.js` and into
 * `assets/icons/<key>.<content-hash>.<ext>`, served by the `/plugins` asset
 * route of `dsh-client-modules`. The boot combo stops carrying ~290 KB of
 * base64 (which compresses to ~160 KB because rasters barely gzip), and the
 * browser only fetches the marks a page actually shows, with immutable caching.
 * The generated `src/client/icons.js` maps a key to
 * `require.asset("plugins/<pkg>/assets/icons/<file>")`; a runtime without the
 * loader's asset support still gets a document-relative `/plugins/...` URL.
 *
 * Provenance of `icons/`:
 *   - lobe-icons (https://github.com/lobehub/lobe-icons, MIT) for most vendors;
 *     some are pinned to the vendor's brand colour, the rest were converted to
 *     the neutral grey `#5b6070` so one asset serves both themes;
 *   - the vendor's own site icon (scripts/fetch-favicons.py) where lobe-icons
 *     has no mark;
 *   - all marks identify the vendors their trademarks belong to. Nothing here
 *     is copied from another product's UI kit.
 *
 * Theme handling — a fixed grey is not theme-aware, so the generated module
 * also records two things the client needs:
 *   - `PROVIDER_ICON_MONO`: SVG marks painted in the neutral grey. They are
 *     rendered through a CSS mask, so the mark takes the theme's secondary text
 *     colour instead of a hard-coded grey that vanishes on the dark panel.
 *   - `PROVIDER_ICON_FRAMES`: raster marks measured with too much transparent
 *     padding (scripts/icon-frames.py). The client scales them up through CSS so
 *     every logo lands at the same optical size without re-encoding the asset.
 *   - `PROVIDER_ICON_TONES`: raster marks whose glyph is near-black ('onLight')
 *     or near-white ('onDark'). `icons/tones.json` holds the measurement made
 *     by `scripts/icon-tones.py`; the client paints a contrast plate behind
 *     those and leaves every other brand mark on the bare surface.
 *
 * Raster size: the favicon-derived marks were 64×64 PNG and dominated the
 * bundle. They are now 48×48 lossy WebP (quality 90, method 6, alpha kept) —
 * 48px covers the 22–30px display sizes at 2x retina, and WebP cuts the raster
 * payload by roughly 53%. The original PNGs live in git history. Keep new
 * rasters at 48px WebP; a .png dropped into icons/ still works but inflates the
 * asset payload (the generator warns when it sees one).
 *
 * Run: node scripts/gen-icons.mjs   (after changing icons/)
 */

import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const iconDir = join(root, 'icons')
const assetsDir = join(root, 'assets/icons')
const output = join(root, 'src/client/icons.js')
const packageName = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).name
const tonesPath = join(iconDir, 'tones.json')
const framesPath = join(iconDir, 'frames.json')

const MIME = { '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png' }

/** The neutral grey the icon set uses for monochrome vendor marks. */
const NEUTRAL = ['fill="#5b6070"', 'fill="currentColor"', 'fill="#5B6070"']

// 79 PNGs were converted to 48×48 WebP; `.png` stays accepted so a stray file
// still renders instead of silently vanishing, but it should be converted.
const pngSeen = []

let tones = {}
try {
  tones = JSON.parse(await readFile(tonesPath, 'utf8'))
} catch {
  console.warn(`warning: ${tonesPath} missing — run python3 scripts/icon-tones.py; raster plates will be skipped`)
}

let frames = {}
try {
  frames = JSON.parse(await readFile(framesPath, 'utf8'))
} catch {
  console.warn(`warning: ${framesPath} missing — run python3 scripts/icon-frames.py; small logos stay small`)
}

const files = (await readdir(iconDir)).sort()
const entries = []
const mono = []
await rm(assetsDir, { recursive: true, force: true })
await mkdir(assetsDir, { recursive: true })
for (const file of files) {
  const ext = extname(file)
  const mime = MIME[ext]
  if (!mime) continue
  if (ext === '.png') pngSeen.push(file)
  const name = file.slice(0, -ext.length)
  const bytes = await readFile(join(iconDir, file))
  if (ext === '.svg') {
    const source = bytes.toString('utf8')
    if (NEUTRAL.some((needle) => source.includes(needle))) mono.push(name)
  }
  // Content-addressed name: the asset route answers `immutable`, so a changed
  // logo must move to a changed URL instead of hiding behind a cached one.
  const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 12)
  const assetName = `${name}.${hash}${ext}`
  await writeFile(join(assetsDir, assetName), bytes)
  const reference = `plugins/${packageName}/assets/icons/${assetName}`
  entries.push(`  ${JSON.stringify(name)}: asset(${JSON.stringify(reference)}),`)
}

const toneRows = Object.keys(tones)
  .filter((name) => tones[name] === 'onLight' || tones[name] === 'onDark' || tones[name] === 'solid')
  .sort()
  .map((name) => `  ${JSON.stringify(name)}: '${tones[name]}',`)

const module = `/** Generated by scripts/gen-icons.mjs — do not edit by hand. */
/** Provider logos: lobe-icons (MIT) + official site icons; rasters are 48×48 WebP. */
/** Resolve a packaged icon through the loader's asset support; a runtime
 *  without it (older DSH) still gets a document-relative URL. */
const asset = (reference) => (typeof require !== 'undefined' && typeof require.asset === 'function'
  ? require.asset(reference)
  : \`/\${reference}\`)

export const PROVIDER_ICONS = {
${entries.join('\n')}
}

/** Marks painted in the neutral grey: render as a mask so they follow the theme. */
export const PROVIDER_ICON_MONO = new Set([
${mono.map((name) => `  ${JSON.stringify(name)},`).join('\n')}
])

/** Rasters that need a contrast plate or a separating ring (measured by scripts/icon-tones.py). */
export const PROVIDER_ICON_TONES = {
${toneRows.join('\n')}
}

/** Rasters that need an optical-size scale-up, measured from their transparent
 *  padding by scripts/icon-frames.py: the client applies it as a CSS transform so
 *  the asset itself stays small. */
export const PROVIDER_ICON_FRAMES = {
${Object.keys(frames).sort().map((name) => `  ${JSON.stringify(name)}: ${JSON.stringify(frames[name])},`).join('\n')}
}

export const PROVIDER_ICON_RULES = [
  ['magpie', ['magpie']],
  ['deepseek', ['deepseek']],
  ['bigmodel', ['bigmodel', 'zhipu', 'open.bigmodel']],
  ['zai', ['z.ai', 'zai-', '/zai']],
  ['kimi', ['moonshot', 'kimi']],
  ['minimax', ['minimax']],
  ['bailian', ['dashscope', 'bailian', 'qwen']],
  ['openrouter', ['openrouter']],
  ['volcengine', ['volcengine', 'ark.cn']],
  ['stepfun', ['stepfun']],
  ['xiaomi', ['xiaomi', 'mimo']],
  ['tencent', ['tencent', 'tokenhub']],
  ['siliconflow', ['siliconflow']],
  ['ollama', ['ollama']],
  ['commandcode', ['commandcode', 'command code', 'cmd-goat']],
  ['opencode', ['opencode']],
  ['openai', ['api.openai.com', 'openai']],
  ['anthropic', ['anthropic', 'claude']],
  ['xai', ['x.ai', 'xai', 'grok']],
]

/** Match a saved provider row to a logo by route, display name or endpoint. */
export function iconForProvider(item) {
  if (item === null || item === undefined) return null
  const haystack = \`\${item.route || ''} \${item.displayName || ''} \${item.baseURL || ''}\`.toLowerCase()
  if (haystack.trim() === '') return null
  for (const [key, needles] of PROVIDER_ICON_RULES) {
    if (needles.some((needle) => haystack.includes(needle))) return key
  }
  return null
}
`

await writeFile(output, module, 'utf8')
console.log(
  `src/client/icons.js written (${module.length} bytes, ${entries.length} icons, ` +
    `${mono.length} mono, ${toneRows.length} plates); assets/icons/ holds ${entries.length} content-addressed files`
)
if (pngSeen.length > 0) {
  console.warn(
    `warning: ${pngSeen.length} PNG icon(s) packaged — convert to 48×48 WebP first ` +
      `(quality 90, method 6, keep alpha), e.g. with Pillow:\n` +
      pngSeen.map((file) => `  - icons/${file}`).join('\n')
  )
}

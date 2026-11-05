/**
 * dsh-provider-studio — Host settings I/O.
 *
 * README: the only module that talks to the DSH `settings` service. Two read
 * sources exist and both matter:
 *
 *  - `settings.describe()` projects the resolved config through the plugin
 *    schema (fast, in-memory, drops undeclared keys, carries `revision`);
 *  - the patch document on disk keeps hand-written fields exact, which is what
 *    a save has to write back.
 *
 * Reads prefer the document and fall back to the schema projection. Writes go
 * through ONE helper (`writeProviders`) that hands the settings guard
 * null-prototype copies and forwards the `revision` from `describe()` so the
 * runtime can refuse a stale write — mapped to SETTINGS_CONFLICT, never a raw
 * English runtime exception (contract §3.4).
 */

import { readFile } from 'node:fs/promises'
import { parse as parseYaml } from 'yaml'

import { ValidationError } from './errors.js'
import { DEEPSEEK_NS, LLM_NS } from './vocabulary.js'
import { errorMessage, hasOwn, makeHostPlain, text, warn } from './util.js'

/** `!!js` tags appear in hand-written patches; parse them as their value. */
const JS_TAG = [{ tag: 'tag:yaml.org,2002:js', resolve: (value) => value }]

/** Settings namespaces may be namespaced (`profile:llm-pi-ai`, `a/llm-pi-ai`). */
export function matchNamespace(ns, target) {
  const value = text(ns)
  return value === target || value.endsWith(`:${target}`) || value.endsWith(`/${target}`)
}

/** Read one settings section, preferring the patch layer. */
export function readSection(settings, ns) {
  if (settings === undefined || settings === null) return {}
  try {
    if (typeof settings.get === 'function') {
      const direct = settings.get(ns)
      if (direct !== null && typeof direct === 'object') return direct
    }
  } catch {
    /* fall through to describe() */
  }
  try {
    if (typeof settings.describe === 'function') {
      const rows = settings.describe({ redactSecrets: false })
      if (Array.isArray(rows)) {
        const row = rows.find((entry) => entry && matchNamespace(entry.ns ?? entry.id, ns))
        if (row) {
          for (const candidate of [row.user, row.value]) {
            if (candidate !== null && typeof candidate === 'object') return candidate
          }
        }
      }
    }
  } catch {
    /* unreadable service: report emptiness to the caller */
  }
  return {}
}

/** Providers from the schema projection, as a null-prototype dictionary. */
export function readProviders(settings) {
  const section = readSection(settings, LLM_NS)
  const dict = section !== null && typeof section === 'object' ? section.providers : undefined
  const out = Object.create(null)
  if (dict !== null && typeof dict === 'object') {
    for (const [route, profile] of Object.entries(dict)) {
      if (profile !== null && typeof profile === 'object') out[route] = profile
    }
  }
  return out
}

/** Read one entry's config straight from the profile patch document.
 *
 * `settings.describe()` projects config through the plugin schema, which drops
 * every key that schema does not declare — per-model `reasoningEfforts` tiers,
 * `compat` flags, custom request headers. Reading the document keeps the user's
 * hand-written fields exact, which is what a save has to write back.
 */
export async function readConfigFromDocument(ctx, settings, entryId) {
  if (settings === undefined || settings === null) return undefined
  if (typeof settings.prepareDocument !== 'function') return undefined
  let path
  try {
    path = await settings.prepareDocument()
  } catch (error) {
    warn(ctx, `prepareDocument failed: ${errorMessage(error)}`)
    return undefined
  }
  if (typeof path !== 'string' || path === '') return undefined
  let raw
  try {
    raw = await readFile(path, 'utf8')
  } catch (error) {
    warn(ctx, `reading ${path} failed: ${errorMessage(error)}`)
    return undefined
  }
  let document
  try {
    document = parseYaml(raw, { customTags: JS_TAG })
  } catch (error) {
    warn(ctx, `parsing ${path} failed: ${errorMessage(error)}`)
    return undefined
  }
  if (!Array.isArray(document)) return undefined
  const row = document.find((entry) => entry !== null && typeof entry === 'object' && entry.id === entryId)
  if (row === undefined) return undefined
  const config = row.config
  return config !== null && typeof config === 'object' ? config : undefined
}

/** Providers from the document when available, else the schema projection. */
export async function readProvidersExact(ctx, settings) {
  const config = await readConfigFromDocument(ctx, settings, LLM_NS)
  const fromDocument = config === undefined ? undefined : config.providers
  if (fromDocument !== null && fromDocument !== undefined && typeof fromDocument === 'object') {
    const out = Object.create(null)
    for (const [route, profile] of Object.entries(fromDocument)) {
      if (profile !== null && typeof profile === 'object') out[route] = profile
    }
    return out
  }
  return readProviders(settings)
}

/** The built-in DeepSeek config block, or an empty object. */
export async function readDeepseekConfig(ctx, settings) {
  const config = await readConfigFromDocument(ctx, settings, DEEPSEEK_NS)
  return config !== null && typeof config === 'object' ? config : {}
}

/**
 * The revision `settings.describe()` reports for a namespace.
 *
 * `write`/`replace`/`update` accept it as their last argument and throw
 * SETTINGS_CONFLICT when the document moved on; `undefined` means "this runtime
 * does not expose revisions, write unconditionally".
 */
export function readRevision(settings, ns) {
  if (settings === undefined || settings === null || typeof settings.describe !== 'function') return undefined
  try {
    const rows = settings.describe({ redactSecrets: false })
    if (!Array.isArray(rows)) return undefined
    const row = rows.find((entry) => entry && matchNamespace(entry.ns ?? entry.id, ns))
    return row !== undefined && typeof row.revision === 'number' ? row.revision : undefined
  } catch {
    return undefined
  }
}

/** Map a runtime write failure onto our code table. */
export function translateWriteError(error) {
  if (error instanceof ValidationError) return error
  if (error !== null && error !== undefined && error.code === 'SETTINGS_CONFLICT') {
    const params = {}
    if (typeof error.expected === 'number') params.expected = error.expected
    if (typeof error.actual === 'number') params.actual = error.actual
    return new ValidationError('SETTINGS_CONFLICT', '配置已被其他窗口修改，请刷新后重试', {
      params: Object.keys(params).length > 0 ? params : undefined,
      detail: errorMessage(error),
      cause: error,
    })
  }
  return new ValidationError('SETTINGS_UNAVAILABLE', '写入 DSH 设置失败', {
    detail: errorMessage(error),
    cause: error,
  })
}

/** Write one settings section through replace/update, forwarding `revision`. */
async function writeSection(settings, ns, section, revision) {
  if (settings === undefined || settings === null) {
    throw new ValidationError('SETTINGS_UNAVAILABLE', 'settings 服务不可用')
  }
  const hasReplace = typeof settings.replace === 'function'
  const hasUpdate = typeof settings.update === 'function'
  if (!hasReplace && !hasUpdate) {
    throw new ValidationError('SETTINGS_READ_ONLY', '设置服务只读（既无 replace 也无 update）')
  }
  try {
    if (hasReplace) await settings.replace(ns, section, revision)
    else await settings.update(ns, section, revision)
  } catch (error) {
    throw translateWriteError(error)
  }
}

/**
 * The single write path for `llm-pi-ai.providers`.
 *
 * `providers` is a route→profile dictionary; it is copied into a null-prototype
 * section (the settings guard rejects sandbox-realm literals) and written with
 * the caller's revision.
 */
export async function writeProviders(settings, providers, revision) {
  const section = Object.create(null)
  const dict = Object.create(null)
  for (const [route, profile] of Object.entries(providers)) dict[route] = makeHostPlain(profile)
  section.providers = dict
  await writeSection(settings, LLM_NS, section, revision)
}

/** The single write path for the built-in DeepSeek config. */
export async function writeDeepseekConfig(settings, config, revision) {
  const section = Object.create(null)
  for (const [key, value] of Object.entries(config)) section[key] = makeHostPlain(value)
  await writeSection(settings, DEEPSEEK_NS, section, revision)
}

/** Report whether the requested provider shape is what the document now holds. */
export async function verifyPersisted(ctx, settings, route, expected) {
  const config = await readConfigFromDocument(ctx, settings, LLM_NS)
  const providers = config !== undefined && config.providers !== null && typeof config.providers === 'object'
    ? config.providers
    : {}
  const actual = hasOwn(providers, route) ? providers[route] : undefined
  if (actual === null || actual === undefined) {
    return { persisted: false, persistedDetail: 'provider missing from the document' }
  }
  const sameDisplay = text(actual.displayName) === text(expected.displayName)
  const sameModels = Array.isArray(actual.models) && Array.isArray(expected.models)
    && actual.models.length === expected.models.length
  return {
    persisted: sameDisplay && sameModels,
    persistedDetail: `displayName=${text(actual.displayName)} models=${Array.isArray(actual.models) ? actual.models.length : 0}`,
  }
}

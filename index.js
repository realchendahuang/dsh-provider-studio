/**
 * dsh-provider-studio — Host half.
 *
 * Static bundle: exports `name`, `inject`, `apply`. Registers one Typert Remote
 * service (`providerPanel`) that the Client settings section calls through the
 * API Gateway. The service reads and writes the `llm-pi-ai` settings section and
 * the DSH credentials store; it never keeps state of its own.
 *
 * Design notes (learned the hard way from the settings service shapes):
 *  - reads prefer the PATCH layer (`user`) of `settings.describe()` over the
 *    resolved layer (`value`), so schemastery defaults are never restated into
 *    the user's document;
 *  - writes go through ONE helper (`writeProviders`) and pass null-prototype
 *    copies, because the 0.2 settings guard rejects cross-realm plain objects
 *    and non-volatile keys;
 *  - secrets are never stored by this plugin: the authoritative copy stays in
 *    the credentials service under the provider's `apiKeyEnv` ref.
 */

import { readFile } from 'node:fs/promises'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { parse as parseYaml } from 'yaml'

import { PACKAGE, SERVICE_KEY, TYPERT_MANIFEST } from './contract.js'

const LLM_NS = 'llm-pi-ai'

/** The built-in DeepSeek adapter is a separate entry, not a pi-ai provider. */
const DEEPSEEK_NS = 'llm-deepseek'
const DEEPSEEK_API = 'deepseek-official'
const DEEPSEEK_DEFAULT_BASE = 'https://api.deepseek.com'
const DEEPSEEK_DEFAULT_REF = 'DEEPSEEK_API_KEY'

/** Protocols the llm-pi-ai adapter understands. */
const PROTOCOLS = ['openai-completions', 'openai-responses', 'anthropic-messages']

// ---------------------------------------------------------------------------
// vocabulary shared with the pi-ai schema
// ---------------------------------------------------------------------------

/** Thinking levels the adapter accepts, in escalation order. */
const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
const TRANSPORTS = ['auto', 'sse', 'websocket', 'websocket-cached']
const CACHE_RETENTIONS = ['none', 'short', 'long']
const MODALITIES = ['text', 'image']
const THINKING_BUDGETS = ['minimal', 'low', 'medium', 'high']

/** Enum-valued compat switches and the spellings each accepts. */
const COMPAT_ENUM = {
  maxTokensField: ['max_completion_tokens', 'max_tokens'],
  thinkingFormat: [
    'openai', 'deepseek', 'openrouter', 'together', 'baseten', 'zai', 'qwen',
    'chat-template', 'qwen-chat-template', 'string-thinking', 'ant-ling',
  ],
  thinkingTokenBudgetField: ['thinking_token_budget', 'thinking_budget', 'thinking_budget_tokens'],
  cacheControlFormat: ['anthropic'],
}
const COMPAT_NUMBER = ['vllmPriority']
const COMPAT_JSON = ['chatTemplateKwargs', 'chatTemplateArgs']

/** The switches each wire protocol offers (pi-ai's own gate). */
const COMPAT_BY_PROTOCOL = {
  'openai-completions': [
    'supportsStore', 'supportsDeveloperRole', 'supportsReasoningEffort',
    'supportsUsageInStreaming', 'supportsFinishReason', 'maxTokensField',
    'requiresToolResultName', 'requiresAssistantAfterToolResult', 'requiresThinkingAsText',
    'requiresReasoningContentOnAssistantMessages', 'thinkingFormat', 'chatTemplateKwargs',
    'chatTemplateArgs', 'supportsThinkingTokenBudget', 'thinkingTokenBudgetField',
    'vllmPriority', 'supportsStrictMode', 'cacheControlFormat', 'supportsLongCacheRetention',
  ],
  'openai-responses': [
    'supportsDeveloperRole', 'supportsMaxOutputTokens', 'supportsStrictMode',
    'supportsLongCacheRetention',
  ],
  'anthropic-messages': [
    'supportsEagerToolInputStreaming', 'supportsLongCacheRetention', 'supportsCacheControlOnTools',
    'supportsTemperature', 'forceAdaptiveThinking', 'allowEmptySignature', 'supportsStrictTools',
  ],
}

/** llm-deepseek's own route knobs: a different vocabulary from pi-ai, so the
 *  panel keeps a separate patch shape for the built-in route. */
const DEEPSEEK_THINKING = ['enabled', 'disabled']
const DEEPSEEK_EFFORTS = ['off', 'low', 'high', 'max']

function applyDeepseekAdvanced(next, patch) {
  if (patch === null || patch === undefined || typeof patch !== 'object') return next
  const setEnum = (key, allowed, label) => {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) return
    const value = patch[key]
    if (value === null || value === undefined) {
      delete next[key]
      return
    }
    const spelling = text(value)
    if (!allowed.includes(spelling)) throw new Error(`${label} 只能是 ${allowed.join(' / ')}`)
    next[key] = spelling
  }
  setEnum('thinking', DEEPSEEK_THINKING, '思考模式')
  setEnum('reasoningEffort', DEEPSEEK_EFFORTS, '推理等级')
  for (const key of ['maxTokens', 'defaultContextWindow', 'streamIdleTimeoutMs']) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue
    const value = patch[key]
    if (value === null || value === undefined) {
      delete next[key]
      continue
    }
    next[key] = wholeNumber(value, key)
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'retryPolicy')) {
    const value = patch.retryPolicy
    if (value === null || value === undefined) {
      delete next.retryPolicy
    } else {
      const mode = text(value && value.mode)
      if (mode !== 'normal' && mode !== 'always') throw new Error('重试策略需要 mode: normal 或 always')
      const existing = next.retryPolicy !== null && typeof next.retryPolicy === 'object' ? next.retryPolicy : {}
      const policy = { ...existing, mode }
      if (mode === 'normal') {
        if (value.maxRetries !== null && value.maxRetries !== undefined) {
          policy.maxRetries = wholeNumber(value.maxRetries, '最大重试次数', { allowZero: true })
        }
      } else {
        delete policy.maxRetries
        delete policy.retryableCodes
      }
      next.retryPolicy = policy
    }
  }
  return next
}

/** Route-level fields the advanced editor owns; every other key in a stored
 *  profile is left exactly as the user wrote it. */
const ADVANCED_KEYS = [
  'headers', 'compat', 'reasoning', 'defaultContextWindow', 'defaultMaxTokens', 'defaultInput',
  'transport', 'cacheRetention', 'timeoutMs', 'websocketConnectTimeoutMs', 'streamIdleTimeoutMs',
  'maxRequestImageBytes', 'requestImagePixelBudget', 'requestImageMaxBytes',
  'maxRequestImages', 'imageOffloadCountQuantum', 'retryPolicy', 'thinkingBudgets',
]

// ---------------------------------------------------------------------------
// plugin entry
// ---------------------------------------------------------------------------

export const name = PACKAGE

/** The RPC registry is the only hard dependency; settings is resolved lazily so
 *  the panel still loads (and reports the problem) in a profile without it. */
export const inject = ['typert']

export function apply(ctx) {
  new ProviderPanelRuntime(ctx)
  ctx.effect(() => ctx.typert.register(TYPERT_MANIFEST), 'dsh-provider-studio: typert manifest')
}

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

const text = (value) => (typeof value === 'string' ? value : '')

/** Deep copy into null-prototype objects (the settings guard's isPlainObject
 *  check rejects sandbox-realm literals). */
function makeHostPlain(value) {
  if (Array.isArray(value)) return value.map((item) => makeHostPlain(item))
  if (value !== null && typeof value === 'object') {
    const out = Object.create(null)
    for (const key of Object.keys(value)) out[key] = makeHostPlain(value[key])
    return out
  }
  return value
}

// ---------------------------------------------------------------------------
// pi-ai field sanitizers (the panel must never write a profile pi-ai refuses)
// ---------------------------------------------------------------------------

function wholeNumber(value, label, { allowZero = false } = {}) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new Error(`${label} 需要整数`)
  }
  if (parsed < (allowZero ? 0 : 1)) throw new Error(`${label} 需要正数`)
  return parsed
}

/** `false`, an ordered level→wire map, or undefined for "inherit the catalog". */
function sanitizeReasoningEfforts(value) {
  if (value === false) return false
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('reasoningEfforts 必须是对象或 false')
  }
  const out = {}
  for (const [level, wire] of Object.entries(value)) {
    if (!THINKING_LEVELS.includes(level)) throw new Error(`未知的思考等级：${level}`)
    const spelling = text(wire).trim()
    if (spelling === '') {
      if (level !== 'off') throw new Error(`思考等级 ${level} 需要发送值`)
      out[level] = null
      continue
    }
    out[level] = spelling
  }
  if (Object.keys(out).length === 0) throw new Error('reasoningEfforts 不能为空')
  if (!Object.keys(out).some((level) => level !== 'off')) {
    throw new Error('reasoningEfforts 至少要有一个 off 以外的等级')
  }
  return out
}

/** One protocol's compat switches; `filter` drops what the protocol refuses
 *  instead of throwing, which is what a protocol change needs. */
function sanitizeCompat(value, api, { filter = false } = {}) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('compat 必须是对象')
  const offered = new Set(COMPAT_BY_PROTOCOL[api] || [])
  const out = {}
  for (const [field, raw] of Object.entries(value)) {
    if (!offered.has(field)) {
      if (filter) continue
      throw new Error(`协议 ${api || '（未设置）'} 不支持兼容开关：${field}`)
    }
    if (Array.isArray(COMPAT_ENUM[field])) {
      const spelling = text(raw)
      if (!COMPAT_ENUM[field].includes(spelling)) throw new Error(`兼容开关 ${field} 的取值无效：${spelling}`)
      out[field] = spelling
    } else if (COMPAT_NUMBER.includes(field)) {
      out[field] = wholeNumber(raw, `兼容开关 ${field}`, { allowZero: true })
    } else if (COMPAT_JSON.includes(field)) {
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`兼容开关 ${field} 需要一个对象`)
      }
      out[field] = raw
    } else {
      if (typeof raw !== 'boolean') throw new Error(`兼容开关 ${field} 需要布尔值`)
      out[field] = raw
    }
  }
  return Object.keys(out).length === 0 ? undefined : out
}

/** Merge the advanced editor's patch into a profile in place. `null` removes a
 *  field; keys the patch does not mention keep whatever the document held. */
function applyAdvanced(next, patch) {
  if (patch === null || patch === undefined || typeof patch !== 'object') return next
  const api = text(next.api)
  for (const key of ADVANCED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue
    const value = patch[key]
    if (value === null || value === undefined) {
      delete next[key]
      continue
    }
    if (key === 'headers') {
      if (typeof value !== 'object' || Array.isArray(value)) throw new Error('请求头必须是对象')
      const headers = {}
      for (const [name, raw] of Object.entries(value)) {
        const header = text(name).trim()
        if (header === '') continue
        headers[header] = text(raw)
      }
      if (Object.keys(headers).length === 0) delete next.headers
      else next.headers = headers
      continue
    }
    if (key === 'compat') {
      const compat = sanitizeCompat(value, api, { filter: true })
      if (compat === undefined) delete next.compat
      else next.compat = compat
      continue
    }
    if (key === 'reasoning') {
      const level = text(value)
      if (!THINKING_LEVELS.includes(level)) throw new Error(`未知的思考等级：${level}`)
      next.reasoning = level
      continue
    }
    if (key === 'defaultInput') {
      if (!Array.isArray(value)) throw new Error('缺省输入模态必须是数组')
      const modalities = value.map((item) => text(item)).filter((item) => MODALITIES.includes(item))
      if (modalities.length === 0) delete next.defaultInput
      else next.defaultInput = modalities
      continue
    }
    if (key === 'transport') {
      const transport = text(value)
      if (!TRANSPORTS.includes(transport)) throw new Error(`不支持的传输方式：${transport}`)
      next.transport = transport
      continue
    }
    if (key === 'cacheRetention') {
      const retention = text(value)
      if (!CACHE_RETENTIONS.includes(retention)) throw new Error(`不支持的缓存保留策略：${retention}`)
      next.cacheRetention = retention
      continue
    }
    if (key === 'retryPolicy') {
      const mode = text(value && value.mode)
      if (mode !== 'normal' && mode !== 'always') throw new Error('重试策略需要 mode: normal 或 always')
      const existing = next.retryPolicy !== null && typeof next.retryPolicy === 'object'
        ? next.retryPolicy
        : {}
      const policy = { ...existing, mode }
      if (mode === 'normal') {
        if (value.maxRetries !== null && value.maxRetries !== undefined) {
          policy.maxRetries = wholeNumber(value.maxRetries, '最大重试次数', { allowZero: true })
        }
      } else {
        delete policy.maxRetries
        delete policy.retryableCodes
      }
      next.retryPolicy = policy
      continue
    }
    if (key === 'thinkingBudgets') {
      if (typeof value !== 'object' || Array.isArray(value)) throw new Error('思考预算必须是对象')
      const budgets = {}
      for (const level of THINKING_BUDGETS) {
        if (value[level] === null || value[level] === undefined) continue
        budgets[level] = wholeNumber(value[level], `思考预算 ${level}`)
      }
      if (Object.keys(budgets).length === 0) delete next.thinkingBudgets
      else next.thinkingBudgets = budgets
      continue
    }
    next[key] = wholeNumber(value, key)
  }
  // A protocol change must not leave switches the new protocol refuses behind.
  if (next.compat !== undefined) {
    const compat = sanitizeCompat(next.compat, api, { filter: true })
    if (compat === undefined) delete next.compat
    else next.compat = compat
  }
  return next
}

function matchNamespace(ns, target) {
  const value = text(ns)
  return value === target || value.endsWith(`:${target}`) || value.endsWith(`/${target}`)
}

/** Read one settings section, preferring the patch layer. */
function readSection(settings, ns) {
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

function readProviders(settings) {
  const section = readSection(settings, LLM_NS)
  const dict = section !== null && typeof section === 'object' ? section.providers : undefined
  const out = {}
  if (dict !== null && typeof dict === 'object') {
    for (const [route, profile] of Object.entries(dict)) {
      if (profile !== null && typeof profile === 'object') out[route] = profile
    }
  }
  return out
}

/** The single write path for `llm-pi-ai.providers`. */
const JS_TAG = [{ tag: 'tag:yaml.org,2002:js', resolve: (value) => value }]

/** Read one entry's config straight from the profile patch document.
 *
 * `settings.describe()` projects config through the plugin schema, which drops
 * every key that schema does not declare — per-model `reasoningEfforts` tiers,
 * `compat` flags, custom request headers. Reading the document keeps the user's
 * hand-written fields exact, which is what a save has to write back.
 */
async function readConfigFromDocument(ctx, settings, entryId) {
  if (settings === undefined || settings === null) return undefined
  if (typeof settings.prepareDocument !== 'function') return undefined
  let path
  try {
    path = await settings.prepareDocument()
  } catch (error) {
    warn(ctx, `prepareDocument failed: ${String(error && error.message ? error.message : error)}`)
    return undefined
  }
  if (typeof path !== 'string' || path === '') return undefined
  let text
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    warn(ctx, `reading ${path} failed: ${String(error && error.message ? error.message : error)}`)
    return undefined
  }
  let document
  try {
    document = parseYaml(text, { customTags: JS_TAG })
  } catch (error) {
    warn(ctx, `parsing ${path} failed: ${String(error && error.message ? error.message : error)}`)
    return undefined
  }
  if (!Array.isArray(document)) return undefined
  const row = document.find((entry) => entry !== null && typeof entry === 'object' && entry.id === entryId)
  if (row === undefined) return undefined
  const config = row.config
  return config !== null && typeof config === 'object' ? config : undefined
}

/** Providers from the document when available, else the schema projection. */
async function readProvidersExact(ctx, settings) {
  const config = await readConfigFromDocument(ctx, settings, LLM_NS)
  const fromDocument = config === undefined ? undefined : config.providers
  if (fromDocument !== null && fromDocument !== undefined && typeof fromDocument === 'object') {
    const out = {}
    for (const [route, profile] of Object.entries(fromDocument)) {
      if (profile !== null && typeof profile === 'object') out[route] = profile
    }
    return out
  }
  return readProviders(settings)
}

async function writeProviders(settings, providers) {
  if (settings === undefined || settings === null) throw new Error('settings 服务不可用')
  const section = Object.create(null)
  const dict = Object.create(null)
  for (const [route, profile] of Object.entries(providers)) dict[route] = makeHostPlain(profile)
  section.providers = dict
  if (typeof settings.replace === 'function') {
    await settings.replace(LLM_NS, section)
    return
  }
  if (typeof settings.update === 'function') {
    await settings.update(LLM_NS, section)
    return
  }
  throw new Error('设置服务只读（既无 replace 也无 update）')
}

function credentialsOf(ctx) {
  try {
    return ctx.get('credentials')
  } catch {
    return undefined
  }
}

/** Reference grammar the credential service accepts. */
const REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

function deriveRef(route) {
  const slug = text(route)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `${slug || 'PROVIDER'}_API_KEY`
}

function warn(ctx, message) {
  try {
    const logger = typeof ctx.get === 'function' ? ctx.get('logger') : undefined
    if (logger !== undefined && logger !== null && typeof logger.warn === 'function') {
      logger.warn(`[dsh-provider-studio] ${message}`)
    }
  } catch {
    /* logging must never fail a handler */
  }
}

async function describeSecret(ctx, ref) {
  if (!ref) return { configured: false, source: undefined, writable: false, hint: 'provider has no apiKeyEnv' }
  const credentials = credentialsOf(ctx)
  if (credentials === undefined || credentials === null) {
    return { configured: false, writable: false, hint: 'credentials service unavailable' }
  }
  if (typeof credentials.describe !== 'function') {
    return { configured: false, writable: false, hint: 'credentials.describe unavailable' }
  }
  let result
  try {
    result = await credentials.describe(ref)
  } catch (error) {
    warn(ctx, `credentials.describe(${ref}) failed: ${String(error && error.message ? error.message : error)}`)
    return { configured: false, writable: false, hint: 'describe failed' }
  }
  let info = result
  if (info !== null && typeof info === 'object' && !('configured' in info) && info[ref] !== undefined) info = info[ref]
  if (info === null || typeof info !== 'object') {
    return { configured: false, writable: false, hint: 'unexpected describe shape' }
  }
  return { configured: info.configured === true, source: info.source, writable: info.writable !== false, hint: 'ok' }
}

async function resolveSecret(ctx, ref) {
  if (!ref) return null
  const credentials = credentialsOf(ctx)
  if (credentials === undefined || credentials === null) return null
  try {
    const resolved = await credentials.resolve(ref)
    if (resolved !== null && typeof resolved === 'object' && typeof resolved.value === 'string') {
      return resolved.value
    }
  } catch {
    /* missing ref */
  }
  return null
}

/** Report whether the requested provider shape is what the document now holds. */
async function verifyPersisted(ctx, settings, route, expected) {
  const config = await readConfigFromDocument(ctx, settings, LLM_NS)
  const providers = config !== undefined && config.providers !== null && typeof config.providers === 'object'
    ? config.providers
    : {}
  const actual = providers[route]
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

async function writeSecret(ctx, ref, value) {
  const credentials = credentialsOf(ctx)
  if (credentials === undefined || credentials === null) throw new Error('凭据服务不可用')
  if (value === '') {
    if (typeof credentials.unset === 'function') {
      try {
        await credentials.unset(ref)
      } catch {
        /* absent ref is not an error */
      }
    }
    return
  }
  if (typeof credentials.set !== 'function') throw new Error('凭据服务不支持写入')
  await credentials.set(ref, value)
}

// ---------------------------------------------------------------------------
// model helpers
// ---------------------------------------------------------------------------

const NUMBER_FIELDS = ['contextWindow', 'maxTokens']

function normalizeModels(models) {
  if (!Array.isArray(models)) return []
  return models
    .filter((entry) => entry !== null && typeof entry === 'object')
    .map((entry) => {
      const model = { ...entry }
      if (!Array.isArray(model.input)) model.input = []
      return model
    })
}

/** Fields only a pi-ai model entry carries; the DeepSeek catalog has its own
 *  schema and must not grow these keys. */
function cleanPiModel(draft, api) {
  const model = cleanModel(draft)
  if (Object.prototype.hasOwnProperty.call(model, 'reasoningEfforts')) {
    const efforts = sanitizeReasoningEfforts(model.reasoningEfforts)
    if (efforts === undefined) delete model.reasoningEfforts
    else model.reasoningEfforts = efforts
  }
  if (Object.prototype.hasOwnProperty.call(model, 'compat')) {
    const compat = sanitizeCompat(model.compat, api, { filter: true })
    if (compat === undefined) delete model.compat
    else model.compat = compat
  }
  return model
}

/** Keep everything the editor does not own, coerce the fields it does. */
function cleanModel(draft) {
  const source = draft !== null && typeof draft === 'object' ? draft : {}
  const model = { ...source }
  const id = text(model.id).trim()
  if (!id) throw new Error('模型的 id 不能为空')
  model.id = id
  if (typeof model.name === 'string') {
    const name = model.name.trim()
    if (name) model.name = name
    else delete model.name
  }
  for (const field of NUMBER_FIELDS) {
    if (model[field] === undefined || model[field] === null || model[field] === '') {
      delete model[field]
      continue
    }
    const value = Number(model[field])
    if (!Number.isFinite(value) || value <= 0) delete model[field]
    else model[field] = value
  }
  if (Array.isArray(model.input)) {
    const allowed = model.input.filter((kind) => kind === 'text' || kind === 'image' || kind === 'video' || kind === 'audio')
    if (allowed.length > 0) model.input = allowed
    else delete model.input
  }
  return model
}

/** DeepSeek's entry keeps capability flags in `inputModalities`; the shared
 *  model editor speaks `input`. Translate at the boundary in both directions. */
function normalizeDeepseekModels(models) {
  if (!Array.isArray(models)) return []
  return models
    .filter((entry) => entry !== null && typeof entry === 'object')
    .map((entry) => {
      const model = { ...entry }
      const input = Array.isArray(model.input)
        ? model.input
        : Array.isArray(model.inputModalities)
          ? model.inputModalities
          : []
      return { ...model, input }
    })
}

function deepseekModelsFromUi(models) {
  return models.map((draft) => {
    const model = cleanModel(draft)
    const input = Array.isArray(model.input) ? model.input : []
    delete model.input
    if (input.length > 0) model.inputModalities = input
    else delete model.inputModalities
    return model
  })
}

async function readDeepseekConfig(ctx, settings) {
  const config = await readConfigFromDocument(ctx, settings, DEEPSEEK_NS)
  return config !== null && typeof config === 'object' ? config : {}
}

async function writeDeepseekConfig(settings, config) {
  if (settings === undefined || settings === null) throw new Error('settings 服务不可用')
  const section = Object.create(null)
  for (const [key, value] of Object.entries(config)) section[key] = makeHostPlain(value)
  if (typeof settings.replace === 'function') {
    await settings.replace(DEEPSEEK_NS, section)
    return
  }
  if (typeof settings.update === 'function') {
    await settings.update(DEEPSEEK_NS, section)
    return
  }
  throw new Error('设置服务只读（既无 replace 也无 update）')
}

function deepseekView(config, info, secret) {
  const ref = text(config.apiKeyEnv) || DEEPSEEK_DEFAULT_REF
  return {
    route: DEEPSEEK_NS,
    source: 'deepseek',
    builtin: true,
    displayName: '',
    api: DEEPSEEK_API,
    baseURL: text(config.baseURL) || DEEPSEEK_DEFAULT_BASE,
    apiKeyEnv: ref,
    models: normalizeDeepseekModels(config.models),
    modelCount: normalizeDeepseekModels(config.models).length,
    usesCatalog: normalizeDeepseekModels(config.models).length === 0,
    keyConfigured: info.configured,
    keySource: info.source ?? null,
    keyHint: info.hint ?? null,
    hasBaseURL: true,
    headers: {},
    secret: secret === null ? null : { value: secret },
    advanced: {
      thinking: text(config.thinking),
      reasoningEffort: text(config.reasoningEffort),
      maxTokens: config.maxTokens,
      defaultContextWindow: config.defaultContextWindow,
      streamIdleTimeoutMs: config.streamIdleTimeoutMs,
      retryPolicy: config.retryPolicy !== null && typeof config.retryPolicy === 'object' ? config.retryPolicy : undefined,
    },
  }
}

// ---------------------------------------------------------------------------
// Remote service
// ---------------------------------------------------------------------------

class ProviderPanelRuntime extends TypertRemoteService {
  constructor(ctx) {
    super(ctx, SERVICE_KEY)
    this.ctx = ctx
  }

  settings() {
    try {
      return this.ctx.get('settings')
    } catch {
      return undefined
    }
  }

  async listProviders() {
    const settings = this.settings()
    const providers = await readProvidersExact(this.ctx, settings)
    let debug
    try {
      if (settings !== undefined && settings !== null && typeof settings.describe === 'function') {
        const rows = settings.describe({ redactSecrets: false }) || []
        debug = {
          arm: typeof settings.get === 'function' ? 'raw' : 'descriptor',
          hasReplace: typeof settings.replace === 'function',
          hasUpdate: typeof settings.update === 'function',
          rows: rows.map((row) => ({
            ns: row === null || row === undefined ? null : (row.ns ?? row.id ?? null),
            user: Object.keys((row && row.user && row.user.providers) || {}),
            value: Object.keys((row && row.value && row.value.providers) || {}),
          })),
        }
      } else {
        debug = { arm: typeof (settings && settings.get) === 'function' ? 'raw' : 'unknown', hasReplace: false, hasUpdate: false, rows: [] }
      }
    } catch (error) {
      debug = { error: String(error && error.message ? error.message : error) }
    }
    const items = []
    for (const [route, profile] of Object.entries(providers)) {
      const ref = text(profile.apiKeyEnv)
      const info = await describeSecret(this.ctx, ref)
      const models = normalizeModels(profile.models)
      items.push({
        route,
        source: 'pi-ai',
        builtin: false,
        displayName: text(profile.displayName) || route,
        api: text(profile.api),
        baseURL: text(profile.baseURL),
        apiKeyEnv: ref,
        modelCount: models.length,
        usesCatalog: models.length === 0,
        keyConfigured: info.configured,
        keySource: info.source ?? null,
        keyHint: info.hint ?? null,
        hasBaseURL: text(profile.baseURL) !== '',
      })
    }
    // The built-in DeepSeek adapter is just another provider row: same list,
    // same editor, no separate section.
    const deepseekConfig = await readDeepseekConfig(this.ctx, settings)
    const deepseekRef = text(deepseekConfig.apiKeyEnv) || DEEPSEEK_DEFAULT_REF
    const deepseekInfo = await describeSecret(this.ctx, deepseekRef)
    const deepseekItem = deepseekView(deepseekConfig, deepseekInfo, null)
    items.push({
      route: deepseekItem.route,
      source: 'deepseek',
      builtin: true,
      displayName: deepseekItem.displayName,
      api: deepseekItem.api,
      baseURL: deepseekItem.baseURL,
      apiKeyEnv: deepseekItem.apiKeyEnv,
      modelCount: deepseekItem.modelCount,
      usesCatalog: deepseekItem.usesCatalog,
      keyConfigured: deepseekItem.keyConfigured,
      keySource: deepseekItem.keySource,
      keyHint: deepseekItem.keyHint,
      hasBaseURL: true,
    })

    items.sort((a, b) => (a.displayName || a.route).localeCompare(b.displayName || b.route))
    const writable = settings !== undefined && settings !== null
      && (typeof settings.replace === 'function' || typeof settings.update === 'function')
    return { ok: true, providers: items, protocols: [...PROTOCOLS], writable, debug }
  }

  async getProvider(args) {
    const route = text(args && args.route)
    if (!route) return { ok: false, error: '缺少 route' }
    const settings = this.settings()
    if (route === DEEPSEEK_NS) {
      const config = await readDeepseekConfig(this.ctx, settings)
      const ref = text(config.apiKeyEnv) || DEEPSEEK_DEFAULT_REF
      const info = await describeSecret(this.ctx, ref)
      const secret = info.configured ? await resolveSecret(this.ctx, ref) : null
      return { ok: true, ...deepseekView(config, info, secret) }
    }
    const providers = await readProvidersExact(this.ctx, settings)
    const profile = providers[route]
    if (profile === undefined) return { ok: false, error: `供应商 "${route}" 不存在` }

    const ref = text(profile.apiKeyEnv)
    const info = await describeSecret(this.ctx, ref)
    const secret = info.configured ? await resolveSecret(this.ctx, ref) : null

    return {
      ok: true,
      route,
      source: 'pi-ai',
      builtin: false,
      displayName: text(profile.displayName),
      api: text(profile.api),
      baseURL: text(profile.baseURL),
      apiKeyEnv: ref,
      headers: profile.headers !== null && typeof profile.headers === 'object' ? profile.headers : {},
      models: normalizeModels(profile.models),
      keyConfigured: info.configured,
      keySource: info.source ?? null,
      keyHint: info.hint ?? null,
      secret: secret === null ? null : { value: secret },
      advanced: omitKnown(profile),
    }
  }

  async saveProvider(args) {
    const route = text(args && args.route)
    if (!route) return { ok: false, error: '缺少 route' }
    const settings = this.settings()
    if (route === DEEPSEEK_NS) return this.saveDeepseek(args, settings)
    const providers = await readProvidersExact(this.ctx, settings)
    const profile = providers[route]
    if (profile === undefined) return { ok: false, error: `供应商 "${route}" 不存在` }

    const patch = args && typeof args.patch === 'object' && args.patch !== null ? args.patch : {}
    const next = { ...profile }
    for (const field of ['displayName', 'api', 'baseURL', 'apiKeyEnv']) {
      if (!Object.prototype.hasOwnProperty.call(patch, field)) continue
      const value = text(patch[field]).trim()
      if (value) next[field] = value
      else delete next[field]
    }
    if (Array.isArray(patch.models)) {
      try {
        next.models = patch.models.map((draft) => cleanPiModel(draft, text(next.api)))
      } catch (err) {
        return { ok: false, error: String(err && err.message ? err.message : err) }
      }
    }
    try {
      applyAdvanced(next, patch.advanced)
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) }
    }

    const apiKey = typeof (args && args.apiKey) === 'string' ? args.apiKey : undefined
    const ref = text(next.apiKeyEnv) || deriveRef(route)
    if (apiKey !== undefined) {
      if (!REF_PATTERN.test(ref)) return { ok: false, error: `无效的凭据名：${ref}` }
      next.apiKeyEnv = ref
    }

    providers[route] = next
    try {
      await writeProviders(settings, providers)
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) }
    }

    if (apiKey !== undefined) {
      try {
        await writeSecret(this.ctx, ref, apiKey.trim())
      } catch (err) {
        return { ok: false, error: `配置已保存，但密钥写入失败：${String(err && err.message ? err.message : err)}` }
      }
    }

    const verification = await verifyPersisted(this.ctx, settings, route, next)
    return { ok: true, route, keyConfigured: apiKey === undefined ? undefined : apiKey.trim() !== '', ...verification }
  }

  /** Save the built-in DeepSeek entry through the same shape as any provider. */
  async saveDeepseek(args, settings) {
    const config = await readDeepseekConfig(this.ctx, settings)
    const patch = args && typeof args.patch === 'object' && args.patch !== null ? args.patch : {}
    const next = { ...config }
    for (const field of ['baseURL', 'apiKeyEnv']) {
      if (!Object.prototype.hasOwnProperty.call(patch, field)) continue
      const value = text(patch[field]).trim()
      if (value) next[field] = value
      else delete next[field]
    }
    if (Array.isArray(patch.models)) {
      try {
        const models = deepseekModelsFromUi(patch.models)
        if (models.length > 0) next.models = models
        else delete next.models
      } catch (err) {
        return { ok: false, error: String(err && err.message ? err.message : err) }
      }
    }

    try {
      applyDeepseekAdvanced(next, patch.advanced)
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) }
    }

    const apiKey = typeof (args && args.apiKey) === 'string' ? args.apiKey : undefined
    const ref = text(next.apiKeyEnv) || DEEPSEEK_DEFAULT_REF
    if (apiKey !== undefined) {
      if (!REF_PATTERN.test(ref)) return { ok: false, error: `无效的凭据名：${ref}` }
      next.apiKeyEnv = ref
    }

    try {
      await writeDeepseekConfig(settings, next)
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) }
    }

    if (apiKey !== undefined) {
      try {
        await writeSecret(this.ctx, ref, apiKey.trim())
      } catch (err) {
        return { ok: false, error: `配置已保存，但密钥写入失败：${String(err && err.message ? err.message : err)}` }
      }
    }

    const after = await readDeepseekConfig(this.ctx, settings)
    const afterModels = Array.isArray(after.models) ? after.models.length : 0
    const expectedModels = Array.isArray(next.models) ? next.models.length : 0
    const sameBase = text(after.baseURL) === text(next.baseURL)
    return {
      ok: true,
      route: DEEPSEEK_NS,
      persisted: sameBase && afterModels === expectedModels,
      persistedDetail: `baseURL=${text(after.baseURL) || '(默认)'} · models=${afterModels}`,
      keyConfigured: apiKey === undefined ? undefined : apiKey.trim() !== '',
    }
  }

  async createProvider(args) {
    const settings = this.settings()
    const route = text(args && args.route).trim()
    if (!route) return { ok: false, error: '缺少 route' }
    if (route === DEEPSEEK_NS) return { ok: false, error: 'DeepSeek 是内置供应商，不需要新建；直接编辑它即可' }
    if (!/^[A-Za-z0-9_.-]+$/.test(route)) return { ok: false, error: 'route 只能包含字母、数字、点、下划线和横线' }
    const providers = await readProvidersExact(this.ctx, settings)
    if (providers[route] !== undefined) return { ok: false, error: `供应商 "${route}" 已存在` }

    const api = text(args.api) || 'openai-completions'
    if (!PROTOCOLS.includes(api)) return { ok: false, error: `不支持的协议：${api}` }
    const baseURL = text(args.baseURL).trim()
    if (baseURL && !/^https?:\/\//i.test(baseURL)) return { ok: false, error: 'baseURL 必须以 http:// 或 https:// 开头' }

    // The credential reference is derived from the route; the panel never asks
    // the user to name an environment variable.
    const apiKeyEnv = ''

    if (!Array.isArray(args.models) || args.models.length === 0) {
      return { ok: false, error: '新供应商至少要有一个模型条目：请填写首个模型 ID 后再创建' }
    }
    const profile = { displayName: text(args.displayName).trim() || route, api, models: [] }
    if (baseURL) profile.baseURL = baseURL
    if (apiKeyEnv) profile.apiKeyEnv = apiKeyEnv
    if (Array.isArray(args.models)) {
      try {
        profile.models = args.models.map(cleanModel)
      } catch (err) {
        return { ok: false, error: String(err && err.message ? err.message : err) }
      }
    }

    const apiKey = typeof (args && args.apiKey) === 'string' ? args.apiKey.trim() : ''
    const ref = apiKeyEnv || (apiKey ? deriveRef(route) : '')
    if (ref) profile.apiKeyEnv = ref

    providers[route] = profile
    try {
      await writeProviders(settings, providers)
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) }
    }
    if (apiKey) {
      try {
        await writeSecret(this.ctx, ref, apiKey)
      } catch (err) {
        return { ok: false, error: `供应商已创建，但密钥写入失败：${String(err && err.message ? err.message : err)}` }
      }
    }
    warn(this.ctx, `createProvider(${route}) wrote; routes now: ${Object.keys(readProviders(settings)).join(',')}`)
    return { ok: true, route }
  }

  async deleteProvider(args) {
    const route = text(args && args.route)
    if (!route) return { ok: false, error: '缺少 route' }
    if (route === DEEPSEEK_NS) return { ok: false, error: 'DeepSeek 是内置供应商，不能删除' }
    const settings = this.settings()
    const providers = await readProvidersExact(this.ctx, settings)
    if (providers[route] === undefined) return { ok: false, error: `供应商 "${route}" 不存在` }
    delete providers[route]
    try {
      await writeProviders(settings, providers)
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) }
    }
    return { ok: true, route }
  }

  /** One minimal request against the provider endpoint to prove a model works. */
  async testModel(args) {
    const route = text(args && args.route)
    const modelId = text(args && args.model)
    if (!route) return { ok: false, error: '缺少 route' }
    if (!modelId) return { ok: false, error: '缺少模型 ID' }
    const settings = this.settings()
    let baseURL
    let api
    let ref
    if (route === DEEPSEEK_NS) {
      const config = await readDeepseekConfig(this.ctx, settings)
      baseURL = (text(config.baseURL) || DEEPSEEK_DEFAULT_BASE).replace(/\/+$/, '')
      api = 'openai-completions'
      ref = text(config.apiKeyEnv) || DEEPSEEK_DEFAULT_REF
    } else {
      const providers = await readProvidersExact(this.ctx, settings)
      const profile = providers[route]
      if (profile === undefined) return { ok: false, error: `供应商 "${route}" 不存在` }
      baseURL = text(profile.baseURL).replace(/\/+$/, '')
      if (!baseURL) return { ok: false, error: '这个供应商没有 baseURL，无法测试' }
      api = text(profile.api) || 'openai-completions'
      ref = text(profile.apiKeyEnv)
    }
    const key = await resolveSecret(this.ctx, ref)
    if (!key) return { ok: false, error: `没有可用的密钥（${ref || '未配置凭据名'}）` }

    let endpoint
    let headers
    let body
    if (api === 'anthropic-messages') {
      endpoint = `${baseURL}/messages`
      headers = { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }
      body = { model: modelId, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }
    } else if (api === 'openai-responses') {
      endpoint = `${baseURL}/responses`
      headers = { 'content-type': 'application/json', authorization: `Bearer ${key}` }
      body = { model: modelId, input: 'ping', max_output_tokens: 16 }
    } else {
      endpoint = `${baseURL}/chat/completions`
      headers = { 'content-type': 'application/json', authorization: `Bearer ${key}` }
      body = { model: modelId, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1, stream: false }
    }

    const started = Date.now()
    let response
    try {
      const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(20000)
        : undefined
      response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      })
    } catch (err) {
      return {
        ok: false,
        endpoint,
        latency: Date.now() - started,
        error: `请求 ${endpoint} 失败：${String(err && err.message ? err.message : err)}`,
      }
    }
    const latency = Date.now() - started
    let snippet = ''
    try {
      snippet = (await response.text()).slice(0, 300)
    } catch {
      snippet = ''
    }
    if (!response.ok) {
      return { ok: false, endpoint, status: response.status, latency, error: `HTTP ${response.status} ${snippet}`.trim() }
    }
    return { ok: true, endpoint, status: response.status, latency, model: modelId }
  }

  async discoverModels(args) {
    const route = text(args && args.route)
    if (!route) return { ok: false, error: '缺少 route' }
    const settings = this.settings()
    let baseURL
    let api
    let ref
    if (route === DEEPSEEK_NS) {
      const config = await readDeepseekConfig(this.ctx, settings)
      baseURL = (text(config.baseURL) || DEEPSEEK_DEFAULT_BASE).replace(/\/+$/, '')
      api = 'openai-completions'
      ref = text(config.apiKeyEnv) || DEEPSEEK_DEFAULT_REF
    } else {
      const providers = await readProvidersExact(this.ctx, settings)
      const profile = providers[route]
      if (profile === undefined) return { ok: false, error: `供应商 "${route}" 不存在` }
      baseURL = text(profile.baseURL).replace(/\/+$/, '')
      if (!baseURL) return { ok: false, error: '这个供应商没有 baseURL，无法向端点查询模型' }
      api = text(profile.api)
      ref = text(profile.apiKeyEnv)
    }
    const key = await resolveSecret(this.ctx, ref)
    if (!key) return { ok: false, error: `没有可用的密钥（${ref || '未配置凭据名'}），无法查询端点` }

    const endpoint = `${baseURL}/models`
    const headers = api === 'anthropic-messages'
      ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
      : { authorization: `Bearer ${key}` }

    let response
    try {
      const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(20000)
        : undefined
      response = await fetch(endpoint, { headers, signal })
    } catch (err) {
      return { ok: false, error: `请求 ${endpoint} 失败：${String(err && err.message ? err.message : err)}`, endpoint }
    }
    if (!response.ok) {
      return { ok: false, error: `端点返回 HTTP ${response.status}`, endpoint, status: response.status }
    }
    let body
    try {
      body = await response.json()
    } catch {
      return { ok: false, error: '端点返回的不是 JSON', endpoint }
    }

    const rows = Array.isArray(body) ? body
      : Array.isArray(body && body.data) ? body.data
        : Array.isArray(body && body.models) ? body.models
          : []
    const models = []
    for (const row of rows) {
      const id = text(row && (row.id ?? row.name ?? row.model))
      if (!id) continue
      models.push({
        id,
        name: text(row.display_name ?? row.displayName ?? row.name) || undefined,
        contextWindow: Number(row.context_window ?? row.contextWindow) || undefined,
        maxTokens: Number(row.max_tokens ?? row.maxOutputTokens ?? row.maxTokens) || undefined,
      })
    }
    if (models.length === 0) return { ok: false, error: '端点没有返回可识别的模型列表', endpoint }
    models.sort((a, b) => a.id.localeCompare(b.id))
    return { ok: true, endpoint, models, count: models.length }
  }
}

/** Every provider field the panel knows about; everything else is echoed back. */
function omitKnown(profile) {
  const known = new Set(['displayName', 'api', 'baseURL', 'apiKeyEnv', 'models'])
  const rest = {}
  for (const [key, value] of Object.entries(profile)) {
    if (!known.has(key)) rest[key] = value
  }
  return rest
}

/** Exported for the local smoke test; the loader only needs apply/name/inject. */
export { ProviderPanelRuntime }

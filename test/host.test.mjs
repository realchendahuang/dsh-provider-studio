/**
 * dsh-provider-studio — Host half regression suite (node:test, no network, no repo writes).
 *
 * Coverage map to the v1.2 contract:
 *   §1  envelope / codec shape            → "error envelope" + "contract codec"
 *   §2  method set (nine incl. revealKey) → "contract methods"
 *   §3.1 revealKey                        → reveal + fake-runtime cases
 *   §3.2 getProvider has no secret        → "getProvider"
 *   §3.3 DeepSeek probe protocol/listing  → "DeepSeek probe"
 *   §3.3 draft must not resolve a stored credential → "draft probe"
 *   §3.4 revision on writes / route grammar / shared validators → "writes"
 *   §3.5 export entry names               → "export"
 *   plus the 1.1.2 URL /v1 regression and the sanitizer branches.
 *
 * The runtime class is exercised through `Object.create(prototype)` with a fake
 * `ctx` (no Cordis Service construction), so every assertion is offline.
 */

import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { INVOCATIONS, METHODS, PACKAGE, SERVICE_KEY, TYPERT_MANIFEST } from '../contract.js'
import { apply, inject, name, ProviderPanelRuntime } from '../index.js'
import {
  credentialsOf,
  deriveRef,
  describeSecret,
  resolveSecret,
} from '../lib/credentials.js'
import { ERROR_CODES, ValidationError, fail, isFailure, ok, toFailure } from '../lib/errors.js'
import {
  cleanModel,
  cleanPiModel,
  deepseekModelsFromUi,
  normalizeDeepseekModels,
  normalizeModels,
  sanitizePiModels,
} from '../lib/models.js'
import {
  MAX_DISCOVERY_BYTES,
  authHeaders,
  listingUrl,
  messagesUrl,
  modelsFromListing,
  probeBody,
  probeHeaders,
  readBodyCapped,
  trimmedBase,
} from '../lib/probe.js'
import {
  applyAdvanced,
  applyDeepseekAdvanced,
  sanitizeCompat,
  sanitizeReasoningEfforts,
  wholeNumber,
} from '../lib/profile.js'
import { deepseekListingBase, deepseekProbeTarget, revealRefFor } from '../lib/routes.js'
import { matchNamespace, readProviders, readRevision, translateWriteError } from '../lib/settings.js'
import { hasOwn, makeHostPlain, text, warn } from '../lib/util.js'
import { checkBaseURL, checkCredentialName, checkProtocol, checkRouteName } from '../lib/validate.js'
import { deepseekView, exportEntryFor, omitKnown, renderExportYaml } from '../lib/views.js'
import {
  DEEPSEEK_ANTHROPIC_BASE,
  DEEPSEEK_DEFAULT_REF,
  DEEPSEEK_EXPORT_NAME,
  DEEPSEEK_NS,
  DEEPSEEK_OFFICIAL_BASE,
  PI_AI_EXPORT_NAME,
  PROTOCOLS,
} from '../lib/vocabulary.js'

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

/** Full patch document: one pi-ai provider + one custom DeepSeek config. */
const FIXTURE_FULL = `# fixture: full
- id: llm-pi-ai
  name: '@deepseek-ai/dsh-llm-pi-ai'
  config:
    providers:
      alpha:
        displayName: Alpha
        api: openai-completions
        baseURL: https://alpha.example/v1
        apiKeyEnv: ALPHA_KEY
        models:
          - id: alpha-1
            name: Alpha One
            contextWindow: 32000
- id: llm-deepseek
  name: '@deepseek-ai/dsh-llm-deepseek-api-key'
  config:
    baseURL: https://proxy.example/v1
    apiKeyEnv: DS_FILE_KEY
    models:
      - id: deepseek-chat
        inputModalities: [text]
`

/** Patch document whose DeepSeek entry is empty and whose pi-ai list is empty. */
const FIXTURE_EMPTY = `# fixture: empty deepseek
- id: llm-pi-ai
  name: '@deepseek-ai/dsh-llm-pi-ai'
  config:
    providers: {}
- id: llm-deepseek
  name: '@deepseek-ai/dsh-llm-deepseek-api-key'
  config: {}
`

let fixtureDir
let fixtureFullPath
let fixtureEmptyPath

before(async () => {
  fixtureDir = await mkdtemp(join(tmpdir(), 'dsh-provider-studio-test-'))
  fixtureFullPath = join(fixtureDir, 'full.patch.yml')
  fixtureEmptyPath = join(fixtureDir, 'empty.patch.yml')
  await writeFile(fixtureFullPath, FIXTURE_FULL, 'utf8')
  await writeFile(fixtureEmptyPath, FIXTURE_EMPTY, 'utf8')
})

after(async () => {
  if (fixtureDir) await rm(fixtureDir, { recursive: true, force: true })
})

/** A settings-service stub: schema projection via get(), no document unless asked. */
function settingsStub({ sections = {}, rows, replace, update } = {}) {
  const calls = { replace: [], update: [] }
  const settings = {
    get: (ns) => sections[ns],
    describe: () => (Array.isArray(rows) ? rows : []),
  }
  if (replace) {
    settings.replace = async (ns, section, revision) => {
      calls.replace.push({ ns, section, revision })
      return replace(ns, section, revision)
    }
  }
  if (update) {
    settings.update = async (ns, section, revision) => {
      calls.update.push({ ns, section, revision })
      return update(ns, section, revision)
    }
  }
  return { settings, calls }
}

/** Settings stub backed by a real (temp) patch document. */
function documentSettings(path, { replace, update, rows } = {}) {
  const calls = { replace: [], update: [] }
  const settings = {
    prepareDocument: async () => path,
    describe: () => (Array.isArray(rows) ? rows : []),
  }
  if (replace) {
    settings.replace = async (ns, section, revision) => {
      calls.replace.push({ ns, section, revision })
      return replace(ns, section, revision)
    }
  }
  if (update) {
    settings.update = async (ns, section, revision) => {
      calls.update.push({ ns, section, revision })
      return update(ns, section, revision)
    }
  }
  return { settings, calls }
}

/** Credentials-service stub. `resolve` records every reference it was asked to open. */
function credentialsStub(values = {}) {
  const resolveCalls = []
  const describeCalls = []
  const setCalls = []
  return {
    resolveCalls,
    describeCalls,
    setCalls,
    service: {
      async describe(ref) {
        describeCalls.push(ref)
        return { configured: Object.hasOwn(values, ref), source: 'file', writable: true }
      },
      async resolve(ref) {
        resolveCalls.push(ref)
        return Object.hasOwn(values, ref) ? { value: values[ref] } : undefined
      },
      async set(ref, value) {
        setCalls.push({ ref, value })
        values[ref] = value
      },
      async unset(ref) {
        delete values[ref]
      },
    },
  }
}

/**
 * Build the RPC service without constructing the Cordis base class: the fake
 * ctx supplies only the two lazy services the Host half reads.
 */
function runtime({ settings, credentials, logger } = {}) {
  const ctx = {
    get(key) {
      if (key === 'settings') return settings
      if (key === 'credentials') return credentials
      return undefined
    },
    logger: logger || { warn() {} },
  }
  const service = Object.create(ProviderPanelRuntime.prototype)
  Object.defineProperty(service, 'ctx', { value: ctx, writable: false })
  return service
}

/** A text-only fetch Response stand-in. */
const textResponse = (body) => ({ text: async () => body, body: null })

/** A streaming fetch Response stand-in (exercises the capped reader). */
function readerResponse(chunks) {
  const queue = [...chunks]
  return {
    body: {
      getReader() {
        return {
          async read() {
            if (queue.length === 0) return { done: true, value: undefined }
            return { done: false, value: new TextEncoder().encode(queue.shift()) }
          },
          async cancel() {},
        }
      },
    },
  }
}

// ---------------------------------------------------------------------------
// plugin entry surface
// ---------------------------------------------------------------------------

test('index.js keeps the static-bundle export surface', () => {
  assert.equal(name, PACKAGE)
  assert.deepEqual(inject, ['typert'])
  assert.equal(typeof apply, 'function')
  assert.equal(typeof ProviderPanelRuntime, 'function')
})

// ---------------------------------------------------------------------------
// contract: methods + codec
// ---------------------------------------------------------------------------

test('contract methods: nine, revealKey last, manifest derived from the array', () => {
  assert.equal(METHODS.length, 9)
  assert.equal(METHODS.at(-1), 'revealKey')
  for (const method of [
    'listProviders', 'getProvider', 'saveProvider', 'createProvider', 'deleteProvider',
    'discoverModels', 'testModel', 'exportProvider', 'revealKey',
  ]) {
    assert.ok(METHODS.includes(method), `missing method ${method}`)
  }
  assert.equal(new Set(METHODS).size, METHODS.length)
  assert.equal(INVOCATIONS.length, METHODS.length)
  assert.deepEqual(
    INVOCATIONS.map((invocation) => invocation.id),
    METHODS.map((method) => `${PACKAGE}#${SERVICE_KEY}/${method}`),
  )
  const members = TYPERT_MANIFEST.model.services[0].members
  assert.deepEqual(members.map((member) => member.name), METHODS)
  assert.equal(TYPERT_MANIFEST.invocations, INVOCATIONS)
  assert.equal(TYPERT_MANIFEST.model.services[0].key, SERVICE_KEY)
})

test('contract codec: parses both envelopes, demands a code on failures', () => {
  const invocation = INVOCATIONS[0]
  const argsCodec = invocation.parameters[0].codec
  const argsParser = argsCodec.create()
  const resultCodec = invocation.result

  // Args codec: undefined/null mean "no args", non-objects are refused.
  // Both the 0.1.x (`schema.parse`) and 0.2.x (`create`) shapes must work.
  assert.deepEqual(argsCodec.schema.parse(undefined), {})
  assert.deepEqual(argsParser.parse(undefined), {})
  assert.deepEqual(argsParser.parse(null), {})
  assert.deepEqual(argsParser.parse({ route: 'x' }), { route: 'x' })
  assert.throws(() => argsParser.parse([1]), TypeError)
  assert.throws(() => argsParser.parse('x'), TypeError)

  // Both the 0.1.x (`schema.parse`) and 0.2.x (`create`) shapes must work.
  assert.equal(typeof resultCodec.schema.parse, 'function')
  assert.equal(typeof resultCodec.create, 'function')
  assert.equal(resultCodec.mode, 'strict')
  const parser = resultCodec.create()
  assert.deepEqual(parser.parse({ ok: true, route: 'x' }), { ok: true, route: 'x' })
  const failure = { ok: false, code: 'INVALID_ROUTE', message: 'bad', error: 'bad' }
  assert.equal(parser.parse(failure), failure)
  assert.throws(() => parser.parse({ ok: false, message: 'no code' }), TypeError)
  assert.throws(() => parser.parse(null), TypeError)
  assert.throws(() => parser.parse({ route: 'x' }), TypeError)
})

test('error envelope: fail/ok/toFailure/ValidationError', () => {
  const bare = fail('INVALID_ROUTE', '坏了')
  assert.deepEqual(bare, {
    ok: false,
    code: 'INVALID_ROUTE',
    message: '坏了',
    error: '坏了',
  })
  assert.equal(isFailure(bare), true)
  assert.equal(isFailure(ok()), false)

  const rich = fail('PROBE_HTTP', 'HTTP 401', {
    params: { status: 401 },
    detail: 'unauthorized',
    endpoint: 'https://x.test/v1/messages',
    status: 401,
    latency: 12,
  })
  assert.equal(rich.code, 'PROBE_HTTP')
  assert.deepEqual(rich.params, { status: 401 })
  assert.equal(rich.detail, 'unauthorized')
  assert.equal(rich.endpoint, 'https://x.test/v1/messages')
  assert.equal(rich.latency, 12)
  // The caller cannot smuggle reserved envelope keys through diagnostics.
  const smuggled = fail('UNKNOWN', 'x', { ok: true, code: 'NOPE', message: 'no', error: 'no' })
  assert.equal(smuggled.ok, false)
  assert.equal(smuggled.code, 'UNKNOWN')
  assert.equal(smuggled.message, 'x')

  assert.deepEqual(ok({ route: 'x' }), { ok: true, route: 'x' })

  const validation = new ValidationError('INVALID_NUMBER', '需要整数', {
    params: { label: '上下文窗口' },
    detail: 'ctx',
  })
  const converted = toFailure(validation)
  assert.equal(converted.code, 'INVALID_NUMBER')
  assert.equal(converted.message, '需要整数')
  assert.deepEqual(converted.params, { label: '上下文窗口' })
  assert.equal(converted.detail, 'ctx')

  const unknown = toFailure(new Error('boom'))
  assert.equal(unknown.code, 'UNKNOWN')
  assert.equal(unknown.detail, 'boom')
  assert.notEqual(unknown.message, 'boom')
  assert.equal(toFailure('weird').code, 'UNKNOWN')

  assert.ok(ERROR_CODES.includes('UNKNOWN'))
  assert.equal(new Set(ERROR_CODES).size, ERROR_CODES.length)
  for (const code of ERROR_CODES) assert.match(code, /^[A-Z][A-Z0-9_]*$/)
  for (const code of ['MISSING_ROUTE', 'UNKNOWN_ROUTE', 'INVALID_ROUTE', 'ROUTE_EXISTS', 'BUILTIN_ROUTE',
    'INVALID_BASE_URL', 'INVALID_API', 'INVALID_MODEL_ID', 'INVALID_CREDENTIAL_NAME', 'INVALID_NUMBER',
    'INVALID_ENUM', 'INVALID_COMPAT', 'INVALID_RETRY', 'INVALID_REASONING', 'SETTINGS_UNAVAILABLE',
    'SETTINGS_READ_ONLY', 'SETTINGS_CONFLICT', 'CREDENTIALS_UNAVAILABLE', 'CREDENTIAL_WRITE_FAILED',
    'EXPORT_EMPTY', 'EXPORT_FAILED', 'DISCOVER_EMPTY', 'DISCOVER_NOT_JSON', 'DISCOVER_HTTP',
    'PROBE_HTTP', 'PROBE_FAILED', 'SAVE_VERIFY_FAILED']) {
    assert.ok(ERROR_CODES.includes(code), `contract code missing from taxonomy: ${code}`)
  }
  // The frozen contract set is exactly 28 codes — no unlisted additions.
  assert.equal(ERROR_CODES.length, 28)

  // `params` keys are what the Client i18n templates interpolate.
  const labelled = (fn) => {
    try {
      fn()
      return null
    } catch (error) {
      return error
    }
  }
  assert.deepEqual(labelled(() => wholeNumber('x', '上下文窗口')).params, { label: '上下文窗口' })
  assert.equal(labelled(() => sanitizePiModels([], 'openai-completions')).params.id, '(空)')
  assert.equal(labelled(() => cleanModel({})).params.id, '(空)')
  assert.equal(labelled(() => sanitizeCompat('x', 'openai-completions')).params.label, 'compat')
})

test('settings write errors are mapped to contract codes', () => {
  const conflict = new Error('settings namespace "llm-pi-ai" changed since it was read')
  conflict.code = 'SETTINGS_CONFLICT'
  conflict.expected = 4
  conflict.actual = 5
  const mapped = translateWriteError(conflict)
  assert.ok(mapped instanceof ValidationError)
  assert.equal(mapped.code, 'SETTINGS_CONFLICT')
  assert.deepEqual(mapped.params, { expected: 4, actual: 5 })
  assert.match(mapped.message, /刷新/)

  const unavailable = translateWriteError(new Error('boom'))
  assert.equal(unavailable.code, 'SETTINGS_UNAVAILABLE')

  const passthrough = new ValidationError('SETTINGS_READ_ONLY', '只读')
  assert.equal(translateWriteError(passthrough), passthrough)
})

// ---------------------------------------------------------------------------
// probe URLs: the 1.1.2 /v1 regression
// ---------------------------------------------------------------------------

test('messagesUrl appends the adapter path exactly once, base trailing slash tolerated', () => {
  assert.equal(
    messagesUrl('https://api.deepseek.com/anthropic', 'anthropic-messages'),
    'https://api.deepseek.com/anthropic/v1/messages',
  )
  assert.equal(
    messagesUrl('https://api.anthropic.com', 'anthropic-messages'),
    'https://api.anthropic.com/v1/messages',
  )
  assert.equal(
    messagesUrl('https://gw.example/v1/', 'openai-completions'),
    'https://gw.example/v1/chat/completions',
  )
  assert.equal(
    messagesUrl('https://gw.example', 'openai-responses'),
    'https://gw.example/responses',
  )
  // Unknown protocol: the probe must not build a path-less URL.
  assert.equal(messagesUrl('https://gw.example', 'made-up'), 'https://gw.example/chat/completions')
  assert.equal(trimmedBase('  https://x.test///  '), 'https://x.test')
})

test('listingUrl: one /v1 for Anthropic, never double (1.1.2 regression)', () => {
  assert.equal(listingUrl('https://api.anthropic.com', 'anthropic-messages'), 'https://api.anthropic.com/v1/models?limit=1000')
  assert.equal(listingUrl('https://api.anthropic.com/v1', 'anthropic-messages'), 'https://api.anthropic.com/v1/models?limit=1000')
  assert.equal(listingUrl('https://api.anthropic.com/v1/', 'anthropic-messages'), 'https://api.anthropic.com/v1/models?limit=1000')
  assert.equal(listingUrl('https://gw.example', 'openai-completions'), 'https://gw.example/models')
  assert.equal(listingUrl('https://gw.example/v1/', 'openai-completions'), 'https://gw.example/v1/models')
})

test('probe headers: protocol auth, deployment override, reserved names ignored', () => {
  const anthropic = authHeaders('anthropic-messages', 'sk-a')
  assert.equal(anthropic['x-api-key'], 'sk-a')
  assert.equal(anthropic['anthropic-version'], '2023-06-01')
  assert.equal(anthropic.authorization, undefined)

  const openai = authHeaders('openai-completions', 'sk-b')
  assert.equal(openai.authorization, 'Bearer sk-b')
  assert.equal(openai['x-api-key'], undefined)

  const merged = probeHeaders({ 'x-extra': 'yes', authorization: 'Bearer override', empty: '' }, 'anthropic-messages', 'sk-a')
  assert.equal(merged['x-extra'], 'yes')
  assert.equal(merged['x-api-key'], 'sk-a')
  assert.equal(merged.empty, '') // deployment headers win, even when empty

  // A '__proto__' header name must not touch Object.prototype.
  const polluted = probeHeaders(JSON.parse('{"__proto__": {"polluted": true}}'), 'openai-completions', 'sk-c')
  assert.equal(polluted.polluted, undefined)
  assert.equal({}.polluted, undefined)
})

test('probe bodies and model-list parsing', () => {
  assert.deepEqual(probeBody('anthropic-messages', 'm1'), {
    model: 'm1', max_tokens: 1, messages: [{ role: 'user', content: 'ping' }],
  })
  assert.equal(probeBody('openai-responses', 'm1').max_output_tokens, 16)
  assert.equal(probeBody('openai-completions', 'm1').stream, false)

  const fromData = modelsFromListing({
    object: 'list',
    data: [
      { id: 'b-model', context_window: 32000 },
      { id: 'a-model', name: 'A', max_tokens: 4096 },
      { nope: true },
    ],
  })
  assert.deepEqual(fromData.map((model) => model.id), ['a-model', 'b-model'])
  assert.equal(fromData[0].name, 'A')
  assert.equal(fromData[0].maxTokens, 4096)
  assert.equal(fromData[1].contextWindow, 32000)

  assert.deepEqual(modelsFromListing([{ id: 'z' }]).map((model) => model.id), ['z'])
  assert.deepEqual(modelsFromListing({ models: [{ id: 'q' }] }).map((model) => model.id), ['q'])
  assert.deepEqual(modelsFromListing({}), [])
  assert.deepEqual(modelsFromListing(null), [])
})

test('readBodyCapped keeps the discovery body bounded', async () => {
  const short = await readBodyCapped(textResponse('{"data":[]}'))
  assert.deepEqual(short, { text: '{"data":[]}', overflow: false })

  const truncatedText = await readBodyCapped(textResponse('x'.repeat(64)), 16)
  assert.equal(truncatedText.overflow, true)
  assert.equal(truncatedText.text.length, 16)

  const streamed = await readBodyCapped(readerResponse(['{"data":', '[{"id":"m"}]', '}']))
  assert.deepEqual(streamed, { text: '{"data":[{"id":"m"}]}', overflow: false })

  const streamedOverflow = await readBodyCapped(readerResponse(['aaaa', 'bbbb', 'cccc']), 6)
  assert.equal(streamedOverflow.overflow, true)
  assert.equal(streamedOverflow.text.length, 6)

  assert.equal(MAX_DISCOVERY_BYTES, 4 * 1024 * 1024)
})

// ---------------------------------------------------------------------------
// sanitizers
// ---------------------------------------------------------------------------

test('wholeNumber rejects non-integers and non-positive values', () => {
  assert.equal(wholeNumber(3, 'x'), 3)
  assert.equal(wholeNumber('3', 'x'), 3)
  assert.equal(wholeNumber(0, 'x', { allowZero: true }), 0)
  assert.throws(() => wholeNumber(0, 'x'), (error) => error.code === 'INVALID_NUMBER')
  assert.throws(() => wholeNumber('abc', 'x'), (error) => error.code === 'INVALID_NUMBER')
  assert.throws(() => wholeNumber(1.5, 'x'), (error) => error.code === 'INVALID_NUMBER')
})

test('cleanModel trims the id, coerces numbers, filters modalities', () => {
  const model = cleanModel({ id: '  m1 ', name: ' Named ', contextWindow: '32000', maxTokens: 0, input: ['text', 'bogus'] })
  assert.equal(model.id, 'm1')
  assert.equal(model.name, 'Named')
  assert.equal(model.contextWindow, 32000)
  assert.equal(model.maxTokens, undefined)
  assert.deepEqual(model.input, ['text'])
  assert.throws(() => cleanModel({ id: '  ' }), (error) => error.code === 'INVALID_MODEL_ID')
  assert.throws(() => cleanModel({}), (error) => error.code === 'INVALID_MODEL_ID')
})

test('cleanPiModel sanitizes reasoningEfforts and compat, keeps other keys', () => {
  const cleaned = cleanPiModel({
    id: 'm1',
    unknownField: { keep: true },
    reasoningEfforts: { low: ' low ', off: '' },
    compat: { supportsStore: true, bogusSwitch: true },
  }, 'openai-completions')
  assert.deepEqual(cleaned.reasoningEfforts, { low: 'low', off: null })
  assert.deepEqual(cleaned.compat, { supportsStore: true })
  assert.deepEqual(cleaned.unknownField, { keep: true })
  assert.throws(
    () => cleanPiModel({ id: 'm1', reasoningEfforts: { bogus: 'x' } }, 'openai-completions'),
    (error) => error.code === 'INVALID_REASONING',
  )
})

test('sanitizePiModels is shared by both write entry points', () => {
  assert.deepEqual(sanitizePiModels([{ id: 'a' }], 'openai-completions'), [{ id: 'a' }])
  assert.deepEqual(sanitizePiModels([], 'openai-completions', { allowEmpty: true }), [])
  assert.throws(() => sanitizePiModels([], 'openai-completions'), (error) => error.code === 'INVALID_MODEL_ID')
  assert.throws(() => sanitizePiModels(undefined, 'openai-completions'), (error) => error.code === 'INVALID_MODEL_ID')
  assert.throws(() => sanitizePiModels([{}], 'openai-completions'), (error) => error.code === 'INVALID_MODEL_ID')
})

test('reasoning / compat sanitizers cover their branches', () => {
  assert.equal(sanitizeReasoningEfforts(false), false)
  assert.equal(sanitizeReasoningEfforts(undefined), undefined)
  assert.deepEqual(sanitizeReasoningEfforts({ high: 'high' }), { high: 'high' })
  assert.throws(() => sanitizeReasoningEfforts('bad'), (error) => error.code === 'INVALID_REASONING')
  assert.throws(() => sanitizeReasoningEfforts({ off: null }), (error) => error.code === 'INVALID_REASONING')
  assert.throws(() => sanitizeReasoningEfforts({}), (error) => error.code === 'INVALID_REASONING')

  assert.deepEqual(sanitizeCompat({ maxTokensField: 'max_tokens' }, 'openai-completions'), { maxTokensField: 'max_tokens' })
  assert.deepEqual(sanitizeCompat({ maxTokensField: 'max_tokens' }, 'anthropic-messages', { filter: true }), undefined)
  assert.throws(
    () => sanitizeCompat({ maxTokensField: 'max_tokens' }, 'anthropic-messages'),
    (error) => error.code === 'INVALID_COMPAT',
  )
  assert.throws(() => sanitizeCompat({ maxTokensField: 'bogus' }, 'openai-completions'), (error) => error.code === 'INVALID_COMPAT')
  assert.throws(() => sanitizeCompat('bad', 'openai-completions'), (error) => error.code === 'INVALID_COMPAT')
  assert.throws(
    () => sanitizeCompat({ supportsStore: 'yes' }, 'openai-completions'),
    (error) => error.code === 'INVALID_COMPAT',
  )
  assert.deepEqual(sanitizeCompat({ vllmPriority: 2 }, 'openai-completions'), { vllmPriority: 2 })
  assert.deepEqual(sanitizeCompat({ empty: undefined }, 'openai-completions', { filter: true }), undefined)
})

test('applyAdvanced: null deletes, protocol change prunes compat, retry policy validates', () => {
  const profile = { api: 'openai-completions' }
  applyAdvanced(profile, {
    transport: 'sse',
    cacheRetention: 'short',
    reasoning: 'high',
    defaultInput: ['text', 'bogus'],
    headers: { ' x-extra ': 'yes' },
    defaultContextWindow: 32000,
    compat: { supportsStore: true },
  })
  assert.equal(profile.transport, 'sse')
  assert.equal(profile.cacheRetention, 'short')
  assert.equal(profile.reasoning, 'high')
  assert.deepEqual(profile.defaultInput, ['text'])
  assert.deepEqual(profile.headers, { 'x-extra': 'yes' })
  assert.equal(profile.defaultContextWindow, 32000)
  assert.deepEqual(profile.compat, { supportsStore: true })

  applyAdvanced(profile, { transport: null, defaultInput: null, headers: null })
  assert.equal(profile.transport, undefined)
  assert.equal(profile.defaultInput, undefined)
  assert.equal(profile.headers, undefined)

  // Changing the protocol drops switches the new protocol refuses.
  applyAdvanced(profile, { compat: { supportsStore: true } })
  profile.api = 'anthropic-messages'
  applyAdvanced(profile, {})
  assert.equal(profile.compat, undefined)

  const retry = { api: 'openai-completions' }
  applyAdvanced(retry, { retryPolicy: { mode: 'normal', maxRetries: 2 } })
  assert.deepEqual(retry.retryPolicy, { mode: 'normal', maxRetries: 2 })
  applyAdvanced(retry, { retryPolicy: { mode: 'always', maxRetries: 5 } })
  assert.deepEqual(retry.retryPolicy, { mode: 'always' })
  assert.throws(() => applyAdvanced(retry, { retryPolicy: { mode: 'nope' } }), (error) => error.code === 'INVALID_RETRY')
  assert.throws(() => applyAdvanced({}, { transport: 'carrier-pigeon' }), (error) => error.code === 'INVALID_ENUM')
  assert.throws(() => applyAdvanced({}, { headers: 'bad' }), (error) => error.code === 'INVALID_ENUM')
  assert.throws(() => applyAdvanced({}, { reasoning: 'bogus' }), (error) => error.code === 'INVALID_REASONING')
})

test('applyDeepseekAdvanced: enums, numbers, retry policy', () => {
  const config = {}
  applyDeepseekAdvanced(config, { thinking: 'enabled', reasoningEffort: 'high', maxTokens: 8192, streamIdleTimeoutMs: 60000 })
  assert.equal(config.thinking, 'enabled')
  assert.equal(config.reasoningEffort, 'high')
  assert.equal(config.maxTokens, 8192)
  assert.equal(config.streamIdleTimeoutMs, 60000)

  applyDeepseekAdvanced(config, { thinking: null, maxTokens: null })
  assert.equal(config.thinking, undefined)
  assert.equal(config.maxTokens, undefined)

  assert.throws(() => applyDeepseekAdvanced({}, { thinking: 'maybe' }), (error) => error.code === 'INVALID_ENUM')
  assert.throws(() => applyDeepseekAdvanced({}, { maxTokens: 'many' }), (error) => error.code === 'INVALID_NUMBER')
  assert.throws(() => applyDeepseekAdvanced({}, { retryPolicy: { mode: 'nope' } }), (error) => error.code === 'INVALID_RETRY')
  applyDeepseekAdvanced(config, { retryPolicy: { mode: 'normal', maxRetries: 1 } })
  assert.deepEqual(config.retryPolicy, { mode: 'normal', maxRetries: 1 })
})

test('DeepSeek model schema translation stays one-way at the boundary', () => {
  assert.deepEqual(normalizeDeepseekModels([{ id: 'd', inputModalities: ['text'] }]), [{ id: 'd', inputModalities: ['text'], input: ['text'] }])
  assert.deepEqual(normalizeModels([{ id: 'p' }]), [{ id: 'p', input: [] }])
  const stored = deepseekModelsFromUi([{ id: 'd', input: ['text', 'image'] }])
  assert.deepEqual(stored, [{ id: 'd', inputModalities: ['text', 'image'] }])
  assert.deepEqual(deepseekModelsFromUi([{ id: 'd' }]), [{ id: 'd' }])
})

// ---------------------------------------------------------------------------
// validators + route resolution
// ---------------------------------------------------------------------------

test('checkRouteName rejects missing, malformed and prototype names', () => {
  assert.equal(checkRouteName('').code, 'MISSING_ROUTE')
  assert.equal(checkRouteName('   ').code, 'MISSING_ROUTE')
  for (const route of ['__proto__', 'prototype', 'constructor']) {
    assert.equal(checkRouteName(route).code, 'INVALID_ROUTE')
  }
  assert.equal(checkRouteName('has space').code, 'INVALID_ROUTE')
  assert.equal(checkRouteName('slash/route').code, 'INVALID_ROUTE')
  assert.equal(checkRouteName('llm-deepseek'), null)
  assert.equal(checkRouteName('my.provider-1'), null)
})

test('checkBaseURL / checkProtocol / checkCredentialName', () => {
  assert.equal(checkBaseURL(''), null)
  assert.equal(checkBaseURL('https://x.test'), null)
  assert.equal(checkBaseURL('http://x.test'), null)
  assert.equal(checkBaseURL('ftp://x.test').code, 'INVALID_BASE_URL')
  assert.equal(checkBaseURL('', { optional: false }).code, 'INVALID_BASE_URL')
  assert.equal(checkProtocol('anthropic-messages'), null)
  assert.equal(checkProtocol('').code, 'INVALID_API')
  assert.equal(checkProtocol('grpc').code, 'INVALID_API')
  assert.equal(checkCredentialName(''), null)
  assert.equal(checkCredentialName('ALPHA_KEY'), null)
  assert.equal(checkCredentialName('bad name').code, 'INVALID_CREDENTIAL_NAME')
  assert.equal(checkCredentialName('9START').code, 'INVALID_CREDENTIAL_NAME')
  assert.equal(checkCredentialName('', { optional: false }).code, 'INVALID_CREDENTIAL_NAME')
})

test('revealRefFor: DeepSeek default, configured ref, pi-ai own ref, UNKNOWN_ROUTE', () => {
  assert.deepEqual(revealRefFor(DEEPSEEK_NS, { deepseekConfig: {} }), { ok: true, ref: DEEPSEEK_DEFAULT_REF })
  assert.deepEqual(
    revealRefFor(DEEPSEEK_NS, { deepseekConfig: { apiKeyEnv: 'CUSTOM_DS' } }),
    { ok: true, ref: 'CUSTOM_DS' },
  )
  const providers = Object.create(null)
  providers.alpha = { apiKeyEnv: 'ALPHA_KEY' }
  providers.plain = {}
  assert.deepEqual(revealRefFor('alpha', { providers }), { ok: true, ref: 'ALPHA_KEY' })
  assert.deepEqual(revealRefFor('plain', { providers }), { ok: true, ref: '' })
  assert.equal(revealRefFor('ghost', { providers }).code, 'UNKNOWN_ROUTE')
  // Prototype names are ordinary missing entries, not inherited functions.
  assert.equal(revealRefFor('__proto__', { providers }).code, 'UNKNOWN_ROUTE')
  assert.equal(revealRefFor('constructor', { providers }).code, 'UNKNOWN_ROUTE')
  assert.equal(revealRefFor('ghost', {}).code, 'UNKNOWN_ROUTE')
})

test('DeepSeek probe target speaks Anthropic Messages; listing stays on the official root', () => {
  const fallback = deepseekProbeTarget({})
  assert.equal(fallback.api, 'anthropic-messages')
  assert.equal(fallback.baseURL, DEEPSEEK_ANTHROPIC_BASE)
  assert.equal(messagesUrl(fallback.baseURL, fallback.api), 'https://api.deepseek.com/anthropic/v1/messages')

  const custom = deepseekProbeTarget({ baseURL: 'https://proxy.example/v1/' })
  assert.equal(custom.baseURL, 'https://proxy.example/v1')
  assert.equal(messagesUrl(custom.baseURL, custom.api), 'https://proxy.example/v1/v1/messages')

  assert.equal(deepseekListingBase({}), DEEPSEEK_OFFICIAL_BASE)
  assert.equal(deepseekListingBase({ baseURL: 'https://api.deepseek.com/' }), DEEPSEEK_OFFICIAL_BASE)
  assert.equal(deepseekListingBase({ baseURL: 'https://api.deepseek.com/anthropic' }), null)
  assert.equal(deepseekListingBase({ baseURL: 'https://proxy.example' }), null)
})

// ---------------------------------------------------------------------------
// utils + settings small helpers
// ---------------------------------------------------------------------------

test('helpers: text, makeHostPlain, hasOwn, warn via ctx.logger', () => {
  assert.equal(text('a'), 'a')
  assert.equal(text(1), '')
  assert.equal(text(null), '')

  const copy = makeHostPlain({ a: [{ b: 1 }] })
  assert.equal(Object.getPrototypeOf(copy), null)
  assert.equal(Object.getPrototypeOf(copy.a[0]), null)
  assert.equal(copy.a[0].b, 1)

  assert.equal(hasOwn({ a: 1 }, 'a'), true)
  assert.equal(hasOwn(Object.create(null), 'a'), false)
  assert.equal(hasOwn({}, '__proto__'), false)
  assert.equal(hasOwn(null, 'a'), false)

  const lines = []
  warn({ logger: { warn: (line) => lines.push(line) } }, 'boom')
  assert.deepEqual(lines, ['[dsh-provider-studio] boom'])
  warn({}, 'ignored') // must never throw
  warn({ logger: { warn: () => { throw new Error('x') } } }, 'ignored')

  // v1.1 read `ctx.get('logger')`, which is always undefined; v1.2 uses the
  // real `ctx.logger` object. Both must stay crash-free.
  const legacy = []
  warn({ get: (key) => (key === 'logger' ? { warn: (line) => legacy.push(line) } : undefined) }, 'legacy')
  assert.deepEqual(legacy, [])

  assert.equal(credentialsOf({ get: () => 'creds' }), 'creds')
  assert.equal(credentialsOf({ get: () => { throw new Error('x') } }), undefined)
})

test('describeSecret reads metadata only, never plaintext', async () => {
  const resolveCalls = []
  const described = await describeSecret({
    get: () => ({
      describe: async () => ({ configured: true, source: 'file' }),
      resolve: async (ref) => {
        resolveCalls.push(ref)
        return { value: 'sk-secret' }
      },
    }),
  }, 'X')
  assert.equal(described.configured, true)
  assert.equal(described.source, 'file')
  assert.deepEqual(resolveCalls, [])
})

test('settings helpers: namespace matching, null-prototype reads, revision', () => {
  assert.equal(matchNamespace('llm-pi-ai', 'llm-pi-ai'), true)
  assert.equal(matchNamespace('profile:llm-pi-ai', 'llm-pi-ai'), true)
  assert.equal(matchNamespace('a/llm-pi-ai', 'llm-pi-ai'), true)
  assert.equal(matchNamespace('llm-deepseek', 'llm-pi-ai'), false)

  const providers = readProviders({ get: () => ({ providers: { alpha: { displayName: 'A' } } }) })
  assert.equal(Object.getPrototypeOf(providers), null)
  assert.equal(providers.alpha.displayName, 'A')
  assert.equal(readProviders(undefined).alpha, undefined)

  const settings = {
    describe: () => [{ ns: 'profile:llm-pi-ai', revision: 12 }],
  }
  assert.equal(readRevision(settings, 'llm-pi-ai'), 12)
  assert.equal(readRevision({ describe: () => [] }, 'llm-pi-ai'), undefined)
  assert.equal(readRevision({}, 'llm-pi-ai'), undefined)
  assert.equal(readRevision({ describe: () => { throw new Error('x') } }, 'llm-pi-ai'), undefined)
})

// ---------------------------------------------------------------------------
// views: no secret, real export names
// ---------------------------------------------------------------------------

test('deepseekView has no secret field and defaults the official endpoint', () => {
  const view = deepseekView({ models: [{ id: 'd', inputModalities: ['text'] }] }, { configured: false })
  assert.equal(Object.hasOwn(view, 'secret'), false)
  assert.equal(view.route, DEEPSEEK_NS)
  assert.equal(view.baseURL, DEEPSEEK_OFFICIAL_BASE)
  assert.equal(view.apiKeyEnv, DEEPSEEK_DEFAULT_REF)
  assert.equal(view.keyConfigured, false)
  assert.deepEqual(view.models, [{ id: 'd', inputModalities: ['text'], input: ['text'] }])
  assert.equal(view.modelCount, 1)
  assert.equal(view.usesCatalog, false)
  assert.equal(deepseekView({}, { configured: true }).usesCatalog, true)
})

test('export entries use the real bundle-patch package names', () => {
  const deepseek = exportEntryFor(DEEPSEEK_NS, { deepseekConfig: { baseURL: 'https://api.deepseek.com' } })
  assert.equal(deepseek.id, DEEPSEEK_NS)
  assert.equal(deepseek.name, DEEPSEEK_EXPORT_NAME)
  assert.equal(DEEPSEEK_EXPORT_NAME, '@deepseek-ai/dsh-llm-deepseek-api-key')

  const pi = exportEntryFor('alpha', { profile: { displayName: 'Alpha' } })
  assert.equal(pi.id, 'llm-pi-ai')
  assert.equal(pi.name, PI_AI_EXPORT_NAME)
  assert.equal(PI_AI_EXPORT_NAME, '@deepseek-ai/dsh-llm-pi-ai')
  assert.equal(Object.getPrototypeOf(pi.config.providers), null)
  assert.equal(pi.config.providers.alpha.displayName, 'Alpha')

  const yaml = renderExportYaml(deepseek)
  assert.match(yaml, /@deepseek-ai\/dsh-llm-deepseek-api-key/)
  assert.match(yaml, /API keys are not included/)
  assert.equal(omitKnown({ displayName: 'A', api: 'x', models: [], extra: 1 }).extra, 1)
  assert.equal(omitKnown({ displayName: 'A', api: 'x', models: [] }).displayName, undefined)
})

// ---------------------------------------------------------------------------
// service: reads
// ---------------------------------------------------------------------------

test('listProviders: rows, protocols, writable flag, DeepSeek appended', async () => {
  const credentials = credentialsStub({ ALPHA_KEY: 'sk-alpha' })
  const { settings } = settingsStub({ sections: { 'llm-pi-ai': { providers: { alpha: { displayName: 'Alpha', api: 'openai-completions', baseURL: 'https://alpha.example', apiKeyEnv: 'ALPHA_KEY', models: [{ id: 'a' }] } } } } })
  const service = runtime({ settings, credentials: credentials.service })
  const result = await service.listProviders()
  assert.equal(result.ok, true)
  assert.deepEqual(result.protocols, [...PROTOCOLS])
  assert.equal(result.writable, false)
  const alpha = result.providers.find((item) => item.route === 'alpha')
  assert.equal(alpha.keyConfigured, true)
  assert.equal(alpha.keySource, 'file')
  assert.equal(alpha.modelCount, 1)
  const deepseek = result.providers.find((item) => item.route === DEEPSEEK_NS)
  assert.equal(deepseek.builtin, true)
  assert.equal(Object.hasOwn(deepseek, 'secret'), false)
})

test('getProvider: detail without secret, key metadata preserved', async () => {
  const credentials = credentialsStub({ ALPHA_KEY: 'sk-alpha' })
  const { settings } = settingsStub({ sections: { 'llm-pi-ai': { providers: { alpha: { displayName: 'Alpha', api: 'openai-completions', baseURL: 'https://alpha.example', apiKeyEnv: 'ALPHA_KEY', models: [{ id: 'a' }], headers: { 'x-extra': 'y' } } } } } })
  const service = runtime({ settings, credentials: credentials.service })
  const detail = await service.getProvider({ route: 'alpha' })
  assert.equal(detail.ok, true)
  assert.equal(Object.hasOwn(detail, 'secret'), false)
  assert.equal(detail.keyConfigured, true)
  assert.equal(detail.keySource, 'file')
  assert.deepEqual(detail.headers, { 'x-extra': 'y' })
  assert.equal(detail.models.length, 1)
  // Detail must not read the plaintext either: resolve was never called.
  assert.deepEqual(credentials.resolveCalls, [])

  const deepseek = await service.getProvider({ route: DEEPSEEK_NS })
  assert.equal(deepseek.ok, true)
  assert.equal(Object.hasOwn(deepseek, 'secret'), false)

  assert.equal((await service.getProvider({})).code, 'MISSING_ROUTE')
  assert.equal((await service.getProvider({ route: 'ghost' })).code, 'UNKNOWN_ROUTE')
  assert.equal((await service.getProvider({ route: '__proto__' })).code, 'INVALID_ROUTE')
})

test('revealKey: every documented branch, offline', async () => {
  const credentials = credentialsStub({ DEEPSEEK_API_KEY: 'sk-deep', DS_FILE_KEY: 'sk-file', ALPHA_KEY: 'sk-alpha' })
  const { settings } = documentSettings(fixtureFullPath)
  const service = runtime({ settings, credentials: credentials.service })

  assert.deepEqual(await service.revealKey({ route: DEEPSEEK_NS }), { ok: true, route: DEEPSEEK_NS, value: 'sk-file' })
  assert.deepEqual(await service.revealKey({ route: 'alpha' }), { ok: true, route: 'alpha', value: 'sk-alpha' })

  assert.equal((await service.revealKey({})).code, 'MISSING_ROUTE')
  assert.equal((await service.revealKey({ route: 'ghost' })).code, 'UNKNOWN_ROUTE')
  assert.equal((await service.revealKey({ route: '__proto__' })).code, 'UNKNOWN_ROUTE')

  // Provider without an apiKeyEnv: configured-or-not is simply null.
  const noRef = settingsStub({ sections: { 'llm-pi-ai': { providers: { bare: { displayName: 'Bare' } } } } })
  const bareService = runtime({ settings: noRef.settings, credentials: credentials.service })
  assert.deepEqual(await bareService.revealKey({ route: 'bare' }), { ok: true, route: 'bare', value: null })

  // Missing credentials service → CREDENTIALS_UNAVAILABLE, never a crash.
  const withoutCredentials = runtime({ settings: noRef.settings })
  assert.equal((await withoutCredentials.revealKey({ route: 'bare' })).code, 'CREDENTIALS_UNAVAILABLE')

  // A reference whose value is missing resolves to null (contract §3.1).
  const missingValue = runtime({ settings: noRef.settings, credentials: credentialsStub({}).service })
  noRef.settings.get = () => ({ providers: { hasRef: { apiKeyEnv: 'NOT_SET' } } })
  assert.deepEqual(await missingValue.revealKey({ route: 'hasRef' }), { ok: true, route: 'hasRef', value: null })
})

// ---------------------------------------------------------------------------
// service: writes (revision + shared validators + route safety)
// ---------------------------------------------------------------------------

test('createProvider writes with the describe() revision and null-prototype section', async () => {
  const { settings, calls } = settingsStub({
    sections: { 'llm-pi-ai': { providers: {} } },
    rows: [{ ns: 'llm-pi-ai', revision: 3 }],
    replace: async () => {},
  })
  const service = runtime({ settings })
  const result = await service.createProvider({
    route: 'beta',
    displayName: 'Beta',
    api: 'anthropic-messages',
    baseURL: 'https://beta.example',
    models: [{ id: 'beta-1' }],
  })
  assert.deepEqual(result, { ok: true, route: 'beta' })
  assert.equal(calls.replace.length, 1)
  const [call] = calls.replace
  assert.equal(call.ns, 'llm-pi-ai')
  assert.equal(call.revision, 3)
  assert.equal(Object.getPrototypeOf(call.section), null)
  assert.equal(Object.getPrototypeOf(call.section.providers), null)
  assert.equal(call.section.providers.beta.api, 'anthropic-messages')
  assert.equal(call.section.providers.beta.displayName, 'Beta')
  assert.equal(Object.getPrototypeOf(call.section.providers.beta.models[0]), null)
  assert.equal(call.section.providers.beta.models[0].id, 'beta-1')
})

test('createProvider failures carry the contract codes', async () => {
  const { settings } = settingsStub({
    sections: { 'llm-pi-ai': { providers: { alpha: { displayName: 'Alpha' } } } },
    rows: [{ ns: 'llm-pi-ai', revision: 1 }],
    replace: async () => {},
  })
  const service = runtime({ settings })

  assert.equal((await service.createProvider({})).code, 'MISSING_ROUTE')
  assert.equal((await service.createProvider({ route: '__proto__' })).code, 'INVALID_ROUTE')
  assert.equal((await service.createProvider({ route: 'constructor' })).code, 'INVALID_ROUTE')
  assert.equal((await service.createProvider({ route: DEEPSEEK_NS })).code, 'BUILTIN_ROUTE')
  assert.equal((await service.createProvider({ route: 'alpha' })).code, 'ROUTE_EXISTS')
  assert.equal((await service.createProvider({ route: 'new', api: 'grpc', models: [{ id: 'm' }] })).code, 'INVALID_API')
  assert.equal((await service.createProvider({ route: 'new', baseURL: 'ftp://x', models: [{ id: 'm' }] })).code, 'INVALID_BASE_URL')
  assert.equal((await service.createProvider({ route: 'new' })).code, 'INVALID_MODEL_ID')
  assert.equal((await service.createProvider({ route: 'new', models: [{}] })).code, 'INVALID_MODEL_ID')

  // Read-only / unavailable settings services are distinct codes.
  const readOnly = runtime({ settings: { get: () => ({ providers: {} }), describe: () => [] } })
  assert.equal((await readOnly.createProvider({ route: 'new', models: [{ id: 'm' }] })).code, 'SETTINGS_READ_ONLY')
  const unavailable = runtime({})
  assert.equal((await unavailable.createProvider({ route: 'new', models: [{ id: 'm' }] })).code, 'SETTINGS_UNAVAILABLE')
})

test('saveProvider: revision passed, patch applied, stale write maps to SETTINGS_CONFLICT', async () => {
  const { settings, calls } = settingsStub({
    sections: {
      'llm-pi-ai': {
        providers: {
          alpha: { displayName: 'Alpha', api: 'openai-completions', baseURL: 'https://alpha.example', apiKeyEnv: 'ALPHA_KEY', models: [{ id: 'a' }] },
        },
      },
    },
    rows: [{ ns: 'llm-pi-ai', revision: 7 }],
    replace: async () => {},
  })
  const service = runtime({ settings })
  const saved = await service.saveProvider({
    route: 'alpha',
    patch: { displayName: 'Alpha Renamed', models: [{ id: 'a2', contextWindow: 64000 }], advanced: { transport: 'sse' } },
  })
  assert.equal(saved.ok, true)
  assert.equal(saved.route, 'alpha')
  assert.equal(saved.persisted, false) // no patch document in this stub
  assert.equal(calls.replace[0].revision, 7)
  assert.equal(calls.replace[0].section.providers.alpha.displayName, 'Alpha Renamed')
  assert.equal(Object.getPrototypeOf(calls.replace[0].section.providers.alpha.models[0]), null)
  assert.equal(calls.replace[0].section.providers.alpha.models[0].id, 'a2')
  assert.equal(calls.replace[0].section.providers.alpha.models[0].contextWindow, 64000)
  assert.equal(calls.replace[0].section.providers.alpha.transport, 'sse')
  // Untouched fields survive.
  assert.equal(calls.replace[0].section.providers.alpha.baseURL, 'https://alpha.example')

  // A stale revision throws from the runtime and must surface as SETTINGS_CONFLICT.
  const conflictSettings = settingsStub({
    sections: { 'llm-pi-ai': { providers: { alpha: { displayName: 'Alpha' } } } },
    rows: [{ ns: 'llm-pi-ai', revision: 2 }],
    replace: async () => {
      const error = new Error('settings namespace "llm-pi-ai" changed since it was read')
      error.code = 'SETTINGS_CONFLICT'
      error.expected = 2
      error.actual = 9
      throw error
    },
  })
  const conflicted = await runtime({ settings: conflictSettings.settings }).saveProvider({
    route: 'alpha',
    patch: { displayName: 'Stale' },
  })
  assert.equal(conflicted.ok, false)
  assert.equal(conflicted.code, 'SETTINGS_CONFLICT')
  assert.deepEqual(conflicted.params, { expected: 2, actual: 9 })
})

test('saveProvider shares createProvider validators', async () => {
  const { settings } = settingsStub({
    sections: { 'llm-pi-ai': { providers: { alpha: { displayName: 'Alpha', api: 'openai-completions' } } } },
    rows: [{ ns: 'llm-pi-ai', revision: 0 }],
    replace: async () => {},
  })
  const service = runtime({ settings })

  assert.equal((await service.saveProvider({ route: 'ghost', patch: {} })).code, 'UNKNOWN_ROUTE')
  assert.equal((await service.saveProvider({ route: '__proto__', patch: {} })).code, 'INVALID_ROUTE')
  assert.equal((await service.saveProvider({ route: 'alpha', patch: { api: 'grpc' } })).code, 'INVALID_API')
  assert.equal((await service.saveProvider({ route: 'alpha', patch: { baseURL: 'ftp://x' } })).code, 'INVALID_BASE_URL')
  assert.equal((await service.saveProvider({ route: 'alpha', patch: { apiKeyEnv: 'bad name' } })).code, 'INVALID_CREDENTIAL_NAME')
  assert.equal((await service.saveProvider({ route: 'alpha', patch: { models: [{}] } })).code, 'INVALID_MODEL_ID')
  // An empty model list is legal on save: it means "use the adapter catalog".
  const cleared = await service.saveProvider({ route: 'alpha', patch: { models: [] } })
  assert.equal(cleared.ok, true)
})

test('deleteProvider deletes with revision and reports unknown routes', async () => {
  const { settings, calls } = settingsStub({
    sections: {
      'llm-pi-ai': {
        providers: {
          alpha: { displayName: 'Alpha' },
          beta: { displayName: 'Beta' },
        },
      },
    },
    rows: [{ ns: 'llm-pi-ai', revision: 4 }],
    replace: async () => {},
  })
  const service = runtime({ settings })
  assert.deepEqual(await service.deleteProvider({ route: 'alpha' }), { ok: true, route: 'alpha' })
  assert.equal(calls.replace[0].revision, 4)
  assert.deepEqual(Object.keys(calls.replace[0].section.providers), ['beta'])
  assert.equal((await service.deleteProvider({ route: 'ghost' })).code, 'UNKNOWN_ROUTE')
  assert.equal((await service.deleteProvider({ route: DEEPSEEK_NS })).code, 'BUILTIN_ROUTE')
  assert.equal((await service.deleteProvider({})).code, 'MISSING_ROUTE')
})

// ---------------------------------------------------------------------------
// service: export
// ---------------------------------------------------------------------------

test('exportProvider emits the real package names and only known fields', async () => {
  const full = documentSettings(fixtureFullPath)
  const service = runtime({ settings: full.settings })

  const deepseek = await service.exportProvider({ route: DEEPSEEK_NS })
  assert.equal(deepseek.ok, true)
  assert.match(deepseek.yaml, /@deepseek-ai\/dsh-llm-deepseek-api-key/)
  assert.match(deepseek.yaml, /API keys are not included/)
  assert.match(deepseek.yaml, /apiKeyEnv: DS_FILE_KEY/)

  const pi = await service.exportProvider({ route: 'alpha' })
  assert.equal(pi.ok, true)
  assert.match(pi.yaml, /@deepseek-ai\/dsh-llm-pi-ai/)
  assert.match(pi.yaml, /alpha:/)
  assert.match(pi.yaml, /apiKeyEnv: ALPHA_KEY/)

  assert.equal((await service.exportProvider({ route: 'ghost' })).code, 'UNKNOWN_ROUTE')
  assert.equal((await service.exportProvider({})).code, 'MISSING_ROUTE')

  const empty = documentSettings(fixtureEmptyPath)
  const emptyService = runtime({ settings: empty.settings })
  assert.equal((await emptyService.exportProvider({ route: DEEPSEEK_NS })).code, 'EXPORT_EMPTY')
})

// ---------------------------------------------------------------------------
// service: probes (offline paths only)
// ---------------------------------------------------------------------------

test('draft probes never resolve a stored credential (v1.2 security fix)', async () => {
  const credentials = credentialsStub({ MAGPIE_GATEWAY_KEY: 'sk-should-never-move' })
  const { settings } = settingsStub({ sections: {} })
  const service = runtime({ settings, credentials: credentials.service })

  // No pasted key → refuses, and the stored reference is never even resolved.
  const refused = await service.probeTarget({
    baseURL: 'https://evil.example',
    api: 'openai-completions',
    apiKeyEnv: 'MAGPIE_GATEWAY_KEY',
  })
  assert.equal(refused.ok, false)
  assert.equal(refused.code, 'CREDENTIALS_UNAVAILABLE')
  assert.deepEqual(credentials.resolveCalls, [])

  // The pasted key is the only credential a draft may use.
  const accepted = await service.probeTarget({
    baseURL: 'https://evil.example',
    api: 'openai-completions',
    apiKey: 'sk-pasted',
    apiKeyEnv: 'MAGPIE_GATEWAY_KEY',
  })
  assert.equal(accepted.ok, true)
  assert.equal(accepted.key, 'sk-pasted')
  assert.deepEqual(credentials.resolveCalls, [])

  // discoverModels inherits the same rule.
  const discover = await service.discoverModels({ baseURL: 'https://evil.example', apiKeyEnv: 'MAGPIE_GATEWAY_KEY' })
  assert.equal(discover.code, 'CREDENTIALS_UNAVAILABLE')
  assert.deepEqual(credentials.resolveCalls, [])
})

test('probeTarget: saved routes resolve only their own reference', async () => {
  const credentials = credentialsStub({ ALPHA_KEY: 'sk-alpha' })
  const { settings } = settingsStub({
    sections: {
      'llm-pi-ai': {
        providers: {
          alpha: { displayName: 'Alpha', api: 'anthropic-messages', baseURL: 'https://alpha.example/v1', apiKeyEnv: 'ALPHA_KEY', headers: { 'x-extra': 'y' } },
          noBase: { displayName: 'No base', apiKeyEnv: 'ALPHA_KEY' },
          noKey: { displayName: 'No key', api: 'openai-completions', baseURL: 'https://nokey.example' },
        },
      },
    },
  })
  const service = runtime({ settings, credentials: credentials.service })

  const target = await service.probeTarget({ route: 'alpha' })
  assert.equal(target.ok, true)
  assert.equal(target.api, 'anthropic-messages')
  assert.equal(target.baseURL, 'https://alpha.example/v1')
  assert.deepEqual(credentials.resolveCalls, ['ALPHA_KEY'])

  assert.equal((await service.probeTarget({ route: 'ghost' })).code, 'UNKNOWN_ROUTE')
  assert.equal((await service.probeTarget({ route: 'noBase' })).code, 'INVALID_BASE_URL')
  assert.equal((await service.probeTarget({ route: 'noKey' })).code, 'CREDENTIALS_UNAVAILABLE')
  assert.equal((await service.probeTarget({})).code, 'MISSING_ROUTE')
  assert.equal((await service.probeTarget({ baseURL: 'ftp://x' })).code, 'INVALID_BASE_URL')
  assert.equal((await service.probeTarget({ baseURL: 'https://x.test', api: 'grpc', apiKey: 'sk' })).code, 'INVALID_API')
})

test('DeepSeek probes: Anthropic Messages target, official-only listing', async () => {
  const credentials = credentialsStub({ DS_FILE_KEY: 'sk-file' })
  const full = documentSettings(fixtureFullPath)
  const service = runtime({ settings: full.settings, credentials: credentials.service })

  const target = await service.probeTarget({ route: DEEPSEEK_NS })
  assert.equal(target.ok, true)
  assert.equal(target.api, 'anthropic-messages')
  assert.equal(target.baseURL, 'https://proxy.example/v1')
  assert.equal(messagesUrl(target.baseURL, target.api), 'https://proxy.example/v1/v1/messages')

  // A custom baseURL has no listing endpoint: DISCOVER_EMPTY without any request.
  const discovered = await service.discoverModels({ route: DEEPSEEK_NS })
  assert.equal(discovered.ok, false)
  assert.equal(discovered.code, 'DISCOVER_EMPTY')

  // Empty config → default Anthropic base (the real adapter's own default).
  const empty = documentSettings(fixtureEmptyPath)
  const emptyService = runtime({ settings: empty.settings, credentials: credentialsStub({ DEEPSEEK_API_KEY: 'sk-deep' }).service })
  const defaultTarget = await emptyService.probeTarget({ route: DEEPSEEK_NS })
  assert.equal(defaultTarget.ok, true)
  assert.equal(defaultTarget.baseURL, DEEPSEEK_ANTHROPIC_BASE)
  assert.equal(defaultTarget.api, 'anthropic-messages')

  // Missing key for the built-in route is CREDENTIALS_UNAVAILABLE with the ref.
  const noKey = runtime({ settings: empty.settings, credentials: credentialsStub({}).service })
  const missing = await noKey.probeTarget({ route: DEEPSEEK_NS })
  assert.equal(missing.code, 'CREDENTIALS_UNAVAILABLE')
  assert.equal(missing.params.ref, DEEPSEEK_DEFAULT_REF)
})

test('testModel rejects a missing model id before any network work', async () => {
  const service = runtime({ settings: settingsStub({ sections: {} }).settings })
  const result = await service.testModel({ baseURL: 'https://x.test', apiKey: 'sk' })
  assert.equal(result.code, 'INVALID_MODEL_ID')
})

// ---------------------------------------------------------------------------
// deriveRef + describeSecret edges
// ---------------------------------------------------------------------------

test('deriveRef keeps the credential grammar', () => {
  assert.equal(deriveRef('alpha'), 'ALPHA_API_KEY')
  assert.equal(deriveRef('my.provider-1'), 'MY_PROVIDER_1_API_KEY')
  assert.equal(deriveRef('!!!'), 'PROVIDER_API_KEY')
})

test('describeSecret reports each degraded path without throwing', async () => {
  assert.equal((await describeSecret({ get: () => undefined }, 'X')).configured, false)
  assert.equal((await describeSecret({ get: () => undefined }, '')).hint, 'provider has no apiKeyEnv')
  const noDescribe = await describeSecret({ get: () => ({}) }, 'X')
  assert.equal(noDescribe.hint, 'credentials.describe unavailable')
  const throwing = await describeSecret({ get: () => ({ describe: async () => { throw new Error('x') } }) }, 'X')
  assert.equal(throwing.hint, 'describe failed')
  const unwrapped = await describeSecret({ get: () => ({ describe: async () => ({ X: { configured: true } }) }) }, 'X')
  assert.equal(unwrapped.configured, true)
  assert.equal(await resolveSecret({ get: () => ({ resolve: async () => ({ value: 'sk' }) }) }, 'X'), 'sk')
  assert.equal(await resolveSecret({ get: () => ({ resolve: async () => undefined }) }, 'X'), null)
})

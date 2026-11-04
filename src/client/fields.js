/** Field vocabulary for the parts of an `llm-pi-ai` profile the main form does
 *  not show.
 *
 * Mirrors `@deepseek-ai/dsh-llm-pi-ai`'s own configuration schema: the thinking
 * levels a model may offer, the wire-compatibility switches each protocol
 * accepts, and the route-level knobs (defaults, transport, timeouts, image
 * budgets, retry policy). Keeping the vocabulary in one module means the
 * editors, the client-side refusals and the README cannot drift apart.
 *
 * A profile field is one of:
 *   bool   — a switch; absent means "let pi-ai detect it"
 *   enum   — a fixed set of wire spellings
 *   number — a positive integer or duration
 *   json   — a free-form object (the chat-template argument dicts)
 */

/** Escalation order pi-ai validates `reasoningEfforts` against. */
export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

/** Locale keys for the level pickers ('off' is the only valueless level). */
const LEVEL_KEYS = {
  off: 'levelOff',
  minimal: 'levelMinimal',
  low: 'levelLow',
  medium: 'levelMedium',
  high: 'levelHigh',
  xhigh: 'levelXhigh',
  max: 'levelMax',
}

/** The locale key naming one thinking level. */
export function levelKey(level) {
  return LEVEL_KEYS[level] || level
}

/** `低 · low`: a translated name plus the wire spelling the adapter expects. */
export function levelLabel(t, level) {
  return `${t(levelKey(level))} · ${level}`
}

/** Wire spellings a profile may name for a thinking dispatch format. */
export const THINKING_FORMATS = [
  'openai',
  'deepseek',
  'openrouter',
  'together',
  'baseten',
  'zai',
  'qwen',
  'chat-template',
  'qwen-chat-template',
  'string-thinking',
  'ant-ling',
]

/** Every wire-compatibility switch, with the kind of value it holds. */
export const COMPAT_FIELDS = {
  supportsStore: { kind: 'bool', labelKey: 'cfSupportsStore' },
  supportsDeveloperRole: { kind: 'bool', labelKey: 'cfSupportsDeveloperRole' },
  supportsReasoningEffort: { kind: 'bool', labelKey: 'cfSupportsReasoningEffort' },
  supportsUsageInStreaming: { kind: 'bool', labelKey: 'cfSupportsUsageInStreaming' },
  supportsFinishReason: { kind: 'bool', labelKey: 'cfSupportsFinishReason' },
  maxTokensField: {
    kind: 'enum',
    options: ['max_completion_tokens', 'max_tokens'],
    labelKey: 'cfMaxTokensField',
  },
  requiresToolResultName: { kind: 'bool', labelKey: 'cfRequiresToolResultName' },
  requiresAssistantAfterToolResult: { kind: 'bool', labelKey: 'cfRequiresAssistantAfterToolResult' },
  requiresThinkingAsText: { kind: 'bool', labelKey: 'cfRequiresThinkingAsText' },
  requiresReasoningContentOnAssistantMessages: {
    kind: 'bool',
    labelKey: 'cfRequiresReasoningContent',
  },
  thinkingFormat: { kind: 'enum', options: THINKING_FORMATS, labelKey: 'cfThinkingFormat' },
  chatTemplateKwargs: { kind: 'json', labelKey: 'cfChatTemplateKwargs' },
  chatTemplateArgs: { kind: 'json', labelKey: 'cfChatTemplateArgs' },
  supportsThinkingTokenBudget: { kind: 'bool', labelKey: 'cfSupportsThinkingTokenBudget' },
  thinkingTokenBudgetField: {
    kind: 'enum',
    options: ['thinking_token_budget', 'thinking_budget', 'thinking_budget_tokens'],
    labelKey: 'cfThinkingTokenBudgetField',
  },
  vllmPriority: { kind: 'number', labelKey: 'cfVllmPriority' },
  supportsStrictMode: { kind: 'bool', labelKey: 'cfSupportsStrictMode' },
  cacheControlFormat: { kind: 'enum', options: ['anthropic'], labelKey: 'cfCacheControlFormat' },
  supportsLongCacheRetention: { kind: 'bool', labelKey: 'cfSupportsLongCacheRetention' },
  supportsMaxOutputTokens: { kind: 'bool', labelKey: 'cfSupportsMaxOutputTokens' },
  supportsEagerToolInputStreaming: {
    kind: 'bool',
    labelKey: 'cfSupportsEagerToolInputStreaming',
  },
  supportsCacheControlOnTools: { kind: 'bool', labelKey: 'cfSupportsCacheControlOnTools' },
  supportsTemperature: { kind: 'bool', labelKey: 'cfSupportsTemperature' },
  forceAdaptiveThinking: { kind: 'bool', labelKey: 'cfForceAdaptiveThinking' },
  allowEmptySignature: { kind: 'bool', labelKey: 'cfAllowEmptySignature' },
  supportsStrictTools: { kind: 'bool', labelKey: 'cfSupportsStrictTools' },
}

/** The switches each wire protocol offers, in pi-ai's declaration order. */
export const COMPAT_BY_PROTOCOL = {
  'openai-completions': [
    'supportsStore',
    'supportsDeveloperRole',
    'supportsReasoningEffort',
    'supportsUsageInStreaming',
    'supportsFinishReason',
    'maxTokensField',
    'requiresToolResultName',
    'requiresAssistantAfterToolResult',
    'requiresThinkingAsText',
    'requiresReasoningContentOnAssistantMessages',
    'thinkingFormat',
    'chatTemplateKwargs',
    'chatTemplateArgs',
    'supportsThinkingTokenBudget',
    'thinkingTokenBudgetField',
    'vllmPriority',
    'supportsStrictMode',
    'cacheControlFormat',
    'supportsLongCacheRetention',
  ],
  'openai-responses': [
    'supportsDeveloperRole',
    'supportsMaxOutputTokens',
    'supportsStrictMode',
    'supportsLongCacheRetention',
  ],
  'anthropic-messages': [
    'supportsEagerToolInputStreaming',
    'supportsLongCacheRetention',
    'supportsCacheControlOnTools',
    'supportsTemperature',
    'forceAdaptiveThinking',
    'allowEmptySignature',
    'supportsStrictTools',
  ],
}

/** The switches one protocol accepts, descriptor objects ready to render. */
export function compatFieldsFor(api) {
  const keys = COMPAT_BY_PROTOCOL[api] || []
  return keys.map((key) => ({ key, ...COMPAT_FIELDS[key] }))
}

/** The default value a freshly added switch starts at. */
export function compatDefault(kind) {
  if (kind === 'bool') return true
  return undefined
}

// ---------------------------------------------------------------------------
// reasoning efforts
// ---------------------------------------------------------------------------

/** How a model declares its thinking levels: inherit the catalog, refuse them,
 *  or spell them out. */
export function readReasoning(model) {
  const value = model !== null && typeof model === 'object' ? model.reasoningEfforts : undefined
  if (value === false) return { mode: 'none', rows: [] }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const rows = Object.entries(value)
      .filter(([level]) => THINKING_LEVELS.includes(level))
      .map(([level, wire]) => [level, typeof wire === 'string' ? wire : ''])
    if (rows.length === 0) return { mode: 'inherit', rows: [] }
    return { mode: 'custom', rows }
  }
  return { mode: 'inherit', rows: [] }
}

/** The seed rows a model starts with when its levels are first spelled out. */
export function initialReasoningRows() {
  return [
    ['off', ''],
    ['low', 'low'],
    ['medium', 'medium'],
    ['high', 'high'],
  ]
}

/** Apply an editor state back onto a model row. `inherit` removes the field so
 *  the installed catalog keeps deciding; `none` refuses thinking outright. */
export function applyReasoning(model, state) {
  const next = { ...model }
  delete next.reasoningEfforts
  if (state.mode === 'none') {
    next.reasoningEfforts = false
    return next
  }
  if (state.mode !== 'custom' || state.rows.length === 0) return next
  const efforts = {}
  for (const [level, wire] of state.rows) {
    if (!THINKING_LEVELS.includes(level)) continue
    efforts[level] = level === 'off' && wire.trim() === '' ? null : wire.trim()
  }
  next.reasoningEfforts = efforts
  return next
}

/** The first refused row of a declared list, mirroring pi-ai's own refusals. */
export function reasoningProblem(state) {
  if (state.mode !== 'custom') return ''
  if (state.rows.length === 0) return 'thinkingNeedsLevel'
  if (!state.rows.some(([level]) => level !== 'off')) return 'thinkingNeedsLevel'
  for (const [level, wire] of state.rows) {
    if (level !== 'off' && wire.trim() === '') return 'thinkingNeedsWire'
  }
  return ''
}

// ---------------------------------------------------------------------------
// compat rows
// ---------------------------------------------------------------------------

/** Stored compat object → editor rows, keeping only switches the protocol
 *  offers so a stale key cannot ride along into the next save. */
export function readCompat(compat, api) {
  if (compat === null || typeof compat !== 'object' || Array.isArray(compat)) return []
  const offered = new Set(COMPAT_BY_PROTOCOL[api] || [])
  return Object.entries(compat)
    .filter(([key]) => offered.has(key))
    .map(([key, value]) => [key, value])
}

/** Editor rows → the stored object, or `undefined` when nothing is declared. */
export function writeCompat(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return undefined
  const compat = {}
  for (const [key, value] of rows) {
    if (!Object.prototype.hasOwnProperty.call(COMPAT_FIELDS, key)) continue
    if (value === undefined) continue
    compat[key] = value
  }
  return Object.keys(compat).length === 0 ? undefined : compat
}

/** Parse a JSON-typed switch; `null` marks an unparseable draft. */
export function parseJsonValue(text) {
  const source = String(text === undefined || text === null ? '' : text).trim()
  if (source === '') return undefined
  try {
    const parsed = JSON.parse(source)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** How a JSON-typed switch renders inside its text field. */
export function formatJsonValue(value) {
  if (value === undefined) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------------------
// route-level knobs
// ---------------------------------------------------------------------------

/** Transport spellings pi-ai accepts. */
export const TRANSPORTS = ['auto', 'sse', 'websocket', 'websocket-cached']

/** Cache-retention spellings pi-ai accepts. */
export const CACHE_RETENTIONS = ['none', 'short', 'long']

/** Retry modes pi-ai accepts. */
export const RETRY_MODES = ['normal', 'always']

/** Modalities a route or a model may declare. */
export const MODALITIES = ['text', 'image']

/** Token budgets one thinking level may reserve. */
export const THINKING_BUDGET_LEVELS = ['minimal', 'low', 'medium', 'high']

/** Every route-level field the advanced card owns, by the editor state key that
 *  carries it. `null` in a patch removes the field. */
export const ADVANCED_FIELDS = [
  'headers',
  'compat',
  'reasoning',
  'defaultContextWindow',
  'defaultMaxTokens',
  'defaultInput',
  'transport',
  'cacheRetention',
  'timeoutMs',
  'websocketConnectTimeoutMs',
  'streamIdleTimeoutMs',
  'maxRequestImageBytes',
  'requestImagePixelBudget',
  'requestImageMaxBytes',
  'retryPolicy',
  'thinkingBudgets',
]

/** Editor state for one route, read out of the stored profile. */
export function readAdvanced(profile) {
  const source = profile !== null && typeof profile === 'object' ? profile : {}
  const headers = source.headers !== null && typeof source.headers === 'object'
    ? Object.entries(source.headers).map(([key, value]) => [key, String(value)])
    : []
  const retry = source.retryPolicy !== null && typeof source.retryPolicy === 'object' ? source.retryPolicy : {}
  const budgets = source.thinkingBudgets !== null && typeof source.thinkingBudgets === 'object'
    ? source.thinkingBudgets
    : {}
  return {
    headers,
    compat: readCompat(source.compat, source.api),
    reasoning: typeof source.reasoning === 'string' ? source.reasoning : '',
    defaultContextWindow: numberText(source.defaultContextWindow),
    defaultMaxTokens: numberText(source.defaultMaxTokens),
    defaultInput: Array.isArray(source.defaultInput) ? source.defaultInput : [],
    transport: typeof source.transport === 'string' ? source.transport : '',
    cacheRetention: typeof source.cacheRetention === 'string' ? source.cacheRetention : '',
    timeoutMs: numberText(source.timeoutMs),
    websocketConnectTimeoutMs: numberText(source.websocketConnectTimeoutMs),
    streamIdleTimeoutMs: numberText(source.streamIdleTimeoutMs),
    maxRequestImageBytes: numberText(source.maxRequestImageBytes),
    requestImagePixelBudget: numberText(source.requestImagePixelBudget),
    requestImageMaxBytes: numberText(source.requestImageMaxBytes),
    retryMode: typeof retry.mode === 'string' ? retry.mode : '',
    maxRetries: numberText(retry.maxRetries),
    thinkingBudgets: Object.fromEntries(
      THINKING_BUDGET_LEVELS.map((level) => [level, numberText(budgets[level])]),
    ),
  }
}

function numberText(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

/** Whether an editor state carries no declaration at all. */
export function advancedIsEmpty(state) {
  if (state === undefined || state === null) return true
  if (state.headers.length > 0 || state.compat.length > 0) return false
  if (state.reasoning !== '' || state.transport !== '' || state.cacheRetention !== '') return false
  if (state.retryMode !== '' || state.maxRetries !== '') return false
  if (state.defaultInput.length > 0) return false
  for (const field of [
    'defaultContextWindow',
    'defaultMaxTokens',
    'timeoutMs',
    'websocketConnectTimeoutMs',
    'streamIdleTimeoutMs',
    'maxRequestImageBytes',
    'requestImagePixelBudget',
    'requestImageMaxBytes',
  ]) {
    if (state[field] !== '') return false
  }
  return THINKING_BUDGET_LEVELS.every((level) => state.thinkingBudgets[level] === '')
}

/** How many declarations an editor state carries, for the collapsed summary. */
export function advancedCount(state) {
  if (state === undefined || state === null) return 0
  let count = state.headers.length + state.compat.length
  if (state.reasoning !== '') count += 1
  if (state.transport !== '') count += 1
  if (state.cacheRetention !== '') count += 1
  if (state.retryMode !== '' || state.maxRetries !== '') count += 1
  if (state.defaultInput.length > 0) count += 1
  for (const field of [
    'defaultContextWindow',
    'defaultMaxTokens',
    'timeoutMs',
    'websocketConnectTimeoutMs',
    'streamIdleTimeoutMs',
    'maxRequestImageBytes',
    'requestImagePixelBudget',
    'requestImageMaxBytes',
  ]) {
    if (state[field] !== '') count += 1
  }
  if (THINKING_BUDGET_LEVELS.some((level) => state.thinkingBudgets[level] !== '')) count += 1
  return count
}

/** Editor state → the `advanced` patch the host merges. Unset fields become
 *  `null` so the host removes them instead of leaving stale values behind. */
export function buildAdvancedPatch(state) {
  const patch = {}
  const headers = {}
  for (const [name, value] of state.headers) {
    const key = String(name).trim()
    if (key === '') continue
    headers[key] = String(value)
  }
  patch.headers = Object.keys(headers).length > 0 ? headers : null
  patch.compat = state.compat.length > 0 ? Object.fromEntries(state.compat) : null
  patch.reasoning = state.reasoning === '' ? null : state.reasoning
  patch.defaultInput = state.defaultInput.length > 0 ? state.defaultInput : null
  patch.transport = state.transport === '' ? null : state.transport
  patch.cacheRetention = state.cacheRetention === '' ? null : state.cacheRetention
  for (const field of [
    'defaultContextWindow',
    'defaultMaxTokens',
    'timeoutMs',
    'websocketConnectTimeoutMs',
    'streamIdleTimeoutMs',
    'maxRequestImageBytes',
    'requestImagePixelBudget',
    'requestImageMaxBytes',
  ]) {
    patch[field] = positiveNumber(state[field])
  }
  const budgets = {}
  for (const level of THINKING_BUDGET_LEVELS) {
    const value = positiveNumber(state.thinkingBudgets[level])
    if (typeof value === 'number') budgets[level] = value
  }
  patch.thinkingBudgets = Object.keys(budgets).length > 0 ? budgets : null
  if (state.retryMode === '') {
    patch.retryPolicy = null
  } else {
    const policy = { mode: state.retryMode }
    if (state.retryMode === 'normal') {
      const retries = positiveNumber(state.maxRetries, true)
      if (typeof retries === 'number') policy.maxRetries = retries
    }
    patch.retryPolicy = policy
  }
  return patch
}

/** A positive integer from an input's text, or `null` to clear the field. */
export function positiveNumber(value, allowZero = false) {
  const source = String(value === undefined || value === null ? '' : value).trim()
  if (source === '') return null
  const parsed = Number(source)
  if (!Number.isFinite(parsed)) return null
  if (allowZero ? parsed < 0 : parsed <= 0) return null
  return Math.round(parsed)
}

// ---------------------------------------------------------------------------
// built-in DeepSeek route (llm-deepseek has its own vocabulary)
// ---------------------------------------------------------------------------

/** Thinking switches and reasoning levels the DeepSeek adapter accepts. */
export const DEEPSEEK_THINKING = ['enabled', 'disabled']
export const DEEPSEEK_EFFORTS = ['off', 'low', 'high', 'max']

/** Editor state for the built-in route, read out of its stored section. */
export function readDeepseekAdvanced(profile) {
  const source = profile !== null && typeof profile === 'object' ? profile : {}
  const retry = source.retryPolicy !== null && typeof source.retryPolicy === 'object' ? source.retryPolicy : {}
  return {
    thinking: typeof source.thinking === 'string' ? source.thinking : '',
    reasoningEffort: typeof source.reasoningEffort === 'string' ? source.reasoningEffort : '',
    maxTokens: numberText(source.maxTokens),
    defaultContextWindow: numberText(source.defaultContextWindow),
    streamIdleTimeoutMs: numberText(source.streamIdleTimeoutMs),
    retryMode: typeof retry.mode === 'string' ? retry.mode : '',
    maxRetries: numberText(retry.maxRetries),
  }
}

/** How many declarations a DeepSeek editor state carries. */
export function deepseekCount(state) {
  if (state === undefined || state === null) return 0
  let count = 0
  if (state.thinking !== '') count += 1
  if (state.reasoningEffort !== '') count += 1
  if (state.maxTokens !== '') count += 1
  if (state.defaultContextWindow !== '') count += 1
  if (state.streamIdleTimeoutMs !== '') count += 1
  if (state.retryMode !== '' || state.maxRetries !== '') count += 1
  return count
}

/** Editor state → the `advanced` patch the DeepSeek save merges. */
export function buildDeepseekPatch(state) {
  const patch = {
    thinking: state.thinking === '' ? null : state.thinking,
    reasoningEffort: state.reasoningEffort === '' ? null : state.reasoningEffort,
    maxTokens: positiveNumber(state.maxTokens),
    defaultContextWindow: positiveNumber(state.defaultContextWindow),
    streamIdleTimeoutMs: positiveNumber(state.streamIdleTimeoutMs),
  }
  if (state.retryMode === '') {
    patch.retryPolicy = null
  } else {
    const policy = { mode: state.retryMode }
    if (state.retryMode === 'normal') {
      const retries = positiveNumber(state.maxRetries, true)
      if (typeof retries === 'number') policy.maxRetries = retries
    }
    patch.retryPolicy = policy
  }
  return patch
}

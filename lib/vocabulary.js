/**
 * dsh-provider-studio — Host vocabulary.
 *
 * README: every constant the rest of the Host half names — settings namespaces,
 * the built-in DeepSeek endpoint facts, the pi-ai protocol enum, and the compat
 * switch catalogue copied from `dsh-llm-pi-ai`. Pure data only: if you need a
 * function, it belongs in profile/models/probe/routes.
 *
 * The DeepSeek block is deliberately separate from the pi-ai block: the built-in
 * adapter is NOT a pi-ai provider. It speaks Anthropic Messages against
 * `https://api.deepseek.com/anthropic` and lists models on the official root.
 */

// --- settings namespaces ----------------------------------------------------

/** The pi-ai providers section this panel edits. */
export const LLM_NS = 'llm-pi-ai'

/** The built-in DeepSeek adapter: a separate entry, not a pi-ai provider. */
export const DEEPSEEK_NS = 'llm-deepseek'

// --- built-in DeepSeek adapter facts ---------------------------------------

/** Pseudo-protocol shown in the panel for the built-in row. */
export const DEEPSEEK_API = 'deepseek-official'

/** Anthropic-Messages is the protocol the real adapter speaks. */
export const DEEPSEEK_PROTOCOL = 'anthropic-messages'

/** Official chat root (the docs' base). */
export const DEEPSEEK_OFFICIAL_BASE = 'https://api.deepseek.com'

/** Default Messages base: the SDK appends `/v1/messages` to it. */
export const DEEPSEEK_ANTHROPIC_BASE = 'https://api.deepseek.com/anthropic'

/** Where the adapter's own model-discovery call goes. */
export const DEEPSEEK_MODELS_URL = 'https://api.deepseek.com/models'

/** Credential reference the built-in adapter reads when none is configured. */
export const DEEPSEEK_DEFAULT_REF = 'DEEPSEEK_API_KEY'

/** Real bundle-patch entry name; a wrong name makes the pasted YAML a no-op. */
export const DEEPSEEK_EXPORT_NAME = '@deepseek-ai/dsh-llm-deepseek-api-key'

/** Verified name for the pi-ai entry (already correct in v1.1). */
export const PI_AI_EXPORT_NAME = '@deepseek-ai/dsh-llm-pi-ai'

// --- route grammar ----------------------------------------------------------

/** Legal provider route characters (the pi-ai schema's own grammar). */
export const ROUTE_PATTERN = /^[A-Za-z0-9_.-]+$/

/** Reference grammar the credential service accepts. */
export const REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

// --- protocols --------------------------------------------------------------

/** Protocols the llm-pi-ai adapter understands. */
export const PROTOCOLS = Object.freeze(['openai-completions', 'openai-responses', 'anthropic-messages'])

/** Thinking levels the adapter accepts, in escalation order. */
export const THINKING_LEVELS = Object.freeze(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])

/** Transports pi-ai accepts. */
export const TRANSPORTS = Object.freeze(['auto', 'sse', 'websocket', 'websocket-cached'])

/** Cache retention policies pi-ai accepts. */
export const CACHE_RETENTIONS = Object.freeze(['none', 'short', 'long'])

/** Input modalities the model editor offers. */
export const MODALITIES = Object.freeze(['text', 'image'])

/** Thinking budget levels pi-ai accepts. */
export const THINKING_BUDGETS = Object.freeze(['minimal', 'low', 'medium', 'high'])

/** Enum-valued compat switches and the spellings each accepts. */
export const COMPAT_ENUM = Object.freeze({
  maxTokensField: Object.freeze(['max_completion_tokens', 'max_tokens']),
  thinkingFormat: Object.freeze([
    'openai', 'deepseek', 'openrouter', 'together', 'baseten', 'zai', 'qwen',
    'chat-template', 'qwen-chat-template', 'string-thinking', 'ant-ling',
  ]),
  thinkingTokenBudgetField: Object.freeze(['thinking_token_budget', 'thinking_budget', 'thinking_budget_tokens']),
  cacheControlFormat: Object.freeze(['anthropic']),
})

/** Numeric compat switches. */
export const COMPAT_NUMBER = Object.freeze(['vllmPriority'])

/** Compat switches that take a free-form JSON object. */
export const COMPAT_JSON = Object.freeze(['chatTemplateKwargs', 'chatTemplateArgs'])

/** The switches each wire protocol offers (pi-ai's own gate). */
export const COMPAT_BY_PROTOCOL = Object.freeze({
  'openai-completions': Object.freeze([
    'supportsStore', 'supportsDeveloperRole', 'supportsReasoningEffort',
    'supportsUsageInStreaming', 'supportsFinishReason', 'maxTokensField',
    'requiresToolResultName', 'requiresAssistantAfterToolResult', 'requiresThinkingAsText',
    'requiresReasoningContentOnAssistantMessages', 'thinkingFormat', 'chatTemplateKwargs',
    'chatTemplateArgs', 'supportsThinkingTokenBudget', 'thinkingTokenBudgetField',
    'vllmPriority', 'supportsStrictMode', 'cacheControlFormat', 'supportsLongCacheRetention',
  ]),
  'openai-responses': Object.freeze([
    'supportsDeveloperRole', 'supportsMaxOutputTokens', 'supportsStrictMode',
    'supportsLongCacheRetention',
  ]),
  'anthropic-messages': Object.freeze([
    'supportsEagerToolInputStreaming', 'supportsLongCacheRetention', 'supportsCacheControlOnTools',
    'supportsTemperature', 'forceAdaptiveThinking', 'allowEmptySignature', 'supportsStrictTools',
  ]),
})

/** llm-deepseek's own route knobs: a different vocabulary from pi-ai. */
export const DEEPSEEK_THINKING = Object.freeze(['enabled', 'disabled'])
export const DEEPSEEK_EFFORTS = Object.freeze(['off', 'low', 'high', 'max'])

/** Route-level fields the advanced editor owns; every other stored key is
 *  left exactly as the user wrote it. */
export const ADVANCED_KEYS = Object.freeze([
  'headers', 'compat', 'reasoning', 'defaultContextWindow', 'defaultMaxTokens', 'defaultInput',
  'transport', 'cacheRetention', 'timeoutMs', 'websocketConnectTimeoutMs', 'streamIdleTimeoutMs',
  'maxRequestImageBytes', 'requestImagePixelBudget', 'requestImageMaxBytes',
  'maxRequestImages', 'imageOffloadCountQuantum', 'retryPolicy', 'thinkingBudgets',
])

// --- probe wire paths -------------------------------------------------------

/** Path the adapter's SDK appends to the configured baseURL, per protocol. */
export const MESSAGE_PATHS = Object.freeze({
  'openai-completions': '/chat/completions',
  'openai-responses': '/responses',
  'anthropic-messages': '/v1/messages',
})

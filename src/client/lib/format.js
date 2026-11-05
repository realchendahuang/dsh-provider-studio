/** Formatting, protocol labels and the small constants shared by the views. */

export const PROTO_LABEL_KEYS = {
  'openai-completions': 'protoOpenaiCompat',
  'openai-responses': 'protoOpenaiResponses',
  'anthropic-messages': 'protoAnthropicMessages',
  'deepseek-official': 'protoDeepseek',
}

export const PROTO_FALLBACK = ['openai-completions', 'openai-responses', 'anthropic-messages']

/** Stable empty result so the picker's reset effect does not loop. */
export const EMPTY_DISCOVER = { models: [] }

const PROTO_ENDPOINT = {
  'openai-completions': '/v1/chat/completions',
  'anthropic-messages': '/v1/messages',
  'openai-responses': '/v1/responses',
}

export function hostOf(url) {
  if (!url) return ''
  try {
    const text = String(url)
    return text.replace(/^https?:\/\//i, '').split('/')[0].replace(/[?#].*$/, '') || text
  } catch {
    return String(url)
  }
}

export function parseNumber(value) {
  const text = String(value === undefined || value === null ? '' : value).trim()
  if (!text) return undefined
  const parsed = Number(text)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

export function protoLabel(api, t) {
  const key = PROTO_LABEL_KEYS[api]
  return key ? t(key) : (api || '—')
}

export function protoOption(api, t) {
  const hint = PROTO_ENDPOINT[api]
  const label = protoLabel(api, t)
  return hint ? `${label} (${hint})` : label
}

/**
 * Anthropic's SDK appends `/v1/messages` to whatever base URL the profile
 * holds, so a trailing `/v1` here would be doubled into `/v1/v1/messages`.
 * Only that exact mistake earns a hint; nothing else gets a nag.
 */
export function anthropicBaseHint(api, baseURL, t) {
  if (api !== 'anthropic-messages') return undefined
  return /\/v1\/?$/i.test(String(baseURL || '').trim()) ? t('anthropicBaseHint') : undefined
}

export function contextLabel(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return ''
  if (number >= 1000000) {
    const millions = Math.round((number / 1000000) * 10) / 10
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`
  }
  if (number >= 1000) return `${Math.round(number / 1000)}K`
  return String(number)
}

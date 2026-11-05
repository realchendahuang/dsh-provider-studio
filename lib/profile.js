/**
 * dsh-provider-studio — Host field sanitizers.
 *
 * README: the panel must never write a profile the adapter refuses to load, so
 * every advanced-editor / compat / reasoning field is validated here before it
 * reaches the settings document. Two shapes exist because the built-in DeepSeek
 * adapter has a different vocabulary from pi-ai:
 *
 *   - `applyAdvanced(next, patch)`        → pi-ai provider profiles
 *   - `applyDeepseekAdvanced(next, patch)` → the `llm-deepseek` config
 *
 * `null` removes a field, absent keys are left alone, and every rejection is a
 * `ValidationError` carrying the code the Client shows (contract §4): numbers →
 * INVALID_NUMBER, enums → INVALID_ENUM, retry policies → INVALID_RETRY,
 * reasoning → INVALID_REASONING, compat switches → INVALID_COMPAT.
 *
 * `params.label` is the display name the Client's `err.INVALID_NUMBER` /
 * `err.INVALID_ENUM` / `err.INVALID_COMPAT` templates interpolate as `{label}`.
 */

import { ValidationError } from './errors.js'
import { text } from './util.js'
import {
  ADVANCED_KEYS,
  CACHE_RETENTIONS,
  COMPAT_BY_PROTOCOL,
  COMPAT_ENUM,
  COMPAT_JSON,
  COMPAT_NUMBER,
  DEEPSEEK_EFFORTS,
  DEEPSEEK_THINKING,
  MODALITIES,
  THINKING_BUDGETS,
  THINKING_LEVELS,
  TRANSPORTS,
} from './vocabulary.js'

/** Integer helper shared by every numeric knob. */
export function wholeNumber(value, label, { allowZero = false } = {}) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new ValidationError('INVALID_NUMBER', `${label} 需要整数`, { params: { label } })
  }
  if (parsed < (allowZero ? 0 : 1)) {
    throw new ValidationError('INVALID_NUMBER', `${label} 需要正数`, { params: { label } })
  }
  return parsed
}

/** `false`, an ordered level→wire map, or undefined for "inherit the catalog". */
export function sanitizeReasoningEfforts(value) {
  if (value === false) return false
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('INVALID_REASONING', 'reasoningEfforts 必须是对象或 false', {
      params: { field: 'reasoningEfforts' },
    })
  }
  const out = {}
  for (const [level, wire] of Object.entries(value)) {
    if (!THINKING_LEVELS.includes(level)) {
      throw new ValidationError('INVALID_REASONING', `未知的思考等级：${level}`, { params: { level } })
    }
    const spelling = text(wire).trim()
    if (spelling === '') {
      if (level !== 'off') {
        throw new ValidationError('INVALID_REASONING', `思考等级 ${level} 需要发送值`, { params: { level } })
      }
      out[level] = null
      continue
    }
    out[level] = spelling
  }
  if (Object.keys(out).length === 0) {
    throw new ValidationError('INVALID_REASONING', 'reasoningEfforts 不能为空', {
      params: { field: 'reasoningEfforts' },
    })
  }
  if (!Object.keys(out).some((level) => level !== 'off')) {
    throw new ValidationError('INVALID_REASONING', 'reasoningEfforts 至少要有一个 off 以外的等级', {
      params: { field: 'reasoningEfforts' },
    })
  }
  return out
}

/** One protocol's compat switches; `filter` drops what the protocol refuses
 *  instead of throwing, which is what a protocol change needs. */
export function sanitizeCompat(value, api, { filter = false } = {}) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('INVALID_COMPAT', 'compat 必须是对象', { params: { label: 'compat', field: 'compat' } })
  }
  const offered = new Set(COMPAT_BY_PROTOCOL[api] || [])
  const out = {}
  for (const [field, raw] of Object.entries(value)) {
    if (!offered.has(field)) {
      if (filter) continue
      throw new ValidationError('INVALID_COMPAT', `协议 ${api || '（未设置）'} 不支持兼容开关：${field}`, {
        params: { label: field, field, api: api || '' },
      })
    }
    if (Array.isArray(COMPAT_ENUM[field])) {
      const spelling = text(raw)
      if (!COMPAT_ENUM[field].includes(spelling)) {
        throw new ValidationError('INVALID_COMPAT', `兼容开关 ${field} 的取值无效：${spelling}`, {
          params: { label: field, field },
        })
      }
      out[field] = spelling
    } else if (COMPAT_NUMBER.includes(field)) {
      out[field] = wholeNumber(raw, `兼容开关 ${field}`, { allowZero: true })
    } else if (COMPAT_JSON.includes(field)) {
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new ValidationError('INVALID_COMPAT', `兼容开关 ${field} 需要一个对象`, {
          params: { label: field, field },
        })
      }
      out[field] = raw
    } else {
      if (typeof raw !== 'boolean') {
        throw new ValidationError('INVALID_COMPAT', `兼容开关 ${field} 需要布尔值`, {
          params: { label: field, field },
        })
      }
      out[field] = raw
    }
  }
  return Object.keys(out).length === 0 ? undefined : out
}

/** Merge the advanced editor's patch into a pi-ai profile in place. */
export function applyAdvanced(next, patch) {
  if (patch === null || patch === undefined || typeof patch !== 'object') return next
  const api = text(next.api)
  for (const key of ADVANCED_KEYS) {
    if (!Object.hasOwn(patch, key)) continue
    const value = patch[key]
    if (value === null || value === undefined) {
      delete next[key]
      continue
    }
    if (key === 'headers') {
      if (typeof value !== 'object' || Array.isArray(value)) {
        throw new ValidationError('INVALID_ENUM', '请求头必须是对象', {
          params: { label: '请求头', field: 'headers' },
        })
      }
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
      if (!THINKING_LEVELS.includes(level)) {
        throw new ValidationError('INVALID_REASONING', `未知的思考等级：${level}`, { params: { level, label: '思考等级' } })
      }
      next.reasoning = level
      continue
    }
    if (key === 'defaultInput') {
      if (!Array.isArray(value)) {
        throw new ValidationError('INVALID_ENUM', '缺省输入模态必须是数组', {
          params: { label: '缺省输入模态', field: 'defaultInput' },
        })
      }
      const modalities = value.map((item) => text(item)).filter((item) => MODALITIES.includes(item))
      if (modalities.length === 0) delete next.defaultInput
      else next.defaultInput = modalities
      continue
    }
    if (key === 'transport') {
      const transport = text(value)
      if (!TRANSPORTS.includes(transport)) {
        throw new ValidationError('INVALID_ENUM', `不支持的传输方式：${transport}`, {
          params: { label: '传输方式', field: 'transport', value: transport },
        })
      }
      next.transport = transport
      continue
    }
    if (key === 'cacheRetention') {
      const retention = text(value)
      if (!CACHE_RETENTIONS.includes(retention)) {
        throw new ValidationError('INVALID_ENUM', `不支持的缓存保留策略：${retention}`, {
          params: { label: '缓存保留策略', field: 'cacheRetention', value: retention },
        })
      }
      next.cacheRetention = retention
      continue
    }
    if (key === 'retryPolicy') {
      const policy = mergeRetryPolicy(next.retryPolicy, value, 'INVALID_RETRY')
      next.retryPolicy = policy
      continue
    }
    if (key === 'thinkingBudgets') {
      if (typeof value !== 'object' || Array.isArray(value)) {
        throw new ValidationError('INVALID_NUMBER', '思考预算必须是对象', {
          params: { label: '思考预算', field: 'thinkingBudgets' },
        })
      }
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

/** Retry-policy patch shared by the pi-ai and DeepSeek advanced editors. */
function mergeRetryPolicy(existing, value, code) {
  const mode = text(value && value.mode)
  if (mode !== 'normal' && mode !== 'always') {
    throw new ValidationError(code, '重试策略需要 mode: normal 或 always', { params: { field: 'retryPolicy' } })
  }
  const base = existing !== null && typeof existing === 'object' ? existing : {}
  const policy = { ...base, mode }
  if (mode === 'normal') {
    if (value.maxRetries !== null && value.maxRetries !== undefined) {
      policy.maxRetries = wholeNumber(value.maxRetries, '最大重试次数', { allowZero: true })
    }
  } else {
    delete policy.maxRetries
    delete policy.retryableCodes
  }
  return policy
}

/** Merge the advanced editor's patch into the built-in DeepSeek config. */
export function applyDeepseekAdvanced(next, patch) {
  if (patch === null || patch === undefined || typeof patch !== 'object') return next
  const setEnum = (key, allowed, label) => {
    if (!Object.hasOwn(patch, key)) return
    const value = patch[key]
    if (value === null || value === undefined) {
      delete next[key]
      return
    }
    const spelling = text(value)
    if (!allowed.includes(spelling)) {
      throw new ValidationError('INVALID_ENUM', `${label} 只能是 ${allowed.join(' / ')}`, {
        params: { label, field: key, value: spelling },
      })
    }
    next[key] = spelling
  }
  setEnum('thinking', DEEPSEEK_THINKING, '思考模式')
  setEnum('reasoningEffort', DEEPSEEK_EFFORTS, '推理等级')
  for (const key of ['maxTokens', 'defaultContextWindow', 'streamIdleTimeoutMs']) {
    if (!Object.hasOwn(patch, key)) continue
    const value = patch[key]
    if (value === null || value === undefined) {
      delete next[key]
      continue
    }
    next[key] = wholeNumber(value, key)
  }
  if (Object.hasOwn(patch, 'retryPolicy')) {
    const value = patch.retryPolicy
    if (value === null || value === undefined) {
      delete next.retryPolicy
    } else {
      next.retryPolicy = mergeRetryPolicy(next.retryPolicy, value, 'INVALID_RETRY')
    }
  }
  return next
}

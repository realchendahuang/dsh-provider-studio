/**
 * dsh-provider-studio — Host argument validators.
 *
 * README: small pure checks that turn untrusted RPC arguments into either
 * `null` (legal) or the failure envelope itself. They live apart from the
 * service so both write entry points (`saveProvider` / `createProvider`) and
 * the probe path apply exactly the same rules — v1.1 validated `api`/`baseURL`
 * on create only, then accepted anything on save.
 */

import { ValidationError, fail } from './errors.js'
import { PROTOCOLS, REF_PATTERN, ROUTE_PATTERN } from './vocabulary.js'
import { isReservedKey, text } from './util.js'

/** `api` must be one of the protocols the pi-ai adapter understands. */
export function checkProtocol(api) {
  const value = text(api)
  if (!PROTOCOLS.includes(value)) {
    return fail('INVALID_API', `不支持的协议：${value || '（未设置）'}`, {
      params: { api: value || '（未设置）' },
    })
  }
  return null
}

/** `baseURL` must be an absolute http(s) URL; empty means "adapter default". */
export function checkBaseURL(baseURL, { optional = true } = {}) {
  const value = text(baseURL).trim()
  if (value === '') {
    return optional ? null : fail('INVALID_BASE_URL', '缺少 baseURL', { params: { field: 'baseURL' } })
  }
  if (!/^https?:\/\//i.test(value)) {
    return fail('INVALID_BASE_URL', 'baseURL 必须以 http:// 或 https:// 开头', {
      params: { field: 'baseURL' },
    })
  }
  return null
}

/** Credential references must match the credential service's own grammar. */
export function checkCredentialName(ref, { optional = true } = {}) {
  const value = text(ref).trim()
  if (value === '') {
    return optional
      ? null
      : fail('INVALID_CREDENTIAL_NAME', '凭据名不能为空', { params: { name: '(空)', field: 'apiKeyEnv' } })
  }
  if (!REF_PATTERN.test(value)) {
    return fail('INVALID_CREDENTIAL_NAME', `无效的凭据名：${value}`, { params: { name: value, ref: value } })
  }
  return null
}

/**
 * Validate a route argument.
 *
 * Returns the failure envelope for an empty route (MISSING_ROUTE) or a route
 * that is malformed / reserved (INVALID_ROUTE), else null. `__proto__`,
 * `prototype` and `constructor` are rejected up front because those names would
 * silently write to a dictionary's prototype instead of adding a key.
 */
export function checkRouteName(route) {
  const value = text(route).trim()
  if (value === '') return fail('MISSING_ROUTE', '缺少 route')
  if (isReservedKey(value)) {
    return fail('INVALID_ROUTE', `route 不能使用保留字：${value}`, { params: { route: value } })
  }
  if (!ROUTE_PATTERN.test(value)) {
    return fail('INVALID_ROUTE', 'route 只能包含字母、数字、点、下划线和横线', { params: { route: value } })
  }
  return null
}

/** Throw the same checks where a thrown ValidationError reads better. */
export function assertProtocol(api) {
  const failure = checkProtocol(api)
  if (failure) throw new ValidationError(failure.code, failure.message, { params: failure.params })
  return text(api)
}

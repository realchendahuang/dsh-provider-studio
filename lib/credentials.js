/**
 * dsh-provider-studio — Host credentials façade.
 *
 * README: this plugin never stores a key. The authoritative copy stays in the
 * DSH credentials service under the provider's `apiKeyEnv` reference; the Host
 * only describes it (configured / source / writable) and, when the user
 * explicitly asks through `revealKey`, resolves one single reference.
 *
 * `resolveSecret` is the ONLY read of a plaintext value in the whole Host half.
 * It is reached from exactly two places: `revealKey` (user pressed 显示/复制) and
 * the probe path (`testModel` / `discoverModels` need the key to make the
 * request). Never from a draft request: the draft branch accepts only the key
 * the caller pasted (contract §3.3, the v1.2 security fix).
 */

import { ValidationError } from './errors.js'
import { REF_PATTERN } from './vocabulary.js'
import { errorMessage, text, warn } from './util.js'

/** The credentials service, if the profile has one. */
export function credentialsOf(ctx) {
  try {
    return ctx.get('credentials')
  } catch {
    return undefined
  }
}

/** Reference grammar the credential service accepts. */
export { REF_PATTERN }

/** Derive the credential name a new provider stores its key under. */
export function deriveRef(route) {
  const slug = text(route)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `${slug || 'PROVIDER'}_API_KEY`
}

/** Describe a reference without ever reading its value. */
export async function describeSecret(ctx, ref) {
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
    warn(ctx, `credentials.describe(${ref}) failed: ${errorMessage(error)}`)
    return { configured: false, writable: false, hint: 'describe failed' }
  }
  let info = result
  if (info !== null && typeof info === 'object' && !('configured' in info) && info[ref] !== undefined) info = info[ref]
  if (info === null || typeof info !== 'object') {
    return { configured: false, writable: false, hint: 'unexpected describe shape' }
  }
  return { configured: info.configured === true, source: info.source, writable: info.writable !== false, hint: 'ok' }
}

/** Resolve ONE reference to its plaintext value; null when it is not there. */
export async function resolveSecret(ctx, ref) {
  if (!ref) return null
  const credentials = credentialsOf(ctx)
  if (credentials === undefined || credentials === null) return null
  if (typeof credentials.resolve !== 'function') return null
  try {
    const resolved = await credentials.resolve(ref)
    if (resolved !== null && typeof resolved === 'object' && typeof resolved.value === 'string') {
      return resolved.value
    }
  } catch (error) {
    warn(ctx, `credentials.resolve(${ref}) failed: ${errorMessage(error)}`)
  }
  return null
}

/** Write (or clear, when `value` is empty) one reference. */
export async function writeSecret(ctx, ref, value) {
  const credentials = credentialsOf(ctx)
  if (credentials === undefined || credentials === null) {
    throw new ValidationError('CREDENTIALS_UNAVAILABLE', '凭据服务不可用', { params: { ref } })
  }
  if (value === '') {
    if (typeof credentials.unset === 'function') {
      try {
        await credentials.unset(ref)
      } catch {
        /* absent ref is not an error */
      }
      return
    }
    return
  }
  if (typeof credentials.set !== 'function') {
    throw new ValidationError('CREDENTIALS_UNAVAILABLE', '凭据服务不支持写入', { params: { ref } })
  }
  try {
    await credentials.set(ref, value)
  } catch (error) {
    throw new ValidationError('CREDENTIAL_WRITE_FAILED', `写入凭据失败：${errorMessage(error)}`, {
      detail: errorMessage(error),
      params: { ref },
      cause: error,
    })
  }
}

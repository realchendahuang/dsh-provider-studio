/** Failure normalization shared by the Remote bridge and the views.
 *
 * The Host answers failures with `{ ok: false, code, message, params, detail }`
 * (the old `error` string survives one release for compatibility). Everything
 * that crosses the wire becomes an `Error` carrying `code`, `params` and
 * `detail`, so views can translate the stable code instead of parsing a
 * preformatted message.
 */

/** An Error with the machine-readable fields the RPC envelope carries. */
export class RpcFailure extends Error {
  constructor(code, message, params, detail) {
    super(message || '')
    this.name = 'RpcFailure'
    this.code = typeof code === 'string' ? code : ''
    this.params = params !== null && typeof params === 'object' ? params : undefined
    this.detail = typeof detail === 'string' && detail !== '' ? detail : undefined
  }
}

function textOf(value) {
  if (typeof value === 'string') return value
  if (value !== null && typeof value === 'object') {
    return typeof value.message === 'string' ? value.message : ''
  }
  return ''
}

/** Turn any rejected/captured value into the client-facing Error shape. */
export function normalizeFailure(payload) {
  if (payload instanceof Error) {
    if (typeof payload.code === 'string' && payload.code !== '') return payload
    const failure = new Error(payload.message || '')
    failure.name = 'RpcFailure'
    failure.code = 'UNKNOWN'
    return failure
  }
  if (payload === null || payload === undefined) return new RpcFailure('UNKNOWN', '')
  if (typeof payload !== 'object') return new RpcFailure('UNKNOWN', textOf(String(payload)))
  const code = typeof payload.code === 'string' && payload.code !== '' ? payload.code : 'UNKNOWN'
  const message = textOf(payload) || textOf(payload.error)
  const detail = typeof payload.detail === 'string' ? payload.detail : undefined
  const params = payload.params !== null && typeof payload.params === 'object'
    ? payload.params
    : undefined
  return new RpcFailure(code, message, params, detail)
}

/** The locale key one failure code maps to. */
export function errorKey(error) {
  const code = error !== null && typeof error === 'object' && typeof error.code === 'string'
    ? error.code
    : ''
  return code === '' ? 'err.UNKNOWN' : `err.${code}`
}

/**
 * Human text for a failure: the translated `err.<CODE>` copy when the locale
 * dictionary knows the code (with `{param}` interpolation), otherwise the
 * message the Host sent, otherwise the generic unknown-error copy.
 */
export function errorText(error, t) {
  const translate = typeof t === 'function' ? t : null
  if (error === null || error === undefined) {
    return translate !== null ? translate('err.UNKNOWN') : ''
  }
  if (typeof error === 'string') return error
  if (translate !== null) {
    const key = errorKey(error)
    const params = error.params !== undefined ? error.params : {}
    const translated = translate(key, params)
    // A client-side generic error carries a more specific message than the
    // dictionary's "unknown error" copy, so that one keeps its own text.
    const generic = key === 'err.UNKNOWN'
    if (translated !== key && (!generic || typeof error.message !== 'string' || error.message === '')) {
      return translated
    }
  }
  if (typeof error.message === 'string' && error.message !== '') return error.message
  if (typeof error.detail === 'string' && error.detail !== '') return error.detail
  return translate !== null ? translate('err.UNKNOWN') : ''
}

/** Build one client-side failure (used for transport-level mistakes). */
export function failure(code, message, params) {
  return new RpcFailure(code, message, params)
}

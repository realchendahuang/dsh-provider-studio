/**
 * dsh-provider-studio — Host error taxonomy.
 *
 * README: every remote method answers the frozen v1.2 envelope —
 *
 *   success: { ok: true, ...payload }
 *   failure: { ok: false, code, message, params?, detail? }
 *
 * `code` is the stable machine key the Client i18n table maps through
 * `err.<CODE>`; `message` stays a Chinese fallback for logs and for codes the
 * Client does not know yet; `error` duplicates `message` so v1.1 clients that
 * only ever read `result.error` keep working until v1.3 removes it.
 *
 * Pure validators (profile/models/validate/routes) throw `ValidationError` with
 * the code attached, so the service layer never has to string-match messages to
 * decide which failure it is looking at. `toFailure` is the single conversion
 * point from a thrown value to the wire envelope.
 *
 * Diagnostics (`endpoint`, `status`, `latency`, ...) ride along on failures that
 * the probe dialogs render; they are additive and never replace `code`/`message`.
 */

/** Every machine code the Host may emit — exactly the frozen contract §4 set. */
export const ERROR_CODES = Object.freeze([
  'MISSING_ROUTE',
  'UNKNOWN_ROUTE',
  'INVALID_ROUTE',
  'ROUTE_EXISTS',
  'BUILTIN_ROUTE',
  'INVALID_BASE_URL',
  'INVALID_API',
  'INVALID_MODEL_ID',
  'INVALID_CREDENTIAL_NAME',
  'INVALID_NUMBER',
  'INVALID_ENUM',
  'INVALID_COMPAT',
  'INVALID_RETRY',
  'INVALID_REASONING',
  'SETTINGS_UNAVAILABLE',
  'SETTINGS_READ_ONLY',
  'SETTINGS_CONFLICT',
  'CREDENTIALS_UNAVAILABLE',
  'CREDENTIAL_WRITE_FAILED',
  'EXPORT_EMPTY',
  'EXPORT_FAILED',
  'DISCOVER_EMPTY',
  'DISCOVER_NOT_JSON',
  'DISCOVER_HTTP',
  'PROBE_HTTP',
  'PROBE_FAILED',
  'SAVE_VERIFY_FAILED',
  'UNKNOWN',
])

/** Keys `fail()` owns itself; everything else in `extra` is diagnostic data. */
const ENVELOPE_KEYS = new Set(['ok', 'code', 'message', 'error', 'params', 'detail'])

/** A validation failure with a stable code, thrown by the pure sanitizers. */
export class ValidationError extends Error {
  constructor(code, message, { params, detail, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'ValidationError'
    this.code = code
    if (params !== undefined) this.params = params
    if (detail !== undefined) this.detail = detail
  }
}

/**
 * Build the failure envelope.
 *
 * @param {string} code stable machine code from ERROR_CODES
 * @param {string} message Chinese fallback text
 * @param {{ params?: Record<string, string|number>, detail?: string } & Record<string, unknown>} [extra]
 *   `params`/`detail` go into the contract fields; any other key is kept as a
 *   diagnostic (endpoint, status, latency, ...).
 */
export function fail(code, message, extra = {}) {
  const out = { ok: false, code, message, error: message }
  const source = extra !== null && typeof extra === 'object' ? extra : {}
  if (source.params !== undefined) out.params = source.params
  if (source.detail !== undefined) out.detail = source.detail
  for (const [key, value] of Object.entries(source)) {
    if (ENVELOPE_KEYS.has(key)) continue
    if (value !== undefined) out[key] = value
  }
  return out
}

/** Build the success envelope. */
export function ok(payload = {}) {
  return { ok: true, ...payload }
}

/** Convert any thrown value into the failure envelope. */
export function toFailure(error) {
  if (error instanceof ValidationError) {
    return fail(error.code, error.message, { params: error.params, detail: error.detail })
  }
  const message = error !== null && error !== undefined && typeof error.message === 'string'
    ? error.message
    : String(error)
  return fail('UNKNOWN', '操作失败', { detail: message })
}

/** True when a value is the failure envelope (used while propagating internals). */
export function isFailure(value) {
  return value !== null && typeof value === 'object' && value.ok === false
}

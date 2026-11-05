/**
 * dsh-provider-studio — Host small helpers.
 *
 * README: the handful of primitives every other lib module touches. Nothing in
 * here knows about the RPC contract, so it stays dependency-free on purpose.
 */

/** Coerce to string without ever throwing (the service reads untrusted args). */
export const text = (value) => (typeof value === 'string' ? value : '')

/** Deep copy into null-prototype objects.
 *
 * The settings guard's `isPlainObject` check accepts `Object.prototype` or
 * `null`, and rejects cross-realm/sandbox literals; null-prototype copies are
 * the shape every write path has to hand it.
 */
export function makeHostPlain(value) {
  if (Array.isArray(value)) return value.map((item) => makeHostPlain(item))
  if (value !== null && typeof value === 'object') {
    const out = Object.create(null)
    for (const key of Object.keys(value)) out[key] = makeHostPlain(value[key])
    return out
  }
  return value
}

/** Own-property lookup that never walks the prototype chain. */
export const hasOwn = (dict, key) => dict !== null && typeof dict === 'object' && Object.hasOwn(dict, key)

/** Object-like guard for untrusted RPC args. */
export const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/** Route names that must never be used as dictionary keys (prototype pollution). */
export const RESERVED_KEYS = Object.freeze(['__proto__', 'prototype', 'constructor'])

/** Is a route/header name a prototype-pollution hazard? */
export const isReservedKey = (key) => RESERVED_KEYS.includes(key)

/** The error's own message, or a String() fallback for thrown non-Errors. */
export const errorMessage = (error) => (
  error !== null && error !== undefined && typeof error.message === 'string'
    ? error.message
    : String(error)
)

/**
 * Log a warning through the Cordis context.
 *
 * `ctx.get('logger')` is NOT a service — it is always undefined, which is why
 * v1.1 logged nothing at all. `ctx.logger` is the object every other DSH plugin
 * uses (`ctx.logger.warn(...)`), so this only ever warns; logging must never
 * fail a handler.
 */
export function warn(ctx, message) {
  try {
    const logger = ctx !== null && ctx !== undefined ? ctx.logger : undefined
    if (logger !== null && logger !== undefined && typeof logger.warn === 'function') {
      logger.warn(`[dsh-provider-studio] ${message}`)
    }
  } catch {
    /* logging must never fail a handler */
  }
}

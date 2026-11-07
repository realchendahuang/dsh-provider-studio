/**
 * dsh-provider-studio — Host HTTP probe primitives.
 *
 * README: 「测试」 and 「拉取模型」 have to hit the same URL with the same headers
 * the adapter itself would, otherwise a provider that works in DSH is reported
 * as broken. Both rules below are copied from `dsh-llm-pi-ai`:
 *
 *  - messages: the configured `baseURL` is passed to the SDK unchanged and the
 *    SDK appends its path, so Anthropic lands on `{baseURL}/v1/messages`;
 *  - listing: pi-ai normalizes one trailing `/v1` for Anthropic only, because
 *    gateway docs publish both spellings of the same root.
 *
 * The built-in DeepSeek adapter additionally speaks Anthropic Messages (see
 * routes.js), so it reuses `messagesUrl` with `api = 'anthropic-messages'`.
 *
 * Everything here is pure except `readBodyCapped`, which is the only guard
 * against an endpoint answering a discovery call with a multi-GB body.
 */

import { MESSAGE_PATHS } from './vocabulary.js'
import { isReservedKey, text } from './util.js'

/** Cap for a discovery response body (4 MiB is far above any model list). */
export const MAX_DISCOVERY_BYTES = 4 * 1024 * 1024

/** Cap for the model-test response body. The request asks for one token, so a
 *  body this large means the endpoint is broken; reading it whole used to let
 *  an endpoint push ~135 MiB of resident memory into the Host process. */
export const MAX_TEST_BYTES = 1024 * 1024

/** Redirect hops a probe follows before it gives up. */
export const MAX_PROBE_REDIRECTS = 5

/** Statuses `fetch` treats as redirects. */
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308])

/** A redirect the probe refused to follow; the service maps it to PROBE_REDIRECT. */
export class ProbeRedirectError extends Error {
  constructor(from, to, reason) {
    super(`probe redirect refused (${reason}): ${from} -> ${to}`)
    this.name = 'ProbeRedirectError'
    this.from = from
    this.to = to
    this.reason = reason
  }
}

/** Whether two URLs share protocol + host + port; malformed URLs never match. */
export function sameOrigin(a, b) {
  try {
    return new URL(a).origin === new URL(b).origin
  } catch {
    return false
  }
}

/**
 * `fetch` for provider probes that cannot hand a credential to another origin.
 *
 * README: plain `fetch` follows 3xx on its own; undici strips `authorization`
 * on a cross-origin hop but leaves other headers alone, so an endpoint could
 * bounce `x-api-key` (Anthropic Messages) to a third party. Follow redirects
 * manually and only within the configured origin; anything else becomes a
 * typed error so the service answers PROBE_REDIRECT instead of calling out.
 *
 * @param {string} url
 * @param {RequestInit} [init]
 * @returns {Promise<{ response: Response, url: string }>} final response and URL
 */
export async function probeFetch(url, init = {}) {
  let current = url
  for (let hop = 0; ; hop += 1) {
    const response = await fetch(current, { ...init, redirect: 'manual' })
    if (!REDIRECT_STATUS.has(response.status)) return { response, url: current }
    const location = response.headers?.get?.('location')
    if (typeof location !== 'string' || location === '') return { response, url: current }
    let next
    try {
      next = new URL(location, current).href
    } catch {
      return { response, url: current }
    }
    try {
      await response.body?.cancel?.()
    } catch {
      /* draining is best effort */
    }
    if (!sameOrigin(current, next)) throw new ProbeRedirectError(current, next, 'cross-origin')
    if (hop >= MAX_PROBE_REDIRECTS) throw new ProbeRedirectError(current, next, 'too many hops')
    current = next
  }
}

/** At most `limit` characters of a response body, for a diagnostic message. */
export async function readResponseSnippet(response, limit = 300) {
  try {
    return (await readBodyCapped(response, limit)).text
  } catch {
    return ''
  }
}


/** Drop trailing slashes so path appending never doubles a separator. */
export const trimmedBase = (value) => text(value).trim().replace(/\/+$/, '')

/** The adapter's messages endpoint for a baseURL + protocol. */
export function messagesUrl(baseURL, api) {
  const path = MESSAGE_PATHS[api] || MESSAGE_PATHS['openai-completions']
  return `${trimmedBase(baseURL)}${path}`
}

/**
 * The adapter's model-listing endpoint.
 *
 * v1.1.2 regression: the Anthropic root may be configured with or without a
 * trailing `/v1`; both spellings must produce exactly one `/v1/models`, never
 * `/v1/v1/models`. OpenAI-shaped protocols list at `{base}/models`.
 */
export function listingUrl(baseURL, api) {
  const base = trimmedBase(baseURL)
  if (api !== 'anthropic-messages') return `${base}/models`
  return `${base.endsWith('/v1') ? base.slice(0, -3) : base}/v1/models?limit=1000`
}

/** Auth headers each protocol's SDK would set on its own. */
export function authHeaders(api, key) {
  if (api === 'anthropic-messages') {
    return {
      'content-type': 'application/json',
      accept: 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    }
  }
  return { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${key}` }
}

/** Deployment headers from the profile, applied last so they win over defaults
 *  exactly the way the adapter's `requestHeaders` merge does. */
export function probeHeaders(profileHeaders, api, key) {
  const headers = authHeaders(api, key)
  if (profileHeaders === null || typeof profileHeaders !== 'object') return headers
  for (const [name, value] of Object.entries(profileHeaders)) {
    const header = text(name).trim()
    if (header === '' || typeof value !== 'string') continue
    if (isReservedKey(header)) continue // never let a header name touch a prototype
    headers[header] = value
  }
  return headers
}

/** The minimal request body that proves a model answers, per protocol. */
export function probeBody(api, modelId) {
  if (api === 'anthropic-messages') {
    return { model: modelId, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }
  }
  if (api === 'openai-responses') {
    return { model: modelId, input: 'ping', max_output_tokens: 16 }
  }
  return { model: modelId, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1, stream: false }
}

/**
 * Normalize a discovery response body into model rows.
 *
 * Accepts the three shapes the ecosystem uses: a bare array, `{ data: [...] }`
 * (OpenAI / DeepSeek official) and `{ models: [...] }` (Anthropic-ish gateways).
 */
export function modelsFromListing(body) {
  const rows = Array.isArray(body) ? body
    : Array.isArray(body && body.data) ? body.data
      : Array.isArray(body && body.models) ? body.models
        : []
  const models = []
  for (const row of rows) {
    const id = text(row && (row.id ?? row.name ?? row.model))
    if (!id) continue
    models.push({
      id,
      name: text(row.display_name ?? row.displayName ?? row.name) || undefined,
      contextWindow: Number(row.context_window ?? row.contextWindow) || undefined,
      maxTokens: Number(row.max_tokens ?? row.maxOutputTokens ?? row.maxTokens) || undefined,
    })
  }
  models.sort((a, b) => a.id.localeCompare(b.id))
  return models
}

/**
 * Read a response body without buffering more than `limit` bytes.
 *
 * @returns {Promise<{ text: string, overflow: boolean }>}
 */
export async function readBodyCapped(response, limit = MAX_DISCOVERY_BYTES) {
  const body = response !== null && response !== undefined ? response.body : undefined
  if (body === null || body === undefined || typeof body.getReader !== 'function') {
    const raw = await response.text()
    if (typeof raw === 'string' && raw.length > limit) return { text: raw.slice(0, limit), overflow: true }
    return { text: typeof raw === 'string' ? raw : '', overflow: false }
  }
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let out = ''
  let overflow = false
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value === undefined || value === null) continue
    out += decoder.decode(value, { stream: true })
    if (out.length > limit) {
      overflow = true
      try {
        await reader.cancel()
      } catch {
        /* cancellation is best effort */
      }
      break
    }
  }
  if (!overflow) out += decoder.decode()
  return { text: overflow ? out.slice(0, limit) : out, overflow }
}

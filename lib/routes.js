/**
 * dsh-provider-studio — Host route → endpoint/credential resolution.
 *
 * README: pure functions that answer three questions without touching the
 * settings service:
 *
 *  1. which credential reference a route stands for (`revealRefFor`), which is
 *     what the new v1.2 `revealKey({route})` method is built on;
 *  2. where the built-in DeepSeek adapter's probe goes (`deepseekProbeTarget`):
 *     Anthropic Messages, base default `https://api.deepseek.com/anthropic`,
 *     endpoint `{base}/v1/messages`;
 *  3. where its model list lives (`deepseekListingBase`): the official root
 *     `https://api.deepseek.com/models`; a custom baseURL has no listing
 *     endpoint and the caller answers DISCOVER_EMPTY instead of guessing.
 *
 * Both the contract's 3.1/3.3 sections and the v1.1 silent bugs live here, so
 * the test suite exercises them directly.
 */

import { fail } from './errors.js'
import { trimmedBase } from './probe.js'
import { hasOwn, text } from './util.js'
import {
  DEEPSEEK_ANTHROPIC_BASE,
  DEEPSEEK_DEFAULT_REF,
  DEEPSEEK_NS,
  DEEPSEEK_OFFICIAL_BASE,
  DEEPSEEK_PROTOCOL,
} from './vocabulary.js'

/**
 * The credential reference a route reveals (contract §3.1).
 *
 * `llm-deepseek` uses the built-in name (`config.apiKeyEnv || DEEPSEEK_API_KEY`);
 * every other route uses its own profile's `apiKeyEnv`. A missing route is
 * UNKNOWN_ROUTE — prototype names included, because the lookup is an own-key
 * check against a null-prototype dictionary.
 *
 * @returns {{ ok: true, ref: string } | { ok: false, code: string, message: string }}
 */
export function revealRefFor(route, { deepseekConfig, providers } = {}) {
  if (route === DEEPSEEK_NS) {
    return { ok: true, ref: text(deepseekConfig && deepseekConfig.apiKeyEnv) || DEEPSEEK_DEFAULT_REF }
  }
  if (!hasOwn(providers, route)) {
    return fail('UNKNOWN_ROUTE', `供应商 "${route}" 不存在`, { params: { route } })
  }
  return { ok: true, ref: text(providers[route] && providers[route].apiKeyEnv) }
}

/**
 * The built-in DeepSeek probe target.
 *
 * v1.1 used `openai-completions` here, which pointed the probe at
 * `{base}/chat/completions` — an endpoint the real adapter never calls. The
 * adapter talks Anthropic Messages, so the probe must too.
 */
export function deepseekProbeTarget(config) {
  const baseURL = trimmedBase(config && config.baseURL) || DEEPSEEK_ANTHROPIC_BASE
  return { baseURL, api: DEEPSEEK_PROTOCOL, headers: {} }
}

/**
 * DeepSeek's listing base, or null when a custom baseURL makes the list
 * meaningless (upstream does not list models for proxy endpoints).
 */
export function deepseekListingBase(config) {
  const configured = trimmedBase(config && config.baseURL)
  if (configured !== '' && configured !== DEEPSEEK_OFFICIAL_BASE) return null
  return DEEPSEEK_OFFICIAL_BASE
}

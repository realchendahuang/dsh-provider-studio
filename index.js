/**
 * dsh-provider-studio — Host half (v1.2).
 *
 * README: this file is the Cordis plugin entry and nothing else. It declares
 * the static-bundle exports the loader looks for (`name`, `inject`, `apply`),
 * instantiates the Typert Remote service, and registers the wire manifest. All
 * behaviour lives in `lib/`, split by responsibility:
 *
 *   lib/vocabulary.js  constants: namespaces, DeepSeek endpoint facts, enums
 *   lib/profile.js     advanced-editor / compat / reasoning sanitizers
 *   lib/models.js      model-entry sanitizers (pi-ai vs DeepSeek schemas)
 *   lib/settings.js    settings reads (document + projection), revision writes
 *   lib/credentials.js credentials façade: describe / resolve / write
 *   lib/probe.js       probe URLs, auth headers, model-list parsing, body cap
 *   lib/routes.js      route → credential / DeepSeek probe endpoint resolution
 *   lib/views.js       wire view shaping + the paste-ready export entry
 *   lib/validate.js    argument validators shared by both write entry points
 *   lib/errors.js      the v1.2 error envelope + stable machine codes
 *   lib/util.js        small dependency-free helpers
 *   lib/service.js     ProviderPanelRuntime — the ten RPC methods
 *
 * Design notes (learned the hard way from the settings service shapes):
 *  - reads prefer the PATCH layer (`user`) of `settings.describe()` over the
 *    resolved layer (`value`), so schemastery defaults are never restated into
 *    the user's document;
 *  - writes go through ONE helper and pass null-prototype copies plus the
 *    current `revision`, because the 0.2 settings guard rejects cross-realm
 *    plain objects, non-volatile keys and stale writes;
 *  - secrets are never stored by this plugin: the authoritative copy stays in
 *    the credentials service under the provider's `apiKeyEnv` ref.
 */

import { PACKAGE, TYPERT_MANIFEST } from './contract.js'
import { ProviderPanelRuntime } from './lib/service.js'

export const name = PACKAGE

/** The RPC registry is the only hard dependency; settings is resolved lazily so
 *  the panel still loads (and reports the problem) in a profile without it. */
export const inject = ['typert']

export function apply(ctx) {
  new ProviderPanelRuntime(ctx)
  ctx.effect(() => ctx.typert.register(TYPERT_MANIFEST), 'dsh-provider-studio: typert manifest')
}

/** Exported for smoke tests; the loader only needs apply/name/inject. */
export { ProviderPanelRuntime }

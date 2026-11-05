/**
 * dsh-provider-studio — Host view shaping.
 *
 * README: turns stored configs into the shapes the settings page renders, and
 * one stored profile back into a paste-ready `cordis.patch.yml` entry.
 *
 * Two contract rules live here:
 *  - `getProvider`/`listProviders` never carry a plaintext secret any more
 *    (contract §3.2); `revealKey` is the only method that can return one.
 *  - the built-in DeepSeek export entry must use the real bundle-patch package
 *    name `@deepseek-ai/dsh-llm-deepseek-api-key`; v1.1 wrote the adapter name,
 *    which made the pasted YAML a silent no-op on the target machine
 *    (contract §3.5).
 */

import { stringify as stringifyYaml } from 'yaml'

import { normalizeDeepseekModels } from './models.js'
import { text } from './util.js'
import {
  DEEPSEEK_API,
  DEEPSEEK_DEFAULT_REF,
  DEEPSEEK_EXPORT_NAME,
  DEEPSEEK_NS,
  DEEPSEEK_OFFICIAL_BASE,
  LLM_NS,
  PI_AI_EXPORT_NAME,
} from './vocabulary.js'

/** The built-in DeepSeek row/detail shape. No `secret` field by design. */
export function deepseekView(config, info) {
  const ref = text(config.apiKeyEnv) || DEEPSEEK_DEFAULT_REF
  const models = normalizeDeepseekModels(config.models)
  return {
    route: DEEPSEEK_NS,
    source: 'deepseek',
    builtin: true,
    displayName: '',
    api: DEEPSEEK_API,
    baseURL: text(config.baseURL) || DEEPSEEK_OFFICIAL_BASE,
    apiKeyEnv: ref,
    models,
    modelCount: models.length,
    usesCatalog: models.length === 0,
    keyConfigured: info.configured,
    keySource: info.source ?? null,
    keyHint: info.hint ?? null,
    hasBaseURL: true,
    headers: {},
    advanced: {
      thinking: text(config.thinking),
      reasoningEffort: text(config.reasoningEffort),
      maxTokens: config.maxTokens,
      defaultContextWindow: config.defaultContextWindow,
      streamIdleTimeoutMs: config.streamIdleTimeoutMs,
      retryPolicy: config.retryPolicy !== null && typeof config.retryPolicy === 'object' ? config.retryPolicy : undefined,
    },
  }
}

/** Every provider field the panel knows about; everything else is echoed back. */
export function omitKnown(profile) {
  const known = new Set(['displayName', 'api', 'baseURL', 'apiKeyEnv', 'models'])
  const rest = {}
  for (const [key, value] of Object.entries(profile)) {
    if (!known.has(key)) rest[key] = value
  }
  return rest
}

/**
 * Build the bundle-patch entry `exportProvider` stringifies.
 *
 * @param {string} route
 * @param {{ deepseekConfig?: object, profile?: object }} source
 */
export function exportEntryFor(route, { deepseekConfig, profile } = {}) {
  if (route === DEEPSEEK_NS) {
    return { id: DEEPSEEK_NS, name: DEEPSEEK_EXPORT_NAME, config: deepseekConfig }
  }
  const providersBlock = Object.create(null)
  providersBlock[route] = profile
  return { id: LLM_NS, name: PI_AI_EXPORT_NAME, config: { providers: providersBlock } }
}

/** Render one export entry as the paste-ready YAML the client shows. */
export function renderExportYaml(entry) {
  const yaml = stringifyYaml([entry], { lineWidth: 0 })
  const header = '# Exported by dsh-provider-studio — API keys are not included.\n'
  return header + yaml
}

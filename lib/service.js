/**
 * dsh-provider-studio — Host RPC service.
 *
 * README: `ProviderPanelRuntime` is the single Typert Remote service
 * (`providerPanel`) the Client settings page calls. It holds no state: every
 * call reads the current settings/credentials, does one thing, and answers the
 * frozen v1.2 envelope (see lib/errors.js).
 *
 * The ten wire methods are exactly the ones contract.js lists:
 *
 *   listProviders · getProvider · saveProvider · createProvider · deleteProvider
 *   discoverModels · testModel · exportProvider · revealKey
 *
 * Design rules this file enforces:
 *  - secrets cross in one direction only: `getProvider` never resolves one,
 *    `revealKey` is the user-initiated exception;
 *  - a draft probe (`testModel`/`discoverModels` without a route) may only use
 *    the key the caller pasted — never a stored credential reference, which was
 *    the v1.1 credential-exfiltration primitive;
 *  - both write entry points share the same validators, and every write sends
 *    the current `revision` so a stale tab gets SETTINGS_CONFLICT instead of a
 *    silent whole-section overwrite;
 *  - route dictionaries are null-prototype and looked up with own-key checks,
 *    so `__proto__`/`constructor` can never fake an entry.
 */

import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

import { SERVICE_KEY } from '../contract.js'
import {
  describeSecret,
  credentialsOf,
  deriveRef,
  resolveSecret,
  writeSecret,
} from './credentials.js'
import { fail, ok, toFailure } from './errors.js'
import { deepseekModelsFromUi, normalizeModels, sanitizePiModels } from './models.js'
import { applyAdvanced, applyDeepseekAdvanced } from './profile.js'
import {
  MAX_DISCOVERY_BYTES,
  listingUrl,
  messagesUrl,
  modelsFromListing,
  probeBody,
  probeHeaders,
  readBodyCapped,
  trimmedBase,
} from './probe.js'
import { deepseekListingBase, deepseekProbeTarget, revealRefFor } from './routes.js'
import {
  readConfigFromDocument,
  readDeepseekConfig,
  readProvidersExact,
  readRevision,
  verifyPersisted,
  writeDeepseekConfig,
  writeProviders,
} from './settings.js'
import { errorMessage, hasOwn, isRecord, text } from './util.js'
import { checkBaseURL, checkCredentialName, checkProtocol, checkRouteName } from './validate.js'
import { deepseekView, exportEntryFor, omitKnown, renderExportYaml } from './views.js'
import {
  DEEPSEEK_DEFAULT_REF,
  DEEPSEEK_NS,
  DEEPSEEK_PROTOCOL,
  LLM_NS,
  PROTOCOLS,
} from './vocabulary.js'

/** Timeout for one probe request (kept short: the panel shows a spinner). */
const PROBE_TIMEOUT_MS = 20000

/** The Typert Remote service the client settings section mounts. */
export class ProviderPanelRuntime extends TypertRemoteService {
  constructor(ctx) {
    super(ctx, SERVICE_KEY)
    this.ctx = ctx
  }

  /** Resolve the settings service lazily: a profile without it must still load. */
  settings() {
    try {
      return this.ctx.get('settings')
    } catch {
      return undefined
    }
  }

  // -------------------------------------------------------------------------
  // reads
  // -------------------------------------------------------------------------

  async listProviders() {
    try {
      const settings = this.settings()
      const providers = await readProvidersExact(this.ctx, settings)
      const items = []
      for (const [route, profile] of Object.entries(providers)) {
        const ref = text(profile.apiKeyEnv)
        const info = await describeSecret(this.ctx, ref)
        const models = normalizeModels(profile.models)
        items.push({
          route,
          source: 'pi-ai',
          builtin: false,
          displayName: text(profile.displayName) || route,
          api: text(profile.api),
          baseURL: text(profile.baseURL),
          apiKeyEnv: ref,
          modelCount: models.length,
          usesCatalog: models.length === 0,
          keyConfigured: info.configured,
          keySource: info.source ?? null,
          keyHint: info.hint ?? null,
          hasBaseURL: text(profile.baseURL) !== '',
        })
      }
      // The built-in DeepSeek adapter is just another provider row: same list,
      // same editor, no separate section.
      const deepseekConfig = await readDeepseekConfig(this.ctx, settings)
      const deepseekRef = text(deepseekConfig.apiKeyEnv) || DEEPSEEK_DEFAULT_REF
      const deepseekInfo = await describeSecret(this.ctx, deepseekRef)
      const deepseekItem = deepseekView(deepseekConfig, deepseekInfo)
      items.push({
        route: deepseekItem.route,
        source: 'deepseek',
        builtin: true,
        displayName: deepseekItem.displayName,
        api: deepseekItem.api,
        baseURL: deepseekItem.baseURL,
        apiKeyEnv: deepseekItem.apiKeyEnv,
        modelCount: deepseekItem.modelCount,
        usesCatalog: deepseekItem.usesCatalog,
        keyConfigured: deepseekItem.keyConfigured,
        keySource: deepseekItem.keySource,
        keyHint: deepseekItem.keyHint,
        hasBaseURL: true,
      })

      items.sort((a, b) => (a.displayName || a.route).localeCompare(b.displayName || b.route))
      const writable = settings !== undefined && settings !== null
        && (typeof settings.replace === 'function' || typeof settings.update === 'function')
      return ok({ providers: items, protocols: [...PROTOCOLS], writable })
    } catch (error) {
      return toFailure(error)
    }
  }

  /** Full detail for one provider. Never carries the secret (contract §3.2). */
  async getProvider(args) {
    try {
      const route = text(args && args.route).trim()
      const routeFailure = checkRouteName(route)
      if (routeFailure) return routeFailure
      const settings = this.settings()
      if (route === DEEPSEEK_NS) {
        const config = await readDeepseekConfig(this.ctx, settings)
        const ref = text(config.apiKeyEnv) || DEEPSEEK_DEFAULT_REF
        const info = await describeSecret(this.ctx, ref)
        return ok(deepseekView(config, info))
      }
      const providers = await readProvidersExact(this.ctx, settings)
      if (!hasOwn(providers, route)) return unknownRoute(route)
      const profile = providers[route]

      const ref = text(profile.apiKeyEnv)
      const info = await describeSecret(this.ctx, ref)
      return ok({
        route,
        source: 'pi-ai',
        builtin: false,
        displayName: text(profile.displayName),
        api: text(profile.api),
        baseURL: text(profile.baseURL),
        apiKeyEnv: ref,
        headers: profile.headers !== null && typeof profile.headers === 'object' ? profile.headers : {},
        models: normalizeModels(profile.models),
        keyConfigured: info.configured,
        keySource: info.source ?? null,
        keyHint: info.hint ?? null,
        advanced: omitKnown(profile),
      })
    } catch (error) {
      return toFailure(error)
    }
  }

  /**
   * The plaintext key behind one route — only when the user asked for it.
   *
   * Contract §3.1: `{ ok:true, route, value }` where `value === null` means the
   * reference is not configured. Failures stay in MISSING_ROUTE / UNKNOWN_ROUTE
   * / CREDENTIALS_UNAVAILABLE.
   */
  async revealKey(args) {
    try {
      const route = text(args && args.route).trim()
      if (route === '') return fail('MISSING_ROUTE', '缺少 route')
      const settings = this.settings()
      const providers = route === DEEPSEEK_NS ? undefined : await readProvidersExact(this.ctx, settings)
      const deepseekConfig = route === DEEPSEEK_NS ? await readDeepseekConfig(this.ctx, settings) : undefined
      const target = revealRefFor(route, { deepseekConfig, providers })
      if (!target.ok) return target
      const credentials = credentialsOf(this.ctx)
      if (credentials === null || credentials === undefined || typeof credentials.resolve !== 'function') {
        return fail('CREDENTIALS_UNAVAILABLE', '凭据服务不可用', {
          params: target.ref ? { ref: target.ref } : undefined,
        })
      }
      const value = target.ref === '' ? null : await resolveSecret(this.ctx, target.ref)
      return ok({ route, value })
    } catch (error) {
      return toFailure(error)
    }
  }

  // -------------------------------------------------------------------------
  // writes
  // -------------------------------------------------------------------------

  async saveProvider(args) {
    try {
      const route = text(args && args.route).trim()
      const routeFailure = checkRouteName(route)
      if (routeFailure) return routeFailure
      const settings = this.settings()
      if (route === DEEPSEEK_NS) return await this.saveDeepseek(args, settings)
      const providers = await readProvidersExact(this.ctx, settings)
      if (!hasOwn(providers, route)) return unknownRoute(route)
      const revision = readRevision(settings, LLM_NS)

      const profile = providers[route]
      const patch = isRecord(args && args.patch) ? args.patch : {}
      const next = { ...profile }
      for (const field of ['displayName', 'api', 'baseURL', 'apiKeyEnv']) {
        if (!Object.hasOwn(patch, field)) continue
        const value = text(patch[field]).trim()
        if (value) next[field] = value
        else delete next[field]
      }
      // Same validator set as createProvider (contract §3.4). `api` may stay
      // absent on hand-written profiles — the adapter applies its own default.
      if (text(next.api) !== '') {
        const apiFailure = checkProtocol(next.api)
        if (apiFailure) return apiFailure
      }
      const baseFailure = checkBaseURL(text(next.baseURL), { optional: true })
      if (baseFailure) return baseFailure
      if (Object.hasOwn(patch, 'apiKeyEnv')) {
        const refFailure = checkCredentialName(text(next.apiKeyEnv), { optional: true })
        if (refFailure) return refFailure
      }

      if (Array.isArray(patch.models)) {
        next.models = sanitizePiModels(patch.models, text(next.api), { allowEmpty: true })
      }
      applyAdvanced(next, patch.advanced)

      const apiKey = typeof (args && args.apiKey) === 'string' ? args.apiKey : undefined
      const ref = text(next.apiKeyEnv) || deriveRef(route)
      if (apiKey !== undefined) {
        const derivedFailure = checkCredentialName(ref, { optional: false })
        if (derivedFailure) return derivedFailure
        next.apiKeyEnv = ref
      }

      providers[route] = next
      await writeProviders(settings, providers, revision)

      if (apiKey !== undefined) {
        try {
          await writeSecret(this.ctx, ref, apiKey.trim())
        } catch (writeError) {
          return fail('CREDENTIAL_WRITE_FAILED', `配置已保存，但密钥写入失败：${errorMessage(writeError)}`, {
            detail: errorMessage(writeError),
            params: { ref },
          })
        }
      }

      const verification = await verifyPersisted(this.ctx, settings, route, next)
      return ok({
        route,
        keyConfigured: apiKey === undefined ? undefined : apiKey.trim() !== '',
        ...verification,
      })
    } catch (error) {
      return toFailure(error)
    }
  }

  /** Save the built-in DeepSeek entry through the same shape as any provider. */
  async saveDeepseek(args, settings) {
    const config = await readDeepseekConfig(this.ctx, settings)
    const revision = readRevision(settings, DEEPSEEK_NS)
    const patch = isRecord(args && args.patch) ? args.patch : {}
    const next = { ...config }
    for (const field of ['baseURL', 'apiKeyEnv']) {
      if (!Object.hasOwn(patch, field)) continue
      const value = text(patch[field]).trim()
      if (value) next[field] = value
      else delete next[field]
    }
    const baseFailure = checkBaseURL(text(next.baseURL), { optional: true })
    if (baseFailure) return baseFailure
    if (Object.hasOwn(patch, 'apiKeyEnv')) {
      const refFailure = checkCredentialName(text(next.apiKeyEnv), { optional: true })
      if (refFailure) return refFailure
    }

    if (Array.isArray(patch.models)) {
      const models = deepseekModelsFromUi(patch.models)
      if (models.length > 0) next.models = models
      else delete next.models
    }
    applyDeepseekAdvanced(next, patch.advanced)

    const apiKey = typeof (args && args.apiKey) === 'string' ? args.apiKey : undefined
    const ref = text(next.apiKeyEnv) || DEEPSEEK_DEFAULT_REF
    if (apiKey !== undefined) {
      const derivedFailure = checkCredentialName(ref, { optional: false })
      if (derivedFailure) return derivedFailure
      next.apiKeyEnv = ref
    }

    await writeDeepseekConfig(settings, next, revision)

    if (apiKey !== undefined) {
      try {
        await writeSecret(this.ctx, ref, apiKey.trim())
      } catch (writeError) {
        return fail('CREDENTIAL_WRITE_FAILED', `配置已保存，但密钥写入失败：${errorMessage(writeError)}`, {
          detail: errorMessage(writeError),
          params: { ref },
        })
      }
    }

    const after = await readDeepseekConfig(this.ctx, settings)
    const afterModels = Array.isArray(after.models) ? after.models.length : 0
    const expectedModels = Array.isArray(next.models) ? next.models.length : 0
    const sameBase = text(after.baseURL) === text(next.baseURL)
    return ok({
      route: DEEPSEEK_NS,
      persisted: sameBase && afterModels === expectedModels,
      persistedDetail: `baseURL=${text(after.baseURL) || '(默认)'} · models=${afterModels}`,
      keyConfigured: apiKey === undefined ? undefined : apiKey.trim() !== '',
    })
  }

  async createProvider(args) {
    try {
      const route = text(args && args.route).trim()
      const routeFailure = checkRouteName(route)
      if (routeFailure) return routeFailure
      const settings = this.settings()
      if (route === DEEPSEEK_NS) {
        return fail('BUILTIN_ROUTE', 'DeepSeek 是内置供应商，不需要新建；直接编辑它即可', {
          params: { route },
        })
      }
      const providers = await readProvidersExact(this.ctx, settings)
      if (hasOwn(providers, route)) {
        return fail('ROUTE_EXISTS', `供应商 "${route}" 已存在`, { params: { route } })
      }
      const revision = readRevision(settings, LLM_NS)

      const api = text(args && args.api) || 'openai-completions'
      const apiFailure = checkProtocol(api)
      if (apiFailure) return apiFailure
      const baseURL = text(args && args.baseURL).trim()
      const baseFailure = checkBaseURL(baseURL, { optional: true })
      if (baseFailure) return baseFailure

      const models = sanitizePiModels(args && args.models, api)
      const profile = { displayName: text(args && args.displayName).trim() || route, api, models }
      if (baseURL) profile.baseURL = baseURL

      // The credential reference is derived from the route; the panel never asks
      // the user to name an environment variable.
      const apiKey = typeof (args && args.apiKey) === 'string' ? args.apiKey.trim() : ''
      const ref = apiKey ? deriveRef(route) : ''
      if (ref) {
        const derivedFailure = checkCredentialName(ref, { optional: false })
        if (derivedFailure) return derivedFailure
        profile.apiKeyEnv = ref
      }

      providers[route] = profile
      await writeProviders(settings, providers, revision)
      if (apiKey) {
        try {
          await writeSecret(this.ctx, ref, apiKey)
        } catch (writeError) {
          return fail('CREDENTIAL_WRITE_FAILED', `供应商已创建，但密钥写入失败：${errorMessage(writeError)}`, {
            detail: errorMessage(writeError),
            params: { ref },
          })
        }
      }
      return ok({ route })
    } catch (error) {
      return toFailure(error)
    }
  }

  async deleteProvider(args) {
    try {
      const route = text(args && args.route).trim()
      const routeFailure = checkRouteName(route)
      if (routeFailure) return routeFailure
      if (route === DEEPSEEK_NS) {
        return fail('BUILTIN_ROUTE', 'DeepSeek 是内置供应商，不能删除', { params: { route } })
      }
      const settings = this.settings()
      const providers = await readProvidersExact(this.ctx, settings)
      if (!hasOwn(providers, route)) return unknownRoute(route)
      const revision = readRevision(settings, LLM_NS)
      delete providers[route]
      await writeProviders(settings, providers, revision)
      return ok({ route })
    } catch (error) {
      return toFailure(error)
    }
  }

  /**
   * Copy one provider out as a paste-ready `cordis.patch.yml` entry.
   *
   * Reads the patch document (not the schema projection) so hand-written fields
   * survive the round trip, and never emits a secret: keys live under
   * `apiKeyEnv` as a credential *name*, which is all a second machine needs.
   */
  async exportProvider(args) {
    try {
      const route = text(args && args.route).trim()
      const routeFailure = checkRouteName(route)
      if (routeFailure) return routeFailure
      const settings = this.settings()

      let entry
      if (route === DEEPSEEK_NS) {
        const config = await readDeepseekConfig(this.ctx, settings)
        if (Object.keys(config).length === 0) {
          return fail('EXPORT_EMPTY', '这个供应商还没有任何自定义配置，没有可导出的内容', {
            params: { route },
          })
        }
        entry = exportEntryFor(route, { deepseekConfig: config })
      } else {
        const document = await readConfigFromDocument(this.ctx, settings, LLM_NS)
        const fromDocument = document !== null && document !== undefined && typeof document.providers === 'object'
          ? document.providers
          : undefined
        const providers = await readProvidersExact(this.ctx, settings)
        const profile = fromDocument !== undefined && hasOwn(fromDocument, route)
          && fromDocument[route] !== null && typeof fromDocument[route] === 'object'
          ? fromDocument[route]
          : (hasOwn(providers, route) ? providers[route] : undefined)
        if (profile === null || profile === undefined || typeof profile !== 'object') return unknownRoute(route)
        entry = exportEntryFor(route, { profile })
      }

      let yaml
      try {
        yaml = renderExportYaml(entry)
      } catch (error) {
        return fail('EXPORT_FAILED', `生成 YAML 失败：${errorMessage(error)}`, {
          detail: errorMessage(error),
          params: { route },
        })
      }
      return ok({ route, yaml })
    } catch (error) {
      return toFailure(error)
    }
  }

  // -------------------------------------------------------------------------
  // probes
  // -------------------------------------------------------------------------

  /**
   * Where a probe goes and how it authenticates.
   *
   * Accepts a saved route *or* a draft the client has not saved yet: the create
   * dialog reads the endpoint's model list before the provider exists.
   *
   * Security: a draft (no route) may ONLY use the key the caller pasted. v1.1
   * also resolved `args.apiKeyEnv`, which let any same-origin caller ship an
   * arbitrary stored credential to an arbitrary host; that branch is gone
   * (contract §3.3).
   */
  async probeTarget(args) {
    const route = text(args && args.route).trim()
    const settings = this.settings()
    if (route === DEEPSEEK_NS) {
      const config = await readDeepseekConfig(this.ctx, settings)
      const ref = text(config.apiKeyEnv) || DEEPSEEK_DEFAULT_REF
      const key = await resolveSecret(this.ctx, ref)
      if (!key) {
        return fail('CREDENTIALS_UNAVAILABLE', `没有可用的密钥（${ref}）`, { params: { ref } })
      }
      const target = deepseekProbeTarget(config)
      return ok({ kind: 'deepseek', config, baseURL: target.baseURL, api: target.api, key, headers: target.headers })
    }
    if (route !== '') {
      const routeFailure = checkRouteName(route)
      if (routeFailure) return routeFailure
      const providers = await readProvidersExact(this.ctx, settings)
      if (!hasOwn(providers, route)) return unknownRoute(route)
      const profile = providers[route]
      const baseURL = trimmedBase(profile.baseURL)
      if (!baseURL) {
        return fail('INVALID_BASE_URL', '这个供应商没有 baseURL，无法访问端点', {
          params: { field: 'baseURL' },
        })
      }
      const baseFailure = checkBaseURL(baseURL, { optional: false })
      if (baseFailure) return baseFailure
      const api = text(profile.api) || 'openai-completions'
      const apiFailure = checkProtocol(api)
      if (apiFailure) return apiFailure
      const ref = text(profile.apiKeyEnv)
      const key = await resolveSecret(this.ctx, ref)
      if (!key) {
        return fail('CREDENTIALS_UNAVAILABLE', `没有可用的密钥（${ref || '未配置凭据名'}）`, {
          params: { ref: ref || '(未配置凭据名)' },
        })
      }
      return ok({ kind: 'pi-ai', baseURL, api, key, headers: profile.headers })
    }
    // Draft: a baseURL and a key, but no route in the configuration yet.
    const baseURL = trimmedBase(args && args.baseURL)
    if (!baseURL) return fail('MISSING_ROUTE', '缺少 route 或 baseURL')
    const baseFailure = checkBaseURL(baseURL, { optional: false })
    if (baseFailure) return baseFailure
    const api = text(args && args.api) || 'openai-completions'
    const apiFailure = checkProtocol(api)
    if (apiFailure) return apiFailure
    const pasted = typeof (args && args.apiKey) === 'string' ? args.apiKey.trim() : ''
    if (pasted === '') {
      return fail('CREDENTIALS_UNAVAILABLE', '先填写 API Key 才能读取端点的模型列表', {
        params: { field: 'apiKey' },
      })
    }
    return ok({ kind: 'draft', baseURL, api, key: pasted, headers: null })
  }

  /** One minimal request against the provider endpoint to prove a model works. */
  async testModel(args) {
    try {
      const modelId = text(args && args.model)
      if (!modelId) return fail('INVALID_MODEL_ID', '缺少模型 ID', { params: { field: 'model' } })
      const target = await this.probeTarget(args)
      if (!target.ok) return target

      const { api, key } = target
      const endpoint = messagesUrl(target.baseURL, api)
      const headers = probeHeaders(target.headers, api, key)
      const body = probeBody(api, modelId)

      const started = Date.now()
      let response
      try {
        const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(PROBE_TIMEOUT_MS)
          : undefined
        response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal })
      } catch (error) {
        const message = errorMessage(error)
        return fail('PROBE_FAILED', `请求 ${endpoint} 失败：${message}`, {
          detail: message,
          endpoint,
          latency: Date.now() - started,
        })
      }
      const latency = Date.now() - started
      let snippet = ''
      try {
        snippet = (await response.text()).slice(0, 300)
      } catch {
        snippet = ''
      }
      if (!response.ok) {
        return fail('PROBE_HTTP', `HTTP ${response.status} ${snippet}`.trim(), {
          params: { status: response.status },
          detail: snippet || undefined,
          endpoint,
          status: response.status,
          latency,
        })
      }
      return ok({ endpoint, status: response.status, latency, model: modelId })
    } catch (error) {
      return toFailure(error)
    }
  }

  /** List the models an endpoint reports, for a saved route or a draft. */
  async discoverModels(args) {
    try {
      const target = await this.probeTarget(args)
      if (!target.ok) return target

      let endpoint
      let headers
      if (target.kind === 'deepseek') {
        const listingBase = deepseekListingBase(target.config)
        if (listingBase === null) {
          return fail('DISCOVER_EMPTY', '这个端点使用自定义地址，不提供模型列表；请手动填写模型 ID', {
            params: { route: DEEPSEEK_NS },
            detail: 'anthropic-compatible baseURL has no listing endpoint',
          })
        }
        endpoint = `${listingBase}/models`
        headers = probeHeaders({}, DEEPSEEK_PROTOCOL, target.key)
      } else {
        endpoint = listingUrl(target.baseURL, target.api)
        headers = probeHeaders(target.headers, target.api, target.key)
      }

      let response
      try {
        const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(PROBE_TIMEOUT_MS)
          : undefined
        response = await fetch(endpoint, { headers, signal })
      } catch (error) {
        const message = errorMessage(error)
        return fail('PROBE_FAILED', `请求 ${endpoint} 失败：${message}`, { detail: message, endpoint })
      }
      if (!response.ok) {
        let snippet = ''
        try {
          snippet = (await response.text()).slice(0, 300)
        } catch {
          snippet = ''
        }
        return fail('DISCOVER_HTTP', `端点返回 HTTP ${response.status}${snippet ? ` ${snippet}` : ''}`.trim(), {
          params: { status: response.status },
          detail: snippet || undefined,
          endpoint,
          status: response.status,
        })
      }
      let raw
      try {
        const capped = await readBodyCapped(response)
        if (capped.overflow) {
          return fail('PROBE_FAILED', `端点响应体超过 ${MAX_DISCOVERY_BYTES} 字节，已中止读取`, {
            detail: `body exceeds ${MAX_DISCOVERY_BYTES} bytes`,
            endpoint,
          })
        }
        raw = capped.text
      } catch (error) {
        return fail('PROBE_FAILED', '读取端点响应失败', { detail: errorMessage(error), endpoint })
      }
      let body
      try {
        body = JSON.parse(raw)
      } catch {
        return fail('DISCOVER_NOT_JSON', '端点返回的不是 JSON', { detail: raw.slice(0, 200), endpoint })
      }

      const models = modelsFromListing(body)
      if (models.length === 0) return fail('DISCOVER_EMPTY', '端点没有返回可识别的模型列表', { endpoint })
      return ok({ endpoint, models, count: models.length })
    } catch (error) {
      return toFailure(error)
    }
  }
}

/** Standard "no such provider" failure. */
function unknownRoute(route) {
  return fail('UNKNOWN_ROUTE', `供应商 "${route}" 不存在`, { params: { route } })
}

/**
 * dsh-provider-studio — Host model-entry sanitizers.
 *
 * README: the shared model editor speaks one UI shape, but two storage schemas
 * exist. pi-ai model entries carry `input`, per-model `reasoningEfforts` and
 * `compat`; the built-in DeepSeek catalog keeps capability flags in
 * `inputModalities` and must not grow pi-ai-only keys. The translation happens
 * at this boundary, in both directions.
 *
 * `sanitizePiModels` is also the single gate `saveProvider` and `createProvider`
 * share (contract §3.4), so both write entries are rejected for the same reason
 * with the same code.
 */

import { ValidationError } from './errors.js'
import { sanitizeCompat, sanitizeReasoningEfforts } from './profile.js'
import { text } from './util.js'

/** Numeric fields every model entry may carry. */
export const NUMBER_FIELDS = Object.freeze(['contextWindow', 'maxTokens'])

/** Coerce a stored model list into the panel's read shape. */
export function normalizeModels(models) {
  if (!Array.isArray(models)) return []
  return models
    .filter((entry) => entry !== null && typeof entry === 'object')
    .map((entry) => {
      const model = { ...entry }
      if (!Array.isArray(model.input)) model.input = []
      return model
    })
}

/** Keep everything the editor does not own, coerce the fields it does. */
export function cleanModel(draft) {
  const source = draft !== null && typeof draft === 'object' ? draft : {}
  const model = { ...source }
  const id = text(model.id).trim()
  if (!id) throw new ValidationError('INVALID_MODEL_ID', '模型的 id 不能为空', {
    params: { id: '(空)', field: 'id' },
  })
  model.id = id
  if (typeof model.name === 'string') {
    const name = model.name.trim()
    if (name) model.name = name
    else delete model.name
  }
  for (const field of NUMBER_FIELDS) {
    if (model[field] === undefined || model[field] === null || model[field] === '') {
      delete model[field]
      continue
    }
    const value = Number(model[field])
    if (!Number.isFinite(value) || value <= 0) delete model[field]
    else model[field] = value
  }
  if (Array.isArray(model.input)) {
    const allowed = model.input.filter((kind) => kind === 'text' || kind === 'image' || kind === 'video' || kind === 'audio')
    if (allowed.length > 0) model.input = allowed
    else delete model.input
  }
  return model
}

/** Fields only a pi-ai model entry carries; the DeepSeek catalog has its own
 *  schema and must not grow these keys. */
export function cleanPiModel(draft, api) {
  const model = cleanModel(draft)
  if (Object.hasOwn(model, 'reasoningEfforts')) {
    const efforts = sanitizeReasoningEfforts(model.reasoningEfforts)
    if (efforts === undefined) delete model.reasoningEfforts
    else model.reasoningEfforts = efforts
  }
  if (Object.hasOwn(model, 'compat')) {
    const compat = sanitizeCompat(model.compat, api, { filter: true })
    if (compat === undefined) delete model.compat
    else model.compat = compat
  }
  return model
}

/**
 * The one model-list sanitizer the two write entry points share.
 *
 * `saveProvider` passes `allowEmpty: true` because an empty list means "use the
 * adapter catalog"; `createProvider` requires at least one entry.
 */
export function sanitizePiModels(models, api, { allowEmpty = false } = {}) {
  if (!Array.isArray(models)) {
    throw new ValidationError('INVALID_MODEL_ID', '模型列表必须是数组', {
      params: { id: '(列表)', field: 'models' },
    })
  }
  if (!allowEmpty && models.length === 0) {
    throw new ValidationError('INVALID_MODEL_ID', '新供应商至少要有一个模型条目：请填写首个模型 ID 后再创建', {
      params: { id: '(空)', field: 'models' },
    })
  }
  return models.map((draft) => cleanPiModel(draft, api))
}

/** DeepSeek's entry keeps capability flags in `inputModalities`; the shared
 *  model editor speaks `input`. Translate at the boundary in both directions. */
export function normalizeDeepseekModels(models) {
  if (!Array.isArray(models)) return []
  return models
    .filter((entry) => entry !== null && typeof entry === 'object')
    .map((entry) => {
      const model = { ...entry }
      const input = Array.isArray(model.input)
        ? model.input
        : Array.isArray(model.inputModalities)
          ? model.inputModalities
          : []
      return { ...model, input }
    })
}

/** Translate the shared editor shape back into the DeepSeek catalog schema. */
export function deepseekModelsFromUi(models) {
  return models.map((draft) => {
    const model = cleanModel(draft)
    const input = Array.isArray(model.input) ? model.input : []
    delete model.input
    if (input.length > 0) model.inputModalities = input
    else delete model.inputModalities
    return model
  })
}

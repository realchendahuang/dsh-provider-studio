/** Provider-row helpers: display names, logos and the built-in rows. */
import { PROVIDER_TEMPLATES } from '../templates/index.js'
import { iconForProvider } from '../icons.js'
import { templateDisplayName, templateLabel } from './template-text.js'

/** '7 models' — the catalog row has no per-provider models of its own. */
export function modelCountText(item, t) {
  if (item.usesCatalog === true || !(item.modelCount > 0)) return t('usesCatalog')
  return `${item.modelCount} ${t('modelCount')}`
}

/** The built-in DeepSeek row: fully editable, but it cannot be deleted. */
export function isBuiltin(item) {
  return item !== null && typeof item === 'object'
    && (item.builtin === true || item.source === 'deepseek')
}

/** Rows whose protocol is DeepSeek's own API (rendered as read-only text). */
export function isOfficial(item) {
  return item !== null && typeof item === 'object'
    && (item.source === 'deepseek' || item.api === 'deepseek-official')
}

/** Match a saved provider to a picker template (route, endpoint or name). */
function templateIconFor(item, t) {
  const route = String(item.route || '').toLowerCase()
  const name = String(item.displayName || '').toLowerCase()
  const base = String(item.baseURL || '').toLowerCase()
  for (const template of PROVIDER_TEMPLATES) {
    const id = String(template.id || '').toLowerCase()
    if (route !== '' && route === id) return template.icon || null
    if (base !== '' && template.baseURL && base.startsWith(String(template.baseURL).toLowerCase())) {
      return template.icon || null
    }
    const labels = [template.displayName, template.label]
    if (typeof t === 'function') {
      labels.push(templateDisplayName(template, t), templateLabel(template, t))
    }
    for (const candidate of labels) {
      const label = String(candidate || '').toLowerCase()
      if (name !== '' && label.length >= 4 && (name === label || name.includes(label))) {
        return template.icon || null
      }
    }
  }
  return null
}

/** Display name with a localized fallback for the built-in DeepSeek row. */
export function providerName(item, t) {
  if (item === null || item === undefined) return ''
  if (typeof item.displayName === 'string' && item.displayName !== '') return item.displayName
  return isOfficial(item) ? t('deepseekOfficial') : (item.route || '')
}

/** Logo for a saved provider: template match first, keyword rules second. */
export function providerIcon(item, t) {
  return templateIconFor(item, t) || iconForProvider(item)
}

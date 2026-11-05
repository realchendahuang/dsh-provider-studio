/** Locale-aware access to the template catalog's text fields.
 *
 * The catalog keeps English as its source text so the data stays readable and
 * comparable; entries whose Chinese copy differs carry an `i18n` map of
 * dictionary keys (`tpl.<id>.<field>`) that this module resolves through the
 * caller's `t`.
 */

/** Resolve one catalog text field for the active language. */
export function templateField(template, field, t) {
  if (template === null || template === undefined) return ''
  const keys = template.i18n
  const key = keys !== null && typeof keys === 'object' ? keys[field] : undefined
  if (typeof key === 'string' && typeof t === 'function') {
    const text = t(key)
    if (text !== key) return text
  }
  return typeof template[field] === 'string' ? template[field] : ''
}

export function templateLabel(template, t) {
  return templateField(template, 'label', t)
}

export function templateDisplayName(template, t) {
  return templateField(template, 'displayName', t)
}

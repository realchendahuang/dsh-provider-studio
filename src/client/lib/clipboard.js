/** Clipboard write with a fallback for hosts without the async API. */

/** Clipboard copy with an `execCommand` fallback for non-secure hosts. */
export async function copyText(value) {
  if (typeof navigator !== 'undefined' && navigator.clipboard
    && typeof navigator.clipboard.writeText === 'function') {
    await navigator.clipboard.writeText(value)
    return
  }
  if (typeof document === 'undefined') throw new Error('clipboard unavailable')
  const area = document.createElement('textarea')
  area.value = value
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.top = '0'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  let copied = false
  try {
    copied = typeof document.execCommand === 'function' && document.execCommand('copy')
  } finally {
    document.body.removeChild(area)
  }
  if (!copied) throw new Error('clipboard unavailable')
}

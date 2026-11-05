/** DOM helpers shared by the panel: motion preference and focus management. */

/** True when the user asked the OS to reduce motion. */
export const REDUCED_MOTION = typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Selector for everything a Tab press can land on. */
export const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/** Visible, enabled focus targets inside one container, in tab order. */
export function focusableIn(node) {
  if (node === null || node === undefined || typeof node.querySelectorAll !== 'function') return []
  return Array.from(node.querySelectorAll(FOCUSABLE)).filter((element) => {
    if (element.hasAttribute('hidden')) return false
    if (element.getAttribute('aria-hidden') === 'true') return false
    if (typeof element.getClientRects === 'function' && element.getClientRects().length === 0) return false
    return true
  })
}

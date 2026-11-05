/**
 * Viewport placement for a popover anchored to a trigger element.
 *
 * Menus are rendered with `position: fixed` and placed from the trigger's
 * measured rect: a popover inside a scrolling dialog body would otherwise be
 * clipped at the dialog edge. The result flips above the trigger when there is
 * no room below and clamps the panel width to the viewport.
 */

/** @returns {{left:number, top?:number, bottom?:number, width:number, maxHeight:number}|null} */
export function popoverBox(node) {
  if (node === null || node === undefined || typeof window === 'undefined') return null
  if (typeof node.getBoundingClientRect !== 'function') return null
  const rect = node.getBoundingClientRect()
  const width = Math.min(Math.max(rect.width, 168), Math.max(160, window.innerWidth - 16))
  const below = window.innerHeight - rect.bottom - 12
  const above = rect.top - 12
  const up = below < 168 && above > below
  const room = Math.min(Math.max(up ? above : below, 120), 264)
  const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8))
  return up
    ? { left, bottom: Math.max(8, window.innerHeight - rect.top + 6), width, maxHeight: room }
    : { left, top: rect.bottom + 6, width, maxHeight: room }
}

/** Unsaved-draft snapshots for one provider editor.
 *
 * The settings dialog unmounts a section when the user switches to another
 * one, so component state alone loses an in-progress edit. Each dirty editor
 * writes a snapshot into `sessionStorage`; reopening the same route offers to
 * restore it. Nothing here is durable: closing the tab clears the data like
 * any other session state.
 */

const PREFIX = 'dsh-provider-studio:draft:'

function storage() {
  try {
    if (typeof window === 'undefined' || window.sessionStorage === undefined) return null
    return window.sessionStorage
  } catch {
    return null
  }
}

function keyFor(route) {
  return `${PREFIX}${String(route === null || route === undefined ? '' : route)}`
}

/** Read the snapshot for one route, or null when there is none. */
export function readDraft(route) {
  if (route === null || route === undefined || route === '') return null
  const store = storage()
  if (store === null) return null
  try {
    const raw = store.getItem(keyFor(route))
    if (raw === null || raw === '') return null
    const parsed = JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/** Store the snapshot; a storage failure never breaks the editor. */
export function writeDraft(route, snapshot) {
  if (route === null || route === undefined || route === '') return
  const store = storage()
  if (store === null) return
  try {
    store.setItem(keyFor(route), JSON.stringify(snapshot))
  } catch {
    /* quota or privacy mode: the beforeunload guard still applies */
  }
}

/** Drop the snapshot once it is saved or deliberately discarded. */
export function clearDraft(route) {
  if (route === null || route === undefined || route === '') return
  const store = storage()
  if (store === null) return
  try {
    store.removeItem(keyFor(route))
  } catch {
    /* nothing to clean up */
  }
}

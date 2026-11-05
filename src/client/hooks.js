/** Shared React hooks for the Provider Panel. */

import React from 'react'

import { readDeepseekAdvanced, readRequestSettings } from './fields.js'
import { errorText } from './lib/errors.js'

/** Mount/unmount helper so overlays can play their exit animation too. */
export function usePresence(open, duration = 140) {
  const [mounted, setMounted] = React.useState(open)
  const [closing, setClosing] = React.useState(false)
  React.useEffect(() => {
    if (open) {
      setMounted(true)
      setClosing(false)
      return undefined
    }
    setClosing(true)
    const timer = setTimeout(() => {
      setMounted(false)
      setClosing(false)
    }, duration)
    return () => clearTimeout(timer)
  }, [open, duration])
  return { mounted: open || mounted, closing: !open && mounted }
}

/**
 * Re-render the caller whenever the locale snapshot changes (a language switch
 * or a late dictionary registration). `t` itself reads the live snapshot, so
 * bumping a revision is all it takes for the whole subtree to speak the new
 * language without a reload.
 */
export function useLocaleRevision(locale) {
  const [, bump] = React.useReducer((value) => value + 1, 0)
  React.useEffect(() => {
    if (locale === null || locale === undefined || typeof locale.subscribe !== 'function') {
      return undefined
    }
    let release = null
    try {
      release = locale.subscribe(() => bump())
    } catch {
      return undefined
    }
    return () => {
      if (typeof release === 'function') {
        try { release() } catch { /* already disposed */ }
      }
    }
  }, [locale])
}

/** Native "you have unsaved changes" guard for reloads and tab closes. */
export function useBeforeUnload(active) {
  React.useEffect(() => {
    if (!active || typeof window === 'undefined') return undefined
    const onBeforeUnload = (event) => {
      event.preventDefault()
      // Chromium needs returnValue set; other engines only need preventDefault.
      event.returnValue = ''
      return ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [active])
}

/** The provider editor's load/draft state, collected out of the view.
 *
 * `baseline` is the last saved snapshot as a JSON string; a successful save can
 * move it forward without a reload (`markSaved`), so a failing reload never
 * turns into a phantom "unsaved changes" state. */
export function useProviderDraft(route, call, t) {
  const [data, setData] = React.useState(null)
  const [draft, setDraft] = React.useState(null)
  const [models, setModels] = React.useState([])
  const [request, setRequest] = React.useState(null)
  const [loadError, setLoadError] = React.useState('')
  const [baseline, setBaseline] = React.useState('')

  const snapshotOf = React.useCallback((result) => JSON.stringify({
    displayName: result.displayName || '',
    api: result.api || '',
    baseURL: result.baseURL || '',
    models: Array.isArray(result.models) ? result.models : [],
    request: result.source === 'deepseek'
      ? readDeepseekAdvanced(result.advanced)
      : readRequestSettings(result.advanced),
  }), [])

  const apply = React.useCallback((result) => {
    setData(result)
    setDraft({
      displayName: result.displayName || '',
      api: result.api || 'openai-completions',
      baseURL: result.baseURL || '',
    })
    setModels((Array.isArray(result.models) ? result.models : []).map((model) => ({ ...model })))
    const rawAdvanced = result.advanced !== null && typeof result.advanced === 'object'
      ? result.advanced
      : {}
    setRequest(result.source === 'deepseek'
      ? readDeepseekAdvanced(rawAdvanced)
      : readRequestSettings(rawAdvanced))
    setBaseline(snapshotOf(result))
    setLoadError('')
  }, [snapshotOf])

  const load = React.useCallback(async () => {
    try {
      const result = await call('getProvider', { route })
      apply(result)
      return true
    } catch (error) {
      setLoadError(errorText(error, t))
      return false
    }
  }, [apply, call, route, t])

  React.useEffect(() => { void load() }, [load])

  const current = React.useMemo(() => (draft === null ? '' : JSON.stringify({
    displayName: draft.displayName,
    api: draft.api,
    baseURL: draft.baseURL,
    models,
    request,
  })), [draft, models, request])

  const markSaved = React.useCallback(() => { setBaseline(current) }, [current])

  return {
    data,
    draft,
    setDraft,
    models,
    setModels,
    request,
    setRequest,
    loadError,
    setLoadError,
    baseline,
    current,
    load,
    apply,
    markSaved,
  }
}

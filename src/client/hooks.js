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

/** Follow the harness theme by watching the root element's computed colour.
 *
 * Every token in `styles.js` resolves through the theme, so the root's text
 * colour is dark on the light theme and light on the dark one. Watching the
 * document element's attributes and the OS preference covers an in-app theme
 * switch and a system appearance change; the icon set needs it to decide
 * whether a logo wants a light or a dark plate behind it.
 */
export function useColorScheme(rootRef) {
  const [scheme, setScheme] = React.useState('light')
  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const read = () => {
      const node = rootRef.current
      if (node === null) return
      const color = window.getComputedStyle(node).color || ''
      const parts = color.match(/-?\d*\.?\d+/g)
      if (parts === null || parts.length < 3) return
      const channels = parts.slice(0, 3).map(Number)
      const scale = Math.max(...channels) <= 1.0001 ? 255 : 1
      const luminance = (0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]) * scale / 255
      const next = luminance > 0.5 ? 'dark' : 'light'
      setScheme((previous) => (previous === next ? previous : next))
    }
    read()
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme', 'data-dsw-theme', 'data-scheme'],
    })
    const media = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null
    if (media !== null && typeof media.addEventListener === 'function') media.addEventListener('change', read)
    // A theme switch that only swaps CSS variables fires no DOM mutation; a slow
    // visibility-aware poll keeps the plates honest without a busy loop.
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') read()
    }, 2000)
    return () => {
      observer.disconnect()
      clearInterval(poll)
      if (media !== null && typeof media.removeEventListener === 'function') media.removeEventListener('change', read)
    }
  }, [rootRef])
  return scheme
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

/**
 * The Provider Panel settings page: the slot component the Client half
 * registers, plus the shell that keeps one level (list / editor / create /
 * template picker) on screen at a time.
 *
 * Host contract this page is written against (v1.2, see contract.js and the
 * README):
 *   listProviders  → { providers, protocols, writable }
 *   getProvider    → provider fields + { models, advanced }; no `secret`
 *   revealKey      → { route, value: string | null } — called on demand only
 *   saveProvider / createProvider / deleteProvider / discoverModels /
 *   testModel / exportProvider.
 * Failures reject with an Error carrying `code`/`params`; the views render
 * `err.<CODE>` through `lib/errors.js`.
 */
import React from 'react'
import { Alert } from './components/ui.jsx'
import { Toasts } from './components/toasts.jsx'
import { ProviderList } from './views/list.jsx'
import { DetailView } from './views/detail.jsx'
import { TemplatePicker } from './views/template-picker.jsx'
import { CreateForm } from './views/create.jsx'
import { CUSTOM_TEMPLATE } from './templates/index.js'
import { PROTO_FALLBACK } from './lib/format.js'
import { errorText } from './lib/errors.js'
import { REDUCED_MOTION } from './lib/dom.js'
import { templateLabel } from './lib/template-text.js'
import { useColorScheme, useLocaleRevision } from './hooks.js'

/** Keeps a render error inside the panel instead of blanking the settings page. */
class PanelBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    // eslint-disable-next-line no-console
    console.error('[dsh-provider-studio] render failed', error)
  }

  render() {
    if (this.state.error === null) return this.props.children
    // The boundary is the last line of defence, so it translates defensively:
    // without a dictionary the raw locale keys are still readable.
    const t = typeof this.props.t === 'function' ? this.props.t : (key) => key
    const message = this.state.error && this.state.error.message
      ? this.state.error.message
      : String(this.state.error)
    return (
      <div className="dpp-root">
        <Alert kind="err" text={t('renderFailed')} detail={message} />
        <button type="button" className="dpp-btn" onClick={() => this.setState({ error: null })}>
          {t('retry')}
        </button>
      </div>
    )
  }
}

function PanelPageInner({ t, call, locale }) {
  // Language switches (and late dictionary registrations) repaint the subtree;
  // `t` reads the live snapshot, so no key has to be passed down differently.
  useLocaleRevision(locale)
  const [boot, setBoot] = React.useState(null)
  const [loadError, setLoadError] = React.useState('')
  const [refreshing, setRefreshing] = React.useState(false)
  const [mode, setMode] = React.useState('list')
  const [selected, setSelected] = React.useState(null)
  const [direction, setDirection] = React.useState('in')
  const [preset, setPreset] = React.useState(null)
  const [busy, setBusy] = React.useState(false)
  const [toasts, setToasts] = React.useState([])
  const toastSeq = React.useRef(0)
  const timersRef = React.useRef([])
  const rootRef = React.useRef(null)
  // The icon set needs the active theme; read it off the root's text colour.
  const colorScheme = useColorScheme(rootRef)

  const pushToast = React.useCallback((kind, text, detail) => {
    const id = toastSeq.current + 1
    toastSeq.current = id
    setToasts((previous) => previous.concat([{ id, kind, text, detail }]))
    const timer = setTimeout(() => {
      timersRef.current = timersRef.current.filter((handle) => handle !== timer)
      setToasts((previous) => previous.filter((toast) => toast.id !== id))
    }, kind === 'err' ? 7000 : 3200)
    timersRef.current.push(timer)
  }, [])

  // Never let a pending dismissal fire into an unmounted panel.
  React.useEffect(() => () => {
    for (const timer of timersRef.current) clearTimeout(timer)
    timersRef.current = []
  }, [])

  const dismissToast = (id) => setToasts((previous) => previous.filter((toast) => toast.id !== id))

  const refresh = React.useCallback(async () => {
    setRefreshing(true)
    try {
      const result = await call('listProviders')
      setBoot(result !== null && typeof result === 'object' ? result : { providers: [] })
      setLoadError('')
    } catch (error) {
      setLoadError(errorText(error, t))
      setBoot({ providers: [], protocols: PROTO_FALLBACK, writable: false })
    } finally {
      setRefreshing(false)
    }
  }, [call, t])

  React.useEffect(() => { void refresh() }, [refresh])

  // Bring each level in at the top of the settings scroller.
  React.useEffect(() => {
    let node = rootRef.current === null ? null : rootRef.current.parentElement
    while (node !== null && node !== undefined) {
      const style = typeof window !== 'undefined' ? window.getComputedStyle(node) : null
      if (style !== null && /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
        if (typeof node.scrollTo === 'function') {
          node.scrollTo({ top: 0, behavior: REDUCED_MOTION ? 'auto' : 'smooth' })
        }
        return
      }
      node = node.parentElement
    }
  }, [mode, selected])

  const providers = boot !== null && Array.isArray(boot.providers) ? boot.providers : []
  const protocols = boot !== null && Array.isArray(boot.protocols) && boot.protocols.length > 0
    ? boot.protocols
    : PROTO_FALLBACK
  const writable = boot === null ? true : boot.writable !== false
  const loading = boot === null

  const openTemplates = () => {
    setPreset(null)
    setMode('template')
    setDirection('in')
  }

  const pickTemplate = (template) => {
    const custom = template === CUSTOM_TEMPLATE
    setPreset({
      route: custom ? '' : template.id,
      icon: custom ? null : template.icon || null,
      displayName: custom ? '' : templateLabel(template, t),
      api: template.api || 'openai-completions',
      baseURL: template.baseURL || '',
      modelId: '',
      apiKey: '',
    })
    setMode('create')
    setDirection('in')
  }

  const create = async (form) => {
    setBusy(true)
    try {
      await call('createProvider', form)
      pushToast('ok', t('created'))
      await refresh()
      setSelected(form.route)
      setMode('detail')
      setDirection('in')
    } finally {
      setBusy(false)
    }
  }

  const backToList = () => {
    setMode('list')
    setDirection('out')
    void refresh()
  }

  const openDetail = (route) => {
    setSelected(route)
    setMode('detail')
    setDirection('in')
  }

  let content = null
  if (mode === 'detail') {
    content = (
      <DetailView
        key={selected}
        t={t}
        call={call}
        route={selected}
        writable={writable}
        protocols={protocols}
        pushToast={pushToast}
        onBack={backToList}
        onChanged={() => { void refresh() }}
      />
    )
  } else if (mode === 'create') {
    content = (
      <CreateForm
        protocols={protocols}
        t={t}
        call={call}
        busy={busy}
        initial={preset}
        onCancel={() => { setMode('template'); setDirection('out') }}
        onSubmit={create}
      />
    )
  } else if (mode === 'template') {
    content = (
      <TemplatePicker
        t={t}
        onPick={pickTemplate}
        onBack={backToList}
      />
    )
  } else {
    content = (
      <ProviderList
        t={t}
        providers={providers}
        loading={loading}
        writable={writable}
        error={loadError}
        refreshing={refreshing}
        onOpen={openDetail}
        onAdd={openTemplates}
        onRefresh={() => { void refresh() }}
      />
    )
  }

  return (
    <div className="dpp-root" ref={rootRef} data-dpp-scheme={colorScheme}>
      <div
        key={`${mode}:${selected || ''}`}
        className={`dpp-view${direction === 'out' ? ' is-back' : ''}`}
      >
        {content}
      </div>
      <Toasts t={t} items={toasts} onDismiss={dismissToast} />
    </div>
  )
}

export function PanelPage(props) {
  return (
    <PanelBoundary t={props.t}>
      <PanelPageInner {...props} />
    </PanelBoundary>
  )
}

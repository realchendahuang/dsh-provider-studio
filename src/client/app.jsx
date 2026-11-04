/** The Provider Panel settings page.
 *
 * One settings section, two levels: a provider list and a provider editor. The
 * editor writes straight back to `llm-pi-ai.providers` (and, for keys, to the
 * DSH credential store) through the Host Remote service; this module never
 * touches settings on its own.
 *
 * Host contract this file is written against:
 *   listProviders → { providers, protocols, writable, debug }
 *     provider: { route, source, displayName, api, baseURL, apiKeyEnv,
 *                 modelCount, usesCatalog, keyConfigured, keySource, keyHint,
 *                 builtin }
 *   getProvider  → the same fields plus { models, secret, headers, extra }
 *   saveProvider → { ok, persisted, persistedDetail }
 *   createProvider / deleteProvider / discoverModels / testModel.
 *
 * The built-in DeepSeek row (source === 'deepseek') is an ordinary list row and
 * an ordinary editor; only two things change: its protocol renders as a
 * read-only value, and it has no Delete action.
 *
 * Interaction model (deliberately close to ZCode's provider settings): rows
 * save on the explicit footer action, secondary provider actions live behind a
 * "…" menu, and every transient result is announced as a toast instead of a
 * banner at the top of the page.
 */

import React from 'react'
import { PROVIDER_TEMPLATES, CUSTOM_TEMPLATE } from './templates.js'
import { PROVIDER_ICONS, iconForProvider } from './icons.js'
import { Icon } from './ui-icons.jsx'

const PROTO_LABELS = {
  'openai-completions': 'OpenAI 兼容',
  'openai-responses': 'OpenAI Responses',
  'anthropic-messages': 'Anthropic Messages',
  'deepseek-official': 'DeepSeek 官方 API',
}

const PROTO_FALLBACK = ['openai-completions', 'openai-responses', 'anthropic-messages']

/** Stable empty result so the picker's reset effect does not loop. */
const EMPTY_DISCOVER = { models: [] }

const PROTO_ENDPOINT = {
  'openai-completions': '/v1/chat/completions',
  'anthropic-messages': '/v1/messages',
  'openai-responses': '/v1/responses',
}

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

/** Host part of a Base URL, for the compact template card. */
function hostOf(url) {
  if (!url) return ''
  try {
    const text = String(url)
    return text.replace(/^https?:\/\//i, '').split('/')[0].replace(/[?#].*$/, '') || text
  } catch {
    return String(url)
  }
}

function errText(error) {
  if (!error) return 'unknown error'
  if (typeof error === 'string') return error
  return error.message || String(error)
}

function parseNumber(value) {
  const text = String(value === undefined || value === null ? '' : value).trim()
  if (!text) return undefined
  const parsed = Number(text)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function protoLabel(api) {
  return PROTO_LABELS[api] || api || '—'
}

function protoOption(api) {
  const hint = PROTO_ENDPOINT[api]
  return hint ? `${protoLabel(api)} (${hint})` : protoLabel(api)
}

/** '7 个模型' — the catalog row has no per-provider models of its own. */
function modelCountText(item, t) {
  if (item.usesCatalog === true || !(item.modelCount > 0)) return t('usesCatalog')
  return `${item.modelCount} ${t('modelCount')}`
}

/** The built-in DeepSeek row: fully editable, but it cannot be deleted. */
function isBuiltin(item) {
  return item !== null && typeof item === 'object'
    && (item.builtin === true || item.source === 'deepseek')
}

/** Rows whose protocol is DeepSeek's own API (rendered as read-only text). */
function isOfficial(item) {
  return item !== null && typeof item === 'object'
    && (item.source === 'deepseek' || item.api === 'deepseek-official')
}

/** Clipboard copy with an `execCommand` fallback for non-secure hosts. */
async function copyText(value) {
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

/** Compact context-window label, ZCode style (1M / 256K). */
function contextLabel(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return ''
  if (number >= 1000000) {
    const millions = Math.round((number / 1000000) * 10) / 10
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`
  }
  if (number >= 1000) return `${Math.round(number / 1000)}K`
  return String(number)
}

/** Match a saved provider to a picker template (route, endpoint or name). */
function templateIconFor(item) {
  const route = String(item.route || '').toLowerCase()
  const name = String(item.displayName || '').toLowerCase()
  const base = String(item.baseURL || '').toLowerCase()
  for (const template of PROVIDER_TEMPLATES) {
    const id = String(template.id || '').toLowerCase()
    const label = String(template.displayName || template.label || '').toLowerCase()
    if (route !== '' && route === id) return template.icon || null
    if (base !== '' && template.baseURL && base.startsWith(String(template.baseURL).toLowerCase())) {
      return template.icon || null
    }
    if (name !== '' && label.length >= 4 && (name === label || name.includes(label))) {
      return template.icon || null
    }
  }
  return null
}

/** Logo for a saved provider: template match first, keyword rules second. */
function providerIcon(item) {
  return templateIconFor(item) || iconForProvider(item)
}

const REDUCED_MOTION = typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

/** Mount/unmount helper so overlays can play their exit animation too. */
function usePresence(open, duration = 140) {
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

/** Provider logo, ZCode style: official asset when we have one, a neutral
 *  package glyph when we do not (no invented monograms). */
function ProviderMark({ iconKey, size = 24 }) {
  const src = iconKey !== null && iconKey !== undefined ? PROVIDER_ICONS[iconKey] : null
  const box = { width: size, height: size }
  if (src) {
    return (
      <span className="dpp-mark" style={box}>
        <img src={src} alt="" width={size} height={size} aria-hidden="true" />
      </span>
    )
  }
  return (
    <span className="dpp-mark dpp-markFallback" style={box} aria-hidden="true">
      <Icon name="package" size={Math.max(12, Math.round(size * 0.58))} strokeWidth={1.6} />
    </span>
  )
}

function Field({ label, hint, wide, children }) {
  return (
    <label className={wide ? 'dpp-field is-wide' : 'dpp-field'}>
      <span className="dpp-fieldLabel">
        {label}
        {hint ? <span className="dpp-fieldHint">{hint}</span> : null}
      </span>
      {children}
    </label>
  )
}

function Alert({ kind = 'info', text, detail }) {
  return (
    <div className={`dpp-alert is-${kind}`} role={kind === 'err' ? 'alert' : 'status'}>
      <Icon name={kind === 'ok' ? 'circle-check' : kind === 'err' ? 'circle-alert' : 'info'} size={15} />
      <span className="dpp-alertText">
        {text}
        {detail ? <span className="dpp-alertDetail">{detail}</span> : null}
      </span>
    </div>
  )
}

function Spinner({ size = 14 }) {
  return <Icon name="loader" size={size} className="dpp-spin" />
}

/** Minimal dialog: focus lands inside, Escape and the scrim close it, and the
 *  panel keeps its exit animation via usePresence. */
function Modal({ open, onClose, title, label, className, bodyClassName, children, footer }) {
  const { mounted, closing } = usePresence(open, 140)
  const panelRef = React.useRef(null)

  React.useEffect(() => {
    if (!open) return undefined
    const previous = document.activeElement
    const timer = setTimeout(() => {
      const node = panelRef.current
      if (node !== null && !node.contains(document.activeElement)) node.focus()
    }, 30)
    return () => {
      clearTimeout(timer)
      if (previous !== null && typeof previous.focus === 'function' && document.contains(previous)) {
        previous.focus()
      }
    }
  }, [open])

  if (!mounted) return null

  return (
    <div
      className={`dpp-overlay${closing ? ' is-closing' : ''}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className={`dpp-modal${className ? ` ${className}` : ''}${closing ? ' is-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={label || title}
        tabIndex={-1}
        ref={panelRef}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          // Keep the keystroke away from the Settings dialog behind us.
          event.stopPropagation()
          onClose()
        }}
      >
        <header className="dpp-modalHead">
          <h3 className="dpp-modalTitle">{title}</h3>
          <button type="button" className="dpp-iconBtn" aria-label="关闭" onClick={onClose}>
            <Icon name="x" size={15} />
          </button>
        </header>
        <div className={bodyClassName ? `dpp-modalBody ${bodyClassName}` : 'dpp-modalBody'}>
          {children}
        </div>
        {footer ? <footer className="dpp-modalFoot">{footer}</footer> : null}
      </div>
    </div>
  )
}

/** Confirm sheet for destructive or lossy actions. */
function ConfirmDialog({ ask, onClose }) {
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (ask === null) setBusy(false)
  }, [ask])

  if (ask === null) return null

  const run = async () => {
    if (busy) return
    setBusy(true)
    try {
      await ask.action()
    } finally {
      setBusy(false)
      onClose()
    }
  }

  return (
    <Modal
      open
      onClose={() => { if (!busy) onClose() }}
      title={ask.title}
      className="dpp-modalConfirm"
      footer={(
        <>
          <button type="button" className="dpp-btn dpp-btnGhost" onClick={onClose} disabled={busy}>
            {ask.cancelLabel || '取消'}
          </button>
          <button
            type="button"
            className={`dpp-btn ${ask.danger ? 'dpp-btnDanger' : 'dpp-btnPrimary'}`}
            onClick={() => { void run() }}
            disabled={busy}
          >
            {busy ? <Spinner /> : null}
            {ask.confirmLabel}
          </button>
        </>
      )}
    >
      <p className="dpp-confirmText">{ask.body}</p>
    </Modal>
  )
}

/** Dropdown menu behind an icon button (provider actions). */
function ActionMenu({ items, label }) {
  const [open, setOpen] = React.useState(false)
  const { mounted, closing } = usePresence(open, 120)
  const rootRef = React.useRef(null)
  const [active, setActive] = React.useState(0)

  React.useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target)) setOpen(false)
    }
    // Capture Escape so the Settings dialog behind us stays open.
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  if (items.length === 0) return null

  return (
    <div className="dpp-menuWrap" ref={rootRef}>
      <button
        type="button"
        className={`dpp-iconBtn${open ? ' is-open' : ''}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={() => {
          setActive(0)
          setOpen((previous) => !previous)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          setOpen(true)
        }}
      >
        <Icon name="more-horizontal" size={16} />
      </button>
      {mounted ? (
        <div
          className={`dpp-menu${closing ? ' is-closing' : ''}`}
          role="menu"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              setOpen(false)
            } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              const step = event.key === 'ArrowDown' ? 1 : -1
              setActive((previous) => (previous + step + items.length) % items.length)
            } else if (event.key === 'Enter') {
              event.preventDefault()
              const item = items[active]
              setOpen(false)
              item.onSelect()
            }
          }}
        >
          {items.map((item, index) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`dpp-menuItem${item.danger ? ' is-danger' : ''}${index === active ? ' is-active' : ''}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
            >
              <Icon name={item.icon} size={14} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Click-to-open picker; the native <select> OS menu is replaced on purpose. */
function SelectMenu({ value, options, onChange, disabled, ariaLabel }) {
  const [open, setOpen] = React.useState(false)
  const { mounted, closing } = usePresence(open, 120)
  const rootRef = React.useRef(null)
  const current = options.find((option) => option.value === value) || options[0]
  const [active, setActive] = React.useState(() => Math.max(0, options.findIndex((option) => option.value === value)))

  React.useEffect(() => {
    if (!open) return undefined
    setActive(Math.max(0, options.findIndex((option) => option.value === value)))
    const onPointerDown = (event) => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open, options, value])

  const commit = (option) => {
    onChange(option.value)
    setOpen(false)
  }

  return (
    <div className="dpp-selectMenu" ref={rootRef}>
      <button
        type="button"
        className={`dpp-selectTrigger${open ? ' is-open' : ''}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((previous) => !previous)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            if (!open) setOpen(true)
            return
          }
          if (!open) return
          if (event.key === 'Escape') {
            event.stopPropagation()
            setOpen(false)
          } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            commit(options[active] || current)
          } else if (event.key === 'ArrowDown') {
            setActive((previous) => (previous + 1) % options.length)
          } else if (event.key === 'ArrowUp') {
            setActive((previous) => (previous - 1 + options.length) % options.length)
          }
        }}
      >
        <span className="dpp-selectValue">{current ? current.label : ''}</span>
        <Icon name="chevron-down" size={13} className="dpp-selectChevron" />
      </button>
      {mounted ? (
        <div
          className={`dpp-selectPopover${closing ? ' is-closing' : ''}`}
          role="listbox"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              setOpen(false)
            } else if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActive((previous) => (previous + 1) % options.length)
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActive((previous) => (previous - 1 + options.length) % options.length)
            } else if (event.key === 'Enter') {
              event.preventDefault()
              commit(options[active])
            }
          }}
        >
          {options.map((option, index) => {
            const selected = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                className={`dpp-selectOption${selected ? ' is-selected' : ''}${index === active ? ' is-active' : ''}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => commit(option)}
              >
                <span className="dpp-selectCheck" aria-hidden="true">
                  {selected ? <Icon name="check" size={13} strokeWidth={2.2} /> : null}
                </span>
                <span className="dpp-selectOptionLabel">{option.label}</span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// list page
// ---------------------------------------------------------------------------

function SkeletonRows() {
  return (
    <div className="dpp-list" aria-hidden="true">
      {[0, 1, 2, 3].map((key) => (
        <div className="dpp-skelRow" key={key} style={{ '--dpp-i': key }}>
          <span className="dpp-skel dpp-skelMark" />
          <span className="dpp-skel" style={{ width: `${46 - key * 6}%` }} />
        </div>
      ))}
    </div>
  )
}

function ProviderList({ t, providers, loading, writable, error, refreshing, onOpen, onAdd, onRefresh }) {
  return (
    <div>
      <header className="dpp-pageHead">
        <h2 className="dpp-pageTitle">
          {t('title')}
          {loading ? null : <span className="dpp-pageCount">{providers.length}</span>}
        </h2>
        <button
          type="button"
          className="dpp-iconBtn"
          aria-label={t('refresh')}
          title={t('refresh')}
          onClick={onRefresh}
          disabled={loading || refreshing}
        >
          <Icon name="refresh-cw" size={15} className={refreshing ? 'dpp-spin' : undefined} />
        </button>
      </header>

      {error ? <Alert kind="err" text={t('loadFailed')} detail={error} /> : null}
      {writable === false ? <Alert kind="err" text={t('readOnly')} /> : null}

      {loading ? <SkeletonRows /> : null}

      {!loading && providers.length === 0 ? (
        <div className="dpp-empty">
          <span className="dpp-emptyIcon" aria-hidden="true"><Icon name="package" size={22} strokeWidth={1.5} /></span>
          <span className="dpp-emptyTitle">{t('empty')}</span>
          <span className="dpp-emptyHint">{t('emptyHint')}</span>
          <button type="button" className="dpp-btn dpp-btnPrimary" onClick={onAdd} disabled={!writable}>
            <Icon name="plus" size={14} />
            {t('create')}
          </button>
        </div>
      ) : null}

      {!loading && providers.length > 0 ? (
        <div className="dpp-list">
          {providers.map((item, index) => (
            <button
              key={item.route}
              type="button"
              className="dpp-row"
              style={{ '--dpp-i': index < 12 ? index : 12 }}
              onClick={() => onOpen(item.route)}
            >
              <ProviderMark iconKey={providerIcon(item)} size={22} />
              <span className="dpp-rowName">{item.displayName || item.route}</span>
              <Icon name="chevron-right" size={14} className="dpp-rowChevron" />
            </button>
          ))}
          <button type="button" className="dpp-addRow" onClick={onAdd} disabled={!writable}>
            <span className="dpp-addRowIcon" aria-hidden="true"><Icon name="plus" size={14} /></span>
            <span>{t('create')}</span>
          </button>
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// model list + model dialog
// ---------------------------------------------------------------------------

function ModelRow({ model, index, t, disabled, onEdit, onRemove, onTest, testing, testResult }) {
  const vision = Array.isArray(model.input) && model.input.includes('image')
  const context = contextLabel(model.contextWindow)
  const busy = testing === model.id
  const result = testResult !== null && testResult.modelId === model.id ? testResult : null
  return (
    <div className="dpp-modelRow" style={{ '--dpp-i': index < 14 ? index : 14 }}>
      <button
        type="button"
        className="dpp-modelName"
        title={t('editModel')}
        onClick={() => onEdit()}
        disabled={disabled}
      >
        {model.id || '—'}
      </button>
      <div className="dpp-modelBadges">
        {context !== '' ? (
          <span className="dpp-badge dpp-badgeMono" title={t('contextWindow')}>{context}</span>
        ) : null}
        {vision ? <span className="dpp-badge" title={t('inputImage')}>{t('vision')}</span> : null}
        {result !== null ? (
          <span
            className={`dpp-result${result.ok ? ' is-ok' : ' is-err'}`}
            title={result.ok ? t('testModel') : result.error}
          >
            <Icon name={result.ok ? 'circle-check' : 'circle-alert'} size={12} />
            {result.ok ? `${result.latency}ms` : t('testFailed')}
          </span>
        ) : null}
      </div>
      <div className="dpp-modelActions">
        <button
          type="button"
          className="dpp-iconBtn is-xs"
          title={t('testModel')}
          aria-label={t('testModel')}
          disabled={disabled || busy || !model.id || typeof onTest !== 'function'}
          onClick={() => onTest(model)}
        >
          {busy ? <Spinner size={14} /> : <Icon name="unplug" size={14} />}
        </button>
        <button
          type="button"
          className="dpp-iconBtn is-xs"
          title={t('edit')}
          aria-label={t('edit')}
          disabled={disabled}
          onClick={() => onEdit()}
        >
          <Icon name="pencil" size={14} />
        </button>
        <button
          type="button"
          className="dpp-iconBtn is-xs is-danger"
          title={t('remove')}
          aria-label={t('remove')}
          disabled={disabled}
          onClick={() => onRemove()}
        >
          <Icon name="trash-2" size={14} />
        </button>
      </div>
    </div>
  )
}

function ModelDialog({ t, model, onSave, onCancel }) {
  const initial = {
    id: model.id || '',
    name: model.name || '',
    contextWindow: model.contextWindow === undefined || model.contextWindow === null ? '' : String(model.contextWindow),
    maxTokens: model.maxTokens === undefined || model.maxTokens === null ? '' : String(model.maxTokens),
    input: Array.isArray(model.input) && model.input.length > 0 ? model.input : ['text'],
  }
  const [form, setForm] = React.useState(initial)
  const [error, setError] = React.useState('')
  const set = (patch) => setForm((previous) => ({ ...previous, ...patch }))
  const toggleInput = (kind) => setForm((previous) => ({
    ...previous,
    input: previous.input.includes(kind)
      ? previous.input.filter((item) => item !== kind)
      : previous.input.concat([kind]),
  }))

  const submit = () => {
    const id = form.id.trim()
    if (!id) {
      setError(t('needModelId'))
      return
    }
    const contextWindow = form.contextWindow.trim() === '' ? undefined : Number(form.contextWindow)
    const maxTokens = form.maxTokens.trim() === '' ? undefined : Number(form.maxTokens)
    onSave({
      ...model,
      id,
      name: form.name.trim() || undefined,
      contextWindow: Number.isFinite(contextWindow) ? contextWindow : undefined,
      maxTokens: Number.isFinite(maxTokens) ? maxTokens : undefined,
      input: form.input.length > 0 ? form.input : undefined,
    })
  }

  return (
    <Modal
      open
      onClose={onCancel}
      title={t('editModel')}
      footer={(
        <>
          <button
            type="button"
            className="dpp-btn dpp-btnGhost"
            onClick={() => { setForm(initial); setError('') }}
          >
            {t('resetForm')}
          </button>
          <span className="dpp-footGap" />
          <button type="button" className="dpp-btn" onClick={onCancel}>{t('cancel')}</button>
          <button type="button" className="dpp-btn dpp-btnPrimary" onClick={submit} disabled={form.id.trim() === ''}>
            {t('save')}
          </button>
        </>
      )}
    >
      <div className="dpp-formGrid">
        <Field label={t('modelId')} wide>
          <input
            className="dpp-input dpp-inputMono"
            value={form.id}
            autoFocus
            placeholder="model-id"
            onChange={(event) => { set({ id: event.target.value }); setError('') }}
            onKeyDown={(event) => { if (event.key === 'Enter') submit() }}
          />
        </Field>
        <Field label={t('modelName')} wide>
          <input
            className="dpp-input"
            value={form.name}
            placeholder={t('modelName')}
            onChange={(event) => set({ name: event.target.value })}
          />
        </Field>
        <Field label={t('contextWindow')}>
          <input
            className="dpp-input dpp-inputMono"
            inputMode="numeric"
            value={form.contextWindow}
            placeholder="131072"
            onChange={(event) => set({ contextWindow: event.target.value })}
          />
        </Field>
        <Field label={t('maxTokens')}>
          <input
            className="dpp-input dpp-inputMono"
            inputMode="numeric"
            value={form.maxTokens}
            placeholder="8192"
            onChange={(event) => set({ maxTokens: event.target.value })}
          />
        </Field>
      </div>
      <div className="dpp-field">
        <span className="dpp-fieldLabel">{t('modelInputs')}</span>
        <div className="dpp-chipRow">
          {[
            { kind: 'text', label: t('inputText') },
            { kind: 'image', label: t('inputImage') },
          ].map((item) => {
            const on = form.input.includes(item.kind)
            return (
              <button
                key={item.kind}
                type="button"
                className={`dpp-chip${on ? ' is-on' : ''}`}
                aria-pressed={on}
                onClick={() => toggleInput(item.kind)}
              >
                {on ? <Icon name="check" size={12} strokeWidth={2.6} /> : null}
                {item.label}
              </button>
            )
          })}
        </div>
      </div>
      {error !== '' ? <Alert kind="err" text={error} /> : null}
    </Modal>
  )
}

function ModelList({ models, t, disabled, onEdit, onRemove, onTest, testing, testResult, onAdd }) {
  if (models.length === 0) {
    return (
      <div className="dpp-modelEmpty">
        <Icon name="info" size={15} />
        <span>{t('modelEmpty')}</span>
        <button type="button" className="dpp-linkBtn" onClick={onAdd} disabled={disabled}>
          {t('addModel')}
        </button>
      </div>
    )
  }
  return (
    <div className="dpp-modelBox">
      {models.map((model, index) => (
        <ModelRow
          key={`${model.id || 'new'}-${index}`}
          model={model}
          index={index}
          t={t}
          disabled={disabled}
          onEdit={() => onEdit(index, model)}
          onRemove={() => onRemove(index)}
          onTest={onTest}
          testing={testing}
          testResult={testResult}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// discover ("pull models from the endpoint")
// ---------------------------------------------------------------------------

function DiscoverModal({ open, t, result, onClose, onAdd, busy }) {
  const [selected, setSelected] = React.useState(() => new Set())
  const [query, setQuery] = React.useState('')
  const models = Array.isArray(result.models) ? result.models : []
  React.useEffect(() => {
    setSelected(new Set())
    setQuery('')
  }, [result])
  const needle = query.trim().toLowerCase()
  const visible = needle === ''
    ? models
    : models.filter((model) => `${model.id} ${model.name || ''}`.toLowerCase().includes(needle))
  const allChosen = models.length > 0 && selected.size === models.length

  const toggle = (id) => {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleAll = () => setSelected(allChosen ? new Set() : new Set(models.map((model) => model.id)))

  return (
    <Modal
      open={open}
      onClose={() => { if (!busy) onClose() }}
      title={t('pickModels')}
      className="dpp-modalPick"
      bodyClassName="dpp-modalBodyFlush"
      footer={(
        <>
          <button
            type="button"
            className="dpp-btn dpp-btnGhost dpp-btnSm"
            onClick={toggleAll}
            disabled={busy || models.length === 0}
          >
            {allChosen ? t('selectNone') : t('selectAll')}
          </button>
          <span className="dpp-footGap" />
          <button type="button" className="dpp-btn" onClick={onClose} disabled={busy}>{t('cancel')}</button>
          <button
            type="button"
            className="dpp-btn dpp-btnPrimary"
            disabled={busy || selected.size === 0}
            onClick={() => onAdd(models.filter((model) => selected.has(model.id)))}
          >
            {busy ? <Spinner /> : null}
            {t('addSelected')}
            {selected.size > 0 ? ` ${selected.size}` : ''}
          </button>
        </>
      )}
    >
      <div className="dpp-searchRow">
        <span className="dpp-searchIcon" aria-hidden="true"><Icon name="search" size={14} /></span>
        <input
          className="dpp-input dpp-inputSearch"
          value={query}
          autoFocus
          placeholder={t('searchModels')}
          aria-label={t('searchModels')}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query !== '' ? (
          <button type="button" className="dpp-searchClear" aria-label={t('close')} onClick={() => setQuery('')}>
            <Icon name="x" size={13} />
          </button>
        ) : null}
      </div>
      <div className="dpp-pickList">
        {visible.length === 0 ? (
          <div className="dpp-pickEmpty">
            <Icon name="info" size={15} />
            <span>{t('noModelMatch')}</span>
          </div>
        ) : null}
        {visible.map((model) => {
          const checked = selected.has(model.id)
          const context = contextLabel(model.contextWindow)
          return (
            <label key={model.id} className={`dpp-pickRow${checked ? ' is-selected' : ''}`}>
              <input
                type="checkbox"
                className="dpp-srOnly"
                checked={checked}
                onChange={() => toggle(model.id)}
              />
              <span className={`dpp-checkbox${checked ? ' is-on' : ''}`} aria-hidden="true">
                {checked ? <Icon name="check" size={11} strokeWidth={2.8} /> : null}
              </span>
              <span className="dpp-pickMain">
                <span className="dpp-pickId" title={model.id}>{model.id}</span>
                {model.name && model.name !== model.id
                  ? <span className="dpp-pickName">{model.name}</span>
                  : null}
              </span>
              {context !== '' ? <span className="dpp-badge dpp-badgeMono">{context}</span> : null}
            </label>
          )
        })}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// provider detail (level 2)
// ---------------------------------------------------------------------------

function SkeletonDetail({ t, onBack }) {
  return (
    <div>
      <button type="button" className="dpp-backBtn" onClick={onBack}>
        <Icon name="arrow-left" size={16} />
        <span>{t('backToProviders')}</span>
      </button>
      <section className="dpp-card" aria-hidden="true">
        <header className="dpp-cardHead">
          <span className="dpp-skel dpp-skelMark" style={{ width: 28, height: 28 }} />
          <div className="dpp-skelStack">
            <span className="dpp-skel" style={{ width: 140, height: 14 }} />
            <span className="dpp-skel" style={{ width: 90 }} />
          </div>
        </header>
        <div className="dpp-cardBody">
          {[0, 1, 2].map((key) => (
            <div className="dpp-skelStack" key={key}>
              <span className="dpp-skel" style={{ width: 60 }} />
              <span className="dpp-skel" style={{ width: '100%', height: 32 }} />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function DetailView({ t, call, route, writable, protocols, onBack, onChanged, pushToast }) {
  const [data, setData] = React.useState(null)
  const [draft, setDraft] = React.useState(null)
  const [models, setModels] = React.useState([])
  const [showKey, setShowKey] = React.useState(false)
  const [keyDraft, setKeyDraft] = React.useState('')
  const [keyEditing, setKeyEditing] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const [picker, setPicker] = React.useState(null)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [pickerBusy, setPickerBusy] = React.useState(false)
  const [testing, setTesting] = React.useState('')
  const [testResult, setTestResult] = React.useState(null)
  const [editor, setEditor] = React.useState(null)
  const [renaming, setRenaming] = React.useState(false)
  const [ask, setAsk] = React.useState(null)
  const [busy, setBusy] = React.useState(false)
  const [loadError, setLoadError] = React.useState('')
  const nameRef = React.useRef(null)

  const readOnly = writable === false

  const apply = React.useCallback((result) => {
    setData(result)
    setDraft({
      displayName: result.displayName || '',
      api: result.api || 'openai-completions',
      baseURL: result.baseURL || '',
    })
    setModels((Array.isArray(result.models) ? result.models : []).map((model) => ({ ...model })))
    setLoadError('')
  }, [])

  const load = React.useCallback(async () => {
    try {
      const result = await call('getProvider', { route })
      apply(result)
    } catch (err) {
      setLoadError(errText(err))
    }
  }, [apply, call, route])

  React.useEffect(() => { void load() }, [load])

  React.useEffect(() => {
    if (!copied) return undefined
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])

  React.useEffect(() => {
    if (testResult === null) return undefined
    const timer = setTimeout(() => setTestResult(null), 6000)
    return () => clearTimeout(timer)
  }, [testResult])

  React.useEffect(() => {
    if (!renaming) return
    const node = nameRef.current
    if (node === null) return
    node.focus()
    node.select()
  }, [renaming])

  const secret = data !== null && data.secret && typeof data.secret.value === 'string' && data.secret.value !== ''
    ? data.secret.value
    : ''

  const baseline = React.useMemo(() => (data === null ? '' : JSON.stringify({
    displayName: data.displayName || '',
    api: data.api || '',
    baseURL: data.baseURL || '',
    models: Array.isArray(data.models) ? data.models : [],
  })), [data])

  const current = draft === null ? '' : JSON.stringify({
    displayName: draft.displayName,
    api: draft.api,
    baseURL: draft.baseURL,
    models,
  })

  const pendingKey = keyEditing && keyDraft.trim() !== '' && keyDraft !== secret
  const dirty = baseline !== '' && (baseline !== current || pendingKey)

  const save = React.useCallback(async () => {
    if (readOnly || busy || draft === null) return
    setBusy(true)
    try {
      const patch = {
        displayName: draft.displayName,
        api: draft.api,
        baseURL: draft.baseURL,
        models: models.map((model) => {
          const next = { ...model }
          next.contextWindow = parseNumber(model.contextWindow)
          next.maxTokens = parseNumber(model.maxTokens)
          if (next.contextWindow === undefined) delete next.contextWindow
          if (next.maxTokens === undefined) delete next.maxTokens
          if (typeof next.id === 'string') next.id = next.id.trim()
          if (!next.id) throw new Error(t('needModelId'))
          return next
        }),
      }
      const nextKey = pendingKey ? keyDraft.trim() : ''
      const result = await call(
        'saveProvider',
        nextKey !== '' ? { route, patch, apiKey: nextKey } : { route, patch },
      )
      setKeyDraft('')
      setKeyEditing(false)
      await load()
      if (typeof onChanged === 'function') onChanged()
      if (result && result.persisted === false) {
        pushToast('err', t('notPersisted'), result.persistedDetail || undefined)
      } else {
        pushToast('ok', t('saved'))
      }
    } catch (err) {
      pushToast('err', t('saveFailed'), errText(err))
    } finally {
      setBusy(false)
    }
  }, [busy, call, draft, keyDraft, load, models, onChanged, pendingKey, pushToast, readOnly, route, t])

  // Cmd/Ctrl+S saves from anywhere on the page.
  React.useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void save()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [save])

  if (loadError !== '') {
    return (
      <div>
        <button type="button" className="dpp-backBtn" onClick={onBack}>
          <Icon name="arrow-left" size={16} />
          <span>{t('backToProviders')}</span>
        </button>
        <Alert kind="err" text={t('loadFailed')} detail={loadError} />
      </div>
    )
  }

  if (data === null || draft === null) {
    return <SkeletonDetail t={t} onBack={onBack} />
  }

  const official = isOfficial(data)
  const builtin = isBuiltin(data)
  const apiOptions = protocols.includes(draft.api) || !draft.api
    ? protocols
    : [draft.api].concat(protocols)
  const dirtyNow = dirty || (keyEditing && keyDraft !== secret)

  const clearKey = async () => {
    try {
      await call('saveProvider', { route, apiKey: '' })
      setShowKey(false)
      setKeyDraft('')
      setKeyEditing(false)
      await load()
      if (typeof onChanged === 'function') onChanged()
      pushToast('ok', t('keyCleared'))
    } catch (err) {
      pushToast('err', t('saveFailed'), errText(err))
    }
  }

  const removeProvider = async () => {
    try {
      await call('deleteProvider', { route })
      pushToast('ok', t('deleted'))
      if (typeof onChanged === 'function') onChanged()
      onBack()
    } catch (err) {
      pushToast('err', t('saveFailed'), errText(err))
    }
  }

  const copyKey = async () => {
    if (!secret) return
    try {
      await copyText(secret)
      setCopied(true)
    } catch (err) {
      pushToast('err', t('saveFailed'), errText(err))
    }
  }

  const testModel = async (model) => {
    if (busy || readOnly || !model.id) return
    setTesting(model.id)
    setTestResult(null)
    try {
      const result = await call('testModel', { route, model: model.id })
      if (result && result.ok) {
        setTestResult({ modelId: model.id, ok: true, latency: result.latency })
      } else {
        setTestResult({
          modelId: model.id,
          ok: false,
          error: result && result.error ? result.error : t('testFailed'),
        })
      }
    } catch (err) {
      const message = errText(err)
      const staleHost = /\b404\b/.test(message) || /transport failure/i.test(message) || /testModel/.test(message)
      setTestResult({ modelId: model.id, ok: false, error: staleHost ? t('testNeedsRestart') : message })
    } finally {
      setTesting('')
    }
  }

  const discover = async () => {
    if (readOnly || busy) return
    setPickerBusy(true)
    try {
      const result = await call('discoverModels', { route })
      const found = Array.isArray(result.models) ? result.models : []
      if (found.length === 0) {
        pushToast('err', t('discoverEmpty'))
      } else {
        setPicker({ endpoint: result.endpoint || '', models: found })
        setPickerOpen(true)
      }
    } catch (err) {
      pushToast('err', t('discoverFailed'), errText(err))
    } finally {
      setPickerBusy(false)
    }
  }

  const addDiscovered = (found) => {
    const known = new Set(models.map((model) => model.id))
    const additions = found
      .filter((model) => !known.has(model.id))
      .map((model) => ({
        id: model.id,
        name: model.name || model.id,
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
        input: ['text'],
      }))
    setModels(models.concat(additions))
    setPickerOpen(false)
    pushToast('ok', t('addSelected'), `${additions.length} ${t('modelCount')}`)
  }

  const saveEditor = (model) => {
    if (editor === null) return
    if (editor.index === null) {
      if (models.some((item) => item.id === model.id)) {
        pushToast('err', t('duplicateModel'))
        setEditor(null)
        return
      }
      setModels(models.concat([model]))
    } else {
      setModels(models.map((item, index) => (index === editor.index ? model : item)))
    }
    setEditor(null)
  }

  const askSaveOnLeave = () => {
    if (!dirtyNow) {
      onBack()
      return
    }
    setAsk({
      title: t('unsavedTitle'),
      body: t('unsavedBody'),
      confirmLabel: t('discard'),
      danger: true,
      action: async () => { onBack() },
    })
  }

  const menuItems = [
    {
      icon: 'pencil',
      label: t('rename'),
      onSelect: () => setRenaming(true),
    },
  ]
  if (!builtin) {
    menuItems.push({
      icon: 'trash-2',
      label: t('deleteProvider'),
      danger: true,
      onSelect: () => setAsk({
        title: t('deleteProvider'),
        body: t('confirmDelete'),
        confirmLabel: t('delete'),
        danger: true,
        action: removeProvider,
      }),
    })
  }

  return (
    <div>
      <button type="button" className="dpp-backBtn" onClick={askSaveOnLeave}>
        <Icon name="arrow-left" size={16} />
        <span>{t('backToProviders')}</span>
      </button>

      <section className="dpp-card">
        <header className="dpp-cardHead">
          <ProviderMark iconKey={providerIcon(data)} size={30} />
          <div className="dpp-titleBlock">
            {renaming ? (
              <input
                className="dpp-titleInput"
                ref={nameRef}
                value={draft.displayName}
                aria-label={t('displayName')}
                placeholder={route}
                disabled={readOnly}
                onChange={(event) => setDraft({ ...draft, displayName: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') setRenaming(false)
                  if (event.key === 'Escape') {
                    event.stopPropagation()
                    setDraft({ ...draft, displayName: data.displayName || '' })
                    setRenaming(false)
                  }
                }}
                onBlur={() => setRenaming(false)}
              />
            ) : (
              <button
                type="button"
                className="dpp-title"
                title={t('rename')}
                disabled={readOnly}
                onClick={() => setRenaming(true)}
              >
                <span className="dpp-titleText">{draft.displayName || route}</span>
                <Icon name="pencil" size={12} className="dpp-titlePen" />
              </button>
            )}
            <div className="dpp-providerMeta">
              <span className="dpp-mono">{route}</span>
              <span className="dpp-metaDot" aria-hidden="true" />
              <span>{modelCountText({ ...data, modelCount: models.length }, t)}</span>
              {builtin ? <span className="dpp-tag">{t('builtin')}</span> : null}
            </div>
          </div>
          <div className="dpp-cardHeadActions">
            <ActionMenu items={menuItems} label={t('providerActions')} />
          </div>
        </header>

        <div className="dpp-cardBody">
          <Field label={t('baseURL')}>
            <input
              className="dpp-input dpp-inputMono"
              value={draft.baseURL}
              disabled={readOnly}
              placeholder="https://api.example.com/v1"
              onChange={(event) => setDraft({ ...draft, baseURL: event.target.value })}
            />
          </Field>

          <Field label={t('protocol')}>
            {official ? (
              <div className="dpp-readonly">{t('officialProtocol')}</div>
            ) : (
              <SelectMenu
                value={draft.api}
                disabled={readOnly}
                ariaLabel={t('protocol')}
                options={apiOptions.map((api) => ({ value: api, label: protoOption(api) }))}
                onChange={(next) => setDraft({ ...draft, api: next })}
              />
            )}
          </Field>

          <div className="dpp-field">
            <span className="dpp-fieldLabel">
              <span>{t('apiKey')}</span>
              <span className={`dpp-keyState${secret ? ' is-on' : ''}`}>
                <span className="dpp-keyDot" aria-hidden="true" />
                {secret ? t('keyConfigured') : t('keyMissing')}
              </span>
            </span>
            <div className="dpp-keyWrap">
              <input
                className="dpp-input dpp-inputMono dpp-keyInput"
                type={showKey ? 'text' : 'password'}
                value={keyEditing ? keyDraft : secret}
                readOnly={!keyEditing}
                disabled={readOnly}
                autoComplete="off"
                spellCheck={false}
                placeholder={t('keyPlaceholder')}
                style={{ paddingRight: secret ? 86 : 52 }}
                onFocus={() => {
                  if (readOnly || keyEditing) return
                  setKeyEditing(true)
                  setKeyDraft(secret)
                }}
                onChange={(event) => setKeyDraft(event.target.value)}
                onBlur={() => {
                  if (keyDraft === secret) {
                    setKeyEditing(false)
                    setKeyDraft('')
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void save()
                  }
                  if (event.key === 'Escape') {
                    event.stopPropagation()
                    setKeyDraft('')
                    setKeyEditing(false)
                  }
                }}
              />
              <div className="dpp-keyActions">
                {secret ? (
                  <button
                    type="button"
                    className="dpp-iconBtn is-xs"
                    title={copied ? t('copied') : t('copy')}
                    aria-label={copied ? t('copied') : t('copy')}
                    onClick={() => { void copyKey() }}
                  >
                    {copied ? <Icon name="check" size={14} /> : <Icon name="copy" size={14} />}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="dpp-iconBtn is-xs"
                  title={showKey ? t('hide') : t('show')}
                  aria-label={showKey ? t('hide') : t('show')}
                  disabled={secret === ''}
                  onClick={() => setShowKey((value) => !value)}
                >
                  <Icon name={showKey ? 'eye-off' : 'eye'} size={14} />
                </button>
                {secret ? (
                  <button
                    type="button"
                    className="dpp-iconBtn is-xs is-danger"
                    title={t('clearKey')}
                    aria-label={t('clearKey')}
                    disabled={readOnly}
                    onClick={() => setAsk({
                      title: t('clearKey'),
                      body: t('confirmClearKey'),
                      confirmLabel: t('clearKeyShort'),
                      danger: true,
                      action: clearKey,
                    })}
                  >
                    <Icon name="trash-2" size={14} />
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="dpp-field">
            <div className="dpp-fieldHead">
              <span className="dpp-fieldLabel dpp-fieldLabelInline">
                {t('models')}
                <span className="dpp-count">{models.length}</span>
              </span>
              <div className="dpp-fieldHeadActions">
                <button
                  type="button"
                  className="dpp-btn dpp-btnGhost dpp-btnSm"
                  disabled={busy || readOnly || pickerBusy}
                  onClick={() => { void discover() }}
                >
                  {pickerBusy ? <Spinner size={13} /> : <Icon name="download" size={14} />}
                  {pickerBusy ? t('discovering') : t('discover')}
                </button>
                <button
                  type="button"
                  className="dpp-btn dpp-btnSecondary dpp-btnSm"
                  disabled={readOnly}
                  onClick={() => setEditor({ index: null, model: { id: '', name: '', input: ['text'] } })}
                >
                  <Icon name="plus" size={14} />
                  {t('addModel')}
                </button>
              </div>
            </div>
            <ModelList
              models={models}
              t={t}
              disabled={readOnly || busy}
              onAdd={() => setEditor({ index: null, model: { id: '', name: '', input: ['text'] } })}
              onEdit={(index, model) => setEditor({ index, model })}
              onRemove={(index) => setModels(models.filter((_, position) => position !== index))}
              onTest={testModel}
              testing={testing}
              testResult={testResult}
            />
          </div>
        </div>

        <footer className="dpp-cardFoot">
          <span className={`dpp-dirty${dirtyNow ? ' is-on' : ''}`}>{dirtyNow ? t('unsaved') : ''}</span>
          <button type="button" className="dpp-btn dpp-btnGhost" onClick={() => { void load() }} disabled={busy}>
            <Icon name="refresh-cw" size={14} />
            {t('reload')}
          </button>
          <button
            type="button"
            className="dpp-btn dpp-btnPrimary"
            onClick={() => { void save() }}
            disabled={busy || readOnly || !dirtyNow}
          >
            {busy ? <Spinner /> : null}
            {busy ? t('saving') : t('save')}
          </button>
        </footer>
      </section>

      {editor !== null ? (
        <ModelDialog
          t={t}
          model={editor.model}
          onSave={saveEditor}
          onCancel={() => setEditor(null)}
        />
      ) : null}

      <DiscoverModal
        open={pickerOpen}
        t={t}
        result={picker || EMPTY_DISCOVER}
        busy={false}
        onClose={() => setPickerOpen(false)}
        onAdd={addDiscovered}
      />

      <ConfirmDialog ask={ask} onClose={() => setAsk(null)} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// template picker
// ---------------------------------------------------------------------------

function TemplatePicker({ t, onPick, onBack }) {
  const [query, setQuery] = React.useState('')
  const [expanded, setExpanded] = React.useState(() => new Set())
  const needle = query.trim().toLowerCase()
  const LIMIT = 12

  const groups = React.useMemo(() => {
    const order = []
    const byGroup = new Map()
    for (const template of PROVIDER_TEMPLATES) {
      if (needle !== '') {
        const haystack = `${template.label} ${template.displayName} ${template.baseURL} ${template.id}`
        if (!haystack.toLowerCase().includes(needle)) continue
      }
      const name = template.group || t('groupOther')
      if (!byGroup.has(name)) {
        byGroup.set(name, [])
        order.push(name)
      }
      byGroup.get(name).push(template)
    }
    return order.map((name) => ({ name, items: byGroup.get(name) }))
  }, [needle, t])

  const toggle = (name) => {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const customCard = (
    <button type="button" className="dpp-tplCard is-custom" onClick={() => onPick(CUSTOM_TEMPLATE)}>
      <span className="dpp-mark dpp-markFallback dpp-markAdd" aria-hidden="true">
        <Icon name="plus" size={16} />
      </span>
      <span className="dpp-tplBody">
        <span className="dpp-tplName">{t('customProvider')}</span>
        <span className="dpp-tplHost">{t('customProviderHint')}</span>
      </span>
      <Icon name="chevron-right" size={14} className="dpp-tplArrow" />
    </button>
  )

  return (
    <div>
      <header className="dpp-subHead">
        <button type="button" className="dpp-backBtn" onClick={onBack}>
          <Icon name="arrow-left" size={16} />
          <span>{t('backToProviders')}</span>
        </button>
        <h2 className="dpp-pageTitle">{t('browseTemplates')}</h2>
      </header>

      <div className="dpp-searchRow dpp-tplSearch">
        <span className="dpp-searchIcon" aria-hidden="true"><Icon name="search" size={14} /></span>
        <input
          className="dpp-input dpp-inputSearch"
          value={query}
          placeholder={t('searchTemplates')}
          aria-label={t('searchTemplates')}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query !== '' ? (
          <button type="button" className="dpp-searchClear" aria-label={t('close')} onClick={() => setQuery('')}>
            <Icon name="x" size={13} />
          </button>
        ) : null}
      </div>

      {groups.length === 0 ? (
        <div className="dpp-pickEmpty dpp-tplNoMatch">
          <Icon name="info" size={15} />
          <span>{t('noTemplateMatch')}</span>
        </div>
      ) : null}

      {groups.map((group, groupIndex) => {
        const open = needle !== '' || expanded.has(group.name)
        const items = open ? group.items : group.items.slice(0, LIMIT)
        const hidden = group.items.length - items.length
        return (
          <section key={group.name} className="dpp-tplGroup">
            <h4 className="dpp-tplGroupTitle">
              {group.name}
              <span className="dpp-tplCount">{group.items.length}</span>
            </h4>
            <div className="dpp-tplGrid">
              {items.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className="dpp-tplCard"
                  onClick={() => onPick(template)}
                >
                  <ProviderMark iconKey={template.icon} size={26} />
                  <span className="dpp-tplBody">
                    <span className="dpp-tplName">{template.label}</span>
                    <span className="dpp-tplHost">{hostOf(template.baseURL) || template.api || '—'}</span>
                  </span>
                  <Icon name="chevron-right" size={14} className="dpp-tplArrow" />
                </button>
              ))}
              {groupIndex === 0 && needle === '' ? customCard : null}
            </div>
            {hidden > 0 ? (
              <button type="button" className="dpp-tplMore" onClick={() => toggle(group.name)}>
                {t('showAllTemplates')}
                <span className="dpp-tplMoreCount">{group.items.length}</span>
                <Icon name="chevron-down" size={13} />
              </button>
            ) : null}
            {open && needle === '' && group.items.length > LIMIT ? (
              <button type="button" className="dpp-tplMore" onClick={() => toggle(group.name)}>
                {t('collapseTemplates')}
                <Icon name="chevron-up" size={13} />
              </button>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// create form
// ---------------------------------------------------------------------------

const EMPTY_CREATE = {
  route: '',
  displayName: '',
  api: 'openai-completions',
  baseURL: '',
  apiKeyEnv: '',
  apiKey: '',
  modelId: '',
}

function CreateForm({ protocols, t, onCancel, onSubmit, busy, initial }) {
  const [form, setForm] = React.useState(() => ({
    ...EMPTY_CREATE,
    ...(initial !== null && typeof initial === 'object' ? initial : {}),
  }))
  const [error, setError] = React.useState('')
  const preset = initial !== null && typeof initial === 'object' ? initial : null
  const heading = preset !== null && preset.displayName ? preset.displayName : t('newProvider')
  const set = (patch) => { setForm((current) => ({ ...current, ...patch })); setError('') }

  const submit = async () => {
    setError('')
    if (!form.route.trim()) {
      setError(t('needRoute'))
      return
    }
    if (form.baseURL.trim() && !/^https?:\/\//i.test(form.baseURL.trim())) {
      setError(t('needBaseURL'))
      return
    }
    if (!form.modelId.trim()) {
      setError(t('needFirstModel'))
      return
    }
    try {
      await onSubmit({
        route: form.route.trim(),
        displayName: form.displayName.trim(),
        api: form.api,
        baseURL: form.baseURL.trim(),
        apiKey: form.apiKey,
        models: [
          {
            id: form.modelId.trim(),
            name: form.displayName.trim() || form.modelId.trim(),
            input: ['text'],
          },
        ],
      })
    } catch (err) {
      setError(errText(err))
    }
  }

  const iconKey = preset !== null && preset.icon ? preset.icon : null

  return (
    <div>
      <header className="dpp-subHead">
        <button type="button" className="dpp-backBtn" onClick={onCancel}>
          <Icon name="arrow-left" size={16} />
          <span>{t('browseTemplates')}</span>
        </button>
        <div className="dpp-subHeadTitle">
          <ProviderMark iconKey={iconKey} size={24} />
          <h2 className="dpp-pageTitle">{heading}</h2>
        </div>
      </header>

      <section className="dpp-card">
        <div className="dpp-cardBody">
          <div className="dpp-formGrid">
            <Field label={t('displayName')}>
              <input
                className="dpp-input"
                value={form.displayName}
                autoFocus
                placeholder="My Gateway"
                onChange={(event) => set({ displayName: event.target.value })}
              />
            </Field>
            <Field label={t('route')}>
              <input
                className="dpp-input dpp-inputMono"
                value={form.route}
                placeholder="my-gateway"
                onChange={(event) => set({ route: event.target.value })}
              />
            </Field>
            <Field label={t('protocol')}>
              <SelectMenu
                value={form.api}
                ariaLabel={t('protocol')}
                options={protocols.map((api) => ({ value: api, label: protoOption(api) }))}
                onChange={(next) => set({ api: next })}
              />
            </Field>
            <Field label={t('baseURL')}>
              <input
                className="dpp-input dpp-inputMono"
                value={form.baseURL}
                placeholder="https://api.example.com/v1"
                onChange={(event) => set({ baseURL: event.target.value })}
              />
            </Field>
            <Field label={t('apiKey')} wide>
              <input
                className="dpp-input dpp-inputMono"
                type="password"
                autoComplete="off"
                value={form.apiKey}
                placeholder="sk-..."
                onChange={(event) => set({ apiKey: event.target.value })}
              />
            </Field>
            <Field label={t('firstModel')} wide>
              <input
                className="dpp-input dpp-inputMono"
                value={form.modelId}
                placeholder="deepseek-v4.1-flash"
                onChange={(event) => set({ modelId: event.target.value })}
                onKeyDown={(event) => { if (event.key === 'Enter') void submit() }}
              />
            </Field>
          </div>
          {error !== '' ? <Alert kind="err" text={error} /> : null}
        </div>
        <footer className="dpp-cardFoot">
          <span className="dpp-dirty" />
          <button type="button" className="dpp-btn dpp-btnGhost" onClick={onCancel} disabled={busy}>
            {t('cancel')}
          </button>
          <button type="button" className="dpp-btn dpp-btnPrimary" onClick={() => { void submit() }} disabled={busy}>
            {busy ? <Spinner /> : null}
            {busy ? t('saving') : t('createSubmit')}
          </button>
        </footer>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// toasts
// ---------------------------------------------------------------------------

function Toasts({ t, items, onDismiss }) {
  return (
    <div className="dpp-toasts" role="status" aria-live="polite">
      {items.map((toast) => (
        <div key={toast.id} className={`dpp-toast is-${toast.kind}`}>
          <Icon
            name={toast.kind === 'ok' ? 'circle-check' : toast.kind === 'err' ? 'circle-alert' : 'info'}
            size={16}
            className="dpp-toastIcon"
          />
          <div className="dpp-toastBody">
            <span className="dpp-toastText">{toast.text}</span>
            {toast.detail ? <span className="dpp-toastDetail">{toast.detail}</span> : null}
          </div>
          <button
            type="button"
            className="dpp-toastClose"
            aria-label={t('close')}
            onClick={() => onDismiss(toast.id)}
          >
            <Icon name="x" size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// page shell
// ---------------------------------------------------------------------------

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
    const message = this.state.error && this.state.error.message
      ? this.state.error.message
      : String(this.state.error)
    return (
      <div className="dpp-root">
        <Alert kind="err" text="面板渲染失败" detail={message} />
        <button type="button" className="dpp-btn" onClick={() => this.setState({ error: null })}>
          重试
        </button>
      </div>
    )
  }
}

function PanelPageInner({ t, call }) {
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
  const rootRef = React.useRef(null)

  const pushToast = React.useCallback((kind, text, detail) => {
    const id = toastSeq.current + 1
    toastSeq.current = id
    setToasts((previous) => previous.concat([{ id, kind, text, detail }]))
    setTimeout(() => {
      setToasts((previous) => previous.filter((toast) => toast.id !== id))
    }, kind === 'err' ? 7000 : 3200)
  }, [])

  const dismissToast = (id) => setToasts((previous) => previous.filter((toast) => toast.id !== id))

  const refresh = React.useCallback(async () => {
    setRefreshing(true)
    try {
      const result = await call('listProviders')
      setBoot(result !== null && typeof result === 'object' ? result : { providers: [] })
      setLoadError('')
    } catch (err) {
      setLoadError(errText(err))
      setBoot({ providers: [], protocols: PROTO_FALLBACK, writable: false })
    } finally {
      setRefreshing(false)
    }
  }, [call])

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
      displayName: custom ? '' : template.label || '',
      api: template.api || 'openai-completions',
      baseURL: template.baseURL || '',
      apiKeyEnv: '',
      modelId: template.firstModel || '',
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
    } catch (err) {
      throw err
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
    <div className="dpp-root" ref={rootRef}>
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
    <PanelBoundary>
      <PanelPageInner {...props} />
    </PanelBoundary>
  )
}

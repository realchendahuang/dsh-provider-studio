/** One provider editor: identity, key, models and advanced settings. */
import React from 'react'
import { Icon } from '../ui-icons.jsx'
import { Alert, Field, ProviderMark, SkeletonDetail, Spinner } from '../components/ui.jsx'
import { ActionMenu, SelectMenu } from '../components/menu.jsx'
import { ConfirmDialog } from '../components/modal.jsx'
import { ModelList } from '../components/model.jsx'
import { RequestCard } from '../components/advanced-request.jsx'
import { DeepseekAdvancedCard } from '../components/advanced-deepseek.jsx'
import { ModelDialog } from './model-dialog.jsx'
import { DiscoverModal } from './discover.jsx'
import { copyText } from '../lib/clipboard.js'
import { EMPTY_DISCOVER, anthropicBaseHint, parseNumber, protoOption } from '../lib/format.js'
import { errorText, failure } from '../lib/errors.js'
import { isBuiltin, isOfficial, modelCountText, providerIcon } from '../lib/providers.js'
import { clearDraft, readDraft, writeDraft } from '../lib/draft-store.js'
import { useBeforeUnload, useProviderDraft } from '../hooks.js'
import { buildRequestPatch, buildDeepseekPatch } from '../fields.js'

/**
 * The API key field. It owns the reveal/edit/copy state so typing in it only
 * re-renders this row, and it calls `revealKey` lazily: the Host no longer
 * ships the secret with `getProvider`, so looking at or copying a key is an
 * explicit action (on focus, Show or Copy) rather than a page-load side effect.
 */
function ProviderKeyField({ t, call, route, readOnly, configured, controller, onDirtyChange, onClearKey, onSave, pushToast }) {
  const [secret, setSecret] = React.useState(null)
  const [revealing, setRevealing] = React.useState(false)
  const [keyEditing, setKeyEditing] = React.useState(false)
  const [keyDraft, setKeyDraft] = React.useState('')
  const [showKey, setShowKey] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const revealed = typeof secret === 'string'

  React.useEffect(() => {
    if (!copied) return undefined
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])

  const reveal = React.useCallback(async () => {
    // Reading the key is not a write, so a read-only settings profile can still
    // show and copy it; only editing/saving is blocked.
    if (typeof secret === 'string') return secret
    if (revealing) return null
    setRevealing(true)
    try {
      const result = await call('revealKey', { route })
      const value = result !== null && typeof result === 'object' && typeof result.value === 'string'
        ? result.value
        : ''
      setSecret(value)
      return value
    } catch (error) {
      pushToast('err', t('keyRevealFailed'), errorText(error, t))
      return null
    } finally {
      setRevealing(false)
    }
  }, [call, pushToast, revealing, route, secret, t])

  const dirty = keyEditing && keyDraft.trim() !== (revealed ? secret.trim() : '')

  React.useEffect(() => {
    if (typeof onDirtyChange === 'function') onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  const resetKey = React.useCallback(() => {
    setSecret(null)
    setKeyEditing(false)
    setKeyDraft('')
    setShowKey(false)
    setCopied(false)
  }, [])

  // The footer's Save button lives in the parent; hand it a tiny imperative
  // surface instead of lifting the per-keystroke state back up there.
  React.useEffect(() => {
    if (controller === null || controller === undefined) return
    controller.current = {
      pending: () => {
        if (!keyEditing) return null
        const next = keyDraft.trim()
        const base = revealed ? secret.trim() : ''
        return next === base ? null : next
      },
      clear: resetKey,
    }
  })

  const beginEdit = () => {
    if (readOnly || keyEditing) return
    setKeyEditing(true)
    setKeyDraft(revealed ? secret : '')
    if (!revealed) {
      void reveal().then((value) => {
        if (typeof value === 'string') setKeyDraft((current) => (current === '' ? value : current))
      })
    }
  }

  const toggleShow = () => {
    if (!revealed && !revealing) {
      void reveal().then((value) => {
        if (typeof value === 'string') setShowKey(true)
      })
      return
    }
    if (!revealed) return
    setShowKey((value) => !value)
  }

  const copyKey = async () => {
    // `reveal` reports a failed read itself, so a null/empty answer just means
    // there is nothing to copy.
    const value = await reveal()
    if (typeof value !== 'string' || value === '') return
    try {
      await copyText(value)
      setCopied(true)
    } catch (error) {
      pushToast('err', t('saveFailed'), errorText(error, t))
    }
  }

  const shown = keyEditing ? keyDraft : (revealed ? secret : '')

  return (
    <div className="dpp-field">
      <span className="dpp-fieldLabel">
        <span>{t('apiKey')}</span>
        <span className={`dpp-keyState${configured ? ' is-on' : ''}`}>
          <span className="dpp-keyDot" aria-hidden="true" />
          {configured ? t('keyConfigured') : t('keyMissing')}
        </span>
      </span>
      <div className="dpp-keyWrap">
        <input
          className="dpp-input dpp-inputMono dpp-keyInput"
          type={showKey ? 'text' : 'password'}
          value={shown}
          readOnly={!keyEditing}
          disabled={readOnly}
          autoComplete="off"
          spellCheck={false}
          aria-label={t('apiKey')}
          placeholder={t('keyPlaceholder')}
          style={{ paddingRight: configured ? 86 : 52 }}
          onFocus={beginEdit}
          onChange={(event) => setKeyDraft(event.target.value)}
          onBlur={() => {
            if (keyDraft === (revealed ? secret : '')) {
              setKeyEditing(false)
              setKeyDraft('')
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void onSave()
            }
            if (event.key === 'Escape') {
              event.stopPropagation()
              setKeyDraft(revealed ? secret : '')
              setKeyEditing(false)
            }
          }}
        />
        <div className="dpp-keyActions">
          {configured ? (
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
            disabled={!configured && !revealed}
            onClick={toggleShow}
          >
            {revealing ? <Spinner size={14} /> : <Icon name={showKey ? 'eye-off' : 'eye'} size={14} />}
          </button>
          {configured ? (
            <button
              type="button"
              className="dpp-iconBtn is-xs is-danger"
              title={t('clearKey')}
              aria-label={t('clearKey')}
              disabled={readOnly}
              onClick={() => { if (typeof onClearKey === 'function') onClearKey() }}
            >
              <Icon name="trash-2" size={14} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function DetailView({ t, call, route, writable, protocols, onBack, onChanged, pushToast }) {
  const {
    data,
    draft,
    setDraft,
    models,
    setModels,
    request,
    setRequest,
    loadError,
    baseline,
    current,
    load,
    markSaved,
  } = useProviderDraft(route, call, t)
  const [keyDirty, setKeyDirty] = React.useState(false)
  const [picker, setPicker] = React.useState(null)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [pickerBusy, setPickerBusy] = React.useState(false)
  const [testing, setTesting] = React.useState('')
  const [testResult, setTestResult] = React.useState(null)
  const [editor, setEditor] = React.useState(null)
  const [renaming, setRenaming] = React.useState(false)
  const [ask, setAsk] = React.useState(null)
  const [busy, setBusy] = React.useState(false)
  const nameRef = React.useRef(null)
  const keyRef = React.useRef(null)
  const dialogOpenRef = React.useRef(false)
  const restoreRef = React.useRef(false)
  const dirtyRef = React.useRef(false)

  const readOnly = writable === false

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

  const draftDirty = baseline !== '' && current !== baseline
  const dirty = draftDirty || keyDirty
  dirtyRef.current = dirty
  dialogOpenRef.current = editor !== null || ask !== null
  useBeforeUnload(dirty)

  // Keep a session-scoped snapshot so switching settings sections (which
  // unmounts this view) does not silently drop the draft. Secrets are never
  // part of it: a pending key only lives in this component's state.
  const snapshot = React.useMemo(
    () => (draft === null ? null : { draft, models, request }),
    [draft, models, request],
  )

  const savedSnapshotRef = React.useRef(null)

  React.useEffect(() => {
    if (!dirty || snapshot === null) return
    // A snapshot that was just saved is not a draft any more; rewriting it here
    // would resurrect a restore prompt for changes that are already on disk.
    if (snapshot === savedSnapshotRef.current) return
    writeDraft(route, snapshot)
  }, [dirty, route, snapshot])

  // Offer to restore a draft left behind by an earlier mount of this route.
  React.useEffect(() => {
    if (restoreRef.current || data === null || draft === null) return
    restoreRef.current = true
    const saved = readDraft(route)
    if (saved === null || typeof saved !== 'object') return
    setAsk({
      title: t('restoreTitle'),
      body: t('restoreBody'),
      confirmLabel: t('restore'),
      cancelLabel: t('discard'),
      action: async () => {
        if (saved.draft !== null && typeof saved.draft === 'object') setDraft({ ...saved.draft })
        if (Array.isArray(saved.models)) setModels(saved.models)
        if (saved.request !== null && typeof saved.request === 'object') setRequest(saved.request)
      },
      onCancel: () => clearDraft(route),
    })
  }, [data, draft, route, setDraft, setModels, setRequest, t])

  // A clean view leaves nothing behind; a dirty one keeps its snapshot for the
  // next mount (that is the whole point of the store).
  React.useEffect(() => () => {
    if (dirtyRef.current !== true) clearDraft(route)
  }, [route])

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
      if (request !== null) {
        patch.advanced = data !== null && isOfficial(data) ? buildDeepseekPatch(request) : buildRequestPatch(request)
      }
      const args = { route, patch }
      const pendingKey = keyRef.current !== null ? keyRef.current.pending() : null
      if (pendingKey !== null) args.apiKey = pendingKey
      const result = await call('saveProvider', args)
      if (keyRef.current !== null) keyRef.current.clear()
      savedSnapshotRef.current = snapshot
      clearDraft(route)
      markSaved()
      if (typeof onChanged === 'function') onChanged()
      if (result && result.persisted === false) {
        pushToast('err', t('notPersisted'), result.persistedDetail || undefined)
      } else {
        pushToast('ok', t('saved'))
      }
      // Reload separately: a failed refresh must not report the save itself as
      // failed (the write already succeeded).
      const reloaded = await load()
      if (!reloaded) pushToast('err', t('loadFailed'))
    } catch (error) {
      pushToast('err', t('saveFailed'), errorText(error, t))
    } finally {
      setBusy(false)
    }
  }, [busy, call, data, draft, load, markSaved, models, onChanged, pushToast, readOnly, request, route, snapshot, t])

  // Cmd/Ctrl+S saves from anywhere on the page, except while a dialog is open:
  // its own primary action owns the keystroke there.
  React.useEffect(() => {
    const onKeyDown = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return
      if (dialogOpenRef.current) return
      event.preventDefault()
      void save()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [save])

  if (loadError !== '' && (data === null || draft === null)) {
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
  const dirtyNow = dirty

  const clearKey = async () => {
    await call('saveProvider', { route, apiKey: '' })
    if (keyRef.current !== null) keyRef.current.clear()
    clearDraft(route)
    await load()
    if (typeof onChanged === 'function') onChanged()
    pushToast('ok', t('keyCleared'))
  }

  const removeProvider = async () => {
    await call('deleteProvider', { route })
    clearDraft(route)
    pushToast('ok', t('deleted'))
    if (typeof onChanged === 'function') onChanged()
    onBack()
  }

  /** Copy this provider as a paste-ready patch entry (keys are never included). */
  const copyConfig = async () => {
    const result = await call('exportProvider', { route })
    if (typeof result.yaml !== 'string') throw failure('EXPORT_FAILED')
    await copyText(result.yaml)
    pushToast('ok', t('copiedConfig'))
  }

  const testModel = async (model) => {
    if (busy || readOnly || !model.id) return
    setTesting(model.id)
    setTestResult(null)
    try {
      const result = await call('testModel', { route, model: model.id })
      setTestResult({ modelId: model.id, ok: true, latency: result.latency })
    } catch (error) {
      const message = errorText(error, t)
      const staleHost = /\b404\b/.test(message)
        || /transport failure/i.test(message)
        || /testModel/.test(message)
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
    } catch (error) {
      pushToast('err', t('discoverFailed'), errorText(error, t))
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
      action: async () => {
        clearDraft(route)
        onBack()
      },
    })
  }

  const baseURLHint = anthropicBaseHint(draft.api, draft.baseURL, t)

  const menuItems = []
  menuItems.push({
    icon: 'copy',
    label: t('copyConfig'),
    onSelect: () => { void copyConfig().catch((error) => { pushToast('err', t('saveFailed'), errorText(error, t)) }) },
  })
  if (!builtin) {
    menuItems.push({
      icon: 'pencil',
      label: t('rename'),
      onSelect: () => setRenaming(true),
    })
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
          <ProviderMark iconKey={providerIcon(data, t)} size={30} />
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
                <span className="dpp-titleText">{draft.displayName || (official ? t('deepseekOfficial') : route)}</span>
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
            {menuItems.length > 0 ? (
              <ActionMenu items={menuItems} label={t('providerActions')} />
            ) : null}
          </div>
        </header>

        <div className="dpp-cardBody">
          {loadError !== '' ? <Alert kind="err" text={t('loadFailed')} detail={loadError} /> : null}

          <Field label={t('baseURL')}>
            <input
              className="dpp-input dpp-inputMono"
              value={draft.baseURL}
              disabled={readOnly}
              placeholder="https://api.example.com/v1"
              onChange={(event) => setDraft({ ...draft, baseURL: event.target.value })}
            />
            {baseURLHint !== undefined ? <span className="dpp-fieldHint">{baseURLHint}</span> : null}
          </Field>

          <Field label={t('protocol')}>
            {official ? (
              <div className="dpp-readonly">{t('officialProtocol')}</div>
            ) : (
              <SelectMenu
                value={draft.api}
                disabled={readOnly}
                ariaLabel={t('protocol')}
                options={apiOptions.map((api) => ({ value: api, label: protoOption(api, t) }))}
                onChange={(next) => setDraft({ ...draft, api: next })}
              />
            )}
          </Field>

          <ProviderKeyField
            t={t}
            call={call}
            route={route}
            readOnly={readOnly}
            configured={data.keyConfigured === true}
            controller={keyRef}
            onDirtyChange={setKeyDirty}
            onSave={save}
            pushToast={pushToast}
            onClearKey={() => setAsk({
              title: t('clearKey'),
              body: t('confirmClearKey'),
              confirmLabel: t('clearKeyShort'),
              danger: true,
              action: clearKey,
            })}
          />

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

          {request !== null ? (
            official ? (
              <DeepseekAdvancedCard
                t={t}
                state={request}
                onChange={setRequest}
                disabled={readOnly || busy}
              />
            ) : (
              <RequestCard
                t={t}
                state={request}
                onChange={setRequest}
                disabled={readOnly || busy}
              />
            )
          ) : null}
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
          api={draft.api}
          showAdvanced={!official}
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

      <ConfirmDialog
        ask={ask}
        t={t}
        onClose={() => setAsk(null)}
        onError={(error) => pushToast('err', t('saveFailed'), errorText(error, t))}
      />
    </div>
  )
}

export { DetailView }

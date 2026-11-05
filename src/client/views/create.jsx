/** Create a provider from a template (or from scratch). */
import React from 'react'
import { Icon } from '../ui-icons.jsx'
import { Alert, Field, ProviderMark, Spinner } from '../components/ui.jsx'
import { SelectMenu } from '../components/menu.jsx'
import { anthropicBaseHint, protoOption } from '../lib/format.js'
import { errorText } from '../lib/errors.js'

// ---------------------------------------------------------------------------
// create form
// ---------------------------------------------------------------------------

const EMPTY_CREATE = {
  route: '',
  displayName: '',
  api: 'openai-completions',
  baseURL: '',
  apiKey: '',
  modelId: '',
}

/** Select value that flips the model field back to free text. */
const MANUAL_MODEL = '__manual__'

export function CreateForm({ protocols, t, call, onCancel, onSubmit, busy, initial }) {
  const [form, setForm] = React.useState(() => ({
    ...EMPTY_CREATE,
    ...(initial !== null && typeof initial === 'object' ? initial : {}),
  }))
  const [error, setError] = React.useState('')
  // Models the endpoint reported for the values currently typed in. Empty
  // keeps the field a plain text input, so a provider created without a key
  // (or against an endpoint that lists nothing) still works by hand.
  const [endpointModels, setEndpointModels] = React.useState([])
  const [reading, setReading] = React.useState(false)
  const preset = initial !== null && typeof initial === 'object' ? initial : null
  const heading = preset !== null && preset.displayName ? preset.displayName : t('newProvider')
  const set = (patch) => {
    setForm((current) => ({ ...current, ...patch }))
    setError('')
    // A different endpoint or key makes a fetched list meaningless.
    if ('baseURL' in patch || 'api' in patch || 'apiKey' in patch) setEndpointModels([])
  }

  const readEndpoint = async () => {
    setError('')
    const baseURL = form.baseURL.trim()
    if (!baseURL) {
      setError(t('needBaseURL'))
      return
    }
    setReading(true)
    try {
      const result = await call('discoverModels', { baseURL, api: form.api, apiKey: form.apiKey })
      const list = Array.isArray(result.models) ? result.models : []
      if (list.length === 0) {
        setError(t('discoverEmpty'))
        return
      }
      setEndpointModels(list)
    } catch (err) {
      setError(errorText(err, t))
    } finally {
      setReading(false)
    }
  }

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
      setError(errorText(err, t))
    }
  }

  const iconKey = preset !== null && preset.icon ? preset.icon : null
  const baseURLHint = anthropicBaseHint(form.api, form.baseURL, t)

  return (
    <div>
      <header className="dpp-subHead">
        <button type="button" className="dpp-backBtn" onClick={onCancel}>
          <Icon name="arrow-left" size={16} />
          <span>{t('browseTemplates')}</span>
        </button>
        <div className="dpp-subHeadTitle">
          <ProviderMark iconKey={iconKey} label={heading} size={24} />
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
                options={protocols.map((api) => ({ value: api, label: protoOption(api, t) }))}
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
              {baseURLHint !== undefined ? <span className="dpp-fieldHint">{baseURLHint}</span> : null}
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
            <Field
              label={t('firstModel')}
              wide
              hint={endpointModels.length > 0 ? `${endpointModels.length} ${t('modelCount')}` : undefined}
            >
              {endpointModels.length === 0 ? (
                <div className="dpp-inlineField">
                  <input
                    className="dpp-input dpp-inputMono"
                    value={form.modelId}
                    placeholder="deepseek-v4.1-flash"
                    onChange={(event) => set({ modelId: event.target.value })}
                    onKeyDown={(event) => { if (event.key === 'Enter') void submit() }}
                  />
                  <button
                    type="button"
                    className="dpp-btn dpp-btnGhost dpp-btnSm"
                    title={t('readModels')}
                    disabled={reading || busy}
                    onClick={() => { void readEndpoint() }}
                  >
                    {reading ? <Spinner size={13} /> : <Icon name="refresh-cw" size={13} />}
                    <span>{t('readModels')}</span>
                  </button>
                </div>
              ) : (
                <SelectMenu
                  value={form.modelId}
                  ariaLabel={t('firstModel')}
                  placeholder={t('pickFirstModel')}
                  options={endpointModels
                    .map((model) => ({ value: model.id, label: model.id }))
                    .concat([{ value: MANUAL_MODEL, label: t('manualInput') }])}
                  onChange={(next) => {
                    if (next === MANUAL_MODEL) {
                      setEndpointModels([])
                      return
                    }
                    set({ modelId: next })
                  }}
                />
              )}
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

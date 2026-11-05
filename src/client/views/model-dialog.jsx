/** Add/edit one model: id, limits, input formats and advanced knobs. */
import React from 'react'
import { Icon } from '../ui-icons.jsx'
import { Modal } from '../components/modal.jsx'
import { Alert, Field } from '../components/ui.jsx'
import { ThinkingEditor, CompatEditor } from './editors.jsx'
import { parseNumber } from '../lib/format.js'
import {
  readReasoning,
  applyReasoning,
  readCompat,
  writeCompat,
  reasoningProblem,
} from '../fields.js'

export function ModelDialog({ t, model, api, showAdvanced, onSave, onCancel }) {
  const initial = {
    id: model.id || '',
    name: model.name || '',
    contextWindow: model.contextWindow === undefined || model.contextWindow === null ? '' : String(model.contextWindow),
    maxTokens: model.maxTokens === undefined || model.maxTokens === null ? '' : String(model.maxTokens),
    input: Array.isArray(model.input) && model.input.length > 0 ? model.input : ['text'],
  }
  const [form, setForm] = React.useState(initial)
  const [thinking, setThinking] = React.useState(() => readReasoning(model))
  const [compat, setCompat] = React.useState(() => readCompat(model.compat, api))
  const [advancedOpen, setAdvancedOpen] = React.useState(() => (
    readCompat(model.compat, api).length > 0 || readReasoning(model).mode !== 'inherit'
  ))
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
    const problem = reasoningProblem(thinking)
    if (problem !== '') {
      setError(t(problem))
      return
    }
    const contextWindow = parseNumber(form.contextWindow)
    const maxTokens = parseNumber(form.maxTokens)
    const next = { ...model, id }
    next.name = form.name.trim()
    if (next.name === '') delete next.name
    if (contextWindow === undefined) delete next.contextWindow
    else next.contextWindow = contextWindow
    if (maxTokens === undefined) delete next.maxTokens
    else next.maxTokens = maxTokens
    if (form.input.length > 0) next.input = form.input
    else delete next.input
    const withThinking = showAdvanced ? applyReasoning(next, thinking) : next
    if (showAdvanced) {
      const declared = writeCompat(compat)
      if (declared === undefined) delete withThinking.compat
      else withThinking.compat = declared
    }
    onSave(withThinking)
  }

  const reset = () => {
    setForm(initial)
    setThinking(readReasoning(model))
    setCompat(readCompat(model.compat, api))
    setError('')
  }

  const declared = (thinking.mode === 'inherit' ? 0 : 1) + (compat.length > 0 ? 1 : 0)

  return (
    <Modal
      open
      onClose={onCancel}
      title={t('editModel')}
      closeLabel={t('close')}
      className="dpp-modalModel"
      footer={(
        <>
          <button type="button" className="dpp-btn dpp-btnGhost" onClick={reset}>
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
      {showAdvanced ? (
        <div className="dpp-modelAdvanced">
          <button
            type="button"
            className="dpp-advToggle"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((value) => !value)}
          >
            <Icon name={advancedOpen ? 'chevron-down' : 'chevron-right'} size={13} />
            {t('advanced')}
            {declared !== 0 ? <span className="dpp-badge">{declared}</span> : null}
          </button>
          {advancedOpen ? (
            <div className="dpp-advPanel">
              <div className="dpp-field">
                <span className="dpp-fieldLabel">
                  <Icon name="sparkles" size={13} className="dpp-fieldIcon" />
                  {t('thinking')}
                </span>
                <ThinkingEditor t={t} state={thinking} onChange={setThinking} />
              </div>
              <div className="dpp-field">
                <span className="dpp-fieldLabel">{t('compat')}</span>
                <CompatEditor t={t} api={api} rows={compat} onChange={setCompat} />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {error !== '' ? <Alert kind="err" text={error} /> : null}
    </Modal>
  )
}

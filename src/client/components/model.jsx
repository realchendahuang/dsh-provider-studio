/** Model list rows and the model list container. */
import React from 'react'
import { Icon } from '../ui-icons.jsx'
import { Spinner } from './ui.jsx'
import { contextLabel } from '../lib/format.js'

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

export function ModelList({ models, t, disabled, onEdit, onRemove, onTest, testing, testResult, onAdd }) {
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

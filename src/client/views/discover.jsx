/** Pick models reported by the endpoint. */
import React from 'react'
import { Icon } from '../ui-icons.jsx'
import { Modal } from '../components/modal.jsx'
import { Spinner } from '../components/ui.jsx'
import { contextLabel } from '../lib/format.js'

// ---------------------------------------------------------------------------
// discover ("pull models from the endpoint")
// ---------------------------------------------------------------------------

export function DiscoverModal({ open, t, result, onClose, onAdd, busy }) {
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
      closeLabel={t('close')}
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
                <span className="dpp-pickId" title={model.name && model.name !== model.id ? `${model.id} · ${model.name}` : model.id}>
                  {model.id}
                </span>
              </span>
              {context !== '' ? <span className="dpp-badge dpp-badgeMono">{context}</span> : null}
            </label>
          )
        })}
      </div>
    </Modal>
  )
}

/** Model-level advanced editors: thinking levels and compat switches. */
import React from 'react'
import { Icon } from '../ui-icons.jsx'
import { SelectMenu } from '../components/menu.jsx'
import {
  THINKING_LEVELS,
  levelKey,
  initialReasoningRows,
  reasoningProblem,
  COMPAT_FIELDS,
  compatFieldsFor,
  parseJsonValue,
  formatJsonValue,
} from '../fields.js'

// ---------------------------------------------------------------------------
// advanced field editors
// ---------------------------------------------------------------------------

/** Translated label for one compat switch, falling back to the raw key. */
function compatLabel(t, field) {
  if (field === undefined) return ''
  const label = t(field.labelKey)
  return label === field.labelKey ? field.key : label
}

/** Two-state choice that reads better than a checkbox in a dense row. */
export function BoolToggle({ t, value, onChange, disabled }) {
  return (
    <div className="dpp-bool" role="group">
      {[true, false].map((state) => (
        <button
          key={String(state)}
          type="button"
          className={`dpp-boolBtn${value === state ? ' is-on' : ''}`}
          aria-pressed={value === state}
          disabled={disabled}
          onClick={() => onChange(state)}
        >
          {state ? t('compatOn') : t('compatOff')}
        </button>
      ))}
    </div>
  )
}

/** The thinking levels a model offers: inherit the catalog, refuse them, or
 *  spell them out one level per row. */
export function ThinkingEditor({ t, state, onChange, disabled }) {
  const modes = [
    { value: 'inherit', label: t('thinkingInherit') },
    { value: 'none', label: t('thinkingNone') },
    { value: 'custom', label: t('thinkingCustom') },
  ]
  const used = state.rows.map(([level]) => level)
  const free = THINKING_LEVELS.filter((level) => !used.includes(level))
  const setMode = (mode) => {
    if (mode === 'custom') {
      onChange({ mode, rows: state.rows.length > 0 ? state.rows : initialReasoningRows() })
      return
    }
    onChange({ mode, rows: [] })
  }
  const setRow = (index, entry) => onChange({
    ...state,
    rows: state.rows.map((row, at) => (at === index ? entry : row)),
  })
  const removeRow = (index) => onChange({ ...state, rows: state.rows.filter((_, at) => at !== index) })
  const addRow = () => {
    if (free.length === 0) return
    // Offer the next escalation step after the highest declared level, so a
    // model that already speaks low/high gains "max" rather than "off".
    const highest = used.reduce((top, level) => Math.max(top, THINKING_LEVELS.indexOf(level)), -1)
    const next = THINKING_LEVELS.find((level, index) => index > highest && !used.includes(level)) || free[0]
    onChange({ ...state, rows: state.rows.concat([[next, next === 'off' ? '' : next]]) })
  }
  const problem = reasoningProblem(state)

  return (
    <div className="dpp-thinking">
      <SelectMenu
        value={state.mode}
        options={modes}
        onChange={setMode}
        ariaLabel={t('thinking')}
        disabled={disabled}
      />
      {state.mode === 'custom' ? (
        <div className="dpp-effList">
          {state.rows.map(([level, wire], index) => (
            <div className="dpp-kvRow" key={`${level}-${index}`}>
              <SelectMenu
                className="dpp-effLevel"
                value={level}
                ariaLabel={t('thinkingLevel')}
                disabled={disabled}
                options={THINKING_LEVELS
                  .filter((candidate) => candidate === level || !used.includes(candidate))
                  .map((candidate) => ({ value: candidate, label: t(levelKey(candidate)) }))}
                onChange={(next) => setRow(index, [next, wire])}
              />
              <input
                className="dpp-input dpp-inputMono"
                value={wire}
                placeholder={level === 'off' ? t('thinkingOffValue') : level}
                aria-label={t('thinkingWire')}
                disabled={disabled}
                onChange={(event) => setRow(index, [level, event.target.value])}
              />
              <button
                type="button"
                className="dpp-iconBtn is-xs is-danger"
                aria-label={t('remove')}
                disabled={disabled}
                onClick={() => removeRow(index)}
              >
                <Icon name="x" size={13} strokeWidth={2.2} />
              </button>
            </div>
          ))}
          {free.length > 0 ? (
            <button type="button" className="dpp-addRow is-compact" disabled={disabled} onClick={addRow}>
              <span className="dpp-addRowIcon" aria-hidden="true"><Icon name="plus" size={13} /></span>
              {t('thinkingAddLevel')}
            </button>
          ) : null}
        </div>
      ) : null}
      {problem !== '' ? <span className="dpp-rowError">{t(problem)}</span> : null}
    </div>
  )
}

/** The wire-compatibility switches one protocol offers, added row by row so the
 *  form never shows a wall of switches nobody uses. */
export function CompatEditor({ t, api, rows, onChange, disabled }) {
  const [drafts, setDrafts] = React.useState({})
  const fields = compatFieldsFor(api)
  const used = new Set(rows.map(([key]) => key))
  const remaining = fields.filter((field) => !used.has(field.key))
  const setValue = (index, value) => onChange(rows.map((row, at) => (at === index ? [row[0], value] : row)))
  const removeAt = (index) => onChange(rows.filter((_, at) => at !== index))
  const add = (key) => {
    const field = COMPAT_FIELDS[key]
    if (field === undefined) return
    const seed = field.kind === 'bool' ? true : field.kind === 'enum' ? field.options[0] : field.kind === 'number' ? 1 : {}
    onChange(rows.concat([[key, seed]]))
  }

  if (fields.length === 0) return <p className="dpp-emptyNote">{t('compatUnavailable')}</p>

  return (
    <div className="dpp-kvList">
      {rows.map(([key, value], index) => {
        const field = COMPAT_FIELDS[key]
        if (field === undefined) return null
        let control = null
        if (field.kind === 'bool') {
          control = <BoolToggle t={t} value={value !== false} disabled={disabled} onChange={(next) => setValue(index, next)} />
        } else if (field.kind === 'enum') {
          control = (
            <SelectMenu
              value={value}
              ariaLabel={compatLabel(t, field)}
              disabled={disabled}
              options={field.options.map((option) => ({ value: option, label: option }))}
              onChange={(next) => setValue(index, next)}
            />
          )
        } else if (field.kind === 'number') {
          control = (
            <input
              className="dpp-input"
              inputMode="numeric"
              value={value === undefined || value === null ? '' : String(value)}
              aria-label={compatLabel(t, field)}
              disabled={disabled}
              onChange={(event) => {
                const parsed = Number(event.target.value)
                setValue(index, Number.isFinite(parsed) ? parsed : 0)
              }}
            />
          )
        } else {
          const draft = drafts[key]
          const text = draft !== undefined ? draft : formatJsonValue(value)
          const invalid = draft !== undefined && parseJsonValue(draft) === null
          control = (
            <input
              className={invalid ? 'dpp-input dpp-inputMono is-invalid' : 'dpp-input dpp-inputMono'}
              value={text}
              aria-label={compatLabel(t, field)}
              aria-invalid={invalid}
              placeholder="{}"
              disabled={disabled}
              onChange={(event) => {
                const next = event.target.value
                setDrafts((previous) => ({ ...previous, [key]: next }))
                const parsed = parseJsonValue(next)
                if (parsed !== null) setValue(index, parsed === undefined ? {} : parsed)
              }}
              onBlur={() => {
                if (parseJsonValue(text) === null) return
                setDrafts((previous) => {
                  const next = { ...previous }
                  delete next[key]
                  return next
                })
              }}
            />
          )
        }
        return (
          <div className="dpp-kvRow" key={key}>
            <span className="dpp-kvLabel" title={key}>{compatLabel(t, field)}</span>
            <div className="dpp-kvValue">{control}</div>
            <button
              type="button"
              className="dpp-iconBtn is-xs is-danger"
              aria-label={t('remove')}
              disabled={disabled}
              onClick={() => removeAt(index)}
            >
              <Icon name="x" size={13} strokeWidth={2.2} />
            </button>
          </div>
        )
      })}
      {remaining.length > 0 ? (
        <SelectMenu
          className="dpp-addMenu"
          value=""
          placeholder={t('compatAdd')}
          ariaLabel={t('compatAdd')}
          disabled={disabled}
          options={remaining.map((field) => ({ value: field.key, label: compatLabel(t, field) }))}
          onChange={add}
        />
      ) : null}
    </div>
  )
}


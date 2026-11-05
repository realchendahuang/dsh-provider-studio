/** The smaller advanced card the built-in DeepSeek provider gets. */
import React from 'react'
import { Icon } from '../ui-icons.jsx'
import { SelectMenu } from './menu.jsx'
import { AdvancedSection } from './advanced-request.jsx'
import { DEEPSEEK_EFFORTS, RETRY_MODES, RETRY_MODE_LABEL_KEYS, deepseekCount, levelLabel } from '../fields.js'

/** The built-in DeepSeek route keeps its own vocabulary: thinking mode,
 *  reasoning effort and a few adapter-level caps that the main card omits. */
export function DeepseekAdvancedCard({ t, state, onChange, disabled }) {
  const [open, setOpen] = React.useState(() => deepseekCount(state) > 0)
  const count = deepseekCount(state)
  const set = (patch) => onChange({ ...state, ...patch })
  const clearOption = { value: '', label: t('advUnset') }
  return (
    <section className="dpp-advBlock">
      <button
        type="button"
        className="dpp-advHead"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} className="dpp-advChevron" />
        <span className="dpp-advTitle">{t('advanced')}</span>
        {count > 0 ? <span className="dpp-badge">{count}</span> : null}
      </button>
      {open ? (
        <div className="dpp-advBody">
          <AdvancedSection title={t('advBehaviour')}>
            <div className="dpp-formGrid">
              <div className="dpp-field">
                <span className="dpp-fieldLabel">{t('advThinking')}</span>
                <SelectMenu
                  value={state.thinking}
                  ariaLabel={t('advThinking')}
                  disabled={disabled}
                  options={[clearOption,
                    { value: 'enabled', label: t('advThinkingOn') },
                    { value: 'disabled', label: t('advThinkingOff') },
                  ]}
                  onChange={(next) => set({ thinking: next })}
                />
              </div>
              <div className="dpp-field">
                <span className="dpp-fieldLabel">{t('advReasoningEffort')}</span>
                <SelectMenu
                  value={state.reasoningEffort}
                  ariaLabel={t('advReasoningEffort')}
                  disabled={disabled}
                  options={[clearOption].concat(DEEPSEEK_EFFORTS.map((level) => ({
                    value: level,
                    label: levelLabel(t, level),
                  })))}
                  onChange={(next) => set({ reasoningEffort: next })}
                />
              </div>
              <div className="dpp-field">
                <span className="dpp-fieldLabel">{t('advMaxTokens')}</span>
                <input
                  className="dpp-input"
                  inputMode="numeric"
                  value={state.maxTokens}
                  aria-label={t('advMaxTokens')}
                  disabled={disabled}
                  onChange={(event) => set({ maxTokens: event.target.value })}
                />
              </div>
            </div>
          </AdvancedSection>
          <AdvancedSection title={t('advConnection')}>
            <div className="dpp-formGrid">
              <div className="dpp-field">
                <span className="dpp-fieldLabel">{t('advStreamIdle')}</span>
                <input
                  className="dpp-input"
                  inputMode="numeric"
                  value={state.streamIdleTimeoutMs}
                  aria-label={t('advStreamIdle')}
                  disabled={disabled}
                  onChange={(event) => set({ streamIdleTimeoutMs: event.target.value })}
                />
              </div>
              <div className="dpp-field">
                <span className="dpp-fieldLabel">{t('advRetry')}</span>
                <SelectMenu
                  value={state.retryMode}
                  ariaLabel={t('advRetry')}
                  disabled={disabled}
                  options={[clearOption].concat(RETRY_MODES.map((mode) => ({
                    value: mode,
                    label: t(RETRY_MODE_LABEL_KEYS[mode] || mode),
                  })))}
                  onChange={(next) => set({ retryMode: next })}
                />
              </div>
              {state.retryMode === 'normal' ? (
                <div className="dpp-field">
                  <span className="dpp-fieldLabel">{t('advMaxRetries')}</span>
                  <input
                    className="dpp-input"
                    inputMode="numeric"
                    value={state.maxRetries}
                    placeholder="5"
                    aria-label={t('advMaxRetries')}
                    disabled={disabled}
                    onChange={(event) => set({ maxRetries: event.target.value })}
                  />
                </div>
              ) : null}
            </div>
          </AdvancedSection>
        </div>
      ) : null}
    </section>
  )
}

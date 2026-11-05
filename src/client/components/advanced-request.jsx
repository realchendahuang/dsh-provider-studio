/** Route-level request settings: headers, transport, timeouts, retry, images. */
import React from 'react'
import { Icon } from '../ui-icons.jsx'
import { SelectMenu } from './menu.jsx'
import { TRANSPORTS, CACHE_RETENTIONS, RETRY_MODES, RETRY_MODE_LABEL_KEYS, requestCount } from '../fields.js'

/** One quiet section of the advanced card. */
export function AdvancedSection({ title, children }) {
  return (
    <div className="dpp-advSection">
      <span className="dpp-advLabel">{title}</span>
      {children}
    </div>
  )
}

/** The provider's own request settings: headers, transport, timeouts, retry
 *  policy and image budgets. Nothing model-level belongs here — a model's
 *  thinking levels and wire compatibility are edited on the model itself. */
export function RequestCard({ t, state, onChange, disabled }) {
  const [open, setOpen] = React.useState(() => requestCount(state) > 0)
  const count = requestCount(state)
  const set = (patch) => onChange({ ...state, ...patch })
  const clearOption = { value: '', label: t('advUnset') }
  const options = (values) => [clearOption].concat(values.map((value) => ({ value, label: value })))

  return (
    <section className="dpp-advBlock">
      <button
        type="button"
        className="dpp-advHead"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} className="dpp-advChevron" />
        <span className="dpp-advTitle">{t('requestSettings')}</span>
        {count > 0 ? <span className="dpp-badge">{count}</span> : null}
      </button>
      {open ? (
        <div className="dpp-advBody">
          <AdvancedSection title={t('advHeaders')}>
            <div className="dpp-kvList">
              {state.headers.map(([name, value], index) => (
                <div className="dpp-kvRow" key={index}>
                  <input
                    className="dpp-input dpp-kvKey"
                    value={name}
                    placeholder={t('headerName')}
                    aria-label={t('headerName')}
                    disabled={disabled}
                    onChange={(event) => set({
                      headers: state.headers.map((row, at) => (at === index ? [event.target.value, row[1]] : row)),
                    })}
                  />
                  <div className="dpp-kvValue">
                    <input
                      className="dpp-input"
                      value={value}
                      placeholder={t('headerValue')}
                      aria-label={t('headerValue')}
                      disabled={disabled}
                      onChange={(event) => set({
                        headers: state.headers.map((row, at) => (at === index ? [row[0], event.target.value] : row)),
                      })}
                    />
                  </div>
                  <button
                    type="button"
                    className="dpp-iconBtn is-xs is-danger"
                    aria-label={t('remove')}
                    disabled={disabled}
                    onClick={() => set({ headers: state.headers.filter((_, at) => at !== index) })}
                  >
                    <Icon name="x" size={13} strokeWidth={2.2} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="dpp-addRow is-compact"
                disabled={disabled}
                onClick={() => set({ headers: state.headers.concat([['', '']]) })}
              >
                <span className="dpp-addRowIcon" aria-hidden="true"><Icon name="plus" size={13} /></span>
                {t('addHeader')}
              </button>
            </div>
          </AdvancedSection>

          <AdvancedSection title={t('advConnection')}>
            <div className="dpp-formGrid">
              <div className="dpp-field">
                <span className="dpp-fieldLabel">{t('advTransport')}</span>
                <SelectMenu
                  value={state.transport}
                  ariaLabel={t('advTransport')}
                  disabled={disabled}
                  options={options(TRANSPORTS)}
                  onChange={(next) => set({ transport: next })}
                />
              </div>
              <div className="dpp-field">
                <span className="dpp-fieldLabel">{t('advCacheRetention')}</span>
                <SelectMenu
                  value={state.cacheRetention}
                  ariaLabel={t('advCacheRetention')}
                  disabled={disabled}
                  options={options(CACHE_RETENTIONS)}
                  onChange={(next) => set({ cacheRetention: next })}
                />
              </div>
              <div className="dpp-field">
                <span className="dpp-fieldLabel">{t('advTimeout')}</span>
                <input
                  className="dpp-input"
                  inputMode="numeric"
                  value={state.timeoutMs}
                  aria-label={t('advTimeout')}
                  disabled={disabled}
                  onChange={(event) => set({ timeoutMs: event.target.value })}
                />
              </div>
              <div className="dpp-field">
                <span className="dpp-fieldLabel">{t('advStreamIdle')}</span>
                <input
                  className="dpp-input"
                  inputMode="numeric"
                  value={state.streamIdleTimeoutMs}
                  placeholder="300000"
                  aria-label={t('advStreamIdle')}
                  disabled={disabled}
                  onChange={(event) => set({ streamIdleTimeoutMs: event.target.value })}
                />
              </div>
              <div className="dpp-field">
                <span className="dpp-fieldLabel">{t('advWsConnect')}</span>
                <input
                  className="dpp-input"
                  inputMode="numeric"
                  value={state.websocketConnectTimeoutMs}
                  aria-label={t('advWsConnect')}
                  disabled={disabled}
                  onChange={(event) => set({ websocketConnectTimeoutMs: event.target.value })}
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

          <AdvancedSection title={t('advImages')}>
            <div className="dpp-formGrid">
              <div className="dpp-field">
                <span className="dpp-fieldLabel">{t('advPixelBudget')}</span>
                <input
                  className="dpp-input"
                  inputMode="numeric"
                  value={state.requestImagePixelBudget}
                  placeholder="4194304"
                  aria-label={t('advPixelBudget')}
                  disabled={disabled}
                  onChange={(event) => set({ requestImagePixelBudget: event.target.value })}
                />
              </div>
              <div className="dpp-field">
                <span className="dpp-fieldLabel">{t('advImageMaxBytes')}</span>
                <input
                  className="dpp-input"
                  inputMode="numeric"
                  value={state.requestImageMaxBytes}
                  placeholder="1048576"
                  aria-label={t('advImageMaxBytes')}
                  disabled={disabled}
                  onChange={(event) => set({ requestImageMaxBytes: event.target.value })}
                />
              </div>
              <div className="dpp-field">
                <span className="dpp-fieldLabel">{t('advMaxRequestImageBytes')}</span>
                <input
                  className="dpp-input"
                  inputMode="numeric"
                  value={state.maxRequestImageBytes}
                  placeholder="20971520"
                  aria-label={t('advMaxRequestImageBytes')}
                  disabled={disabled}
                  onChange={(event) => set({ maxRequestImageBytes: event.target.value })}
                />
              </div>
              <div className="dpp-field">
                <span className="dpp-fieldLabel">{t('advMaxRequestImages')}</span>
                <input
                  className="dpp-input"
                  inputMode="numeric"
                  value={state.maxRequestImages}
                  placeholder="50"
                  aria-label={t('advMaxRequestImages')}
                  disabled={disabled}
                  onChange={(event) => set({ maxRequestImages: event.target.value })}
                />
              </div>
              <div className="dpp-field">
                <span className="dpp-fieldLabel">{t('advOffloadCountQuantum')}</span>
                <input
                  className="dpp-input"
                  inputMode="numeric"
                  value={state.imageOffloadCountQuantum}
                  aria-label={t('advOffloadCountQuantum')}
                  disabled={disabled}
                  onChange={(event) => set({ imageOffloadCountQuantum: event.target.value })}
                />
              </div>
            </div>
          </AdvancedSection>
        </div>
      ) : null}
    </section>
  )
}


/** Transient toast stack for panel-level results. */
import React from 'react'
import { Icon } from '../ui-icons.jsx'

// ---------------------------------------------------------------------------
// toasts
// ---------------------------------------------------------------------------

export function Toasts({ t, items, onDismiss }) {
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


/** Modal dialog and its confirmation variant. */
import React from 'react'
import { Icon } from '../ui-icons.jsx'
import { Spinner } from './ui.jsx'
import { focusableIn } from '../lib/dom.js'
import { usePresence } from '../hooks.js'

/** Minimal dialog: focus lands inside and stays there, Escape and the scrim
 *  close it, and the panel keeps its exit animation via usePresence. */
function Modal({ open, onClose, title, label, closeLabel, className, bodyClassName, children, footer, showClose = true, icon, iconTone }) {
  const { mounted, closing } = usePresence(open, 140)
  const panelRef = React.useRef(null)

  React.useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined
    const previous = document.activeElement
    const timer = setTimeout(() => {
      const node = panelRef.current
      if (node === null || node.contains(document.activeElement)) return
      // Prefer the first real control; the panel itself is the fallback for
      // dialogs that are pure copy (a confirmation with a footer still has one).
      const first = focusableIn(node)[0]
      if (first !== undefined) first.focus()
      else node.focus()
    }, 30)

    // Focus trap: Tab and Shift+Tab stay inside the panel while it is open.
    const onKeyDown = (event) => {
      if (event.key !== 'Tab') return
      const node = panelRef.current
      if (node === null) return
      const targets = focusableIn(node)
      if (targets.length === 0) {
        event.preventDefault()
        node.focus()
        return
      }
      const first = targets[0]
      const last = targets[targets.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === node)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', onKeyDown, true)
      // Restore focus to whatever opened the dialog (usually the row button).
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
          {icon ? (
            <span className={`dpp-modalIcon${iconTone === 'danger' ? ' is-danger' : ''}`} aria-hidden="true">
              <Icon name={icon} size={15} />
            </span>
          ) : null}
          <h3 className="dpp-modalTitle">{title}</h3>
          {showClose ? (
            <button type="button" className="dpp-iconBtn" aria-label={closeLabel || title} onClick={onClose}>
              <Icon name="x" size={15} />
            </button>
          ) : null}
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
function ConfirmDialog({ ask, onClose, onError, t }) {
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
    } catch (error) {
      // A rejected action never leaves the sheet silent: report it and stay
      // closed, because the caller usually already navigated or reloaded.
      if (typeof onError === 'function') onError(error)
      else if (typeof console !== 'undefined') {
        console.error('[dsh-provider-studio] confirm action failed', error)
      }
    } finally {
      setBusy(false)
      onClose()
    }
  }

  const dismiss = () => {
    if (busy) return
    if (typeof ask.onCancel === 'function') {
      try { ask.onCancel() } catch { /* a rejected cleanup must not block the close */ }
    }
    onClose()
  }

  return (
    <Modal
      open
      onClose={dismiss}
      title={ask.title}
      className="dpp-modalConfirm"
      showClose={false}
      icon="circle-alert"
      iconTone={ask.danger ? 'danger' : 'plain'}
      footer={(
        <>
          <button type="button" className="dpp-btn" onClick={dismiss} disabled={busy}>
            {ask.cancelLabel || t('cancel')}
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

export { Modal, ConfirmDialog }

/** Dropdown menus: the provider action menu and the value select. */
import React from 'react'
import { Icon } from '../ui-icons.jsx'
import { popoverBox } from '../lib/viewport.js'
import { usePresence } from '../hooks.js'

/** Stable ids for the ARIA ownership pairs (activedescendant/controls). */
let idSeq = 0
function nextId(prefix) {
  idSeq += 1
  return `dpp-${prefix}-${idSeq}`
}

function ActionMenu({ items, label }) {
  const [open, setOpen] = React.useState(false)
  const { mounted, closing } = usePresence(open, 120)
  const rootRef = React.useRef(null)
  const triggerRef = React.useRef(null)
  const menuRef = React.useRef(null)
  const [active, setActive] = React.useState(0)
  const idRef = React.useRef(null)
  if (idRef.current === null) idRef.current = nextId('actions')

  const closeMenu = React.useCallback((restoreFocus) => {
    setOpen(false)
    if (restoreFocus) {
      const node = triggerRef.current
      if (node !== null && typeof node.focus === 'function') node.focus()
    }
  }, [])

  React.useEffect(() => {
    if (!open) return undefined
    // Focus moves into the menu so arrows/Enter work where the highlight is.
    const timer = setTimeout(() => {
      const node = menuRef.current
      if (node !== null && !node.contains(document.activeElement)) node.focus()
    }, 0)
    const onPointerDown = (event) => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target)) closeMenu(false)
    }
    // Capture Escape so the Settings dialog behind us stays open.
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      closeMenu(true)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open, closeMenu])

  if (items.length === 0) return null

  const itemId = (index) => `${idRef.current}-item-${index}`

  return (
    <div className="dpp-menuWrap" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className={`dpp-iconBtn${open ? ' is-open' : ''}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? idRef.current : undefined}
        title={label}
        onClick={() => {
          setActive(0)
          setOpen((previous) => !previous)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          setActive(event.key === 'ArrowDown' ? 0 : items.length - 1)
          setOpen(true)
        }}
      >
        <Icon name="more-horizontal" size={16} />
      </button>
      {mounted ? (
        <div
          className={`dpp-menu${closing ? ' is-closing' : ''}`}
          id={idRef.current}
          role="menu"
          tabIndex={-1}
          ref={menuRef}
          aria-label={label}
          aria-activedescendant={items.length > 0 ? itemId(active) : undefined}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              closeMenu(true)
            } else if (event.key === 'Tab') {
              closeMenu(false)
            } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              const step = event.key === 'ArrowDown' ? 1 : -1
              setActive((previous) => (previous + step + items.length) % items.length)
            } else if (event.key === 'Home') {
              event.preventDefault()
              setActive(0)
            } else if (event.key === 'End') {
              event.preventDefault()
              setActive(items.length - 1)
            } else if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              const item = items[active]
              closeMenu(true)
              if (item !== undefined) item.onSelect()
            }
          }}
        >
          {items.map((item, index) => (
            <button
              key={item.label}
              id={itemId(index)}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={`dpp-menuItem${item.danger ? ' is-danger' : ''}${index === active ? ' is-active' : ''}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => {
                closeMenu(true)
                item.onSelect()
              }}
            >
              <Icon name={item.icon} size={14} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Click-to-open picker; the native <select> OS menu is replaced on purpose. */
function SelectMenu({ value, options, onChange, disabled, ariaLabel, className, placeholder }) {
  const [open, setOpen] = React.useState(false)
  const { mounted, closing } = usePresence(open, 120)
  const rootRef = React.useRef(null)
  const triggerRef = React.useRef(null)
  const popoverRef = React.useRef(null)
  // A popover placed by absolute coordinates inside a scrolling dialog body is
  // clipped at the dialog's edge, so it is anchored to the viewport instead and
  // follows the trigger's rect (measured when it opens, and on resize).
  const [box, setBox] = React.useState(null)
  const matched = options.find((option) => option.value === value) || null
  const current = matched !== null ? matched : (placeholder === undefined ? options[0] : null)
  const currentLabel = current !== null && current !== undefined ? current.label : (placeholder || '')
  const [active, setActive] = React.useState(() => Math.max(0, options.findIndex((option) => option.value === value)))
  const idRef = React.useRef(null)
  if (idRef.current === null) idRef.current = nextId('select')
  // The effect below must not re-subscribe every time a parent re-renders with
  // a freshly built options array; read the live values through refs instead.
  const optionsRef = React.useRef(options)
  optionsRef.current = options
  const valueRef = React.useRef(value)
  valueRef.current = value

  const measure = React.useCallback(() => {
    const next = popoverBox(triggerRef.current)
    if (next !== null) setBox(next)
  }, [])

  const restoreFocus = React.useCallback(() => {
    const node = triggerRef.current
    if (node !== null && typeof node.focus === 'function') node.focus()
  }, [])

  const closeMenu = React.useCallback((focusTrigger) => {
    setOpen(false)
    if (focusTrigger) restoreFocus()
  }, [restoreFocus])

  React.useEffect(() => {
    if (!open) return undefined
    measure()
    setActive(Math.max(0, optionsRef.current.findIndex((option) => option.value === valueRef.current)))
    const onPointerDown = (event) => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      closeMenu(true)
    }
    // The popover follows the viewport, so an outer scroll would leave it
    // behind; scrolling the option list itself must keep it open.
    const onScroll = (event) => {
      if (rootRef.current !== null && event.target instanceof Node && rootRef.current.contains(event.target)) return
      setOpen(false)
    }
    const onResize = () => measure()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open, measure, closeMenu])

  // Focus enters the listbox once it is placed, so the arrow keys and the
  // active option announced to assistive tech stay in sync.
  React.useEffect(() => {
    if (!open || box === null) return
    const node = popoverRef.current
    if (node !== null && !node.contains(document.activeElement)) node.focus()
  }, [open, box])

  const commit = (option) => {
    if (option === undefined || option === null) return
    onChange(option.value)
    closeMenu(true)
  }

  const optionId = (index) => `${idRef.current}-option-${index}`
  const activeOptionId = options.length > 0 ? optionId(active) : undefined

  return (
    <div className={className ? `dpp-selectMenu ${className}` : 'dpp-selectMenu'} ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className={`dpp-selectTrigger${open ? ' is-open' : ''}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-controls={open ? idRef.current : undefined}
        onClick={() => setOpen((previous) => !previous)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          setActive(event.key === 'ArrowDown' ? 0 : options.length - 1)
          setOpen(true)
        }}
      >
        <span className="dpp-selectValue">{currentLabel}</span>
        <Icon name="chevron-down" size={13} className="dpp-selectChevron" />
      </button>
      {mounted && box !== null ? (
        <div
          className={`dpp-selectPopover${closing ? ' is-closing' : ''}`}
          id={idRef.current}
          role="listbox"
          tabIndex={-1}
          ref={popoverRef}
          style={box}
          aria-label={ariaLabel}
          aria-activedescendant={activeOptionId}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              closeMenu(true)
            } else if (event.key === 'Tab') {
              closeMenu(false)
            } else if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActive((previous) => (previous + 1) % options.length)
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActive((previous) => (previous - 1 + options.length) % options.length)
            } else if (event.key === 'Home') {
              event.preventDefault()
              setActive(0)
            } else if (event.key === 'End') {
              event.preventDefault()
              setActive(options.length - 1)
            } else if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              commit(options[active])
            }
          }}
        >
          {options.map((option, index) => {
            const selected = option.value === value
            return (
              <button
                key={option.value}
                id={optionId(index)}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={selected}
                className={`dpp-selectOption${selected ? ' is-selected' : ''}${index === active ? ' is-active' : ''}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => commit(option)}
              >
                <span className="dpp-selectCheck" aria-hidden="true">
                  {selected ? <Icon name="check" size={13} strokeWidth={2.2} /> : null}
                </span>
                <span className="dpp-selectOptionLabel">{option.label}</span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export { ActionMenu, SelectMenu }

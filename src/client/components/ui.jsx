/** Small presentational primitives shared by the panel views. */
import React from 'react'
import { Icon } from '../ui-icons.jsx'
import { PROVIDER_ICONS, PROVIDER_ICON_FRAMES, PROVIDER_ICON_MONO, PROVIDER_ICON_TONES } from '../icons.js'

/** First letter of a provider name, used when the set has no logo for it. */
function monogram(label) {
  const text = String(label === null || label === undefined ? '' : label).trim()
  const match = text.match(/[\p{L}\p{N}]/u)
  return match === null ? '' : match[0].toUpperCase()
}

/** Provider logo: official asset when the set has one, the provider's initial
 *  when it does not.
 *
 *  Theme handling: SVG marks drawn in the neutral grey are rendered through a
 *  CSS mask so they take the theme's secondary text colour (a fixed grey goes
 *  dim on the dark panel). Rasters measured as near-black or near-white get a
 *  contrast plate; every other brand mark keeps its own background-free look. */
export function ProviderMark({ iconKey, label, size = 24 }) {
  const key = iconKey === null || iconKey === undefined ? null : String(iconKey)
  const src = key !== null && Object.prototype.hasOwnProperty.call(PROVIDER_ICONS, key)
    ? PROVIDER_ICONS[key]
    : null
  const box = { width: size, height: size }
  if (src !== null) {
    if (PROVIDER_ICON_MONO.has(key)) {
      return (
        <span className="dpp-mark" style={box} aria-hidden="true">
          <span
            className="dpp-markMask"
            style={{ ...box, maskImage: `url("${src}")`, WebkitMaskImage: `url("${src}")` }}
          />
        </span>
      )
    }
    const tone = PROVIDER_ICON_TONES[key]
    const plate = tone === 'onLight' ? ' is-onLight' : tone === 'onDark' ? ' is-onDark' : tone === 'solid' ? ' is-solid' : ''
    // Logos measured with too much padding are scaled up instead of re-encoded,
    // so the shared 48px asset stays small and every mark lands at the same size.
    const frame = PROVIDER_ICON_FRAMES[key]
    const transform = frame === undefined
      ? undefined
      : `scale(${frame.scale}) translate(${frame.x}%, ${frame.y}%)`
    return (
      <span className={`dpp-mark${plate}`} style={box}>
        <img src={src} alt="" width={size} height={size} aria-hidden="true" style={transform === undefined ? undefined : { transform }} />
      </span>
    )
  }
  const initial = monogram(label)
  return (
    <span className="dpp-mark dpp-markFallback" style={box} aria-hidden="true">
      {initial === '' ? (
        <Icon name="package" size={Math.max(12, Math.round(size * 0.58))} strokeWidth={1.6} />
      ) : (
        <span className="dpp-markInitial" style={{ fontSize: Math.max(10, Math.round(size * 0.44)) }}>
          {initial}
        </span>
      )}
    </span>
  )
}

export function Field({ label, hint, wide, children }) {
  return (
    <label className={wide ? 'dpp-field is-wide' : 'dpp-field'}>
      <span className="dpp-fieldLabel">
        {label}
        {hint ? <span className="dpp-fieldHint">{hint}</span> : null}
      </span>
      {children}
    </label>
  )
}

export function Alert({ kind = 'info', text, detail }) {
  return (
    <div className={`dpp-alert is-${kind}`} role={kind === 'err' ? 'alert' : 'status'}>
      <Icon name={kind === 'ok' ? 'circle-check' : kind === 'err' ? 'circle-alert' : 'info'} size={15} />
      <span className="dpp-alertText">
        {text}
        {detail ? <span className="dpp-alertDetail">{detail}</span> : null}
      </span>
    </div>
  )
}

export function Spinner({ size = 14 }) {
  return <Icon name="loader" size={size} className="dpp-spin" />
}

export function SkeletonDetail({ t, onBack }) {
  return (
    <div>
      <button type="button" className="dpp-backBtn" onClick={onBack}>
        <Icon name="arrow-left" size={16} />
        <span>{t('backToProviders')}</span>
      </button>
      <section className="dpp-card" aria-hidden="true">
        <header className="dpp-cardHead">
          <span className="dpp-skel dpp-skelMark" style={{ width: 28, height: 28 }} />
          <div className="dpp-skelStack">
            <span className="dpp-skel" style={{ width: 140, height: 14 }} />
            <span className="dpp-skel" style={{ width: 90 }} />
          </div>
        </header>
        <div className="dpp-cardBody">
          {[0, 1, 2].map((key) => (
            <div className="dpp-skelStack" key={key}>
              <span className="dpp-skel" style={{ width: 60 }} />
              <span className="dpp-skel" style={{ width: '100%', height: 32 }} />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

/** Small presentational primitives shared by the panel views. */
import React from 'react'
import { Icon } from '../ui-icons.jsx'
import { PROVIDER_ICONS } from '../icons.js'

/** Provider logo, ZCode style: official asset when we have one, a neutral
 *  package glyph when we do not (no invented monograms). */
export function ProviderMark({ iconKey, size = 24 }) {
  const src = iconKey !== null && iconKey !== undefined ? PROVIDER_ICONS[iconKey] : null
  const box = { width: size, height: size }
  if (src) {
    return (
      <span className="dpp-mark" style={box}>
        <img src={src} alt="" width={size} height={size} aria-hidden="true" />
      </span>
    )
  }
  return (
    <span className="dpp-mark dpp-markFallback" style={box} aria-hidden="true">
      <Icon name="package" size={Math.max(12, Math.round(size * 0.58))} strokeWidth={1.6} />
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

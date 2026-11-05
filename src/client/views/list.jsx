/** The provider list: the panel's home level. */
import React from 'react'
import { Icon } from '../ui-icons.jsx'
import { Alert, ProviderMark } from '../components/ui.jsx'
import { providerIcon, providerName } from '../lib/providers.js'

// ---------------------------------------------------------------------------
// list page
// ---------------------------------------------------------------------------

function SkeletonRows() {
  return (
    <div className="dpp-list" aria-hidden="true">
      {[0, 1, 2, 3].map((key) => (
        <div className="dpp-skelRow" key={key} style={{ '--dpp-i': key }}>
          <span className="dpp-skel dpp-skelMark" />
          <span className="dpp-skel" style={{ width: `${46 - key * 6}%` }} />
        </div>
      ))}
    </div>
  )
}

export function ProviderList({ t, providers, loading, writable, error, refreshing, onOpen, onAdd, onRefresh }) {
  return (
    <div>
      <header className="dpp-pageHead">
        <h2 className="dpp-pageTitle">
          {t('title')}
          {loading ? null : <span className="dpp-pageCount">{providers.length}</span>}
        </h2>
        <button
          type="button"
          className="dpp-iconBtn"
          aria-label={t('refresh')}
          title={t('refresh')}
          onClick={onRefresh}
          disabled={loading || refreshing}
        >
          <Icon name="refresh-cw" size={15} className={refreshing ? 'dpp-spin' : undefined} />
        </button>
      </header>

      {error ? <Alert kind="err" text={t('loadFailed')} detail={error} /> : null}
      {writable === false ? <Alert kind="err" text={t('readOnly')} /> : null}

      {loading ? <SkeletonRows /> : null}

      {!loading && providers.length === 0 ? (
        <div className="dpp-empty">
          <span className="dpp-emptyIcon" aria-hidden="true"><Icon name="package" size={22} strokeWidth={1.5} /></span>
          <span className="dpp-emptyTitle">{t('empty')}</span>
          <span className="dpp-emptyHint">{t('emptyHint')}</span>
          <button type="button" className="dpp-btn dpp-btnPrimary" onClick={onAdd} disabled={!writable}>
            <Icon name="plus" size={14} />
            {t('create')}
          </button>
        </div>
      ) : null}

      {!loading && providers.length > 0 ? (
        <div className="dpp-list">
          {providers.map((item, index) => (
            <button
              key={item.route}
              type="button"
              className="dpp-row"
              style={{ '--dpp-i': index < 12 ? index : 12 }}
              onClick={() => onOpen(item.route)}
            >
              <ProviderMark iconKey={providerIcon(item, t)} size={22} />
              <span className="dpp-rowName">{providerName(item, t)}</span>
              <Icon name="chevron-right" size={14} className="dpp-rowChevron" />
            </button>
          ))}
          <button type="button" className="dpp-addRow" onClick={onAdd} disabled={!writable}>
            <span className="dpp-addRowIcon" aria-hidden="true"><Icon name="plus" size={14} /></span>
            <span>{t('create')}</span>
          </button>
        </div>
      ) : null}
    </div>
  )
}

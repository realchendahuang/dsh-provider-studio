/** The provider template picker shown before creating a provider. */
import React from 'react'
import { Icon } from '../ui-icons.jsx'
import { ProviderMark } from '../components/ui.jsx'
import { PROVIDER_TEMPLATES, CUSTOM_TEMPLATE } from '../templates/index.js'
import { hostOf } from '../lib/format.js'
import { templateLabel } from '../lib/template-text.js'

// ---------------------------------------------------------------------------
// template picker
// ---------------------------------------------------------------------------

export function TemplatePicker({ t, onPick, onBack }) {
  const [query, setQuery] = React.useState('')
  const [expanded, setExpanded] = React.useState(() => new Set())
  const needle = query.trim().toLowerCase()
  const LIMIT = 12

  // Group names and label matching are locale-dependent, so the catalog is
  // re-grouped on every render instead of being cached across a language
  // switch (218 entries, and only while this level is on screen).
  const groupKey = (template) => (template.group ? template.group : 'groupOther')
  const grouped = () => {
    const order = []
    const byGroup = new Map()
    for (const template of PROVIDER_TEMPLATES) {
      if (needle !== '') {
        const haystack = `${template.label} ${template.displayName} ${template.baseURL} ${template.id} ${templateLabel(template, t)}`
        if (!haystack.toLowerCase().includes(needle)) continue
      }
      const key = groupKey(template)
      if (!byGroup.has(key)) {
        byGroup.set(key, [])
        order.push(key)
      }
      byGroup.get(key).push(template)
    }
    return order.map((key) => ({ key, name: t(key), items: byGroup.get(key) }))
  }
  const groups = grouped()

  const toggle = (name) => {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const customCard = (
    <button type="button" className="dpp-tplCard is-custom" onClick={() => onPick(CUSTOM_TEMPLATE)}>
      <span className="dpp-mark dpp-markFallback dpp-markAdd" aria-hidden="true">
        <Icon name="plus" size={16} />
      </span>
      <span className="dpp-tplBody">
        <span className="dpp-tplName">{t('customProvider')}</span>
        <span className="dpp-tplHost">{t('customProviderHint')}</span>
      </span>
      <Icon name="chevron-right" size={14} className="dpp-tplArrow" />
    </button>
  )

  return (
    <div>
      <header className="dpp-subHead">
        <button type="button" className="dpp-backBtn" onClick={onBack}>
          <Icon name="arrow-left" size={16} />
          <span>{t('backToProviders')}</span>
        </button>
        <h2 className="dpp-pageTitle">{t('browseTemplates')}</h2>
      </header>

      <div className="dpp-searchRow dpp-tplSearch">
        <span className="dpp-searchIcon" aria-hidden="true"><Icon name="search" size={14} /></span>
        <input
          className="dpp-input dpp-inputSearch"
          value={query}
          placeholder={t('searchTemplates')}
          aria-label={t('searchTemplates')}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query !== '' ? (
          <button type="button" className="dpp-searchClear" aria-label={t('close')} onClick={() => setQuery('')}>
            <Icon name="x" size={13} />
          </button>
        ) : null}
      </div>

      {groups.length === 0 ? (
        <div className="dpp-pickEmpty dpp-tplNoMatch">
          <Icon name="info" size={15} />
          <span>{t('noTemplateMatch')}</span>
        </div>
      ) : null}

      {groups.map((group, groupIndex) => {
        const open = needle !== '' || expanded.has(group.key)
        const items = open ? group.items : group.items.slice(0, LIMIT)
        const hidden = group.items.length - items.length
        return (
          <section key={group.key} className="dpp-tplGroup">
            <h4 className="dpp-tplGroupTitle">
              {group.name}
              <span className="dpp-tplCount">{group.items.length}</span>
            </h4>
            <div className="dpp-tplGrid">
              {items.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className="dpp-tplCard"
                  onClick={() => onPick(template)}
                >
                  <ProviderMark iconKey={template.icon} size={26} />
                  <span className="dpp-tplBody">
                    <span className="dpp-tplName">{templateLabel(template, t)}</span>
                    <span className="dpp-tplHost">{hostOf(template.baseURL) || template.api || '—'}</span>
                  </span>
                  <Icon name="chevron-right" size={14} className="dpp-tplArrow" />
                </button>
              ))}
              {groupIndex === 0 && needle === '' ? customCard : null}
            </div>
            {hidden > 0 ? (
              <button type="button" className="dpp-tplMore" onClick={() => toggle(group.key)}>
                {t('showAllTemplates')}
                <span className="dpp-tplMoreCount">{group.items.length}</span>
                <Icon name="chevron-down" size={13} />
              </button>
            ) : null}
            {open && needle === '' && group.items.length > LIMIT ? (
              <button type="button" className="dpp-tplMore" onClick={() => toggle(group.key)}>
                {t('collapseTemplates')}
                <Icon name="chevron-up" size={13} />
              </button>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}

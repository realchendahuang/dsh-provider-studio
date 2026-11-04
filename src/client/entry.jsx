/** Client half: mounts the Remote service and registers the settings section. */

import React from 'react'
import { PACKAGE, SERVICE_KEY, INVOCATIONS } from '../../contract.js'
import { PanelPage } from './app.jsx'
import { CSS } from './styles.js'
import { NS, ZH, EN } from './i18n.js'

export const name = PACKAGE

/** Client services this plugin reads; any of them missing keeps it dormant. */
export const inject = ['slots', 'remote', 'locale']

const STYLE_ID = 'dsh-provider-studio-styles'

function adoptStyles() {
  if (typeof document === 'undefined') return () => {}
  const existing = document.getElementById(STYLE_ID)
  if (existing !== null) {
    existing.textContent = CSS
    return () => {}
  }
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
  return () => {
    if (style.parentNode !== null) style.parentNode.removeChild(style)
  }
}

export function apply(ctx) {
  const locale = ctx.get('locale') ?? ctx.locale
  let t = (key) => key
  if (locale !== undefined && locale !== null) {
    try {
      ctx.effect(() => locale.register(NS, { zh: ZH, en: EN }), 'dsh-provider-studio: locale')
    } catch {
      /* a second application must not fail the plugin */
    }
    try {
      t = locale.bind(NS)
    } catch {
      /* fall back to raw keys */
    }
  }

  ctx.effect(adoptStyles, 'dsh-provider-studio: styles')

  let remote = null
  ctx.effect(() => {
    let live = true
    let release = null
    void (async () => {
      try {
        const dispose = await ctx.remote.$mount({ package: PACKAGE, descriptors: INVOCATIONS })
        if (!live) {
          try { await dispose() } catch { /* already gone */ }
          return
        }
        release = dispose
        remote = pickRemoteHandle(ctx)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[dsh-provider-studio] failed to mount the Remote service', error)
      }
    })()
    return () => {
      live = false
      remote = null
      if (release !== null) {
        try { void release() } catch { /* already disposed */ }
      }
    }
  }, 'dsh-provider-studio: remote')

  const call = async (method, args) => {
    if (remote === null || typeof remote[method] !== 'function') {
      throw new Error('providerPanel 远程服务尚未挂载，请稍后重试或重启 DSH')
    }
    const reply = await remote[method](args || {})
    if (reply === null || typeof reply !== 'object' || reply.ok !== true) {
      const failure = reply && reply.error
      const message = failure && (failure.message || failure.error || JSON.stringify(failure))
      throw new Error(message || '调用失败')
    }
    const value = reply.value
    if (value === null || typeof value !== 'object' || value.ok !== true) {
      throw new Error((value && value.error) || '调用失败')
    }
    return value
  }

  const slots = ctx.get('slots') ?? ctx.slots
  if (slots === undefined || slots === null) return

  slots.inject('settings.section', () => {
    return slots.register(
      { name: 'settings.section', id: PACKAGE, order: 13, label: () => t('nav'), locale: NS },
      () => React.createElement(PanelPage, { t, call }),
    )
  })
}

/** The mounted namespace lives under the `remote.<namespace>` service key; the
 *  Context may expose it through `get()` or through `reflect`. */
function pickRemoteHandle(ctx) {
  const key = `remote.${SERVICE_KEY}`
  try {
    if (typeof ctx.get === 'function') {
      const found = ctx.get(key)
      if (found !== undefined && found !== null) return found
    }
  } catch {
    /* not a plain service */
  }
  try {
    if (ctx.reflect !== undefined && typeof ctx.reflect.get === 'function') {
      const found = ctx.reflect.get(key)
      if (found !== undefined && found !== null) return found
    }
  } catch {
    /* reflect may not expose it */
  }
  return null
}

// dsh-desktop-kit client half — injected into the SPA by the harness.
//
// Only acts inside the native shell (window.__TAURI__ present); in a plain
// browser, links and zoom are already native behavior and we do nothing.
//
// Two browser-parity fixes for WKWebView:
// 1. target="_blank" / cross-origin links are dead in a bare webview — they
//    are delegated to the shell's kit_open_external command (system browser).
// 2. WKWebView has no browser-style zoom — Cmd/Ctrl + =/-/0 applies a CSS
//    zoom on <body>, persisted in localStorage.

type TauriCore = { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> }

const tauri = (window as unknown as { __TAURI__?: { core?: TauriCore } }).__TAURI__

if (tauri?.core?.invoke) {
  const invoke = (cmd: string, args: Record<string, unknown>) => {
    tauri.core!.invoke(cmd, args).catch((error) => console.warn('dsh-desktop-kit:', cmd, error))
  }

  const isExternal = (href: string): boolean => {
    try {
      const url = new URL(href, location.href)
      if (url.protocol === 'mailto:') return true
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
      return url.origin !== location.origin
    } catch {
      return false
    }
  }

  const openExternal = (href: string) => {
    try {
      invoke('kit_open_external', { url: new URL(href, location.href).href })
    } catch {
      /* malformed href — ignore */
    }
  }

  // Click delegation (capture phase, so SPA handlers never see dead clicks).
  document.addEventListener(
    'click',
    (event) => {
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor) return
      const href = anchor.getAttribute('href') ?? ''
      if (anchor.target === '_blank' || isExternal(href)) {
        event.preventDefault()
        event.stopPropagation()
        openExternal(href)
      }
    },
    true,
  )

  // window.open() gets the same treatment.
  const rawOpen = window.open.bind(window)
  window.open = ((url?: string | URL, target?: string, features?: string) => {
    const href = String(url ?? '')
    if (href !== '' && isExternal(href)) {
      openExternal(href)
      return null
    }
    return rawOpen(url as string, target, features)
  }) as typeof window.open

  // Browser-style zoom (WKWebView has none built in).
  const ZOOM_KEY = 'dsh-desktop-kit.zoom'
  let zoom = Number(localStorage.getItem(ZOOM_KEY) ?? '1') || 1
  const applyZoom = () => {
    if (document.body) document.body.style.zoom = String(zoom)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyZoom)
  else applyZoom()
  document.addEventListener(
    'keydown',
    (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      if (event.key === '=' || event.key === '+') zoom = Math.min(3, Math.round((zoom + 0.1) * 100) / 100)
      else if (event.key === '-') zoom = Math.max(0.3, Math.round((zoom - 0.1) * 100) / 100)
      else if (event.key === '0') zoom = 1
      else return
      event.preventDefault()
      localStorage.setItem(ZOOM_KEY, String(zoom))
      applyZoom()
    },
    true,
  )
}

export {}

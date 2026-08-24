// dsh-desktop-kit client half — injected into the SPA by the harness.
//
// The harness module loader applies client entries as cordis plugins, so this
// entry MUST export a plugin shape (name + apply). A bare side-effect module
// is rejected at load time: "invalid plugin, expect function or object with
// an 'apply' method, received object".
//
// Only acts inside the native shell (window.__TAURI__ present); in a plain
// browser, links and zoom are already native behavior and we do nothing.
//
// Two browser-parity fixes for WKWebView:
// 1. target="_blank" / cross-origin links are dead in a bare webview — they
//    are delegated to the shell's kit_open_external command (system browser).
// 2. WKWebView has no browser-style zoom — Cmd/Ctrl + =/-/0 asks the shell
//    for native page zoom (kit_set_zoom → WKWebView pageZoom, macOS 11+),
//    persisted in localStorage. A CSS `zoom` on <body> is deliberately NOT
//    used: in WebKit it splits the page into two coordinate systems (CSS
//    layout / getBoundingClientRect in local px, while clientX / innerWidth
//    / elementFromPoint stay in rendered px), which breaks page-side
//    drag/resize widgets — e.g. the dsh-better-sidebar panel handles stop
//    tracking the cursor and their clamps overflow the virtual viewport.
export const name = 'dsh-desktop-kit';
export function apply() {
    const tauri = window.__TAURI__;
    if (!tauri?.core?.invoke)
        return;
    const invoke = (cmd, args) => {
        tauri.core.invoke(cmd, args).catch((error) => console.warn('dsh-desktop-kit:', cmd, error));
    };
    const isExternal = (href) => {
        try {
            const url = new URL(href, location.href);
            if (url.protocol === 'mailto:')
                return true;
            if (url.protocol !== 'http:' && url.protocol !== 'https:')
                return false;
            return url.origin !== location.origin;
        }
        catch {
            return false;
        }
    };
    const openExternal = (href) => {
        try {
            invoke('kit_open_external', { url: new URL(href, location.href).href });
        }
        catch {
            /* malformed href — ignore */
        }
    };
    // Click delegation (capture phase, so SPA handlers never see dead clicks).
    document.addEventListener('click', (event) => {
        const anchor = event.target?.closest?.('a[href]');
        if (!anchor)
            return;
        const href = anchor.getAttribute('href') ?? '';
        if (anchor.target === '_blank' || isExternal(href)) {
            event.preventDefault();
            event.stopPropagation();
            openExternal(href);
        }
    }, true);
    // window.open() gets the same treatment.
    const rawOpen = window.open.bind(window);
    window.open = ((url, target, features) => {
        const href = String(url ?? '');
        if (href !== '' && isExternal(href)) {
            openExternal(href);
            return null;
        }
        return rawOpen(url, target, features);
    });
    // Browser-style zoom (WKWebView has none built in). Native page zoom — the
    // shell's kit_set_zoom maps to WKWebView pageZoom, which scales the render
    // above CSS layout and keeps every coordinate API consistent.
    const ZOOM_KEY = 'dsh-desktop-kit.zoom';
    let zoom = Number(localStorage.getItem(ZOOM_KEY) ?? '1') || 1;
    const applyZoom = () => {
        invoke('kit_set_zoom', { scaleFactor: zoom });
    };
    if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', applyZoom);
    else
        applyZoom();
    document.addEventListener('keydown', (event) => {
        if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey)
            return;
        if (event.key === '=' || event.key === '+')
            zoom = Math.min(3, Math.round((zoom + 0.1) * 100) / 100);
        else if (event.key === '-')
            zoom = Math.max(0.3, Math.round((zoom - 0.1) * 100) / 100);
        else if (event.key === '0')
            zoom = 1;
        else
            return;
        event.preventDefault();
        localStorage.setItem(ZOOM_KEY, String(zoom));
        applyZoom();
    }, true);
}

# Changelog

All notable changes to **dsh-desktop-kit**. Format follows [Keep a Changelog](https://keepachangelog.com/),
versioning follows [SemVer](https://semver.org/).

## 0.2.3 — 2026-08-25

- Change: use `DSH` consistently as the native app name, window title, launcher
  title, and default plugin/shell title.

## 0.2.2 — 2026-08-25

- Fix: the clickable `DSH.app` now has a native Mach-O launcher. The launcher
  invokes the existing shell logic as a child process, so LaunchServices no
  longer routes the app through Terminal.app. Release packages carry the
  prebuilt arm64 launcher; source checkouts compile it with clang when the
  macOS Command Line Tools are available.

## 0.2.1 — 2026-08-24

- Fix: published tarballs no longer carry an install-time lifecycle build script;
  dsh-market can install the prebuilt macOS shell without asking the user to approve
  package builds.

## 0.2.0 — 2026-08-24

- New: macOS arm64 release packages include the native shell and clickable app assets;
  the plugin installs them on the first `dsh web` start, so dsh-market installation no
  longer requires a separate Rust build or manual `DSH.app` setup.

## 0.1.5 — 2026-08-24

- Fix: the macOS desktop launcher now starts `dsh web --no-open` on a cold launch,
  so opening the desktop icon does not also open a duplicate browser window.

## 0.1.0 — 2026-08-19

Initial release.

- Plugin half: `inject: [webServer]`, spawns the native shell on the bound loopback URL;
  shell exit code 0 (window closed) shuts the harness down via `ctx.appExit`; any other
  exit keeps the web surface running. Graceful degradation to browser-only when no shell
  binary resolves (`config.bin` / `DSH_DESKTOP_KIT_BIN` → `$DSH_HOME/bin` → `PATH` → `~/.local/bin`).
- Shell half (Tauri v2): decorated WKWebView window — native macOS fullscreen out of the
  box (the headline feature vs frameless shells), single-instance with focus-on-relaunch,
  exit-0-on-window-close lifecycle contract.
- 17 vitest cases for resolution/spawn/exit/dispose logic; CI: plugin (ubuntu) + shell (macOS).

## 0.1.1 — 2026-08-19

- Fix: wrap the client bundle in the harness's `__ModuleLoader__.load({ id, factory })`
  envelope — a bare IIFE failed boot with "loaded without registering via __ModuleLoader__.load".
- Fix: macOS icon padding (84% artwork on transparent canvas; was full-bleed/oversized).

## 0.1.2 — 2026-08-19

- Fix: the client entry now exports a cordis plugin (`name` + `apply`) instead of being
  side-effect-only. The 0.1.1 envelope let the bundle register, but the factory returned
  an empty object, so the harness rejected it at apply time ("invalid plugin, expect
  function or object with an 'apply' method, received object") and the "Failed to load
  plugins" banner stayed up. Side effects now run inside `apply()`. Regression test
  included: the built bundle's factory is exercised against a stubbed module loader.

## 0.1.4 — 2026-08-20

- New: `app/` ships the clickable wrapper in-repo — `install.sh` builds
  `~/Applications/DSH.app` (launcher + Info.plist + icon.icns from the shell artwork).
- Fix: the launcher attaches to an already-running harness on 127.0.0.1:3080 instead of
  exec'ing a second `dsh web`, which died on `EADDRINUSE` — clicking the icon while a
  terminal-started instance is up now opens a window instead of crashing.
- Fix: page zoom now uses the shell's native `WKWebView` page zoom
  (`kit_set_zoom` → wry `WebView::zoom` → `setPageZoom`, macOS 11+) instead of a CSS
  `zoom` on `<body>`. In WebKit, a CSS `zoom` on `<body>` splits the page into two
  coordinate systems — CSS layout / `getBoundingClientRect` report "local px" while
  `clientX` / `window.innerWidth` / `elementFromPoint` stay in rendered px — which broke
  page-side drag/resize widgets: the dsh-better-sidebar panel sliders (its
  `.panelResize` / `.bottomResize` / `.cornerHandle`) no longer tracked the cursor (they
  moved `zoom ×` faster), their `window.innerWidth`-based clamps allowed a panel wider
  than the virtual viewport and collapsed `#root`, and the sidebar's panel-host geometry
  self-check false-positived a "page-level transform", pinning the layer in degraded mode
  with a never-ending rAF sync loop. Native page zoom scales the render above CSS layout,
  so all coordinate APIs stay consistent — exactly what Safari's Cmd/Ctrl+= does.

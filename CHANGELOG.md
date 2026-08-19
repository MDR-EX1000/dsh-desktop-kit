# Changelog

All notable changes to **dsh-desktop-kit**. Format follows [Keep a Changelog](https://keepachangelog.com/),
versioning follows [SemVer](https://semver.org/).

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

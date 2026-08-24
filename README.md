# dsh-desktop-kit

Self-owned desktop shell for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH): a small plugin plus a native Tauri window over the harness web surface. The macOS arm64 release package includes the native shell and clickable `DSH.app` launcher.

`dsh web` starts → the plugin spawns the shell on the served loopback URL → you get DSH in a real desktop window. You can still use the browser as a second client by opening the loopback URL yourself; the desktop app does not open that extra browser window during a cold launch. No fork, no repackaged runtime, no second profile — everything stays a plugin over your existing harness.

## Why not the third-party shell?

[dsh-desktop](https://github.com/s3yf1337/dsh-desktop) is great and was the blueprint. We rebuilt a smaller one for one concrete reason: **real macOS fullscreen**. Its window is frameless with a web-drawn title bar and never wires up `setFullscreen` — the maximize button is zoom, not a native fullscreen Space. This shell uses a plain **decorated** window, so the green traffic-light button and Ctrl+Cmd+F give you true macOS fullscreen out of the box.

## Features (v0.2.1)

- **Native window on the loopback web surface** — same origin the browser uses, so the whole SPA and every plugin work unchanged (verified with `dsh-rw`).
- **Real macOS fullscreen** — decorated window, native fullscreen Space, no custom title bar needed.
- **Single instance** — a second launch focuses the existing window instead of opening another.
- **Lifecycle contract** — closing the window exits the shell with code 0, and the plugin shuts the harness down; plugin teardown kills the shell. No orphaned processes on either side.
- **Self-installing macOS release** — the packaged arm64 shell is copied to `~/.dsh/bin` and the clickable `DSH.app` is installed on the first `dsh web` start; no Rust build is required.
- **Graceful degradation** — on an unsupported platform or source checkout without bundled assets, the harness keeps serving the web UI in the browser, with an actionable log line.
- **Small** — system WebKit (WKWebView), no bundled Chromium; the shell binary is a few MB.
- **External links that work** — `target="_blank"` / cross-origin links are delegated to the system browser via the shell's `kit_open_external` command (a bare WKWebView renders them dead otherwise).
- **Browser-style zoom** — Cmd/Ctrl + `=` / `-` / `0` zooms the page (persisted), something a bare WKWebView does not offer.

Deliberately not in v0.1: tray, OS notifications, file panel, in-app updater, control channel. The architecture (control pipe over stdin/stdout, `dshdctl:` protocol) is documented in the blueprint and can grow later.

## Architecture

```
dsh web  (your existing web profile)
  └─ dsh-desktop-kit (this plugin, inject: [webServer])
       └─ spawns dsh-desktop-kit <url> <title>   (the Tauri shell)
            └─ native WKWebView window on http://127.0.0.1:<port>
                 window closed → exit 0 → plugin shuts the harness down
```

The plugin resolves the shell binary in order: `config.bin` / `DSH_DESKTOP_KIT_BIN` → `$DSH_HOME/bin/dsh-desktop-kit` → `PATH` → `~/.local/bin/dsh-desktop-kit`.

## Install

Requires the `dsh` CLI and macOS (other platforms are untested but should work).

```bash
# 1. the plugin
dsh plugin --profile web add dsh-desktop-kit          # dsh-market
# or from the latest prebuilt GitHub Release tarball:
dsh plugin --profile web add https://github.com/MDR-EX1000/dsh-desktop-kit/releases/latest/download/dsh-desktop-kit.tgz
# or from a checkout / GitHub source:
dsh plugin --profile web add /path/to/dsh-desktop-kit

# 2. restart dsh web — the release package installs the shell and DSH.app,
#    then opens the native window with it
```

The macOS arm64 release package includes the native shell and `app/` assets. The GitHub source
repository also tracks the compiled plugin `lib/`, the arm64 `bin/dsh-desktop-kit`, and the app
assets, so a dsh-market GitHub-source install does not need a local TypeScript or Rust build on
Apple Silicon. Release packages use the stable filename `dsh-desktop-kit.tgz` across versions, so
the `releases/latest/download` URL remains valid after upgrades. On the first `dsh web` start it
installs the binary to `~/.dsh/bin/dsh-desktop-kit`
and creates `~/Applications/DSH.app`. A source checkout still requires `cargo build --release`
only when rebuilding the native shell; `app/install.sh` remains available for rebuilding the app
bundle.

To uninstall: `dsh plugin --profile web remove dsh-desktop-kit`, delete
`~/.dsh/bin/dsh-desktop-kit`, and remove `~/Applications/DSH.app` if it was installed.

### Clickable app icon (macOS)

```bash
app/install.sh   # builds ~/Applications/DSH.app (idempotent, macOS built-ins only)
```

The bundle is a thin launcher, not a second harness: if `127.0.0.1:3080` already answers
(e.g. a terminal-started `dsh web`), the icon just opens a window on that instance;
otherwise it boots `dsh web --no-open` itself. The server still starts normally, but the
desktop entry does not open a duplicate browser client. Starting a second `dsh web` would
die on `EADDRINUSE` — earlier hand-rolled wrappers did exactly that when an instance was
already up, which is why the launcher lives in this repo now.

## Development

```bash
# plugin half (TypeScript)
pnpm install
pnpm build        # tsc → lib/
pnpm test         # vitest — spawn/exit/resolution logic, all fakes
pnpm typecheck

# shell half (Rust / Tauri v2)
cd shell
cargo build --release   # binary at target/release/dsh-desktop-kit
```

Install the built plugin into your harness for a live run:

```bash
dsh plugin --profile web remove dsh-desktop-kit 2>/dev/null
dsh plugin --profile web add /path/to/dsh-desktop-kit
cp shell/target/release/dsh-desktop-kit ~/.dsh/bin/
# restart dsh web
```

## Configuration

Plugin config keys (defaults shown):

| Key | Default | Meaning |
| --- | --- | --- |
| `bin` | `''` | Explicit shell binary path; empty resolves `$DSH_HOME/bin` → `PATH` → `~/.local/bin`. Also settable via `DSH_DESKTOP_KIT_BIN`. |
| `title` | `'DeepSeek Harness'` | Window title (argv[2] to the shell). |

Shell argv: `dsh-desktop-kit [url] [title]` — defaults `http://127.0.0.1:3080` and `DeepSeek Harness`.
`--selftest` runs a scriptable native-fullscreen enter/exit check (exit 0 on pass);
`DSH_KIT_NO_SINGLE_INSTANCE=1` runs a side-by-side instance (selftest, dev).

## Known limitations

- macOS is the only tested platform (WKWebView). Linux/Windows builds are unverified.
- Plugin reload while the harness stays up is not handled — restart `dsh web` after reinstalling.
- No close-to-tray: closing the window shuts the harness down (by design, matching the referenced behavior).

## License

MIT

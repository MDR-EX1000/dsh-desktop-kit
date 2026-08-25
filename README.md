# dsh-desktop-kit

Self-owned desktop shell for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH): a small plugin plus a native Tauri window over the harness web surface. The macOS arm64 release package includes the native shell and clickable `DSH.app` launcher.

`dsh web` starts → the plugin spawns the shell on the served loopback URL → you get DSH in a real desktop window. You can still use the browser as a second client by opening the loopback URL yourself; the desktop app does not open that extra browser window during a cold launch. No fork, no repackaged runtime, no second profile — everything stays a plugin over your existing harness.

## Why not the third-party shell?

[dsh-desktop](https://github.com/s3yf1337/dsh-desktop) is great and was the blueprint. We rebuilt a smaller one for one concrete reason: **real macOS fullscreen**. Its window is frameless with a web-drawn title bar and never wires up `setFullscreen` — the maximize button is zoom, not a native fullscreen Space. This shell uses a plain **decorated** window, so the green traffic-light button and Ctrl+Cmd+F give you true macOS fullscreen out of the box.

## Features (v0.2.3)

- **Native window on the loopback web surface** — same origin the browser uses, so the whole SPA and every plugin work unchanged (verified with `dsh-rw`).
- **Real macOS fullscreen** — decorated window, native fullscreen Space, no custom title bar needed.
- **Single instance** — a second launch focuses the existing window instead of opening another.
- **Lifecycle contract** — closing the window exits the shell with code 0, and the plugin shuts the harness down; plugin teardown kills the shell. No orphaned processes on either side.
- **Self-installing macOS release** — the packaged arm64 shell and native Mach-O launcher are copied to `~/.dsh/bin`, and the clickable `DSH.app` is installed on the first `dsh web` start; no Rust build is required. Launching the app does not open Terminal.app.
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

The macOS arm64 release package includes the native shell, native launcher, and `app/` assets. The
GitHub source repository also tracks the compiled plugin `lib/`, the arm64 `bin/dsh-desktop-kit` and
`bin/dsh-launcher`, and the app assets, so a dsh-market GitHub-source install does not need a local TypeScript or Rust build on
Apple Silicon. Release packages use the stable filename `dsh-desktop-kit.tgz` across versions, so
the `releases/latest/download` URL remains valid after upgrades. On the first `dsh web` start it
installs the native shell and launcher to `~/.dsh/bin`
and creates `~/Applications/DSH.app`. A source checkout still requires `cargo build --release`
only when rebuilding the native shell; `app/install.sh` compiles the small native launcher with
clang when a prebuilt `bin/dsh-launcher` is not present.

### Source-install maintenance notes

If the dsh-market catalog omits the `tarball` field, dsh-market falls back to
`github:MDR-EX1000/dsh-desktop-kit`. The installer then uses the repository's current
default-branch commit instead of the latest formal Release; it does not rebuild this plugin during
installation. The committed `lib/`, `bin/dsh-desktop-kit`, `bin/dsh-launcher`, and `app/` files are the installable
runtime assets and must remain in Git.

When changing the TypeScript plugin or the native shell, regenerate and commit the corresponding
artifacts before users install from GitHub:

```bash
pnpm build                         # refreshes lib/
cd shell && cargo build --release  # refreshes the native binary when shell code changed
# copy target/release/dsh-desktop-kit to bin/dsh-desktop-kit
# build/copy app/dsh-launcher.c to bin/dsh-launcher when the native launcher changes
```

The bundled binary is currently macOS **arm64**. A GitHub-source install does not cross-compile it
for Intel Macs, Linux, or Windows; unsupported platforms keep the browser fallback described above.
Choose a Release tarball when you need the exact tested Release contents, and choose the GitHub
source target only when following the default branch is intentional.

To uninstall: `dsh plugin --profile web remove dsh-desktop-kit`, delete
`~/.dsh/bin/dsh-desktop-kit`, and remove `~/Applications/DSH.app` if it was installed.

### Clickable app icon (macOS)

```bash
app/install.sh   # builds ~/Applications/DSH.app (native launcher; idempotent)
```

The bundle's `CFBundleExecutable` is a native Mach-O launcher, not a shell script. It invokes the
resource script without attaching a TTY, so macOS does not start Terminal.app. The bundle is still
a thin launcher, not a second harness: if `127.0.0.1:3080` already answers
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
| `title` | `'DSH'` | Window title (argv[2] to the shell). |

Shell argv: `dsh-desktop-kit [url] [title]` — defaults `http://127.0.0.1:3080` and `DSH`.
`--selftest` runs a scriptable native-fullscreen enter/exit check (exit 0 on pass);
`DSH_KIT_NO_SINGLE_INSTANCE=1` runs a side-by-side instance (selftest, dev).

## Known limitations

- macOS is the only tested platform (WKWebView). Linux/Windows builds are unverified.
- Plugin reload while the harness stays up is not handled — restart `dsh web` after reinstalling.
- No close-to-tray: closing the window shuts the harness down (by design, matching the referenced behavior).

## License

MIT

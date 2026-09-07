# dsh-desktop-kit

Self-owned desktop shell for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH): a small plugin plus a native Tauri window over the harness web surface. The macOS arm64 release package includes the native shell and clickable `DSH.app` launcher.

`dsh web` starts → the plugin spawns the shell on the served loopback URL → you get DSH in a real desktop window. You can still use the browser as a second client by opening the loopback URL yourself; the desktop app does not open that extra browser window during a cold launch. No fork, no repackaged runtime, no second profile — everything stays a plugin over your existing harness.

## Why not the third-party shell?

[dsh-desktop](https://github.com/s3yf1337/dsh-desktop) is great and was the blueprint. We rebuilt a smaller one for one concrete reason: **real macOS fullscreen**. Its window is frameless with a web-drawn title bar and never wires up `setFullscreen` — the maximize button is zoom, not a native fullscreen Space. This shell uses a plain **decorated** window, so the green traffic-light button and Ctrl+Cmd+F give you true macOS fullscreen out of the box.

## Features (v0.2.6)

- **Authenticated native window on the loopback web surface** — the plugin uses DSH's connection service to mint a process-token URL, so the WebKit client can establish its signed browser cookie under DSH `0.1.2-rc.1`; the visible URL becomes clean after the exchange.
- **Real macOS fullscreen** — decorated window, native fullscreen Space, no custom title bar needed.
- **Single instance** — a second launch focuses the existing window instead of opening another.
- **Lifecycle contract** — closing the window exits the shell with code 0, and the plugin shuts the harness down; plugin teardown kills the shell. No orphaned processes on either side.
- **Self-installing macOS release** — the packaged arm64 shell and native Mach-O launcher are copied to `~/.dsh/bin`, and the clickable `DSH.app` is installed on the first `dsh web` start; no Rust build is required. Launching the app does not open Terminal.app.
- **Graceful degradation** — on an unsupported platform or source checkout without bundled assets, the harness keeps serving the web UI in the browser, with an actionable log line.
- **Small** — system WebKit (WKWebView), no bundled Chromium; the shell binary is a few MB.
- **External links that work** — `target="_blank"` / cross-origin links are delegated to the system browser via the shell's `kit_open_external` command (a bare WKWebView renders them dead otherwise).
- **Browser-style zoom** — Cmd/Ctrl + `=` / `-` / `0` zooms the page (persisted), something a bare WKWebView does not offer.
- **Follows DSH Language** — the window renders the same DSH web application and the same Host-backed global language preference as a browser client. Changing **Settings → Language** updates DSH and localized plugins such as `dsh-rw` live inside the desktop window; Desktop Kit has no separate language setting or plugin-owned UI copy.

Deliberately not in v0.1: tray, OS notifications, file panel, in-app updater, control channel. The architecture (control pipe over stdin/stdout, `dshdctl:` protocol) is documented in the blueprint and can grow later.

## Architecture

```
dsh web  (your existing web profile)
  └─ dsh-desktop-kit (this plugin, inject: [webServer, connection])
       └─ connection.authenticatedUrl(clean URL)
            └─ spawns dsh-desktop-kit <authenticated-url> <title>
            └─ native WKWebView window on http://127.0.0.1:<port>
                 window closed → exit 0 → plugin shuts the harness down
```

The process token is used only to establish the persistent signed browser cookie. Logs keep the clean
loopback URL so the credential is not copied into terminal output. The plugin resolves the shell binary
in order: `config.bin` / `DSH_DESKTOP_KIT_BIN` → `$DSH_HOME/bin/dsh-desktop-kit` → `PATH` → `~/.local/bin/dsh-desktop-kit`.

## Install

Requires the `dsh` CLI and macOS (other platforms are untested). Version `0.2.6`
supports DSH `0.1.2-rc.1` and later compatible `0.1.x` releases, including the
new launch-token authentication flow.

```bash
# 1. GitHub source, shown by DSH Market as a compact repository basename
dsh plugin --profile web add github:MDR-EX1000/dsh-desktop-kit
# or use the exact latest prebuilt GitHub Release archive:
dsh plugin --profile web add https://github.com/MDR-EX1000/dsh-desktop-kit/releases/latest/download/dsh-desktop-kit.tgz
# or use a local checkout for development:
dsh plugin --profile web add /path/to/dsh-desktop-kit

# 2. restart dsh web — the packaged repository installs the shell and DSH.app,
#    then opens the native window with it
```

The GitHub source repository tracks the compiled plugin `lib/`, the arm64
`bin/dsh-desktop-kit` and `bin/dsh-launcher`, and the `app/` assets, so a DSH Market
GitHub-source install needs no local TypeScript or Rust build on Apple Silicon. Market keeps the
`github:` source when updating and resolves the repository's current default-branch commit. Release
packages contain the same runtime assets and use the stable filename `dsh-desktop-kit.tgz`, so the
`releases/latest/download` URL remains valid when an exact release archive is required. On the
first `dsh web` start the plugin
installs the native shell and launcher to `~/.dsh/bin`
and creates `~/Applications/DSH.app`. Signed executables are replaced atomically so macOS does not
reuse stale code-signature state after a local upgrade, and the completed app bundle is ad-hoc signed
after its resources are assembled so strict bundle verification succeeds. A source checkout still requires `cargo build --release`
only when rebuilding the native shell; `app/install.sh` compiles the small native launcher with
clang when a prebuilt `bin/dsh-launcher` is not present.

### Source-install maintenance notes

The basename installation follows the repository's default branch and does not rebuild this plugin
during installation. The committed `lib/`, `bin/dsh-desktop-kit`, `bin/dsh-launcher`, and `app/`
files are the installable runtime assets and must remain in Git.

When changing the TypeScript plugin or the native shell, regenerate and commit the corresponding
artifacts before users install from GitHub:

```bash
pnpm build                         # refreshes lib/
cd shell && cargo build --release  # refreshes the native binary when shell code changed
# copy target/release/dsh-desktop-kit to bin/dsh-desktop-kit
# build/copy app/dsh-launcher.c to bin/dsh-launcher when the native launcher changes
```

For each release, commit every changed runtime asset before pushing the version commit and tag.
Existing basename installations then stay on the same concise GitHub source through future Market
updates. The bundled binary is currently macOS **arm64**. A GitHub-source install does not
cross-compile it for Intel Macs, Linux, or Windows; unsupported platforms keep the browser fallback
described above. Use a Release tarball only when an exact tested archive is required.

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
already up, which is why the launcher lives in this repo now. An HTTP 401 response counts as
"already running" because DSH `0.1.2` deliberately protects its unauthenticated root URL.

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

Shell argv: `dsh-desktop-kit [url] [title]` — the plugin supplies an authenticated URL; standalone defaults remain `http://127.0.0.1:3080` and `DSH`.
`--selftest` runs a scriptable native-fullscreen enter/exit check (exit 0 on pass);
`DSH_KIT_NO_SINGLE_INSTANCE=1` runs a side-by-side instance (selftest, dev).

## Language

Desktop Kit does not duplicate or translate the DSH interface. Its WKWebView loads the running DSH
web surface, so DSH's global `locale.preference` and live locale updates are preserved exactly as
they are in the browser. Plugin dictionaries registered through
`@deepseek-ai/dsh-client-locale` therefore work inside `DSH.app` without Desktop Kit-specific code.
The stable application and window name `DSH` is language-neutral; native macOS window controls
continue to follow the operating system locale.

## Known limitations

- macOS is the only tested platform (WKWebView). Linux/Windows builds are unverified.
- Plugin reload while the harness stays up is not handled — restart `dsh web` after reinstalling.
- A fresh WebKit data store cannot attach through the standalone `DSH.app` launcher to a server that
  was started without Desktop Kit: the launcher has no access to that server process's launch token.
  Once Desktop Kit has established the signed cookie for its WebKit data store, later attaches work.
- No close-to-tray: closing the window shuts the harness down (by design, matching the referenced behavior).

## License

MIT

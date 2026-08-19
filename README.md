# dsh-desktop-kit

Self-owned desktop shell for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH): a small plugin plus a native Tauri window over the harness web surface.

`dsh web` starts → the plugin spawns the shell on the served loopback URL → you get DSH in a real desktop window, with the browser tab still available as a second client. No fork, no repackaged runtime, no second profile — everything stays a plugin over your existing harness.

## Why not the third-party shell?

[dsh-desktop](https://github.com/s3yf1337/dsh-desktop) is great and was the blueprint. We rebuilt a smaller one for one concrete reason: **real macOS fullscreen**. Its window is frameless with a web-drawn title bar and never wires up `setFullscreen` — the maximize button is zoom, not a native fullscreen Space. This shell uses a plain **decorated** window, so the green traffic-light button and Ctrl+Cmd+F give you true macOS fullscreen out of the box.

## Features (v0.1)

- **Native window on the loopback web surface** — same origin the browser uses, so the whole SPA and every plugin work unchanged (verified with `dsh-rw`).
- **Real macOS fullscreen** — decorated window, native fullscreen Space, no custom title bar needed.
- **Single instance** — a second launch focuses the existing window instead of opening another.
- **Lifecycle contract** — closing the window exits the shell with code 0, and the plugin shuts the harness down; plugin teardown kills the shell. No orphaned processes on either side.
- **Graceful degradation** — no shell binary found? The harness keeps serving the web UI in the browser, with an actionable log line.
- **Small** — system WebKit (WKWebView), no bundled Chromium; the shell binary is a few MB.

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
dsh plugin --profile web add dsh-desktop-kit          # npm (once published)
# or from a checkout / GitHub release tarball:
dsh plugin --profile web add /path/to/dsh-desktop-kit

# 2. the shell binary (prebuilt on the Releases page, or build it yourself)
mkdir -p ~/.dsh/bin
cp dsh-desktop-kit ~/.dsh/bin/        # from the release download
# or: cd shell && cargo build --release && cp target/release/dsh-desktop-kit ~/.dsh/bin/

# 3. restart dsh web — the native window opens with it
```

To uninstall: `dsh plugin --profile web remove dsh-desktop-kit` and delete `~/.dsh/bin/dsh-desktop-kit`.

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

## Known limitations

- macOS is the only tested platform (WKWebView). Linux/Windows builds are unverified.
- Plugin reload while the harness stays up is not handled — restart `dsh web` after reinstalling.
- No close-to-tray: closing the window shuts the harness down (by design, matching the referenced behavior).

## License

MIT

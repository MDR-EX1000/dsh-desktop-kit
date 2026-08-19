// dsh-desktop-kit — self-owned desktop shell for DeepSeek Harness.
//
// Host half. After the web server binds, spawn the native Tauri shell on the
// served loopback URL. The shell is a plain *decorated* window: native macOS
// fullscreen (green button / Ctrl+Cmd+F) works out of the box — unlike
// frameless shells that have to wire it up by hand. The shell exits with
// code 0 when its window closes, which this plugin treats as a request to
// shut the harness down (ctx.appExit). Any other exit keeps the web surface
// running in the browser.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import z from 'schemastery'

export const name = 'dsh-desktop-kit'

// webServer is INJECTED so apply() runs only after the server is bound and
// the port is the real (possibly OS-assigned) one.
export const inject = ['webServer']

export const Config = z.object({
  /** Explicit shell binary path; empty resolves $DSH_HOME/bin → PATH → ~/.local/bin. */
  bin: z.string().default(''),
  /** Window title, passed to the shell as argv[2]. */
  title: z.string().default('DeepSeek Harness'),
})

export interface Config {
  bin: string
  title: string
}

/** The slice of the webServer service this plugin reads. */
export interface WebServerLike {
  port: number
}

export interface LoggerLike {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}

/** Subset of the plugin context used here, structurally typed for tests. */
export interface CtxLike {
  get(name: 'webServer'): WebServerLike | undefined
  get(name: 'appExit'): ((code: number) => void) | undefined
  get(name: 'loader'): { await(): Promise<unknown> } | undefined
  get(name: string): unknown
  effect(fn: () => void | (() => void), label?: string): void
  logger: LoggerLike
}

/** The subset of ChildProcess the plugin relies on (structural, test-friendly). */
export interface ChildLike {
  exitCode: number | null
  killed: boolean
  kill(signal?: NodeJS.Signals): boolean
  on(event: 'error', listener: (error: Error) => void): unknown
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown
}

export type SpawnLike = (
  bin: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; stdio: ['ignore', 'inherit', 'inherit'] },
) => ChildLike

export interface ApplyOverrides {
  spawn?: SpawnLike
  dshHome?: string
  pathDirs?: string[]
  localBin?: string
  console?: Pick<Console, 'log' | 'error'>
}

const SHELL_NAME = 'dsh-desktop-kit'
const LOOPBACK_HOST = '127.0.0.1'

function resolveDshHome(): string {
  return process.env.DSH_HOME && process.env.DSH_HOME.trim() !== ''
    ? process.env.DSH_HOME
    : join(homedir(), '.dsh')
}

function findOnPath(name: string, pathDirs?: string[]): string | undefined {
  const dirs = pathDirs ?? (process.env.PATH ?? '').split(delimiter).filter(Boolean)
  for (const dir of dirs) {
    const candidate = join(dir, name)
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

/**
 * Resolve the native shell binary to spawn, in order: explicit config/env →
 * $DSH_HOME/bin → PATH → ~/.local/bin. A path-bearing explicit value must
 * exist (a config error, not a fallback case); a bare name is left for PATH
 * resolution by the OS.
 */
export function resolveShellBinary(
  explicitBin: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  dshHome: string = resolveDshHome(),
  pathDirs?: string[],
  localBin: string = join(homedir(), '.local', 'bin', SHELL_NAME),
): string | undefined {
  const explicit = [explicitBin, env.DSH_DESKTOP_KIT_BIN].find(
    (value) => typeof value === 'string' && value.trim() !== '',
  )
  if (explicit !== undefined) {
    if (explicit.includes('/') || explicit.includes('\\')) {
      if (!existsSync(explicit)) throw new Error(`configured shell binary not found: ${explicit}`)
      return explicit
    }
    return explicit
  }
  const homeBin = join(dshHome, 'bin', process.platform === 'win32' ? `${SHELL_NAME}.exe` : SHELL_NAME)
  if (existsSync(homeBin)) return homeBin
  const onPath = findOnPath(SHELL_NAME, pathDirs)
  if (onPath !== undefined) return onPath
  if (existsSync(localBin)) return localBin
  return undefined
}

export function apply(ctx: Context, config: Config, overrides: ApplyOverrides = {}): void {
  const ctxLike = ctx as unknown as CtxLike
  const log = overrides.console ?? console
  const doSpawn: SpawnLike = overrides.spawn ?? ((bin, args, options) => spawn(bin, args, options))
  const settled = ctxLike.get('loader')?.await()
  const exit = ctxLike.get('appExit')
  let child: ChildLike | undefined

  // Plugin teardown kills the shell; the reverse (window closed) is handled
  // in the exit listener below.
  ctxLike.effect(() => () => {
    if (child !== undefined && child.exitCode === null && !child.killed) child.kill('SIGTERM')
  }, 'desktop-kit: kill shell on dispose')

  const open = () => {
    const server = ctxLike.get('webServer')
    if (server === undefined) return
    const url = `http://${LOOPBACK_HOST}:${server.port}`
    let bin: string | undefined
    try {
      bin = resolveShellBinary(config.bin, process.env, overrides.dshHome, overrides.pathDirs, overrides.localBin)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.error(`dsh desktop-kit: ${message}`)
      ctxLike.logger.error(message)
      return
    }
    if (bin === undefined) {
      log.error(
        `dsh desktop-kit: no shell binary found; keeping the web surface at ${url} — ` +
          'build the shell (shell/, cargo build --release) and install it to ~/.dsh/bin, or set DSH_DESKTOP_KIT_BIN',
      )
      ctxLike.logger.warn('desktop-kit: no shell binary found; keeping the web surface')
      return
    }
    log.log(`dsh desktop-kit: ${url} (window: ${bin})`)
    ctxLike.logger.info(`desktop-kit: opening ${url} with ${bin}`)
    child = doSpawn(bin, [url, config.title], {
      env: { ...process.env, DSH_HOME: overrides.dshHome ?? resolveDshHome() },
      // v1 has no control channel: stdin ignored, stdout/stderr inherited so
      // the shell's own log lines reach the harness terminal.
      stdio: ['ignore', 'inherit', 'inherit'],
    })
    child.on('error', (error: Error) => {
      log.error(`dsh desktop-kit: failed to start ${bin}: ${error.message}; keeping the web surface at ${url}`)
      ctxLike.logger.error(`desktop-kit: failed to start ${bin}: ${error.message}`)
    })
    child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      if (signal !== null || code === null) return // we killed it, or it died by a signal
      if (code === 0) {
        log.log('dsh desktop-kit: window closed; shutting the harness down')
        ctxLike.logger.info('desktop-kit: window closed; shutting the harness down')
        if (exit !== undefined) exit(0)
      } else {
        log.error(`dsh desktop-kit: shell exited with code ${code}; keeping the web surface at ${url}`)
        ctxLike.logger.warn(`desktop-kit: shell exited with code ${code}`)
      }
    })
  }

  if (settled === undefined) open()
  else settled.then(open, () => {})
}

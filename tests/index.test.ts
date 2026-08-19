// dsh-desktop-kit host plugin tests. Everything runs against in-memory fakes:
// no real binary spawn, no real ~/.dsh, no real web server.
import { EventEmitter } from 'node:events'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { apply, resolveShellBinary } from '../src/index.js'
import type { ApplyOverrides, CtxLike, WebServerLike } from '../src/index.js'

// ---------------------------------------------------------------------------
// fakes

class FakeChild extends EventEmitter {
  exitCode: number | null = null
  killed = false
  stdin = null
  kill() {
    this.killed = true
    this.exitCode = 0
    this.emit('exit', 0, null)
    return true
  }
}

interface FakeCtx extends CtxLike {
  effects: Array<() => void | (() => void)>
}

function makeCtx(opts: { port?: number; withExit?: boolean; settled?: boolean } = {}) {
  const records = {
    logs: [] as string[],
    errors: [] as string[],
    warns: [] as string[],
    exits: [] as number[],
  }
  const webServer: WebServerLike | undefined = opts.port === undefined ? undefined : { port: opts.port }
  const ctx: FakeCtx = {
    effects: [],
    get(name: string): any {
      if (name === 'webServer') return webServer
      if (name === 'appExit') return opts.withExit === false ? undefined : (code: number) => records.exits.push(code)
      if (name === 'loader') return opts.settled === false ? undefined : { await: () => Promise.resolve() }
      return undefined
    },
    effect(fn) {
      this.effects.push(fn)
    },
    logger: {
      info: (m) => records.logs.push(m),
      warn: (m) => records.warns.push(m),
      error: (m) => records.errors.push(m),
    },
  }
  return { ctx, records }
}

function makeSpawn() {
  const calls: Array<{ bin: string; args: string[] }> = []
  const child = new FakeChild()
  const spawn = ((bin: string, args: string[]) => {
    calls.push({ bin, args })
    return child
  }) as NonNullable<ApplyOverrides['spawn']>
  return { calls, child, spawn }
}

const tmpDirs: string[] = []
function tmpDir() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-desktop-kit-'))
  tmpDirs.push(dir)
  return dir
}
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true })
})

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

// ---------------------------------------------------------------------------
// resolveShellBinary

describe('resolveShellBinary', () => {
  it('returns an existing explicit path', () => {
    const dir = tmpDir()
    const bin = join(dir, 'dsh-desktop-kit')
    writeFileSync(bin, '')
    expect(resolveShellBinary(bin, {}, tmpDir(), [], join(dir, 'none'))).toBe(bin)
  })

  it('throws when an explicit path does not exist', () => {
    expect(() => resolveShellBinary('/no/such/bin', {}, tmpDir(), [], '/no/local')).toThrow(
      /configured shell binary not found/,
    )
  })

  it('prefers $DSH_HOME/bin over PATH and ~/.local/bin', () => {
    const home = tmpDir()
    const homeBin = join(home, 'bin', 'dsh-desktop-kit')
    mkdirSync(join(home, 'bin'))
    writeFileSync(homeBin, '')
    const pathDir = tmpDir()
    writeFileSync(join(pathDir, 'dsh-desktop-kit'), '')
    expect(resolveShellBinary('', {}, home, [pathDir], '/no/local')).toBe(homeBin)
  })

  it('falls back to PATH, then ~/.local/bin', () => {
    const pathDir = tmpDir()
    writeFileSync(join(pathDir, 'dsh-desktop-kit'), '')
    expect(resolveShellBinary('', {}, tmpDir(), [pathDir], '/no/local')).toBe(join(pathDir, 'dsh-desktop-kit'))

    const local = join(tmpDir(), 'dsh-desktop-kit')
    writeFileSync(local, '')
    expect(resolveShellBinary('', {}, tmpDir(), [], local)).toBe(local)
  })

  it('honours DSH_DESKTOP_KIT_BIN from env over empty config', () => {
    const dir = tmpDir()
    const bin = join(dir, 'kit')
    writeFileSync(bin, '')
    expect(resolveShellBinary('', { DSH_DESKTOP_KIT_BIN: bin }, tmpDir(), [], '/no/local')).toBe(bin)
  })

  it('returns a bare name untouched for OS PATH resolution', () => {
    expect(resolveShellBinary('dsh-desktop-kit', {}, tmpDir(), [], '/no/local')).toBe('dsh-desktop-kit')
  })

  it('returns undefined when nothing resolves', () => {
    expect(resolveShellBinary('', {}, tmpDir(), [], '/no/local')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// apply

describe('apply', () => {
  it('spawns the shell with the loopback URL from webServer.port and the title', async () => {
    const { ctx } = makeCtx({ port: 3080 })
    const { calls, spawn } = makeSpawn()
    const binDir = tmpDir()
    const bin = join(binDir, 'dsh-desktop-kit')
    writeFileSync(bin, '')
    apply(ctx as never, { bin, title: 'DSH Test' }, { spawn, dshHome: tmpDir() })
    await flush()
    expect(calls).toEqual([{ bin, args: ['http://127.0.0.1:3080', 'DSH Test'] }])
  })

  it('waits for the loader to settle before opening', async () => {
    const { ctx } = makeCtx({ port: 3999 })
    const { calls, spawn } = makeSpawn()
    const bin = join(tmpDir(), 'dsh-desktop-kit')
    writeFileSync(bin, '')
    apply(ctx as never, { bin, title: 'x' }, { spawn, dshHome: tmpDir() })
    expect(calls).toEqual([]) // not before the promise resolves
    await flush()
    expect(calls).toHaveLength(1)
    expect(calls[0]!.args[0]).toBe('http://127.0.0.1:3999')
  })

  it('warns and keeps the web surface when no binary resolves', async () => {
    const { ctx, records } = makeCtx({ port: 3080 })
    const { calls, spawn } = makeSpawn()
    const errors: string[] = []
    apply(ctx as never, { bin: '', title: 'x' }, {
      spawn,
      dshHome: tmpDir(),
      pathDirs: [],
      localBin: '/no/local',
      console: { log: () => {}, error: (m) => errors.push(String(m)) },
    })
    await flush()
    expect(calls).toEqual([])
    expect(errors.some((m) => m.includes('no shell binary found'))).toBe(true)
    expect(records.warns.some((m) => m.includes('no shell binary found'))).toBe(true)
  })

  it('surfaces a config error for a missing explicit binary', async () => {
    const { ctx, records } = makeCtx({ port: 3080 })
    const { calls, spawn } = makeSpawn()
    const errors: string[] = []
    apply(ctx as never, { bin: '/no/such/bin', title: 'x' }, {
      spawn,
      dshHome: tmpDir(),
      console: { log: () => {}, error: (m) => errors.push(String(m)) },
    })
    await flush()
    expect(calls).toEqual([])
    expect(errors.some((m) => m.includes('configured shell binary not found'))).toBe(true)
    expect(records.errors.some((m) => m.includes('configured shell binary not found'))).toBe(true)
  })

  it('does nothing when webServer is absent', async () => {
    const { ctx } = makeCtx({})
    const { calls, spawn } = makeSpawn()
    apply(ctx as never, { bin: '', title: 'x' }, { spawn, dshHome: tmpDir() })
    await flush()
    expect(calls).toEqual([])
  })

  it('calls appExit(0) when the shell exits with code 0 (window closed)', async () => {
    const { ctx, records } = makeCtx({ port: 3080 })
    const { child, spawn } = makeSpawn()
    const bin = join(tmpDir(), 'dsh-desktop-kit')
    writeFileSync(bin, '')
    apply(ctx as never, { bin, title: 'x' }, { spawn, dshHome: tmpDir() })
    await flush()
    child.exitCode = 0
    child.emit('exit', 0, null)
    expect(records.exits).toEqual([0])
  })

  it('keeps the harness running when the shell exits non-zero', async () => {
    const { ctx, records } = makeCtx({ port: 3080 })
    const { child, spawn } = makeSpawn()
    const bin = join(tmpDir(), 'dsh-desktop-kit')
    writeFileSync(bin, '')
    apply(ctx as never, { bin, title: 'x' }, { spawn, dshHome: tmpDir() })
    await flush()
    child.emit('exit', 1, null)
    expect(records.exits).toEqual([])
    expect(records.warns.some((m) => m.includes('code 1'))).toBe(true)
  })

  it('ignores exit by signal (we killed it ourselves)', async () => {
    const { ctx, records } = makeCtx({ port: 3080 })
    const { child, spawn } = makeSpawn()
    const bin = join(tmpDir(), 'dsh-desktop-kit')
    writeFileSync(bin, '')
    apply(ctx as never, { bin, title: 'x' }, { spawn, dshHome: tmpDir() })
    await flush()
    child.emit('exit', null, 'SIGTERM')
    expect(records.exits).toEqual([])
  })

  it('kills the shell on plugin dispose', async () => {
    const { ctx } = makeCtx({ port: 3080 })
    const { child, spawn } = makeSpawn()
    const bin = join(tmpDir(), 'dsh-desktop-kit')
    writeFileSync(bin, '')
    apply(ctx as never, { bin, title: 'x' }, { spawn, dshHome: tmpDir() })
    await flush()
    const cleanup = ctx.effects[0]!()
    expect(typeof cleanup).toBe('function')
    ;(cleanup as () => void)()
    expect(child.killed).toBe(true)
  })

  it('reports a spawn error and keeps the web surface', async () => {
    const { ctx, records } = makeCtx({ port: 3080 })
    const { child, spawn } = makeSpawn()
    const bin = join(tmpDir(), 'dsh-desktop-kit')
    writeFileSync(bin, '')
    apply(ctx as never, { bin, title: 'x' }, { spawn, dshHome: tmpDir() })
    await flush()
    child.emit('error', new Error('spawn EACCES'))
    expect(records.errors.some((m) => m.includes('spawn EACCES'))).toBe(true)
    expect(records.exits).toEqual([])
  })
})

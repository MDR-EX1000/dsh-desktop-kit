import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  files?: string[]
  scripts?: Record<string, string>
}

describe('desktop package assets', () => {
  it('publishes the app installer assets alongside the plugin', () => {
    expect(manifest.files).toEqual(expect.arrayContaining(['app', 'shell/icons']))
    expect(existsSync(new URL('../app/dsh-launcher.c', import.meta.url))).toBe(true)
    expect(existsSync(new URL('../app/dsh-launcher.sh', import.meta.url))).toBe(true)
    expect(existsSync(new URL('../app/install.sh', import.meta.url))).toBe(true)
    expect(existsSync(new URL('../app/Info.plist', import.meta.url))).toBe(true)
    expect(existsSync(new URL('../shell/icons/icon.png', import.meta.url))).toBe(true)
  })

  it('keeps the native binary optional for source/CI checkouts', () => {
    expect(manifest.files).toContain('bin')
    // Release CI stages both native binaries from the macOS shell job before npm pack.
    // A source checkout intentionally has no checked-in executable, while a staged
    // release checkout may contain them here before npm pack.
    const shellBinary = new URL('../bin/dsh-desktop-kit', import.meta.url)
    const launcherBinary = new URL('../bin/dsh-launcher', import.meta.url)
    if (existsSync(shellBinary) || existsSync(launcherBinary)) expect(manifest.files).toContain('bin')
  })

  it('requires a native launcher for the installed app', () => {
    const installer = readFileSync(new URL('../app/install.sh', import.meta.url), 'utf8')
    expect(installer).toContain('LAUNCHER_BIN="$REPO_DIR/bin/dsh-launcher"')
    expect(installer).toContain('if [ -f "$LAUNCHER_BIN" ]')
    expect(installer).toContain('app/dsh-launcher.c')
    expect(installer).toContain('app/dsh-launcher.sh')
    expect(installer).toContain('no native dsh-launcher binary')
  })

  it('does not require an install-time build script', () => {
    expect(manifest.scripts?.preinstall).toBeUndefined()
    expect(manifest.scripts?.install).toBeUndefined()
    expect(manifest.scripts?.postinstall).toBeUndefined()
    expect(manifest.scripts?.prepack).toBeUndefined()
  })
})

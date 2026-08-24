import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  files?: string[]
  scripts?: Record<string, string>
}

describe('desktop package assets', () => {
  it('publishes the app installer assets alongside the plugin', () => {
    expect(manifest.files).toEqual(expect.arrayContaining(['app', 'shell/icons']))
    expect(existsSync(new URL('../app/dsh-launcher', import.meta.url))).toBe(true)
    expect(existsSync(new URL('../app/install.sh', import.meta.url))).toBe(true)
    expect(existsSync(new URL('../app/Info.plist', import.meta.url))).toBe(true)
    expect(existsSync(new URL('../shell/icons/icon.png', import.meta.url))).toBe(true)
  })

  it('keeps the native binary optional for source/CI checkouts', () => {
    expect(manifest.files).toContain('bin')
    // Release CI stages bin/dsh-desktop-kit from the macOS shell job before npm pack.
    // A source checkout intentionally has no checked-in executable, while a staged
    // release checkout may contain it here before npm pack.
    const binary = new URL('../bin/dsh-desktop-kit', import.meta.url)
    if (existsSync(binary)) expect(manifest.files).toContain('bin')
  })

  it('does not require an install-time build script', () => {
    expect(manifest.scripts?.preinstall).toBeUndefined()
    expect(manifest.scripts?.install).toBeUndefined()
    expect(manifest.scripts?.postinstall).toBeUndefined()
    expect(manifest.scripts?.prepack).toBeUndefined()
  })
})

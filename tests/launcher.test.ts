import { readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const launcherPath = new URL('../app/dsh-launcher.sh', import.meta.url)
const launcher = readFileSync(launcherPath, 'utf8')
const nativeLauncherPath = new URL('../app/dsh-launcher.c', import.meta.url)
const nativeLauncher = readFileSync(nativeLauncherPath, 'utf8')

describe('desktop launcher', () => {
  it('keeps the fallback script executable', () => {
    expect(statSync(launcherPath).mode & 0o111).not.toBe(0)
  })

  it('uses a native wrapper as the app executable', () => {
    expect(nativeLauncher).toContain('#include <mach-o/dyld.h>')
    expect(nativeLauncher).toContain('posix_spawn(&child, "/bin/bash"')
    expect(nativeLauncher).toContain('/../Resources/dsh-launcher.sh')
  })

  it('does not open a duplicate browser during a cold launch', () => {
    expect(launcher).toContain('exec "$HOME/.local/bin/dsh" web --no-open')
  })

  it('prefers a bundled shell and falls back to the user install', () => {
    expect(launcher).toContain('BUNDLE_BIN="$CONTENTS/Resources/dsh-desktop-kit"')
    expect(launcher).toContain('USER_BIN="$HOME/.dsh/bin/dsh-desktop-kit"')
    expect(launcher).toContain('exec open "$URL"')
  })
})

import { readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const launcherPath = new URL('../app/dsh-launcher', import.meta.url)
const launcher = readFileSync(launcherPath, 'utf8')

describe('desktop launcher', () => {
  it('is executable', () => {
    expect(statSync(launcherPath).mode & 0o111).not.toBe(0)
  })

  it('does not open a duplicate browser during a cold launch', () => {
    expect(launcher).toContain('exec "$HOME/.local/bin/dsh" web --no-open')
  })
})

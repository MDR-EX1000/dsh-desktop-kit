// Structural checks for the built client bundle: the harness loads
// lib/client.js verbatim, so the bundle must carry the expected behavior
// markers (and must actually exist after `pnpm build`).
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const bundle = existsSync('lib/client.js') ? readFileSync('lib/client.js', 'utf8') : ''

describe('client bundle', () => {
  it('exists and is non-trivial', () => {
    expect(existsSync('lib/client.js')).toBe(true)
    expect(bundle.length).toBeGreaterThan(500)
  })

  it('registers itself with the harness module loader', () => {
    expect(bundle).toContain('window.__ModuleLoader__.load({')
    expect(bundle).toContain('id: "dsh-desktop-kit"')
    expect(bundle).toContain('factory: (require) =>')
  })

  it('is guarded to only act inside the native shell (__TAURI__)', () => {
    expect(bundle).toContain('__TAURI__')
  })

  it('delegates external links to kit_open_external', () => {
    expect(bundle).toContain('kit_open_external')
    expect(bundle).toContain('_blank')
  })

  it('ships the zoom handler', () => {
    expect(bundle).toContain('dsh-desktop-kit.zoom')
  })
})

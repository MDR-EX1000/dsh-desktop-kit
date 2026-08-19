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

  it('hands the loader a valid cordis plugin (name + apply)', () => {
    // Regression: the 0.1.1 entry was side-effect-only, so the factory
    // returned {} and the harness rejected it at apply time ("invalid plugin,
    // expect function or object with an 'apply' method, received object").
    type Entry = { id: string; factory: (require: unknown) => Record<string, unknown> }
    let entry: Entry | undefined
    const windowStub = { __ModuleLoader__: { load: (e: Entry) => { entry = e } } }
    new Function('window', bundle)(windowStub)
    expect(entry?.id).toBe('dsh-desktop-kit')
    const plugin = entry!.factory(() => { throw new Error('unexpected require') })
    expect(plugin.name).toBe('dsh-desktop-kit')
    expect(typeof plugin.apply).toBe('function')
    // Outside the native shell (no __TAURI__) apply() is a no-op.
    expect(() => (plugin.apply as () => void)()).not.toThrow()
  })
})

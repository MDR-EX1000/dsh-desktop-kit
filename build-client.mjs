// Bundle the client half: src/client/index.ts → lib/client.js.
//
// DSH client entries must be classic scripts registered through
// window.__ModuleLoader__.load({ id, factory }) — a bare IIFE fails to load
// ("loaded without registering ... via __ModuleLoader__.load"). We bundle with
// esbuild as an IIFE, expose the entry's exports via a globalName, and wrap
// the result in the loader envelope.
import { build } from 'esbuild'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(root, 'lib')
mkdirSync(outDir, { recursive: true })

await build({
  entryPoints: [path.join(root, 'src/client/index.ts')],
  bundle: true,
  format: 'iife',
  // Expose the entry's ESM exports as a global we can copy onto module.exports.
  globalName: '__DshDesktopKitClientExports',
  platform: 'browser',
  target: 'es2020',
  outfile: path.join(outDir, 'client.tmp.js'),
  logLevel: 'silent',
})

const body = readFileSync(path.join(outDir, 'client.tmp.js'), 'utf8')
const wrapped =
  `window.__ModuleLoader__.load({\n` +
  `\tid: "dsh-desktop-kit",\n` +
  `\tfactory: (require) => {\n` +
  `\t\tvar module = { exports: {} };\n` +
  `\t\tvar exports = module.exports;\n` +
  `\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });\n` +
  body +
  `\t\tObject.assign(module.exports, __DshDesktopKitClientExports);\n` +
  `\t\treturn module.exports;\n` +
  `\t},\n` +
  `});\n`
writeFileSync(path.join(outDir, 'client.js'), wrapped)
rmSync(path.join(outDir, 'client.tmp.js'))
console.log('lib/client.js written')

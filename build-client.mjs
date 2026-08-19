// Bundle the client half (src/client/index.ts → lib/client.js) with esbuild.
// The harness loads lib/client.js as the plugin's browser bundle.
import { build } from 'esbuild'

await build({
  entryPoints: ['src/client/index.ts'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  outfile: 'lib/client.js',
  logLevel: 'info',
})

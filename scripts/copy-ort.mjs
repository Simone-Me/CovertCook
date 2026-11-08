// Copies the onnxruntime-web runtime (WebAssembly + its loaders) into public/ort/ before every build.
// Why: foodModel.ts loads them from the site itself (ort.env.wasm.wasmPaths = "/ort/") — never from a CDN,
// because of the CSP ('self') and so that the scan works offline. They are generated, not committed:
// the version always matches the onnxruntime-web installed by npm.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const src = join('node_modules', 'onnxruntime-web', 'dist')
const dest = join('public', 'ort')
mkdirSync(dest, { recursive: true })
const files = readdirSync(src).filter((f) => /^ort-wasm-simd-threaded.*\.(wasm|mjs)$/.test(f))
if (files.length === 0) throw new Error(`no onnxruntime-web runtime found in ${src}: run npm install`)
for (const f of files) copyFileSync(join(src, f), join(dest, f))
console.log(`copied ${files.length} onnxruntime-web files to ${dest}`)

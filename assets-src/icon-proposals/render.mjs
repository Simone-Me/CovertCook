import { chromium } from 'playwright-core'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The SVG is inlined rather than loaded through <img src="file://…">: a page
// created with setContent has an opaque origin, and Chromium refuses it every
// local file. Inlining sidesteps the question entirely.
const dir = resolve('.')
const svgs = readdirSync(dir).filter((f) => f.endsWith('.svg')).sort()
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 })
for (const f of svgs) {
  const svg = readFileSync(resolve(dir, f), 'utf8')
  await page.setContent(`<style>html,body{margin:0;padding:0}svg{display:block}</style>${svg}`)
  await page.screenshot({ path: f.replace(/\.svg$/, '.png'), clip: { x: 0, y: 0, width: 512, height: 512 } })
}
await browser.close()
console.log(`rese ${svgs.length} icone`)

import { chromium } from 'playwright-core'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const dir = resolve('.')
const files = readdirSync(dir).filter((f) => f.endsWith('.svg')).sort()
const labels = {
  '0-attuale.svg': '0 · quella di prima',
  'a-domino.svg': 'A · domino a punte',
  'b-mascherina-incastrata.svg': 'B · incastrata sotto la falda',
  'c-mascherina-stretta.svg': 'C · mascherina stretta',
  'd-toque-larga.svg': 'D · toque larga',
  'e-con-lacci.svg': 'E · con i lacci',
  'f-sbircia.svg': 'F · sbircia dal bancone',
}
const cells = files
  .map((f) => {
    const svg = readFileSync(resolve(dir, f), 'utf8')
    return `<figure><div class="big">${svg}</div><figcaption>${labels[f] ?? f}</figcaption>
      <div class="row"><div class="sm">${svg}</div><div class="md">${svg}</div></div></figure>`
  })
  .join('')

const html = `<style>
  body{margin:0;padding:36px;background:#f2efe9;font:15px/1.4 system-ui,sans-serif;color:#2b2724}
  .grid{display:flex;gap:24px;align-items:flex-start;flex-wrap:nowrap}
  figure{margin:0;width:196px;text-align:center}
  .big{width:196px;height:196px;border-radius:44px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,.18)}
  .big svg{width:196px;height:196px;display:block}
  figcaption{margin:12px 0 10px;font-size:13px;font-weight:600}
  .row{display:flex;gap:14px;align-items:center;justify-content:center}
  .sm{width:48px;height:48px;border-radius:11px;overflow:hidden}.sm svg{width:48px;height:48px;display:block}
  .md{width:72px;height:72px;border-radius:16px;overflow:hidden}.md svg{width:72px;height:72px;display:block}
  h1{font-size:17px;margin:0 0 22px}
  p.note{font-size:12px;color:#6b635c;margin:20px 0 0}
</style>
<h1>CovertCook — toque + mascherina, sette varianti · glifo #FFFCF6 su fondo #C6202C</h1>
<div class="grid">${cells}</div>
<p class="note">Sotto ogni variante: 48 px e 72 px. A 48 px la mascherina è il primo dettaglio che si perde.</p>`

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await browser.newPage({ viewport: { width: 1620, height: 440 }, deviceScaleFactor: 2 })
await page.setContent(html)
await page.screenshot({ path: 'VARIANTI.png', fullPage: true })
await browser.close()
console.log('sheet varianti reso')

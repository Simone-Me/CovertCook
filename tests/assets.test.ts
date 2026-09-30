import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALLERGENS, DIETS, foodIconSrc } from '../src/lib/foodTags'
import { MACRO_PHOTO } from '../src/lib/filRouge'

const pub = (p: string) => existsSync(join('public', p))

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

describe('static assets referenced from the code exist in public/', () => {
  const sources = [...walk('src'), 'index.html', ...walk('supabase/email-templates')].filter((f) =>
    /\.(tsx?|css|html)$/.test(f),
  )
  const ref = /["'(`](\/[\w./-]+\.(?:webp|avif|png|jpe?g|mp4|svg))/g
  const url = /netlify\.app(\/[\w./-]+\.png)/g

  it('every "/path/file.ext" literal and email image resolves', () => {
    const missing: string[] = []
    for (const f of sources) {
      const s = readFileSync(f, 'utf8')
      for (const m of s.matchAll(ref)) if (!pub(m[1])) missing.push(`${f}: ${m[1]}`)
      for (const m of s.matchAll(url)) if (!pub(m[1])) missing.push(`${f}: ${m[1]}`)
    }
    expect(missing).toEqual([])
  })

  it('every allergen and diet tile has its icon', () => {
    for (const tag of [...ALLERGENS, ...DIETS]) expect(pub(foodIconSrc(tag.code)!), tag.code).toBe(true)
  })

  it('every fil-rouge photo exists', () => {
    for (const p of Object.values(MACRO_PHOTO)) expect(pub(p), p).toBe(true)
  })

  it('every drawer icon in Icon.tsx exists', () => {
    const src = readFileSync('src/components/Icon.tsx', 'utf8')
    const names = [...src.matchAll(/^\s+\w+: '([\w-]+)',/gm)].map((m) => m[1])
    expect(names.length).toBeGreaterThan(10)
    for (const n of names) expect(pub(`icons/${n}.webp`), n).toBe(true)
  })
})

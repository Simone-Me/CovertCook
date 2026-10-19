import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

type Tree = { [k: string]: string | Tree }
const load = (l: string): Tree => JSON.parse(readFileSync(`src/locales/${l}/common.json`, 'utf8'))

function keys(t: Tree, prefix = ''): string[] {
  return Object.entries(t).flatMap(([k, v]) =>
    typeof v === 'string' ? [prefix + k] : keys(v, `${prefix}${k}.`),
  )
}

describe('translations', () => {
  // i18next plural suffixes may legitimately differ per language.
  const base = (k: string) => k.replace(/_(zero|one|two|few|many|other)$/, '')
  const set = (l: string) => new Set(keys(load(l)).map(base))
  const enBase = set('en')

  // Each language loads on its own, with no English behind it (src/lib/i18n.ts),
  // so a key missing here is a raw key on somebody's screen.
  for (const l of ['fr', 'it', 'es']) {
    const other = set(l)
    it(`${l} has every English key`, () => {
      expect([...enBase].filter((k) => !other.has(k))).toEqual([])
    })
    it(`English has every ${l} key`, () => {
      expect([...other].filter((k) => !enBase.has(k))).toEqual([])
    })
  }
})

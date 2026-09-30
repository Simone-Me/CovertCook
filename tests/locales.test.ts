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
  const en = new Set(keys(load('en')))
  const fr = new Set(keys(load('fr')))
  // i18next plural suffixes may legitimately differ per language.
  const base = (k: string) => k.replace(/_(zero|one|two|few|many|other)$/, '')
  const enBase = new Set([...en].map(base))
  const frBase = new Set([...fr].map(base))

  it('French has every English key', () => {
    expect([...enBase].filter((k) => !frBase.has(k))).toEqual([])
  })
  it('English has every French key', () => {
    expect([...frBase].filter((k) => !enBase.has(k))).toEqual([])
  })
})

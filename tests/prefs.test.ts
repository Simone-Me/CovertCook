import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_TEXT_STEP, getTextStep, sizeName } from '../src/lib/prefs'

const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage

describe('text size preference', () => {
  afterEach(() => store.clear())

  it('starts at medium on a device that never chose', () => {
    expect(getTextStep()).toBe(DEFAULT_TEXT_STEP)
    expect(sizeName(getTextStep())).toBe('medium')
  })

  it('keeps a stored choice, including the smallest', () => {
    store.set('covertcook.textStep', '0')
    expect(getTextStep()).toBe(0)
  })

  it('ignores garbage', () => {
    store.set('covertcook.textStep', 'big')
    expect(getTextStep()).toBe(DEFAULT_TEXT_STEP)
  })
})

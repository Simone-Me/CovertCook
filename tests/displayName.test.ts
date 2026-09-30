import { describe, expect, it } from 'vitest'
import { finalName, nameProblem, normalizeName } from '../src/lib/displayName'

describe('display names', () => {
  it('lowercases and turns spaces into one hyphen', () => {
    expect(normalizeName('Marie   Claire')).toBe('marie-claire')
    expect(finalName('Marie Claire ')).toBe('marie-claire')
  })
  it('accepts ordinary names', () => {
    for (const n of ['Giulia', 'marco-88', 'Jean Pierre', 'draper', 'violet', 'grape']) {
      expect(nameProblem(n)).toBeNull()
    }
  })
  it('refuses names that pass for the app', () => {
    for (const n of ['CovertCook', 'covert cook', 'C0vertCook', 'covertcook-official', 'Admin', 'Test', 'official-support']) {
      expect(nameProblem(n)).toBe('reserved')
    }
  })
  it('refuses offensive names', () => {
    for (const n of ['women-raper', 'Women Rapist', 'h1tler', 'rape']) {
      expect(nameProblem(n)).toBe('offensive')
    }
  })
  it('refuses odd characters and one-letter names', () => {
    expect(nameProblem('a')).toBe('invalid')
    for (const n of ['José', 'zoé', 'müller', 'Иван', 'bob smith!']) expect(nameProblem(n), n).toBe('invalid')
    for (const n of ['cazzo', 'merde', 'vaffanculo']) expect(nameProblem(n), n).toBe('offensive')
    expect(nameProblem('bob<script>')).toBe('invalid')
  })
})

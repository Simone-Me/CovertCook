import { describe, expect, it } from 'vitest'
import { findProfanity } from '../src/lib/profanity'

describe('profanity: vetted Italian and Spanish additions', () => {
  it('refuses plain abuse', () => {
    for (const w of ['che stronzata', 'sei un pirla', 'eres un gilipollas', 'qué capullo', 'hijoputa'])
      expect(findProfanity(w), w).not.toBeNull()
  })
  it('leaves the kitchen alone', () => {
    for (const w of ['biga per la pizza', 'battere le uova', 'insalata di finocchio', 'pisello', 'perro caliente', 'hueso de jamón', 'nueces', 'pollo asado', 'carne alla pizzaiola'])
      expect(findProfanity(w), w).toBeNull()
  })
})

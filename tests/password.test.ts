import { describe, expect, it } from 'vitest'
import { checkPassword } from '../src/lib/password'

describe('checkPassword', () => {
  it('rejects short passwords, whatever they contain', () => {
    expect(checkPassword('Abcd1234!').valid).toBe(false)
  })
  it('accepts 14+ characters with a digit and a capital', () => {
    expect(checkPassword('Abcdefghijklm1')).toEqual({ valid: true, satisfied: 'classes' })
  })
  it('rejects 14+ characters without a digit or capital', () => {
    expect(checkPassword('abcdefghijklmn').valid).toBe(false)
  })
  it('accepts a 21+ character passphrase of anything', () => {
    expect(checkPassword('the cat sat on the fridge again')).toEqual({ valid: true, satisfied: 'length' })
  })
  it('counts an emoji as one character', () => {
    expect(checkPassword('😀'.repeat(20)).valid).toBe(false)
    expect(checkPassword('😀'.repeat(21)).valid).toBe(true)
  })
})

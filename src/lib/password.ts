/**
 * What counts as a password here, and why it is two rules rather than one.
 *
 * The usual "8 characters, one of each kind" produces `Passw0rd!` — short,
 * memorable to a cracking dictionary, annoying to type. Length is what
 * actually costs an attacker time, so there are two ways to be long enough:
 *
 *   * **14 or more** with a digit and a capital, or
 *   * **21 or more** of anything at all — a sentence you can remember and
 *     nobody can guess, with no arithmetic required.
 *
 * The second exists because a passphrase is both stronger and easier, and a
 * rule that forbids `the cat sat on the fridge again` while allowing `Abcd1234!`
 * has the whole thing backwards.
 */

export const LONG_ENOUGH_ALONE = 21
export const MIN_WITH_CLASSES = 14

export interface PasswordVerdict {
  valid: boolean
  /** Which of the two routes it currently satisfies, for the hint under the field. */
  satisfied: 'none' | 'classes' | 'length'
}

export function checkPassword(value: string): PasswordVerdict {
  // Count characters, not UTF-16 units: an emoji is one character to the
  // person typing it, and charging them two for it is arbitrary.
  const length = [...value].length

  if (length >= LONG_ENOUGH_ALONE) return { valid: true, satisfied: 'length' }

  if (length >= MIN_WITH_CLASSES && /\d/.test(value) && /\p{Lu}/u.test(value)) {
    return { valid: true, satisfied: 'classes' }
  }

  return { valid: false, satisfied: 'none' }
}

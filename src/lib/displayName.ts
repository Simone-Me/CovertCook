// What a public name may be. The server enforces the same rules (migration
// 0097, display_name_problem) — this copy exists so the form can say why
// before a round trip, not to be trusted on its own.
//
// Names are stored lowercase with '-' for spaces, so "Marie Claire" and
// "marie-claire" are one name rather than two people who look alike.

import { findProfanity } from './profanity'

export type NameProblem = 'invalid' | 'reserved' | 'offensive'

/** Lowercase, spaces (any run) become one '-', no '-' at the start. Applied
 *  as the person types, so what they see is what will be stored. */
export function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
}

/** As stored: the same, plus no trailing '-'. */
export function finalName(raw: string): string {
  return normalizeName(raw).replace(/-+$/, '')
}

// Words nobody but us may be called, matched against the whole name.
const RESERVED_EXACT = [
  'admin', 'administrator', 'administrateur', 'amministratore', 'root', 'mod', 'moderator',
  'moderateur', 'moderatore', 'support', 'staff', 'team', 'equipe', 'squadra', 'system',
  'systeme', 'sistema', 'null', 'undefined', 'test', 'tester', 'testing', 'anonymous',
  'anonyme', 'anonimo', 'official', 'officiel', 'ufficiale', 'owner', 'help', 'aide', 'info',
]
// Anything containing these reads as us, however it is spaced or spelled.
const RESERVED_PARTS = ['covertcook', 'covertcuisine']
// Standing alone between hyphens, these claim to speak for the app.
const IMPERSONATION = ['official', 'officiel', 'ufficiale', 'staff', 'admin', 'moderator', 'support']

// Strong enough to match anywhere in the name.
const OFFENSIVE_PARTS = [
  'rapist', 'rapiste', 'hitler', 'nigger', 'nigga', 'faggot', 'pedophile',
  'pedofil', 'paedo', 'terrorist', 'terroriste', 'terrorista', 'jihad', 'killall', 'violeur',
  'stupratore', 'puttana', 'salope', 'connard', 'encule', 'bitch', 'whore',
  'cunt', 'fuck', 'shit', 'cazzo', 'merde', ]
// Too short or too ordinary to match inside a word ("grape", "violet"):
// only when they stand alone between hyphens.
const OFFENSIVE_WORDS = ['rape', 'raper', 'sex', 'porn', 'pedo', 'negro', 'nazi', 'nazis', 'viol', 'violer', 'kill', 'slut', 'anal', 'nsfw']

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' }

function fold(name: string): string {
  return [...name].map((c) => LEET[c] ?? c).join('')
}

export function nameProblem(raw: string): NameProblem | null {
  const name = finalName(raw)
  if (name.length < 2 || name.length > 60) return 'invalid'
  // Only a to z, digits and - _ . — no accents, no other alphabets, no symbols.
  if (!/^[a-z0-9_.-]+$/.test(name)) return 'invalid'

  const folded = fold(name)
  const squashed = folded.replace(/[-_.]/g, '')
  const words = folded.split(/[-_.]/)

  if (RESERVED_EXACT.includes(squashed)) return 'reserved'
  if (RESERVED_PARTS.some((p) => squashed.includes(p))) return 'reserved'
  if (IMPERSONATION.some((p) => words.includes(p))) return 'reserved'

  if (OFFENSIVE_PARTS.some((p) => squashed.includes(p))) return 'offensive'
  if (OFFENSIVE_WORDS.some((p) => words.includes(p))) return 'offensive'
  // The two libraries, word by word and with the hyphens read as spaces.
  if (findProfanity(name.replace(/[-_.]+/g, ' '))) return 'offensive'
  return null
}

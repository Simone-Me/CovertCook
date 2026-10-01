// Vulgarity check for everything a person types freely: names, dinner titles,
// recipes, chat, notes.
//
// Two libraries, because neither covers enough alone:
//   * `obscenity` — English, and good at the evasions (f.u.c.k, fuuuck, fvck).
//   * `leo-profanity` — English, French and Russian word lists. It has no
//     Spanish despite asking for it (it silently falls back to English), and
//     no Italian, German or Portuguese; EXTRA below is our own short list of
//     the plainly abusive words in those.
//
// Matching is by whole word, never by substring. "Spaghetti alla puttanesca",
// "grape", "cocktail" and "Scunthorpe" are fine; the price is that a word glued
// into a longer one slips through. Names get the stricter substring check in
// displayName.ts on top of this.
//
// Words that are ordinary in a kitchen and only rude in another language are
// taken out of the lists (KITCHEN_OK): "chili con carne", "cul de poule",
// "butt" as in pork butt, "tit" as in the bird.
import leo from 'leo-profanity'
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity'

const EXTRA: Record<string, string[]> = {
  it: [
    'cazzo', 'cazzi', 'vaffanculo', 'stronzo', 'stronza', 'stronzi', 'merda', 'puttana', 'puttane',
    'troia', 'troie', 'coglione', 'coglioni', 'minchia', 'figa', 'culo', 'bastardo', 'bastarda',
    'frocio', 'finocchio', 'negro', 'porcodio', 'diocane', 'porcamadonna', 'zoccola', 'mignotta',
    'pompino', 'sborra', 'scopare', 'ricchione', 'handicappato', 'mongoloide',
  ],
  es: [
    'puta', 'puto', 'putas', 'mierda', 'coño', 'joder', 'jodete', 'cabron', 'cabrona', 'pendejo',
    'pendeja', 'gilipollas', 'polla', 'verga', 'pinche', 'marica', 'maricon', 'zorra', 'chingar',
    'chingada', 'hijoputa', 'culero', 'mamon',
  ],
  de: [
    'scheisse', 'scheiße', 'arschloch', 'fotze', 'wichser', 'hurensohn', 'hure', 'schlampe',
    'fick', 'ficken', 'verpiss', 'missgeburt', 'spast', 'neger', 'kanake', 'scheissdreck',
  ],
  pt: [
    'caralho', 'foda', 'foder', 'puta', 'buceta', 'viado', 'cuzao', 'filhodaputa', 'arrombado',
    'punheta', 'porra', 'cacete',
  ],
  // Hate and violence that is worth refusing in any language.
  all: [
    'rapist', 'raper', 'rapiste', 'nazi', 'nazis', 'hitler', 'pedophile', 'pedofilo', 'pedophile',
    'pedofil', 'paedo', 'violeur', 'stupratore', 'terrorist', 'terroriste', 'terrorista', 'jihad',
  ],
}

// Rude somewhere, innocent on a menu.
const KITCHEN_OK = new Set(['con', 'cul', 'bite', 'butt', 'tit', 'tits', 'cock', 'pinche', 'polla', 'fick'])

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i' }

/** Lowercase, accents off — so "merdé" and "merde" are one word. */
function plain(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function unleet(s: string): string {
  return [...s].map((c) => LEET[c] ?? c).join('')
}

let words: Set<string> | null = null

function dictionary(): Set<string> {
  if (words) return words
  const set = new Set<string>()
  for (const lang of ['en', 'fr', 'ru']) {
    leo.loadDictionary(lang)
    for (const w of leo.list()) set.add(plain(unleet(w)))
  }
  for (const list of Object.values(EXTRA)) for (const w of list) set.add(plain(w))
  for (const w of KITCHEN_OK) set.delete(w)
  words = set
  return set
}

const english = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers })

/** Drops trailing ! @ $ - a loop, because the regex form backtracks badly. */
function stripTrailingMarks(token: string): string {
  let end = token.length
  while (end > 0 && '!@$'.includes(token[end - 1])) end--
  return token.slice(0, end)
}

/**
 * The first vulgar word in `text`, as typed, or null.
 * Whole words only; see the header for why.
 */
export function findProfanity(text: string): string | null {
  if (!text || text.length < 3) return null

  const dict = dictionary()
  // Tokens keep @ $ ! and digits so "sh1t" and "p@ta" survive to be unleeted.
  const tokens = text.split(/[^\p{L}\p{N}@$!]+/u).filter(Boolean)
  for (const token of tokens) {
    const folded = plain(unleet(token)).replace(/[^\p{L}]/gu, '')
    if (folded.length >= 3 && dict.has(folded)) return stripTrailingMarks(token) || token
  }

  // Spaced-out evasions ("f u c k") are left to obscenity, below.
  const hit = english.getAllMatches(text, true)[0]
  if (hit) return text.slice(hit.startIndex, hit.endIndex + 1)
  return null
}

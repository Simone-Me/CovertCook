import { useTranslation } from 'react-i18next'
import type { FilRougeCategory } from './rpc'

// THE TWO FREE KINDS FIRST, and that is the whole of the reasoning: since 0091
// an ingredient and a way of cooking are free in full, for everybody, for ever,
// and the four after them open through the week's selection or through Crème.
// A host on the free app should meet what is theirs before what is not.
export const FIL_ROUGE_KINDS: FilRougeCategory[] = ['STAPLE', 'TECHNIQUE', 'COUNTRY', 'COLOUR', 'LETTER', 'ERA']

// The two kinds that are free in full, for ever (0091). The server is the
// authority — `fil_rouge_category.free` is what `offered` is computed from —
// and this list exists only so a screen can SAY so: with Crème every row is
// offered, so "everything here is unlocked" cannot be read back off the shelf.
export const FREE_KINDS: FilRougeCategory[] = ['STAPLE', 'TECHNIQUE']

/** One glyph per kind, for the places that show the kinds rather than a value. */
export const KIND_MARK: Record<FilRougeCategory, string> = {
  STAPLE: '🍅',
  TECHNIQUE: '🔥',
  COUNTRY: '🌍',
  COLOUR: '🎨',
  LETTER: '🔤',
  ERA: '🏛️',
}

/**
 * The name of a country, in the reader's language, from its ISO code.
 *
 * WHY THERE IS NO TRANSLATION FILE FOR THIS. 194 countries in two languages is
 * 388 strings to write, spell and keep in step, and a hand-written French list
 * gets the accents wrong. The browser already knows every one of them, in
 * every locale, and knows them better than we would — so the catalogue stores
 * 'JP' rather than 'JAPAN' (0084), the app carries no country strings at all,
 * and a third language costs nothing.
 *
 * The fallback is the code itself, which is at least recognisable, for the rare
 * engine without Intl.DisplayNames — and for the empty locale, which throws.
 */
export function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

/**
 * The label for any fil rouge value: a country from the browser, a letter from
 * itself, everything else from the translations.
 */
export function useFilRougeLabel() {
  const { t, i18n } = useTranslation()
  return (category: FilRougeCategory, code: string) => {
    if (category === 'COUNTRY') return countryName(code, i18n.language)
    if (category === 'LETTER') return code
    return t(`filRouge.value.${code}`, { defaultValue: code })
  }
}

/**
 * One glyph per fil rouge value, so a grid can be read at a glance.
 *
 * WHY A MAP IN THE CLIENT AND NOT A COLUMN. A mark is a rendering decision —
 * the same value wants a different glyph the day the grid is drawn differently
 * — and a column would make every change a migration. The codes are permanent
 * (0083), so this map is stable in the only way that matters.
 *
 * The world is not in here on purpose: 194 flags would read as a geopolitical
 * statement in a picker, and several of them are contested. Countries are
 * chosen by name, through the atlas.
 */
export const FIL_ROUGE_MARK: Record<string, string> = {
  // Colours, as the colour itself. Nothing else is as legible.
  RED: '🔴', ORANGE: '🟠', YELLOW: '🟡', GREEN: '🟢', BLUE: '🔵',
  PURPLE: '🟣', PINK: '🌸', WHITE: '⚪', BLACK: '⚫', BROWN: '🟤',

  // Ways of cooking, said by the thing you would reach for.
  NO_OVEN: '🔌', RAW_ONLY: '🍣', GRILLED: '🔥', FRIED: '🍳',
  STEAMED: '♨️', ONE_PAN: '🥘', SERVED_COLD: '❄️', ALL_LIQUID: '🥣',
  NO_KNIFE: '🥄', ONE_BITE: '🍢', UNDER_A_CRUST: '🥧', ROLLED: '🌯',

  // Ingredients.
  EGG: '🥚', POTATO: '🥔', TOMATO: '🍅', RICE: '🍚', BREAD: '🍞',
  CHEESE: '🧀', CHOCOLATE: '🍫', LEMON: '🍋', MUSHROOM: '🍄', PULSES: '🫘',
  FISH: '🐟', HONEY: '🍯', APPLE: '🍎', PUMPKIN: '🎃', GARLIC: '🧄',
  ONION: '🧅', BUTTER: '🧈', ALMOND: '🌰', CREAM: '🥛', CHILLI: '🌶️',

  // Times, and the half of them that are memories rather than periods.
  ANCIENT_ROME: '🏛️', MEDIEVAL: '🏰', VERSAILLES: '👑', TWENTIES: '🥂',
  FIFTIES_AMERICA: '🍔', SEVENTIES: '🕺', EIGHTIES: '📼', THE_FUTURE: '🚀',
  SCHOOL_CANTEEN: '🎒', FAMILY_PICNIC: '🧺', SUNDAY_AT_GRANDMAS: '🍲',
  CAMPING: '🏕️',
}

/** The six letters that are a bad evening rather than a hard one: they used to
 *  cost Crème, which read as a recommendation (0089). Named here so the picker
 *  can say so in words. */
export const HARD_LETTERS = ['K', 'Q', 'W', 'X', 'Y', 'Z']

/**
 * A photograph for each of the seven parts of the world.
 *
 * The macro groups are staples — wheat, rice, maize — so the pictures are of
 * the grain itself rather than of a landscape or a flag: a country is not a
 * postcard, and a region of the world drawn as one is the kind of thing that
 * gets screenshotted. A sack of millet is what the seven groups actually have
 * in common.
 *
 * KEYED BY FILE NAME AND NOT BY CONVENTION, so replacing one is dropping a file
 * in `public/` and changing the line below — no renaming, no build step. A code
 * with no entry simply gets no photograph, and the row stays as it was.
 */
export const MACRO_PHOTO: Record<string, string> = {
  '1': '/fil-rouge/wheat-dairy.avif', // Wheat and dairy
  '2': '/fil-rouge/wheat-rice.jpg', // Wheat and rice
  '3': '/fil-rouge/rice.avif', // Rice
  '4': '/fil-rouge/roots-tubers.jpg', // Roots and tubers
  '5': '/fil-rouge/millet-sorghum.avif', // Millet and sorghum
  '6': '/fil-rouge/maize.avif', // Maize
  '7': '/fil-rouge/taro-breadfruit.jpg', // Taro and breadfruit
}

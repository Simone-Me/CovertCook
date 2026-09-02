// The look half of a dinner: which mark stands for it, which faces the fridge
// hands out, and how the cloth is dressed.
//
// The catalogue itself lives in Postgres (0072) — codes, tiers, prices, and
// whether this account may use each one. What is here is the part that cannot
// be a database row: the artwork. A theme is a look, and a look is CSS and
// glyphs shipped with the build.
//
// WHY EMOJI AND NOT ICONS. Every icon in this app is a drawn 96px WebP
// (components/Icon.tsx), and there is no artwork for these lists yet. A glyph
// is the honest placeholder: it is already how a round marks itself
// (rounds.accent_emoji, 0001), it costs no request, and the day the drawings
// exist the change is this file plus the files, not every screen that renders
// a mark.
import type { NameTheme, TableTheme } from './rpc'

/**
 * The faces the fridge gives out.
 *
 * Keyed to the author's name, so the same chef keeps the same face all evening
 * — Chef Persil is always the carrot (0037). Each list gets a palette drawn
 * from its own world, because a brigade of stations wearing vegetables was the
 * pseudonym theme choice being thrown away at the one screen where everybody
 * is looking at each other.
 *
 * Sizes differ on purpose and it does not matter: the palette is indexed by a
 * hash, not zipped against the word list.
 */
const FACES: Record<NameTheme, string[]> = {
  FOOD: ['🥕', '🍅', '🧄', '🧅', '🥦', '🍆', '🌽', '🥑', '🍋', '🍇', '🍒', '🧀', '🥐', '🍄', '🌶️', '🥬', '🍐', '🥝'],
  BRIGADE: ['👨‍🍳', '👩‍🍳', '🧑‍🍳', '🔪', '🍽️', '🥄', '🧂', '🔥', '🥘', '🍲', '🫕', '🧑‍🌾', '🥣', '🍳', '⚖️', '🧊'],
  PASTA: ['🍝', '🌾', '🫓', '🥟', '🍜', '🧆', '🥖', '🫘', '🧄', '🍅', '🧀', '🌿', '🥫', '🫒', '🥄', '🔥'],
  PATISSERIE: ['🍰', '🧁', '🍮', '🍩', '🍪', '🥧', '🍫', '🍯', '🥐', '🍓', '🥚', '🧈', '🍬', '🥮', '🍡', '☕'],
  BATTERIE: ['🍳', '🔪', '🥄', '🥣', '⚗️', '🧯', '🪵', '⚖️', '🧽', '🫖', '🥡', '🧊', '🔥', '🧲', '🪣', '🧰'],
}

/** The one character that stands for the whole list. Kept in step with
 *  name_theme_catalogue.mark — that column is what the picker prints, this is
 *  the fallback for anywhere the catalogue has not been fetched. */
const MARKS: Record<NameTheme, string> = {
  FOOD: '🌿',
  BRIGADE: '👨‍🍳',
  PASTA: '🍝',
  PATISSERIE: '🍰',
  BATTERIE: '🍳',
}

export function themeMark(theme: NameTheme | undefined) {
  return MARKS[theme ?? 'FOOD'] ?? MARKS.FOOD
}

/** The face for one chef, stable for the evening. The hash is the same one the
 *  fridge has always used; only the palette it indexes into is new. */
export function faceFor(name: string, theme: NameTheme | undefined) {
  const palette = FACES[theme ?? 'FOOD'] ?? FACES.FOOD
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

/**
 * The class the cloth wears. One attribute on the scene, styled in
 * styles/table.css — so a theme is a palette swap rather than a second set of
 * components, and an unknown code (a theme added to the catalogue before the
 * client knows about it) simply falls through to the default cloth.
 */
export function tableThemeClass(theme: TableTheme | undefined) {
  return `theme-${(theme ?? 'CHECKS').toLowerCase()}`
}

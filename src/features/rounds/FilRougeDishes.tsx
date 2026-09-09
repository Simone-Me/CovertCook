import { useTranslation } from 'react-i18next'
import { dishesFor } from '../../lib/countryDishes'
import type { FilRougeCategory } from '../../lib/rpc'

/**
 * Three dishes from the country, where the country is the thread.
 *
 * WHERE IT BELONGS. Beside the person who has to act on it: the host choosing
 * a fil rouge, and the sender writing a recipe against one. Not on the round
 * page, where it would be trivia, and not on the cook's screen, where the
 * recipe has already been written and the suggestion is too late to be useful.
 *
 * SUGGESTIONS, SAID AS SUGGESTIONS. Never "the national dish": see the note in
 * lib/countryDishes.ts. Three is deliberately few — enough to unlock a country
 * nobody at the table has cooked from, too few to become the menu.
 *
 * Renders nothing for every category but the world, because a colour needs no
 * introduction and a letter has no dishes.
 */
export function FilRougeDishes({
  category,
  code,
}: {
  category: FilRougeCategory | null | undefined
  code: string | null | undefined
}) {
  const { t } = useTranslation()
  if (category !== 'COUNTRY' || !code) return null
  const dishes = dishesFor(code)
  if (dishes.length === 0) return null
  return <p className="muted">{t('filRouge.someDishes', { items: dishes.join(' · ') })}</p>
}

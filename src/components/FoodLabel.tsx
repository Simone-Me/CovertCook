import { useTranslation } from 'react-i18next'
import { foodIconSrc, isFoodCode } from '../lib/foodTags'

/**
 * One stored dietary label, shown the way it deserves.
 *
 * The column holds two different things since the grid arrived: a **code**
 * chosen from a tile (`CELERY`), and **free text** somebody typed into the
 * "other" field. They must not look identical, because they do not behave
 * identically — a code is matched against a dish's `contains_tags`
 * automatically, a typed word is only ever read by a human.
 *
 * So a code gets its picture and its translation; a typed label gets quotation
 * by way of italics and no icon. Without this, a code would reach the screen as
 * the bare word CELERY, in English, at a French table.
 */
export function FoodLabel({ label, stacked = false }: { label: string; stacked?: boolean }) {
  const { t } = useTranslation()

  // Anything not in the manifest is either a legacy row from before the grid
  // or something typed into "other". Both get the Other picture and their own
  // words: without a picture they read as a note somebody left rather than as
  // a declaration, and in a grid of pictures that is the one that gets
  // skipped.
  if (!isFoodCode(label)) {
    return (
      <span className={`food-label food-label--typed${stacked ? ' food-label--stacked' : ''}`}>
        <img src="/allergy/other.webp" alt="" aria-hidden="true" loading="lazy" />
        <em>{label}</em>
      </span>
    )
  }

  const cls = stacked ? 'food-label food-label--stacked' : 'food-label'

  const src = foodIconSrc(label)
  const name = t(`food.allergen.${label}`, {
    defaultValue: t(`food.diet.${label}`, { defaultValue: label }),
  })

  return (
    <span className={cls}>
      {src && <img src={src} alt="" aria-hidden="true" loading="lazy" />}
      <span>{name}</span>
    </span>
  )
}

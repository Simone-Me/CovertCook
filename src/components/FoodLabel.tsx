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

  if (!isFoodCode(label)) {
    return <em className="food-label food-label--typed">{label}</em>
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

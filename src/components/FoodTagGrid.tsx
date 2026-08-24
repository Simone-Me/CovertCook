import { useTranslation } from 'react-i18next'
import { foodIconSrc, OTHER_CODE, type FoodTag } from '../lib/foodTags'

/**
 * A grid of food to tap, three to a row.
 *
 * It replaces a form that asked somebody to name their own allergens into a
 * text field — which produced whatever spelling came to mind, in whichever
 * language, and left the person to remember that celery is an allergen at all.
 * A grid says so for them.
 *
 * **Selected is never only a colour.** A chosen tile gets a ring, a tick and
 * `aria-pressed`. One man in twelve reads red and green poorly, and this is
 * the screen where being wrong about what you selected has consequences at
 * somebody else's table.
 *
 * The last tile opens a text field, because fourteen allergens is the legal
 * list and not the human one — kiwi, nickel and histamine exist. What it
 * writes is free text, and the panel that displays it says so: a typed
 * allergen cannot be matched against a dish's coded tags, and a check that
 * never ran must not look like one that passed.
 */
export function FoodTagGrid({
  tags,
  selected,
  onToggle,
  namespace,
  otherValues = [],
  onOtherAdd,
  onOtherRemove,
}: {
  tags: FoodTag[]
  selected: string[]
  onToggle: (code: string) => void
  /** Locale namespace holding the names, e.g. `food.allergen`. */
  namespace: string
  otherValues?: string[]
  onOtherAdd?: (value: string) => void
  onOtherRemove?: (value: string) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="stack">
      <div className="tag-grid">
        {tags.map((tag) => {
          const isOther = tag.code === OTHER_CODE
          const on = isOther ? otherValues.length > 0 : selected.includes(tag.code)
          return (
            <button
              key={tag.code}
              type="button"
              className={`tag-tile${on ? ' is-on' : ''}`}
              aria-pressed={on}
              onClick={() => onToggle(tag.code)}
            >
              <img src={foodIconSrc(tag.code) ?? ''} alt="" aria-hidden="true" loading="lazy" />
              <span className="tag-tile__name">{t(`${namespace}.${tag.code}`)}</span>
              {on && (
                <span className="tag-tile__mark" aria-hidden="true">
                  ✓
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Whatever was typed, listed under the grid rather than hidden inside
          the tile: it is the part nobody can recognise from a picture. */}
      {otherValues.length > 0 && (
        <ul className="tag-typed">
          {otherValues.map((value) => (
            <li key={value}>
              <span>{value}</span>
              {onOtherRemove && (
                <button type="button" className="linkish" onClick={() => onOtherRemove(value)}>
                  {t('actions.remove')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {onOtherAdd && selected.includes(OTHER_CODE) && (
        <OtherField onAdd={onOtherAdd} placeholder={t(`${namespace}.otherPlaceholder`)} />
      )}
    </div>
  )
}

function OtherField({ onAdd, placeholder }: { onAdd: (value: string) => void; placeholder: string }) {
  const { t } = useTranslation()
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault()
        const input = e.currentTarget.elements.namedItem('other') as HTMLInputElement
        const value = input.value.trim()
        if (!value) return
        onAdd(value)
        input.value = ''
      }}
    >
      <input name="other" maxLength={80} placeholder={placeholder} />
      <button type="submit">{t('actions.add')}</button>
    </form>
  )
}

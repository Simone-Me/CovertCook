import { useTranslation } from 'react-i18next'
import { fromCents, type ThemeTier } from '../../lib/rpc'

export interface ThemeChoice {
  code: string
  tier: ThemeTier
  price_cents: number | null
  mark?: string
  owned: boolean
}

/**
 * A shelf of looks, most of which you cannot have yet.
 *
 * WHY A LOCKED ROW IS SHOWN AT ALL. The alternative — list only what this
 * account owns — makes the app look like it has two pseudonym lists and one
 * table cloth, and a host who would happily pay fifty cents for the pâtisserie
 * never learns it exists. A locked row with a price on it is an honest
 * shopfront: you can read the whole shelf and you can see which part of it is
 * yours.
 *
 * WHAT IT DOES NOT DO. It does not sell anything. There is no payment provider
 * wired to this app (DISTRIBUTION.md: monetising is a later and much more
 * expensive decision than a store listing), so a locked row explains itself and
 * refuses, and there is deliberately no "buy" button that would 404 into a
 * checkout that does not exist. The entitlement check is already server-side —
 * `theme_available` in 0072 — so the day a purchase lands, a row appears in
 * `profile_theme_unlocks` and this shelf unlocks itself with no change here.
 *
 * Radios, not a <select>: a select can only show the name of a locked option,
 * never why it is locked or what it costs, and disabled <option>s are silently
 * unreadable on half of mobile Safari.
 */
export function ThemePicker({
  name,
  options,
  value,
  onChange,
  labelKey,
  locale,
}: {
  /** Radio group name — two pickers on one form must not share a group. */
  name: string
  options: ThemeChoice[] | undefined
  value: string
  onChange: (code: string) => void
  /** i18n prefix; `${labelKey}.${code}` is the name, `…Hint` the sentence. */
  labelKey: string
  locale: string
}) {
  const { t } = useTranslation()

  if (!options) return <p className="muted">…</p>

  return (
    <div className="stack shelf">
      {options.map((opt) => {
        const locked = !opt.owned
        return (
          <label
            key={opt.code}
            className={`shelf__row${locked ? ' is-locked' : ''}${value === opt.code ? ' is-chosen' : ''}`}
          >
            <input
              type="radio"
              name={name}
              style={{ width: 'auto' }}
              disabled={locked}
              checked={value === opt.code}
              onChange={() => onChange(opt.code)}
            />
            {opt.mark && (
              <span className="shelf__mark" aria-hidden="true">
                {opt.mark}
              </span>
            )}
            <span className="shelf__text">
              <span className="shelf__name">
                {t(`${labelKey}.${opt.code}`, { defaultValue: opt.code })}
                {/* The tier, said in words rather than by a padlock alone:
                    "free" on the second row is the fact that stops the whole
                    shelf reading as a paywall. */}
                {opt.tier === 'FREE' && <span className="shelf__tag">{t('themes.free')}</span>}
                {locked && opt.price_cents !== null && (
                  <span className="shelf__tag shelf__tag--price">
                    {fromCents(opt.price_cents, locale)}
                  </span>
                )}
              </span>
              <span className="muted shelf__hint">
                {t(`${labelKey}.${opt.code}Hint`, { defaultValue: '' })}
              </span>
              {locked && <span className="shelf__locked">{t('themes.notYet')}</span>}
            </span>
          </label>
        )
      })}
    </div>
  )
}

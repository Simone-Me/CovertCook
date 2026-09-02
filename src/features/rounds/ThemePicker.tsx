import { useTranslation } from 'react-i18next'
import { ChoiceList } from '../../components/ChoiceList'
import { fromCents, type ThemeTier } from '../../lib/rpc'

export interface ThemeChoice {
  code: string
  tier: ThemeTier
  price_cents: number | null
  mark?: string
  owned: boolean
  /** Being worked on, and out of reach of everybody until it is finished. */
  paused?: boolean
}

/**
 * A shelf of looks, most of which you cannot have yet.
 *
 * WHY A LOCKED ROW IS SHOWN AT ALL. The alternative — list only what this
 * account owns — makes the app look like it has two pseudonym lists and one
 * table cloth, and a host who would happily pay fifty cents for the pâtisserie
 * never learns it exists. A locked row with a price on it is an honest
 * shopfront: you read the whole shelf and you see which part of it is yours.
 *
 * WHAT IT DOES NOT DO. It does not sell anything. There is no payment provider
 * wired to this app, so a locked row explains itself and points at the PRO
 * page, where the three ways in are described in one place. The entitlement
 * check is server-side — `theme_available` in 0072, taught about subscriptions
 * in 0075 — so the day a purchase lands, this shelf unlocks itself.
 *
 * Height-capped and scrolling: seven cloths at full height turned the creation
 * form into a page of options with the actual dinner somewhere above it.
 */
export function ThemePicker({
  name,
  options,
  value,
  onChange,
  labelKey,
  locale,
  freeUntil,
}: {
  /** Radio group name — two pickers on one form must not share a group. */
  name: string
  options: ThemeChoice[] | undefined
  value: string
  onChange: (code: string) => void
  /** i18n prefix; `${labelKey}.${code}` is the name, `…Hint` the sentence. */
  labelKey: string
  locale: string
  /** When the free-for-all ends, if it is on. A PAID row is usable during it
   *  and must still say so — see the note on the tag below. */
  freeUntil?: string | null
}) {
  const { t } = useTranslation()

  if (!options) return <p className="muted">…</p>

  return (
    <ChoiceList
      name={name}
      value={value}
      onChange={onChange}
      visibleRows={3.5}
      options={options.map((opt) => ({
        value: opt.code,
        label: t(`${labelKey}.${opt.code}`, { defaultValue: opt.code }),
        hint: t(`${labelKey}.${opt.code}Hint`, { defaultValue: '' }) || undefined,
        mark: opt.mark,
        locked: !opt.owned,
        // Two different sentences, and printing the wrong one is a support
        // question: "not yours yet" invites somebody to go and buy it, which
        // is not what is happening to a cloth that is back in the workshop.
        lockedReason: opt.paused ? t('themes.paused') : t('themes.notYet'),
        tag: (
          <>
            {/* The tier, in words rather than by a padlock alone: "free" on the
                second row is the fact that stops the whole shelf reading as a
                paywall. */}
            {opt.tier === 'FREE' && <span className="shelf__tag">{t('themes.free')}</span>}

            {/* A PAID row keeps saying PRO EVEN WHEN IT IS USABLE, and this is
                the point of the whole prop. During the free-for-all every
                paid theme is unlocked, so without this the shelf looks like
                seven free cloths — and on 1 January five of them would appear
                to have been taken away. Marked now, with the date it stops
                being free, nothing is a surprise later. */}
            {opt.tier === 'PAID' && !opt.paused && (
              <>
                <span className="shelf__tag shelf__tag--pro">{t('pro.badge')}</span>
                {opt.owned && freeUntil && (
                  <em className="shelf__freenow">
                    {t('pro.freeForNow', {
                      date: new Date(freeUntil).toLocaleDateString(locale, {
                        day: 'numeric',
                        month: 'numeric',
                      }),
                    })}
                  </em>
                )}
              </>
            )}

            {/* A price on something nobody can have is noise, and a price on
                something that is being redrawn is a promise about a thing that
                does not exist yet. The paused row carries one word instead. */}
            {opt.paused ? (
              <span className="shelf__tag">{t('themes.pausedTag')}</span>
            ) : (
              !opt.owned &&
              opt.price_cents !== null && (
                <span className="shelf__tag shelf__tag--price">
                  {fromCents(opt.price_cents, locale)}
                </span>
              )
            )}
          </>
        ),
      }))}
    />
  )
}

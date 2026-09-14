import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import { BackToTable } from '../../components/BackToTable'
import { Fold } from '../../components/Fold'
import { themeMark } from '../../lib/themes'
import { ProEndingNotice } from './ProNotices'
import {
  fromCents,
  listNameThemes,
  listTableThemes,
  myProStatus,
  redeemCode,
  setProTestOverride,
  ALREADY_REDEEMED,
  INVALID_CODE,
  TEST_WINDOW_CLOSED,
  type NameTheme,
} from '../../lib/rpc'

// The annual price, in cents, in one place. Not in the database like the
// per-item prices are, because there is nothing to sell it through yet: the
// day there is, the store is the authority on what a subscription costs and
// this constant goes away rather than being kept in step with it.
const YEARLY_CENTS = 500

/**
 * What Crème is, what it opens, and the two ways in.
 *
 * ONE PRICE, FOR EVERYTHING, FOR A YEAR. Buying a cloth or a word list on its
 * own is gone: it split one small decision into six, and somebody who spent
 * fifty cents on the pâtisserie still found the third recipe tab shut. What is
 * sold is Crème, once, and everything on this page opens with it.
 *
 * THE HARDEST THING ON THIS PAGE IS BEING HONEST ABOUT THE MIDDLE OF IT.
 * Nothing can be bought — there is no payment provider wired to this app — and
 * during the test period everybody has everything anyway. A page with a big
 * buy button would be a shopfront with no till behind it, and the first
 * person to press it would find that out the hard way.
 *
 * So the shape is: what it opens (real, and browsable), then how you would get
 * it (described, and labelled as not yet), then the one route that does work
 * today (a code). The order is deliberate — somebody who leaves after the
 * first section has learned the true thing, which is that the free app is a
 * whole app and Crème is a look and a kindness.
 */
export function ProPage() {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const locale = profile?.locale ?? i18n.language ?? 'en'

  const [code, setCode] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const { data: pro } = useQuery({ queryKey: ['pro', 'status'], queryFn: myProStatus })
  const { data: nameThemes } = useQuery({ queryKey: ['themes', 'name'], queryFn: listNameThemes })
  const { data: tableThemes } = useQuery({ queryKey: ['themes', 'table'], queryFn: listTableThemes })

  async function onRedeem() {
    setNote(null)
    setBusy(true)
    try {
      const what = await redeemCode(code)
      setCode('')
      setNote(t('pro.redeem.done', { what: t(`pro.redeem.kind.${what}`, { defaultValue: what }) }))
      await queryClient.invalidateQueries({ queryKey: ['pro'] })
      await queryClient.invalidateQueries({ queryKey: ['themes'] })
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      setNote(
        raw === INVALID_CODE
          ? t('pro.redeem.invalid')
          : raw === ALREADY_REDEEMED
            ? t('pro.redeem.already')
            : raw || t('errors.generic'),
      )
    } finally {
      setBusy(false)
    }
  }

  async function onToggleTrial(mode: 'FORCE_ON' | null) {
    setNote(null)
    try {
      await setProTestOverride(mode)
      await queryClient.invalidateQueries({ queryKey: ['pro'] })
      await queryClient.invalidateQueries({ queryKey: ['themes'] })
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      setNote(raw === TEST_WINDOW_CLOSED ? t('pro.trial.closed') : raw || t('errors.generic'))
    }
  }

  // The end of the free-for-all, in words, in one place: the status line, the
  // switch and both of the offers all name it now.
  const windowUntil =
    pro?.window_open && pro.window_until
      ? new Date(pro.window_until).toLocaleDateString(locale, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : null

  /**
   * What to say under an offer that cannot be taken yet.
   *
   * While the window is open the true sentence is not "you cannot buy this" —
   * it is "you do not have to". Switching Crème on above costs nothing until
   * the date, and this is where it will be bought afterwards. Saying "not yet,
   * wait" instead reads as a feature being withheld, which is the opposite of
   * what is happening.
   */
  const buyingNote = windowUntil
    ? t('pro.ways.freeWhileTesting', { date: windowUntil })
    : t('pro.ways.notYet')

  const paidNames = (nameThemes ?? []).filter((x) => x.tier === 'PAID')
  const paidTables = (tableThemes ?? []).filter((x) => x.tier === 'PAID')

  /**
   * What to print in the corner of a card on the shelf.
   *
   * NO PRICE, BECAUSE NOTHING ON THIS SHELF IS SOLD ON ITS OWN ANY MORE. Crème
   * is one thing bought once a year, so fifty cents in the corner of a cloth
   * was an offer nobody could take and a second, smaller shop next to the only
   * one that exists. What the corner is for now is the reader's own standing:
   * free until the date while the window is open, "yours" after it, and the
   * word Crème on everything they have not got.
   *
   * "Yours" is still the wrong word during the free-for-all, and wrong in the
   * way that costs trust later: everything is unlocked, so every card would
   * claim to be owned, and in January they would appear to have been taken
   * away from somebody who was told they had them.
   */
  function shelfLabel(item: { owned: boolean; paused?: boolean }) {
    // Nothing about having it on a card for something that is back in the
    // workshop: it is not for sale and it is not free either, it is simply not
    // finished, and that is the only fact worth the corner.
    if (item.paused) return <em className="procard__freenow">{t('themes.pausedTag')}</em>
    if (pro?.window_open && pro.window_until) {
      return (
        <em className="procard__freenow">
          {t('pro.freeForNow', {
            date: new Date(pro.window_until).toLocaleDateString(locale, {
              day: 'numeric',
              month: 'numeric',
            }),
          })}
        </em>
      )
    }
    return item.owned ? t('pro.opens.yours') : t('pro.badge')
  }

  return (
    <div className="stack sheet">
      <BackToTable />
      <h1>{t('pro.title')}</h1>

      {/* The first thing, before any of the offers: the free app is a whole
          app. Somebody arriving here from a locked row is one sentence away
          from believing the dinner they are planning is a demo. */}
      <div className="profree">
        <p className="profree__head">{t('pro.badge')}</p>
        <p className="profree__free">{t('pro.freeForever')}</p>
        <p className="profree__what">{t('pro.what')}</p>
      </div>

      {/* Where you stand, said plainly and with the reason. "You have PRO"
          during the free-for-all is true and deeply misleading on its own — it
          is a window that shuts, and somebody planning around it deserves the
          date rather than a surprise in January. */}
      {pro && (
        <div className="card stack pro-status">
          <strong>{t(pro.pro ? 'pro.status.on' : 'pro.status.off')}</strong>
          {windowUntil && (
            <p className="muted" style={{ margin: 0 }}>
              {t('pro.status.window', { date: windowUntil })}
            </p>
          )}
          {!pro.window_open && pro.expires_at && (
            <p className="muted" style={{ margin: 0 }}>
              {t('pro.status.until', { date: new Date(pro.expires_at).toLocaleDateString(locale) })}
            </p>
          )}

          {/* THE TRIAL, and it is a door rather than a gift (0081). It used
              to be the other way round — everybody had Crème and this switch
              took it away so you could see the free version — which meant
              nobody chose it, nobody noticed what it gave them, and in January
              a great many accounts would lose features they never knew they
              had. Asked for, it means something: the day the window shuts, the
              people who lose Crème are the people who once pressed this.

              The server refuses it the moment the window closes (0075): it is
              not a way to have Crème for nothing afterwards. */}
          {pro.window_open && (
            <div className="stack">
              <hr className="pass__rule" />
              <p className="muted" style={{ margin: 0 }}>
                {t('pro.trial.why', { date: windowUntil ?? '' })}
              </p>
              <button
                type="button"
                className={pro.test_override === 'FORCE_ON' ? 'secondary' : undefined}
                onClick={() => onToggleTrial(pro.test_override === 'FORCE_ON' ? null : 'FORCE_ON')}
              >
                {t(pro.test_override === 'FORCE_ON' ? 'pro.trial.off' : 'pro.trial.on', {
                  date: windowUntil ?? '',
                })}
              </button>
            </div>
          )}
        </div>
      )}

      <ProEndingNotice />

      {note && <p className="notice">{note}</p>}

      {/* ---- 1. What it opens ---- */}
      <h2>{t('pro.opens.title')}</h2>

      <Fold
        title={t('rounds.recipesPerBrief.label')}
        aside={
          pro?.window_open && pro.window_until
            ? t('pro.freeForNow', {
                date: new Date(pro.window_until).toLocaleDateString(locale, {
                  day: 'numeric',
                  month: 'numeric',
                }),
              })
            : undefined
        }
        defaultOpen
      >
        <div className="card stack">
          <p style={{ margin: 0 }}>{t('pro.opens.recipes')}</p>
          {/* The example rather than a description of it: three tabs is exactly
              what the sender sees, and showing it is shorter than saying it. */}
          <div className="row ideatabs" aria-hidden="true">
            <span className="ideatab is-now">{t('pro.opens.recipesEg1')}</span>
            <span className="ideatab secondary">{t('pro.opens.recipesEg2')}</span>
            <span className="ideatab secondary">{t('pro.opens.recipesEg3')}</span>
          </div>
          <p className="muted" style={{ margin: 0 }}>{t('pro.opens.recipesWhy')}</p>
        </div>
      </Fold>

      <Fold title={t('rounds.nameTheme.label')} aside={t('pro.opens.count', { count: paidNames.length })}>
        <div className="card stack">
          <p className="muted" style={{ margin: 0 }}>{t('pro.opens.names')}</p>
          <div className="prorow">
            {paidNames.map((x) => (
              <div key={x.code} className={`procard${x.owned ? ' is-owned' : ''}`}>
                <span className="procard__mark" aria-hidden="true">
                  {x.mark || themeMark(x.code as NameTheme)}
                </span>
                <strong>{t(`rounds.nameTheme.${x.code}`, { defaultValue: x.code })}</strong>
                <span className="muted procard__eg">
                  {t(`rounds.nameTheme.${x.code}Hint`, { defaultValue: '' })}
                </span>
                <span className="procard__price">{shelfLabel(x)}</span>
              </div>
            ))}
          </div>
        </div>
      </Fold>

      <Fold title={t('rounds.tableTheme.label')} aside={t('pro.opens.count', { count: paidTables.length })}>
        <div className="card stack">
          <p className="muted" style={{ margin: 0 }}>{t('pro.opens.tables')}</p>
          <div className="prorow">
            {paidTables.map((x) => (
              <div key={x.code} className={`procard${x.owned ? ' is-owned' : ''}`}>
                {/* The cloth itself, as a swatch. The whole thing being sold is
                    what it looks like, so a name and a price with no picture is
                    the one description that cannot do the job. */}
                <span
                  className={`procard__swatch cloth theme-${x.code.toLowerCase()}`}
                  aria-hidden="true"
                />
                <strong>{t(`rounds.tableTheme.${x.code}`, { defaultValue: x.code })}</strong>
                <span className="muted procard__eg">
                  {t(`rounds.tableTheme.${x.code}Hint`, { defaultValue: '' })}
                </span>
                <span className="procard__price">{shelfLabel(x)}</span>
              </div>
            ))}
          </div>
        </div>
      </Fold>

      {/* ---- 2 and 3. How you would get it ---- */}
      <h2>{t('pro.ways.title')}</h2>

      {/* ONE OFFER, AND ONLY ONE. There used to be two — a cloth or a word list
          bought on its own, and everything for a year — and the small one was
          doing the app harm: it invited somebody to spend fifty cents, find
          that three recipes were still shut, and spend again. One price, once a
          year, everything open, is both the shorter sentence and the honest
          one. */}
      <div className="card stack">
        <strong>{t('pro.ways.yearly', { price: fromCents(YEARLY_CENTS, locale) })}</strong>
        <p className="notice">{buyingNote}</p>
      </div>

      {/* The one that works today. Last, because it is not how most people will
          ever get here — but it is the only section on this page that does
          something, and it is how testers and the author get in. */}
      <div className="card stack">
        <strong>{t('pro.redeem.title')}</strong>
        <p className="muted" style={{ margin: 0 }}>{t('pro.redeem.what')}</p>
        <label htmlFor="redeem">{t('pro.redeem.label')}</label>
        <div className="row">
          <input
            id="redeem"
            value={code}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="XXXXX-XX"
            onChange={(e) => setCode(e.target.value)}
          />
          <button type="button" disabled={busy || !code.trim()} onClick={onRedeem}>
            {t('pro.redeem.go')}
          </button>
        </div>
      </div>

      <p className="muted">
        <Link to="/legal/terms">{t('legal.terms')}</Link>
      </p>
    </div>
  )
}

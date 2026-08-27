import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChatThread } from '../chat/ChatThread'
import { useRound } from '../rounds/hooks'
import {
  getMyAssignment,
  getMyBrief,
  getResults,
  listRoundRecipes,
  saveRecipes,
  type Course,
  type RoundResult,
} from '../../lib/rpc'
import { BackToTable } from '../../components/BackToTable'

// The order a meal is eaten in, which is the order a menu is printed in.
// Alphabetical would put the dessert second.
const COURSE_ORDER: Course[] = ['STARTER', 'MAIN', 'DESSERT', 'DRINK', 'OTHER']

/**
 * The evening, printed as the menu it was.
 *
 * This used to be a leaderboard: a stack of cards, `#1 Tarte tatin` in bold,
 * the course in grey underneath, the points on the right. Everything true and
 * nothing memorable — the same shape a sports app uses, on the one screen an
 * evening ends on.
 *
 * A menu says the same facts in the form the subject already has. The courses
 * become sections, the dishes become lines, and the score is printed where a
 * price would be, which is the only place on a menu the eye already knows to
 * look for a number. Nothing in this app fits the tablecloth better, and it is
 * the screen people will screenshot.
 *
 * Two things it must not lose, because a menu is a decorative shape and
 * results are a factual one:
 *
 *   * Who won. A carte that hides the winner has stopped being a results
 *     page. The dinner's first place carries a seal; the best of each course
 *     is already named by its award.
 *   * What did not arrive. A dish whose cook left is struck off the way a
 *     kitchen strikes a line off the service menu, rather than vanishing and
 *     leaving a course that looks like a bug (0057).
 */
export function ResultsPage() {
  const { t } = useTranslation()
  const { roundId } = useParams()

  const queryClient = useQueryClient()
  // Armed, not always on. A menu where every dish is a control is a form; the
  // switch below turns it into one only for as long as somebody is choosing.
  const [arming, setArming] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [savedCount, setSavedCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: round } = useRound(roundId)
  const { data: results, isLoading, error: resultsError } = useQuery({
    queryKey: ['rounds', roundId, 'results'],
    enabled: !!roundId,
    queryFn: () => getResults(roundId as string),
  })
  // Reveal happens per-thread (get_thread unmasks other_party_* once the
  // round is RESULTS/ARCHIVED, regardless of anonymity) — surfacing both of
  // this player's own threads here means they don't have to remember where
  // to look for "who cooked for me" / "who I cooked for".
  const { data: assignment } = useQuery({
    queryKey: ['rounds', roundId, 'my-assignment'],
    enabled: !!roundId,
    queryFn: () => getMyAssignment(roundId as string),
  })
  const { data: myBrief } = useQuery({
    queryKey: ['rounds', roundId, 'my-brief'],
    enabled: !!roundId,
    queryFn: () => getMyBrief(roundId as string),
  })
  // The recipes themselves — the one call in this app that reads somebody
  // else's brief (0058). Fetched with the page rather than on arming, so the
  // switch is instant and so `already_saved` is known before anything is
  // offered.
  const { data: recipes } = useQuery({
    queryKey: ['rounds', roundId, 'recipes'],
    enabled: !!roundId,
    queryFn: () => listRoundRecipes(roundId as string),
  })

  if (isLoading) return <p className="muted">…</p>

  // The two named refusals `get_results` raises (0025). Before the menu they
  // fell through as an empty list, which was quiet and wrong; with an empty
  // state that says "no dishes were recorded" they would be quiet, wrong and
  // confident. Both mean the evening is fine and the reader is early.
  if (resultsError) {
    const raw = resultsError instanceof Error ? resultsError.message : ''
    return (
      <div className="stack sheet">
        <BackToTable />
        <h1>{t('results.title')}</h1>
        <p className="notice notice--wanting">
          {t(`results.gate.${raw}`, { defaultValue: raw || t('errors.generic') })}
        </p>
      </div>
    )
  }

  // A round with no courses has no sections: one carte générale, which is
  // what a free-for-all dinner actually was. Printing "OTHER" as a heading
  // over every dish would be inventing a structure the evening never had.
  const dishes = results ?? []
  const sections =
    round?.slot_mode === 'CATEGORIES'
      ? COURSE_ORDER.map((course) => ({ course, dishes: dishes.filter((d) => d.course === course) })).filter(
          (section) => section.dishes.length > 0,
        )
      : [{ course: null, dishes }]

  const savable = new Map((recipes ?? []).map((r) => [r.brief_id, r]))
  const alreadySaved = new Set((recipes ?? []).filter((r) => r.already_saved).map((r) => r.brief_id))

  /**
   * Arming loads what is already in the book into the selection.
   *
   * This is the whole reason the switch stays a switch. One save per person
   * per recipe is enforced by a unique index, so a second confirm writes
   * nothing — but a panel that came back empty would invite somebody to tap
   * four names again and then report "0 saved", which reads as a failure.
   * Coming back already ticked says the true thing: these are yours already.
   */
  function arm() {
    if (arming) {
      setArming(false)
      return
    }
    setSavedCount(null)
    setError(null)
    setPicked(new Set(alreadySaved))
    setArming(true)
  }

  function toggle(briefId: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(briefId)) next.delete(briefId)
      else next.add(briefId)
      return next
    })
  }

  // Only what is not already in the book travels. Sending the lot would work —
  // the index would drop the duplicates — but then the number that comes back
  // is the number of NEW rows, and the sentence on screen would have to explain
  // why four taps became one save.
  const toSave = [...picked].filter((id) => !alreadySaved.has(id))

  async function confirmSave() {
    if (!roundId) return
    setError(null)
    setBusy(true)
    try {
      const written = await saveRecipes(roundId, toSave)
      setSavedCount(written)
      setArming(false)
      await queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'recipes'] })
      await queryClient.invalidateQueries({ queryKey: ['my-recipes'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack sheet">
      <BackToTable />
      <h1>{t('results.title')}</h1>

      {error && <div className="error">{error}</div>}

      <div className={`menucard menucard--carte${arming ? ' is-arming' : ''}`}>
        <p className="menucard__head">{round?.name ?? t('results.title')}</p>

        {dishes.length === 0 && <p className="muted">{t('results.nothingServed')}</p>}

        {sections.map((section) => (
          <div key={section.course ?? 'carte'} className="menucard__section">
            {section.course && (
              <h2 className="menucard__section-title">{t(`briefs.courseOption.${section.course}`)}</h2>
            )}
            <ul className="menucard__list">
              {section.dishes.map((dish) => (
                <MenuLine
                  key={dish.brief_id}
                  dish={dish}
                  savable={arming && savable.has(dish.brief_id)}
                  picked={picked.has(dish.brief_id)}
                  saved={alreadySaved.has(dish.brief_id)}
                  onToggle={() => toggle(dish.brief_id)}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* The switch, the confirm, and the line that says where they went.
          Under the menu rather than on it: the menu is the evening, and a
          control living inside it would make the evening look like a form. */}
      {(recipes?.length ?? 0) > 0 && (
        <div className="stack">
          <button type="button" className={arming ? '' : 'secondary'} onClick={arm} aria-expanded={arming}>
            {t(arming ? 'book.stopChoosing' : 'book.keepRecipes')}
          </button>

          {arming && (
            <div className="paper stack">
              <p className="muted" style={{ margin: 0 }}>{t('book.armHelp')}</p>
              <div className="row">
                <button type="button" disabled={busy || toSave.length === 0} onClick={confirmSave}>
                  {t('book.saveCount', { n: toSave.length })}
                </button>
                <button type="button" className="secondary" onClick={() => setArming(false)}>
                  {t('actions.cancel')}
                </button>
              </div>
            </div>
          )}

          {/* Where they went, said once, with the way to get there. A save that
              reports success and leaves you on the same screen has told you
              nothing about where the thing now is. */}
          {savedCount !== null && (
            <p className="notice">
              {savedCount > 0 ? t('book.savedTo', { n: savedCount }) : t('book.savedNothingNew')}{' '}
              <Link to="/profile">{t('book.openBook')}</Link>
            </p>
          )}
        </div>
      )}

      {assignment && (
        <>
          <h2>{t('results.whoCookedForYou')}</h2>
          <ChatThread pairingId={assignment.pairing_id} roundId={roundId} />
        </>
      )}

      {myBrief && (
        <>
          <h2>{t('results.whoYouCookedFor')}</h2>
          <ChatThread pairingId={myBrief.pairing_id} roundId={roundId} />
        </>
      )}
    </div>
  )
}

/**
 * One line on the carte: the dish, its awards, and the number in the price
 * column.
 *
 * The leader dots are not decoration — they are what makes a name and a
 * number twelve centimetres apart read as one line rather than two columns,
 * which is the entire typographic trick of a printed menu. They are drawn
 * with a repeating gradient rather than a row of full stops so a screen
 * reader is never handed forty periods to announce.
 */
function MenuLine({
  dish,
  savable,
  picked,
  saved,
  onToggle,
}: {
  dish: RoundResult
  savable: boolean
  picked: boolean
  saved: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  const won = dish.served && dish.final_rank === 1

  // While the panel is armed the name becomes the control. Not a checkbox
  // beside it: a row of boxes down a menu is a form with a menu drawn behind
  // it, and the thing being chosen is the dish, so the dish is what you press.
  const Name = savable ? 'button' : 'span'
  const nameProps = savable
    ? ({ type: 'button', onClick: onToggle, 'aria-pressed': picked } as const)
    : {}

  return (
    <li className="menucard__row">
      <div className={`menucard__course${dish.served ? '' : ' is-unserved'}${picked ? ' is-picked' : ''}`}>
        <Name className={`menucard__name${savable ? ' menucard__name--tappable' : ''}`} {...nameProps}>
          {/* The dinner's first place. One mark, on one dish — the best of
              each course is already said in words by its own award, and a
              second badge saying the same thing twice is how a menu turns
              back into a scoreboard. */}
          {won && (
            <span className="menucard__seal" title={t('results.winner')} aria-label={t('results.winner')}>
              ●
            </span>
          )}
          {dish.dish_name}
          {/* The ring a glass leaves on a menu: what you chose, marked the way
              the table itself marks things. Drawn on the row rather than
              beside the name so it reads as the line being circled. */}
          {picked && <span className="menucard__ring" aria-hidden="true" />}
        </Name>
        <span className="menucard__leader" aria-hidden="true" />
        <span className="menucard__price">
          {savable && saved
            ? t('book.inYourBook')
            : dish.served
              ? t('results.points', { points: dish.borda_points.toFixed(1) })
              : t('results.notServed')}
        </span>
      </div>

      {dish.award_keys.length > 0 && (
        <p className="menucard__awards">
          {dish.award_keys.map((key) => t(`results.award.${key}`, key)).join(' · ')}
        </p>
      )}
    </li>
  )
}

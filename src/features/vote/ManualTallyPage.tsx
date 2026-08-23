import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import { useRound } from '../rounds/hooks'
import { BackToTable } from '../../components/BackToTable'
import { InlineConfirm } from '../../components/InlineConfirm'
import { Fold } from '../../components/Fold'
import {
  closeManualVote,
  setManualVoters,
  TOO_MANY_FOR_DISH,
  TOO_MANY_FOR_PLACE,
  getManualMenu,
  getManualTally,
  setManualTally,
} from '../../lib/rpc'

// Counting a show of hands, in the order a room can actually answer.
//
// Three passes, worst place first: thirds, then seconds, then firsts. That
// order is not arbitrary — asking "who was your favourite?" first makes the
// next two questions feel like consolation, and people start voting for the
// answer they already gave. Working up keeps every pass a real question, and
// the winner is the last thing anybody says out loud.
//
// Points follow the places: third = 1, second = 2, first = 3.
const PASSES = [
  { place: 3, points: 1 },
  { place: 2, points: 2 },
  { place: 1, points: 3 },
] as const

export function ManualTallyPage() {
  const { t } = useTranslation()
  const { roundId } = useParams()
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const [closing, setClosing] = useState(false)
  const [voters, setVoters] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  const { data: round, isLoading } = useRound(roundId)

  const { data: menu } = useQuery({
    queryKey: ['rounds', roundId, 'manual-menu'],
    enabled: !!roundId,
    queryFn: () => getManualMenu(roundId as string),
  })

  const { data: tally } = useQuery({
    queryKey: ['rounds', roundId, 'manual-tally'],
    enabled: !!roundId,
    queryFn: () => getManualTally(roundId as string),
  })

  if (isLoading || !round) return <p className="muted">…</p>
  if (round.host_id !== profile?.id) return <Navigate to={`/rounds/${roundId}`} replace />

  const countFor = (briefId: string, place: number) =>
    tally?.find((row) => row.brief_id === briefId && row.place === place)?.voters ?? 0

  async function bump(briefId: string, place: number, delta: number) {
    if (!roundId) return
    const next = Math.max(0, countFor(briefId, place) + delta)
    setError(null)
    try {
      await setManualTally(roundId, briefId, place, next)
      await queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'manual-tally'] })
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      if (raw === TOO_MANY_FOR_DISH) setError(t('vote.manual.tooManyForDish', { n: round?.manual_voters }))
      else if (raw === TOO_MANY_FOR_PLACE) setError(t('vote.manual.tooManyForPlace', { n: round?.manual_voters }))
      else setError(raw || t('errors.generic'))
    }
  }

  async function onSetVoters(value: string) {
    if (!roundId) return
    setError(null)
    try {
      await setManualVoters(roundId, value ? Number(value) : null)
      await queryClient.invalidateQueries({ queryKey: ['rounds', roundId] })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    }
  }

  // The same arithmetic close_manual_vote does, run here so the host can see
  // the standings before committing them. Recomputed from the counts rather
  // than cached, because the counts are what people are still changing.
  const standings = (menu ?? [])
    .map((dish) => ({
      ...dish,
      points: PASSES.reduce((sum, p) => sum + countFor(dish.brief_id, p.place) * p.points, 0),
      firsts: countFor(dish.brief_id, 1),
    }))
    .sort((a, b) => b.points - a.points || b.firsts - a.firsts || a.dish_name.localeCompare(b.dish_name))

  async function onClose() {
    if (!roundId) return
    setError(null)
    setClosing(true)
    try {
      await closeManualVote(roundId)
      await queryClient.invalidateQueries({ queryKey: ['rounds', roundId] })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setClosing(false)
    }
  }

  async function onShare() {
    const lines = standings.map((s, i) => `${i + 1}. ${s.dish_name} — ${s.points} ${t('vote.points')}`)
    const text = `${t('vote.manual.shareTitle', { name: round?.name })}\n${lines.join('\n')}`
    // Share sheet where the phone has one, clipboard where it doesn't. Both
    // hand the result to the host to send however they already talk to people.
    if (navigator.share) {
      await navigator.share({ text }).catch(() => {})
    } else {
      await navigator.clipboard.writeText(text).catch(() => {})
    }
  }

  return (
    <div className="stack sheet">
      <BackToTable />
      <h1>{t('vote.manual.title')}</h1>
      {error && <div className="error">{error}</div>}

      {/* Asked first, because every check below depends on it — and asked
          rather than counted from the roster: somebody who turned up without
          cooking still ate, and still gets a say. */}
      <div className="card stack">
        <label htmlFor="voters">{t('vote.manual.howMany')}</label>
        <input
          id="voters"
          type="number"
          min={1}
          inputMode="numeric"
          value={voters || (round.manual_voters ?? '')}
          onChange={(e) => setVoters(e.target.value)}
          onBlur={(e) => onSetVoters(e.target.value)}
        />
        <p className="muted" style={{ margin: 0 }}>{t('vote.manual.howManyHint')}</p>
      </div>

      {/* Said once, at the top, because whoever is holding the phone is also
          the person explaining the rules to the room. */}
      <div className="howto">
        <p className="howto__lead">{t('vote.manual.howLead')}</p>
        <ol className="howto__steps">
          {(t('vote.manual.howSteps', { returnObjects: true }) as string[]).map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </div>

      {/* Three folds rather than a wizard, so the room sets the order. The
          suggested one is worst-place-first — asking for favourites first
          makes the next two questions feel like consolation and people
          re-vote for the answer they already gave — but a host who has
          already asked out of order should not have to fight the screen. */}
      {PASSES.map((pass) => (
        <Fold
          key={pass.place}
          title={t('vote.manual.askFor', {
            place: t(`vote.manual.place.${pass.place}`),
            points: pass.points,
          })}
          aside={t('vote.manual.handsCounted', {
            count: (menu ?? []).reduce((n, d) => n + countFor(d.brief_id, pass.place), 0),
          })}
          defaultOpen={pass.place === 3}
        >
          <ol className="menucard__list">
            {menu?.map((dish) => (
              <li key={dish.brief_id} className="menucard__row">
                <div className="menucard__course">
                  <span className="menucard__name">
                    {dish.dish_name}
                    <span className="tally__cook">{dish.cook_name}</span>
                  </span>
                  <span className="tally__counter">
                    <button
                      type="button"
                      className="tally__step"
                      aria-label={t('vote.manual.fewer')}
                      onClick={() => bump(dish.brief_id, pass.place, -1)}
                    >
                      −
                    </button>
                    <span className="tally__n">{countFor(dish.brief_id, pass.place)}</span>
                    <button
                      type="button"
                      className="tally__step"
                      aria-label={t('vote.manual.more')}
                      onClick={() => bump(dish.brief_id, pass.place, 1)}
                    >
                      +
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </Fold>
      ))}

      {/* Always visible, and recomputed from the counts rather than cached,
          because the counts are what people are still changing. */}
      <div className="menucard">
        <p className="menucard__head">{t('vote.manual.finalTitle')}</p>
        <ol className="menucard__list">
          {standings.map((s, i) => (
            <li key={s.brief_id} className="menucard__row">
              <div className={`menucard__course${i === 0 && s.points > 0 ? ' is-now' : ''}`}>
                <span className="tally__rank">{i + 1}</span>
                <span className="menucard__name">
                  {s.dish_name}
                  <span className="tally__cook">{s.cook_name}</span>
                </span>
                <span className="tally__points">
                  {s.points} {t('vote.points')}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <button type="button" className="secondary" onClick={onShare}>
        {t('vote.manual.share')}
      </button>

      {round.status === 'VOTING' && (
        <InlineConfirm
          title={t('vote.manual.close')}
          confirmLabel={t('vote.manual.close')}
          busy={closing}
          onConfirm={onClose}
          onCancel={() => {}}
        >
          <p className="confirmbox__why">{t('vote.manual.closeWhy')}</p>
        </InlineConfirm>
      )}
    </div>
  )
}

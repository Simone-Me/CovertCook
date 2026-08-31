import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import {
  addCourse,
  changeCourse,
  clearAssignment,
  BRIEFS_EXIST,
  COURSE_IN_USE,
  getMenuStatus,
  removeCourse,
  setSlotMode,
  COURSES,
  type Course,
  type RoundStatus,
  type SlotMode,
} from '../../lib/rpc'
import { HostAction } from './HostAction'
import { TurnBack } from '../../components/TurnBack'

// Composing the menu, next to the other things the Executive Chef is being
// asked to do — not buried in a settings page they'd have to know to visit.
//
// It also finally shows the arithmetic. generate_assignment has always
// refused unless the courses equal the seated chefs (one dish each), but
// the rule was enforced and never stated: being one course short produced a
// refusal rather than a count, which reads as a broken button.
export function MenuPanel({
  roundId,
  slotMode,
  status,
}: {
  roundId: string
  slotMode: SlotMode
  /** Where the dinner is. The panel is offered for the whole of DRAFT → LOCKED
   *  (0036 allows all three), but the arithmetic below only *means* anything at
   *  LOCKED: before the door shuts the number of chefs is still moving, so a
   *  menu that is one course short is a menu in progress, not a menu that is
   *  wrong. */
  status: RoundStatus
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [newCourse, setNewCourse] = useState<Course>('MAIN')
  // Which course the picker below is about to replace. Null means the picker
  // adds a new one — same control, two jobs, and the turning arrow is what
  // says which job it is doing.
  const [swapping, setSwapping] = useState<string | null>(null)
  // A change the roulette refused. Held so the offer below can carry it out
  // for real instead of only apologising.
  const [blocked, setBlocked] = useState<{ slotId: string; course: Course } | null>(null)
  // The last door, and the only destructive one in the app: clearing the
  // roulette when recipes already exist takes those recipes and their private
  // messages with it. Held separately so it can be asked for on its own.
  const [discardAsk, setDiscardAsk] = useState<{ slotId: string; course: Course } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: slots } = useQuery({
    queryKey: ['rounds', roundId, 'slots'],
    enabled: slotMode === 'CATEGORIES',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('slots')
        .select('id,course')
        .eq('round_id', roundId)
        .order('course')
      if (error) throw error
      return data as { id: string; course: Course }[]
    },
  })

  const { data: menu } = useQuery({
    queryKey: ['rounds', roundId, 'menu-status'],
    queryFn: () => getMenuStatus(roundId),
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['rounds', roundId] })
  }

  // The RPCs raise named outcomes (0027) so the two things that can go
  // wrong here can be said in words. Before this, deleting a course the
  // roulette had already assigned surfaced the raw foreign-key constraint
  // name, and everything else became "something went wrong".
  async function run(fn: () => Promise<unknown>, onBlocked?: () => void) {
    setError(null)
    try {
      await fn()
      refresh()
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      if (raw === COURSE_IN_USE && onBlocked) onBlocked()
      const known = t(`rounds.menu.errors.${raw}`, { defaultValue: '' })
      setError(known || raw || t('errors.generic'))
    }
  }

  // The way through a COURSE_IN_USE: the course is frozen because the
  // roulette has already dealt it, so undo the roulette and deal again. Safe
  // because clear_assignment refuses once anybody has written (0037) — this
  // can only ever throw away a shuffle.
  async function forceChange(discardBriefs = false) {
    const target = discardBriefs ? discardAsk : blocked
    if (!target) return
    const { slotId, course } = target
    setBlocked(null)
    setDiscardAsk(null)
    setError(null)
    try {
      await clearAssignment(roundId, discardBriefs)
      await changeCourse(roundId, slotId, course)
      setSwapping(null)
      refresh()
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      // Recipes are already written. Not a refusal to work around silently —
      // the next offer says exactly what it would cost.
      if (raw === BRIEFS_EXIST) {
        setDiscardAsk({ slotId, course })
        setError(t('rounds.menu.errors.BRIEFS_EXIST'))
        return
      }
      const known = t(`rounds.menu.errors.${raw}`, { defaultValue: '' })
      setError(known || raw || t('errors.generic'))
    }
  }

  const courses = menu?.courses ?? 0
  const seats = menu?.seats ?? 0
  const balanced = courses === seats
  // The count is a demand at LOCKED and a running total before it.
  const counting = status === 'LOCKED'

  return (
    <HostAction
      title={t('rounds.menu.title')}
      waiting={counting && slotMode === 'CATEGORIES' && !balanced}
    >
      {/* An error with no way out is a dead end: the arrow stayed armed, the
          message stayed on screen, and the only escape was leaving the page.
          The OK clears both the message and the half-made swap. */}
      {error && (
        <div className="error stack">
          <span>{error}</span>
          {discardAsk ? (
            <>
              <span className="muted">{t('rounds.menu.discardWarning')}</span>
              <div className="row">
                <button
                  type="button"
                  className="confirmbox__ok"
                  onClick={() => forceChange(true)}
                >
                  {t('rounds.menu.discardConfirm')}
                </button>
                <button
                  type="button"
                  className="confirmbox__cancel"
                  onClick={() => {
                    setError(null)
                    setDiscardAsk(null)
                    setSwapping(null)
                  }}
                >
                  {t('actions.no')}
                </button>
              </div>
            </>
          ) : blocked ? (
            <>
              <span className="muted">{t('rounds.menu.clearToChange')}</span>
              <div className="row">
                <button type="button" className="confirmbox__ok" onClick={() => forceChange(false)}>
                  {t('actions.ok')}
                </button>
                <button
                  type="button"
                  className="confirmbox__cancel"
                  onClick={() => {
                    setError(null)
                    setBlocked(null)
                    setSwapping(null)
                  }}
                >
                  {t('actions.no')}
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="confirmbox__ok"
              onClick={() => {
                setError(null)
                setSwapping(null)
              }}
            >
              {t('actions.ok')}
            </button>
          )}
        </div>
      )}

      <label className="row">
        <input
          type="radio"
          style={{ width: 'auto' }}
          checked={slotMode === 'FREE'}
          onChange={() => run(() => setSlotMode(roundId, 'FREE'))}
        />
        <span>
          <strong>{t('rounds.menu.free')}</strong>
          <span className="muted"> — {t('rounds.menu.freeHint')}</span>
        </span>
      </label>

      <label className="row">
        <input
          type="radio"
          style={{ width: 'auto' }}
          checked={slotMode === 'CATEGORIES'}
          onChange={() => run(() => setSlotMode(roundId, 'CATEGORIES'))}
        />
        <span>
          <strong>{t('rounds.menu.composed')}</strong>
          <span className="muted"> — {t('rounds.menu.composedHint')}</span>
        </span>
      </label>

      {/* WHICH COURSES WAITS FOR THE DOOR TO SHUT, and the mode does not.
          There has to be exactly one course per chef, and until sign-ups close
          the number of chefs keeps moving: every arrival broke the sum the
          host had just finished making, and the panel answered with a red line
          about a menu that was not wrong yet. So before LOCKED this offers the
          choice between a free-for-all and a composed menu, says when the menu
          gets composed, and stops there. */}
      {slotMode === 'CATEGORIES' && !counting && (
        <p className="muted">{t('rounds.menu.composedAtLock')}</p>
      )}

      {slotMode === 'CATEGORIES' && counting && (
        <>
          {/* One course per chef, because every chef cooks exactly one
              dish. Shown as it happens instead of as a refusal later. */}
          <p className={balanced ? 'muted' : 'error'}>
            {t(balanced ? 'rounds.menu.balanced' : 'rounds.menu.unbalanced', { courses, seats })}
          </p>

          <div className="stack">
            {slots?.map((slot) => (
              <div key={slot.id} className="row" style={{ justifyContent: 'space-between' }}>
                <span className={swapping === slot.id ? 'menu-slot is-swapping' : 'menu-slot'}>
                  {t(`briefs.courseOption.${slot.course}`)}
                </span>
                <span className="row">
                  {/* Same gesture as the status arrow: it turns, and it only
                      arms the picker below — the button down there is what
                      acts. Removing and re-adding left the menu one course
                      short of the table in between, which is the exact state
                      the roulette refuses on. */}
                  <TurnBack
                    open={swapping === slot.id}
                    label={t('rounds.menu.swap')}
                    onToggle={() => setSwapping((cur) => (cur === slot.id ? null : slot.id))}
                  />
                  <button
                    type="button"
                    className="chef-remove"
                    aria-label={t('actions.remove')}
                    onClick={() => run(() => removeCourse(roundId, slot.id))}
                  >
                    🍌
                  </button>
                </span>
              </div>
            ))}
          </div>

          <div className="row">
            <select value={newCourse} onChange={(e) => setNewCourse(e.target.value as Course)}>
              {COURSES.map((c) => (
                <option key={c} value={c}>
                  {t(`briefs.courseOption.${c}`)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() =>
                run(async () => {
                  if (swapping) {
                    const slotId = swapping
                    await run(
                      async () => {
                        await changeCourse(roundId, slotId, newCourse)
                        setSwapping(null)
                      },
                      () => setBlocked({ slotId, course: newCourse }),
                    )
                  } else {
                    await addCourse(roundId, newCourse)
                  }
                })
              }
            >
              {swapping ? t('rounds.menu.change') : t('actions.add')}
            </button>
          </div>
        </>
      )}
    </HostAction>
  )
}

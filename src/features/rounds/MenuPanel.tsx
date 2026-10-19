import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addCourse,
  clearAssignment,
  COURSE_IN_USE,
  getMenuStatus,
  getSlots,
  removeCourse,
  setSlotMode,
  COURSES,
  type Course,
  type RoundStatus,
  type SlotMode,
} from '../../lib/rpc'
import { HostAction } from './HostAction'

// Composing the menu, next to the other things the Executive Chef is being
// asked to do — not buried in a settings page they'd have to know to visit.
//
// It also finally shows the arithmetic. generate_assignment has always
// refused unless the courses equal the seated chefs (one dish each), but
// the rule was enforced and never stated: being one course short produced a
// refusal rather than a count, which reads as a broken button.
//
// EVERY COURSE IS ON THE PAGE, WITH A COUNT. It used to be a dropdown, an Add
// button and a list of what had been added, with a turning arrow to swap one —
// three controls to say "two mains and a dessert". Now each course has a
// banana, a number and a plus; the count of courses against chefs sits on top;
// and nothing is sent until OK, which waits for the two numbers to match. So
// the menu is never saved half-made, and moving a dish from one course to
// another is a banana here and a plus there.
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
  // What the host is composing, course by course. Null until they touch it:
  // until then the page shows the menu as saved.
  const [draft, setDraft] = useState<Record<Course, number> | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: slots } = useQuery({
    queryKey: ['rounds', roundId, 'slots'],
    enabled: slotMode === 'CATEGORIES',
    queryFn: () => getSlots(roundId),
  })

  const { data: menu } = useQuery({
    queryKey: ['rounds', roundId, 'menu-status'],
    queryFn: () => getMenuStatus(roundId),
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['rounds', roundId] })
  }

  // The RPCs raise named outcomes (0027) so what can go wrong here can be
  // said in words rather than as a constraint name.
  function message(err: unknown) {
    const raw = err instanceof Error ? err.message : ''
    const known = t(`rounds.menu.errors.${raw}`, { defaultValue: '' })
    return known || raw || t('errors.generic')
  }

  async function run(fn: () => Promise<unknown>) {
    setError(null)
    try {
      await fn()
      refresh()
    } catch (err) {
      setError(message(err))
    }
  }

  const saved = Object.fromEntries(COURSES.map((c) => [c, 0])) as Record<Course, number>
  for (const slot of slots ?? []) saved[slot.course] += 1
  const counts = draft ?? saved

  const seats = menu?.seats ?? 0
  const placed = COURSES.reduce((n, c) => n + counts[c], 0)
  const changed = COURSES.some((c) => counts[c] !== saved[c])
  const balanced = placed === seats
  // The count is a demand at LOCKED and a running total before it.
  const counting = status === 'LOCKED'

  function step(course: Course, by: 1 | -1) {
    setError(null)
    setDraft({ ...counts, [course]: Math.max(0, counts[course] + by) })
  }

  // A pairing on a course is only the roulette's shuffle until somebody
  // writes: at LOCKED no recipe can exist yet, so a course the roulette has
  // already dealt is freed by clearing the shuffle, and the host deals again
  // after. Recipes already written are refused by clear_assignment (0037) and
  // said in words.
  async function removeSlot(slotId: string) {
    try {
      await removeCourse(roundId, slotId)
    } catch (err) {
      if ((err instanceof Error ? err.message : '') !== COURSE_IN_USE) throw err
      await clearAssignment(roundId, false)
      await removeCourse(roundId, slotId)
    }
  }

  // Removals first, so the menu never passes through more courses than chefs.
  async function save() {
    setSaving(true)
    setError(null)
    try {
      for (const course of COURSES) {
        const extra = saved[course] - counts[course]
        if (extra <= 0) continue
        const ofCourse = (slots ?? []).filter((s) => s.course === course)
        for (const slot of ofCourse.slice(-extra)) await removeSlot(slot.id)
      }
      for (const course of COURSES) {
        for (let i = saved[course]; i < counts[course]; i++) await addCourse(roundId, course)
      }
      setDraft(null)
    } catch (err) {
      setError(message(err))
    } finally {
      setSaving(false)
      refresh()
    }
  }

  return (
    <HostAction
      title={t('rounds.menu.title')}
      aside={slotMode === 'CATEGORIES' ? t('rounds.menu.composed') : t('rounds.menu.free')}
      waiting={counting && slotMode === 'CATEGORIES' && !balanced}
    >
      {/* An error with no way out is a dead end, so the OK clears it. */}
      {error && (
        <div className="error stack">
          <span>{error}</span>
          <button type="button" className="confirmbox__ok" onClick={() => setError(null)}>
            {t('actions.ok')}
          </button>
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
          host had just finished making. So before LOCKED this offers the
          choice between a free-for-all and a composed menu, says when the menu
          gets composed, and stops there. */}
      {slotMode === 'CATEGORIES' && !counting && (
        <p className="muted">{t('rounds.menu.composedAtLock')}</p>
      )}

      {slotMode === 'CATEGORIES' && counting && (
        <>
          {/* Always on top, and always the two numbers: courses on the menu,
              out of how many there have to be. */}
          <p className={`menu-tally${balanced ? ' is-balanced' : ''}`} aria-live="polite">
            {t('rounds.menu.tally', { placed, seats })}
            {!balanced && <span className="muted"> — {t('rounds.menu.tallyHint')}</span>}
          </p>

          <ul className="menu-steps">
            {COURSES.map((course) => {
              const name = t(`briefs.courseOption.${course}`)
              return (
                <li key={course} className={`menu-steps__row${counts[course] > 0 ? ' is-on' : ''}`}>
                  <span className="menu-steps__name">{name}</span>
                  <span className="menu-steps__ctl">
                    {/* The banana is the app's "take one away" already; here
                        it takes one of this course off the menu. */}
                    <button
                      type="button"
                      className="menu-slot-remove"
                      aria-label={t('rounds.menu.less', { course: name })}
                      title={t('rounds.menu.less', { course: name })}
                      disabled={saving || counts[course] === 0}
                      onClick={() => step(course, -1)}
                    >
                      🍌
                    </button>
                    <span className="menu-steps__count">{counts[course]}</span>
                    <button
                      type="button"
                      className="menu-slot-remove menu-steps__more"
                      aria-label={t('rounds.menu.more', { course: name })}
                      title={t('rounds.menu.more', { course: name })}
                      // One course per chef: past the table there is nobody to cook it.
                      disabled={saving || placed >= seats}
                      onClick={() => step(course, 1)}
                    >
                      +
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>

          <button type="button" disabled={saving || !balanced || !changed} onClick={save}>
            {t('actions.ok')}
          </button>
        </>
      )}
    </HostAction>
  )
}

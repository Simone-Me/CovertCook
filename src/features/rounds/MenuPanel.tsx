import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { addCourse, getMenuStatus, removeCourse, setSlotMode, type Course, type SlotMode } from '../../lib/rpc'
import { HostAction } from './HostAction'

const COURSES: Course[] = ['STARTER', 'MAIN', 'DESSERT', 'DRINK', 'OTHER']

// Composing the menu, next to the other things the Executive Chef is being
// asked to do — not buried in a settings page they'd have to know to visit.
//
// It also finally shows the arithmetic. generate_assignment has always
// refused unless the courses equal the seated chefs (one dish each), but
// the rule was enforced and never stated: being one course short produced a
// refusal rather than a count, which reads as a broken button.
export function MenuPanel({ roundId, slotMode }: { roundId: string; slotMode: SlotMode }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [newCourse, setNewCourse] = useState<Course>('MAIN')
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

  const { data: status } = useQuery({
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
  async function run(fn: () => Promise<unknown>) {
    setError(null)
    try {
      await fn()
      refresh()
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      const known = t(`rounds.menu.errors.${raw}`, { defaultValue: '' })
      setError(known || raw || t('errors.generic'))
    }
  }

  const courses = status?.courses ?? 0
  const seats = status?.seats ?? 0
  const balanced = courses === seats

  return (
    <HostAction
      title={t('rounds.menu.title')}
      waiting={slotMode === 'CATEGORIES' && !balanced}
    >
      {error && <div className="error">{error}</div>}

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

      {slotMode === 'CATEGORIES' && (
        <>
          {/* One course per chef, because every chef cooks exactly one
              dish. Shown as it happens instead of as a refusal later. */}
          <p className={balanced ? 'muted' : 'error'}>
            {t(balanced ? 'rounds.menu.balanced' : 'rounds.menu.unbalanced', { courses, seats })}
          </p>

          <div className="stack">
            {slots?.map((slot) => (
              <div key={slot.id} className="row" style={{ justifyContent: 'space-between' }}>
                <span>{t(`briefs.courseOption.${slot.course}`)}</span>
                <button
                  type="button"
                  className="chef-remove"
                  aria-label={t('actions.remove')}
                  onClick={() => run(() => removeCourse(roundId, slot.id))}
                >
                  🍌
                </button>
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
              onClick={() => run(() => addCourse(roundId, newCourse))}
            >
              {t('actions.add')}
            </button>
          </div>
        </>
      )}
    </HostAction>
  )
}

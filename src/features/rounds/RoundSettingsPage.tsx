import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, Link, Navigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import { useRound, useRoundMembers } from './hooks'
import {
  advancePhase,
  previousPhaseFor,
  updateRoundDetails,
  getExclusionPairs,
  addExclusionPair,
  removeExclusionPair,
  getSlots,
  addSlot,
  removeSlot,
  type Course,
} from '../../lib/rpc'

const COURSES: Course[] = ['STARTER', 'MAIN', 'DESSERT', 'DRINK', 'OTHER']

const COMMON_TIMEZONES = [
  'Europe/Paris', 'Europe/London', 'Europe/Madrid', 'Europe/Berlin',
  'America/New_York', 'America/Los_Angeles', 'America/Chicago',
  'America/Sao_Paulo', 'Asia/Tokyo', 'Australia/Sydney', 'UTC',
]

// dinner_at is a timestamptz; <input type="datetime-local"> works in the
// browser's local wall-clock time, so this only round-trips correctly when
// the browser's local time and the round's chosen timezone happen to match.
// Good enough for v1 (single-timezone dinners, the overwhelming case) —
// see README "Known simplifications" for the same tradeoff pattern used
// elsewhere in this codebase.
function toLocalInputValue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function RoundSettingsPage() {
  const { t } = useTranslation()
  const { roundId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const { data: round, isLoading } = useRound(roundId)
  const { data: members } = useRoundMembers(roundId)
  const [location, setLocation] = useState<string | null>(null)
  const [dinnerAt, setDinnerAt] = useState<string | null>(null)
  const [timezone, setTimezone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [stepping, setStepping] = useState(false)
  const [exclusionA, setExclusionA] = useState('')
  const [exclusionB, setExclusionB] = useState('')
  const [newSlotCourse, setNewSlotCourse] = useState<Course>('STARTER')

  const { data: exclusions, refetch: refetchExclusions } = useQuery({
    queryKey: ['rounds', roundId, 'exclusion-pairs'],
    enabled: !!roundId,
    queryFn: () => getExclusionPairs(roundId as string),
  })
  const { data: slots, refetch: refetchSlots } = useQuery({
    queryKey: ['rounds', roundId, 'slots'],
    enabled: !!roundId && round?.slot_mode === 'CATEGORIES',
    queryFn: () => getSlots(roundId as string),
  })

  if (isLoading || !round) return <p className="muted">…</p>

  const isHost = round.host_id === profile?.id
  if (!isHost) {
    return <Navigate to={`/rounds/${roundId}`} replace />
  }

  const detailsLocked = ['DINNER', 'VOTING', 'RESULTS', 'ARCHIVED', 'CANCELLED'].includes(round.status)
  const previousPhase = previousPhaseFor(round.status, round.voting_enabled)
  const canCancel = !['RESULTS', 'ARCHIVED', 'CANCELLED'].includes(round.status)
  const preAssignment = ['DRAFT', 'OPEN', 'LOCKED'].includes(round.status)
  const activeMembers = members?.filter((m) => m.status === 'ACTIVE' && m.approved) ?? []
  const activeApprovedCount = activeMembers.length
  const memberName = (id: string) => activeMembers.find((m) => m.id === id)?.secret_name ?? id

  async function onSaveDetails(e: React.FormEvent) {
    e.preventDefault()
    if (!roundId || !round) return
    setError(null)
    setSaved(false)
    setSaving(true)
    try {
      await updateRoundDetails({
        roundId,
        location: location ?? round!.location,
        dinnerAt: dinnerAt !== null ? new Date(dinnerAt).toISOString() : round!.dinner_at,
        timezone: timezone ?? round!.timezone,
      })
      await queryClient.invalidateQueries({ queryKey: ['rounds', roundId] })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setSaving(false)
    }
  }

  async function onStepBack() {
    if (!roundId || !previousPhase) return
    const confirmed = window.confirm(t('rounds.settings.stepBackConfirm', { phase: t(`rounds.phase.${previousPhase}`) }))
    if (!confirmed) return
    setError(null)
    setStepping(true)
    try {
      await advancePhase(roundId, previousPhase)
      await queryClient.invalidateQueries({ queryKey: ['rounds', roundId] })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setStepping(false)
    }
  }

  async function onAddExclusion(e: React.FormEvent) {
    e.preventDefault()
    if (!roundId || !exclusionA || !exclusionB || exclusionA === exclusionB) return
    setError(null)
    try {
      await addExclusionPair(roundId, exclusionA, exclusionB)
      setExclusionA('')
      setExclusionB('')
      await refetchExclusions()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    }
  }

  async function onRemoveExclusion(id: string) {
    await removeExclusionPair(id)
    refetchExclusions()
  }

  async function onAddSlot() {
    if (!roundId) return
    setError(null)
    try {
      await addSlot(roundId, newSlotCourse)
      await refetchSlots()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    }
  }

  async function onRemoveSlot(id: string) {
    await removeSlot(id)
    refetchSlots()
  }

  async function onCancelRound() {
    if (!roundId) return
    const confirmed = window.confirm(t('rounds.settings.cancelConfirm'))
    if (!confirmed) return
    setError(null)
    try {
      await advancePhase(roundId, 'CANCELLED')
      await queryClient.invalidateQueries({ queryKey: ['rounds', roundId] })
      navigate(`/rounds/${roundId}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    }
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>{t('rounds.settings.title')}</h1>
        <Link to={`/rounds/${roundId}`}>{t('actions.back')}</Link>
      </div>

      {error && <div className="error">{error}</div>}

      <h2>{t('rounds.settings.dinerInfo')}</h2>
      {detailsLocked && <p className="muted">{t('rounds.settings.detailsLockedNote')}</p>}
      <form onSubmit={onSaveDetails} className="stack card">
        <div>
          <label htmlFor="location">{t('rounds.settings.location')}</label>
          <input
            id="location"
            disabled={detailsLocked}
            value={location ?? round.location ?? ''}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="dinnerAt">{t('rounds.settings.dinnerAt')}</label>
          <input
            id="dinnerAt"
            type="datetime-local"
            disabled={detailsLocked}
            value={dinnerAt ?? toLocalInputValue(round.dinner_at)}
            onChange={(e) => setDinnerAt(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="timezone">{t('rounds.settings.timezone')}</label>
          <select
            id="timezone"
            disabled={detailsLocked}
            value={timezone ?? round.timezone}
            onChange={(e) => setTimezone(e.target.value)}
          >
            {COMMON_TIMEZONES.includes(round.timezone) ? null : <option value={round.timezone}>{round.timezone}</option>}
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        {!detailsLocked && (
          <button type="submit" disabled={saving}>
            {t('actions.save')}
          </button>
        )}
        {saved && <p className="muted">{t('rounds.settings.saved')}</p>}
      </form>

      <h2>{t('rounds.settings.phaseControl')}</h2>
      <div className="card stack">
        <p>
          {t('rounds.settings.currentPhase')}: <span className="badge">{t(`rounds.phase.${round.status}`)}</span>
        </p>
        {previousPhase ? (
          <button type="button" className="secondary" onClick={onStepBack} disabled={stepping}>
            {t('rounds.settings.stepBackTo', { phase: t(`rounds.phase.${previousPhase}`) })}
          </button>
        ) : (
          <p className="muted">{t('rounds.settings.noStepBack')}</p>
        )}
      </div>

      <h2>{t('rounds.settings.exclusions')}</h2>
      <p className="muted">{t('rounds.settings.exclusionsHelp')}</p>
      <div className="stack card">
        {exclusions?.length === 0 && <p className="muted">{t('rounds.settings.noExclusions')}</p>}
        {exclusions?.map((ex) => (
          <div key={ex.id} className="row" style={{ justifyContent: 'space-between' }}>
            <span>
              {memberName(ex.member_a)} ↔ {memberName(ex.member_b)}
            </span>
            {preAssignment && (
              <button type="button" className="secondary" onClick={() => onRemoveExclusion(ex.id)}>
                {t('actions.remove')}
              </button>
            )}
          </div>
        ))}
        {preAssignment && (
          <form onSubmit={onAddExclusion} className="row">
            <select value={exclusionA} onChange={(e) => setExclusionA(e.target.value)}>
              <option value="">—</option>
              {activeMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.secret_name}
                </option>
              ))}
            </select>
            <select value={exclusionB} onChange={(e) => setExclusionB(e.target.value)}>
              <option value="">—</option>
              {activeMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.secret_name}
                </option>
              ))}
            </select>
            <button type="submit" disabled={!exclusionA || !exclusionB || exclusionA === exclusionB}>
              {t('actions.add')}
            </button>
          </form>
        )}
      </div>

      {round.slot_mode === 'CATEGORIES' && (
        <>
          <h2>{t('rounds.settings.courses')}</h2>
          <p className="muted">{t('rounds.settings.coursesHelp', { count: activeApprovedCount })}</p>
          <div className="stack card">
            {slots?.map((slot) => (
              <div key={slot.id} className="row" style={{ justifyContent: 'space-between' }}>
                <span>{t(`briefs.courseOption.${slot.course}`)}</span>
                {preAssignment && (
                  <button type="button" className="secondary" onClick={() => onRemoveSlot(slot.id)}>
                    {t('actions.remove')}
                  </button>
                )}
              </div>
            ))}
            {preAssignment && (
              <div className="row">
                <select value={newSlotCourse} onChange={(e) => setNewSlotCourse(e.target.value as Course)}>
                  {COURSES.map((c) => (
                    <option key={c} value={c}>
                      {t(`briefs.courseOption.${c}`)}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={onAddSlot}>
                  {t('actions.add')}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {canCancel && (
        <>
          <h2>{t('rounds.settings.dangerZone')}</h2>
          <div className="card">
            <button type="button" className="secondary" onClick={onCancelRound}>
              {t('rounds.settings.cancelRound')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

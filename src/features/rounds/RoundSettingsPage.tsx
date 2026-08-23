import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, Link, Navigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import { useRound, useRoundMembers } from './hooks'
import { BackToTable } from '../../components/BackToTable'
import { Fold } from '../../components/Fold'
import { PhaseMenu } from './PhaseMenu'
import { InlineConfirm } from '../../components/InlineConfirm'
import {
  advancePhase,
  previousPhaseFor,
  ROUND_PHASE_ORDER,
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
  const [city, setCity] = useState<string | null>(null)
  const [notes, setNotes] = useState<string | null>(null)
  const [dinnerAt, setDinnerAt] = useState<string | null>(null)
  const [timezone, setTimezone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [stepping, setStepping] = useState(false)
  const [cancelling, setCancelling] = useState(false)
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
        city: city ?? round!.city,
        notes: notes ?? round!.notes,
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

  // No dialog here any more: PhaseMenu shows the warning in the gap between
  // the two phases and carries its own OK, so by the time this runs the host
  // has already read what changes. A browser confirm() on top of that would
  // be a second question about the same decision, asked worse.
  async function onStepBack() {
    if (!roundId || !previousPhase) return
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
    <div className="stack sheet">
      <BackToTable />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>{t('rounds.settings.title')}</h1>
        <Link to={`/rounds/${roundId}`}>{t('actions.back')}</Link>
      </div>

      {error && <div className="error">{error}</div>}

      {/* Mirrors the panel on the round page. Filling the table is a thing
          a host comes back to, and they don't always come back the same
          way — so it lives in both places they'd look. */}
      <Fold title={t('rounds.settings.filling')} defaultOpen>
        <div className="card stack">
        <label>{t('rounds.shareLink')}</label>
        <div className="row">
          <code style={{ fontSize: 18, letterSpacing: '0.08em' }}>{round.join_code}</code>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              navigator.clipboard.writeText(
                `${import.meta.env.VITE_APP_BASE_URL}/join?code=${round.join_code}`,
              )
            }
          >
            {t('actions.copy')}
          </button>
        </div>
        {ROUND_PHASE_ORDER.indexOf(round.status) >= ROUND_PHASE_ORDER.indexOf('ASSIGNED') && (
          <p className="muted">{t('rounds.lateJoinerWarning')}</p>
        )}
        </div>
      </Fold>

      <Fold title={t('rounds.settings.dinerInfo')}>
        {detailsLocked && <p className="muted">{t('rounds.settings.detailsLockedNote')}</p>}
        <form onSubmit={onSaveDetails} className="stack card">
        <div>
          <label htmlFor="city">{t('rounds.settings.city')}</label>
          {/* Its own field because it is the one line the round page shows
              on the closed envelope — a guest checking which town this is
              shouldn't have to open anything (0034). */}
          <input
            id="city"
            disabled={detailsLocked}
            value={city ?? round.city ?? ''}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>

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

        <div>
          <label htmlFor="notes">{t('rounds.settings.notes')}</label>
          <textarea
            id="notes"
            rows={3}
            disabled={detailsLocked}
            placeholder={t('rounds.settings.notesPlaceholder')}
            value={notes ?? round.notes ?? ''}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
          />
        </div>

        {!detailsLocked && (
          <button type="submit" disabled={saving}>
            {t('actions.save')}
          </button>
        )}
        {saved && <p className="muted">{t('rounds.settings.saved')}</p>}
        </form>
      </Fold>

      <Fold title={t('rounds.settings.phaseControl')} defaultOpen>
        <PhaseMenu
          status={round.status}
          votingEnabled={round.voting_enabled}
          previousPhase={previousPhase}
          stepping={stepping}
          onStepBack={onStepBack}
        />
      </Fold>

      <Fold title={t('rounds.settings.exclusions')} hint={t('rounds.settings.exclusionsHelp')}>
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
      </Fold>

      {round.slot_mode === 'CATEGORIES' && (
        <Fold
          title={t('rounds.settings.courses')}
          hint={t('rounds.settings.coursesHelp', { count: activeApprovedCount })}
        >
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
        </Fold>
      )}

      {canCancel && (
        <Fold title={t('rounds.settings.dangerZone')}>
          <div className="card stack">
            {/* The consequence is read here, next to the button, rather than
                in a dialog that has already covered the page it is about. */}
            {cancelling ? (
              <InlineConfirm
                title={t('rounds.settings.cancelRound')}
                confirmLabel={t('rounds.settings.cancelRound')}
                onConfirm={() => {
                  setCancelling(false)
                  onCancelRound()
                }}
                onCancel={() => setCancelling(false)}
              >
                <p className="confirmbox__why">{t('rounds.settings.cancelConfirm')}</p>
              </InlineConfirm>
            ) : (
              <button type="button" className="secondary" onClick={() => setCancelling(true)}>
                {t('rounds.settings.cancelRound')}
              </button>
            )}
          </div>
        </Fold>
      )}
    </div>
  )
}

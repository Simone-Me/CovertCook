import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, Link, Navigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import { useRound } from './hooks'
import { advancePhase, updateRoundDetails, type RoundStatus } from '../../lib/rpc'

const FORWARD_ORDER: RoundStatus[] = [
  'DRAFT', 'OPEN', 'LOCKED', 'ASSIGNED', 'BRIEFS_CLOSED', 'DINNER', 'VOTING', 'RESULTS', 'ARCHIVED',
]

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
  const [location, setLocation] = useState<string | null>(null)
  const [dinnerAt, setDinnerAt] = useState<string | null>(null)
  const [timezone, setTimezone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [stepping, setStepping] = useState(false)

  if (isLoading || !round) return <p className="muted">…</p>

  const isHost = round.host_id === profile?.id
  if (!isHost) {
    return <Navigate to={`/rounds/${roundId}`} replace />
  }

  const detailsLocked = ['DINNER', 'VOTING', 'RESULTS', 'ARCHIVED', 'CANCELLED'].includes(round.status)
  const currentIdx = FORWARD_ORDER.indexOf(round.status)
  const previousPhase = currentIdx > 0 ? FORWARD_ORDER[currentIdx - 1] : null
  const canCancel = !['RESULTS', 'ARCHIVED', 'CANCELLED'].includes(round.status)

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

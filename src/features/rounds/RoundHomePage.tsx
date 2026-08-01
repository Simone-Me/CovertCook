import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import { useRound, useRoundMembers } from './hooks'
import {
  advancePhase,
  approveMember,
  rejectMember,
  assignmentExists,
  generateAssignment,
  getDietaryPanel,
  getRoundProgress,
  type RoundStatus,
} from '../../lib/rpc'

const FORWARD_PHASE: Partial<Record<RoundStatus, RoundStatus>> = {
  DRAFT: 'OPEN',
  OPEN: 'LOCKED',
  LOCKED: 'ASSIGNED',
  ASSIGNED: 'BRIEFS_CLOSED',
  BRIEFS_CLOSED: 'DINNER',
  DINNER: 'VOTING',
  VOTING: 'RESULTS',
  RESULTS: 'ARCHIVED',
}

export function RoundHomePage() {
  const { t } = useTranslation()
  const { roundId } = useParams()
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const { data: round, isLoading: roundLoading } = useRound(roundId)
  const { data: members } = useRoundMembers(roundId)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const { data: dietaryPanel } = useQuery({
    queryKey: ['rounds', roundId, 'dietary-panel'],
    enabled: !!roundId,
    queryFn: () => getDietaryPanel(roundId as string),
  })

  const { data: progress } = useQuery({
    queryKey: ['rounds', roundId, 'progress'],
    enabled: !!roundId && (round?.status === 'ASSIGNED' || round?.status === 'BRIEFS_CLOSED'),
    queryFn: () => getRoundProgress(roundId as string),
  })

  const { data: hasAssignment } = useQuery({
    queryKey: ['rounds', roundId, 'assignment-exists'],
    enabled: !!roundId && round?.status === 'LOCKED',
    queryFn: () => assignmentExists(roundId as string),
  })

  if (roundLoading || !round) return <p className="muted">…</p>

  const isHost = round.host_id === profile?.id
  const nextPhase = FORWARD_PHASE[round.status]
  const shareLink = `${import.meta.env.VITE_APP_BASE_URL}/join?code=${round.join_code}`
  const activeApprovedCount = members?.filter((m) => m.status === 'ACTIVE' && m.approved).length ?? 0
  // Mirrors the precondition generate_assignment/advance_phase enforce
  // server-side (supabase/migrations/0005_assignment.sql,
  // 0006_phases.sql) — shown here so the block is visible before the
  // host clicks anything, not discovered as a raw Postgres error.
  const nextBlockedReason =
    round.status === 'LOCKED' && nextPhase === 'ASSIGNED' && !hasAssignment
      ? t('rounds.assignment.needed')
      : null

  async function onAdvance() {
    if (!nextPhase || !roundId) return
    setError(null)
    try {
      await advancePhase(roundId, nextPhase)
      queryClient.invalidateQueries({ queryKey: ['rounds', roundId] })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    }
  }

  async function onGenerateAssignment() {
    if (!roundId) return
    if (hasAssignment) {
      const confirmed = window.confirm(t('rounds.assignment.rerollConfirm'))
      if (!confirmed) return
    }
    setError(null)
    setGenerating(true)
    try {
      await generateAssignment(roundId)
      await queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'assignment-exists'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setGenerating(false)
    }
  }

  async function onApprove(memberId: string) {
    if (!roundId) return
    await approveMember(roundId, memberId)
    queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'members'] })
  }

  async function onReject(memberId: string) {
    if (!roundId) return
    await rejectMember(roundId, memberId)
    queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'members'] })
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>
          {round.accent_emoji} {round.name}
        </h1>
        <span className="badge">{t(`rounds.phase.${round.status}`)}</span>
      </div>

      {isHost && <Link to={`/rounds/${roundId}/settings`}>{t('rounds.settings.title')}</Link>}

      {error && <div className="error">{error}</div>}

      {isHost && round.status === 'OPEN' && (
        <div className="card">
          <label>{t('rounds.shareLink')}</label>
          <div className="row">
            {round.visibility === 'PRIVATE_CODE' && <code>{round.join_code}</code>}
            <button type="button" className="secondary" onClick={() => navigator.clipboard.writeText(shareLink)}>
              {t('actions.copy')}
            </button>
          </div>
        </div>
      )}

      {progress && (
        <p className="muted">
          {progress.briefs_submitted} / {progress.total_players}
          {progress.missing_sender_display_names && progress.missing_sender_display_names.length > 0 && (
            <> — {progress.missing_sender_display_names.join(', ')}</>
          )}
        </p>
      )}

      <h2>{t('rounds.roster')}</h2>
      <div className="stack">
        {members
          ?.filter((m) => m.status === 'ACTIVE')
          .map((m) => (
            <div key={m.id} className="row" style={{ justifyContent: 'space-between' }}>
              <span>
                {m.secret_name}
                {round.anonymity === 'OPEN' && m.role === 'HOST' ? ` (${t('rounds.phase.OPEN')})` : ''}
                {!m.approved && <span className="badge"> {t('rounds.pendingApproval')}</span>}
              </span>
              {isHost && !m.approved && (
                <div className="row">
                  <button type="button" onClick={() => onApprove(m.id)}>
                    {t('actions.approve')}
                  </button>
                  <button type="button" className="secondary" onClick={() => onReject(m.id)}>
                    {t('actions.reject')}
                  </button>
                </div>
              )}
            </div>
          ))}
      </div>

      <h2>{t('dietary.panelTitle')}</h2>
      {dietaryPanel && dietaryPanel.length === 0 && <p className="muted">{t('dietary.panelEmpty')}</p>}
      <div className="allergy-grid">
        {dietaryPanel?.map((d, i) => (
          <div key={i} className="allergy-card">
            <div className="allergy-placeholder" aria-hidden="true">
              {d.label.slice(0, 1).toUpperCase()}
            </div>
            <span className="muted">{t(`dietary.kind.${d.kind}`)}</span>
            <span>{d.label}</span>
          </div>
        ))}
      </div>

      {round.status === 'LOCKED' && (
        <>
          <h2>{t('rounds.assignment.title')}</h2>
          <div className="card stack">
            <p className="muted">{t('rounds.seatCount', { count: activeApprovedCount })}</p>
            {isHost ? (
              <button type="button" onClick={onGenerateAssignment} disabled={generating}>
                {hasAssignment ? t('rounds.assignment.reroll') : t('rounds.assignment.generate')}
              </button>
            ) : (
              <p className="muted">{t('rounds.assignment.waitingForHost')}</p>
            )}
            {hasAssignment && <p className="muted">{t('rounds.assignment.ready')}</p>}
          </div>
        </>
      )}

      {isHost && nextPhase && (
        <div className="stack">
          {nextBlockedReason && <p className="muted">{nextBlockedReason}</p>}
          <button type="button" onClick={onAdvance} disabled={!!nextBlockedReason}>
            {t('actions.next')} → {t(`rounds.phase.${nextPhase}`)}
          </button>
        </div>
      )}
    </div>
  )
}

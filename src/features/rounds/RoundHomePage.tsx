import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import { useRound, useRoundMembers } from './hooks'
import {
  advancePhase,
  approveMember,
  rejectMember,
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

  if (roundLoading || !round) return <p className="muted">…</p>

  const isHost = round.host_id === profile?.id
  const nextPhase = FORWARD_PHASE[round.status]
  const shareLink = `${import.meta.env.VITE_APP_BASE_URL}/join?code=${round.join_code}`

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

      {error && <div className="error">{error}</div>}

      {isHost && round.visibility === 'PRIVATE_CODE' && round.status === 'OPEN' && (
        <div className="card">
          <label>{t('rounds.joinCode')}</label>
          <div className="row">
            <code>{round.join_code}</code>
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
      <div className="stack">
        {dietaryPanel?.map((d, i) => (
          <span key={i} className="badge">
            {t(`dietary.kind.${d.kind}`)}: {d.label}
          </span>
        ))}
      </div>

      {isHost && nextPhase && (
        <button type="button" onClick={onAdvance}>
          {t('actions.next')} → {t(`rounds.phase.${nextPhase}`)}
        </button>
      )}
    </div>
  )
}

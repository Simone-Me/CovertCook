import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import { isPastRound, useMyRounds, type MyRoundRow } from './hooks'
import { getMyInvitations, respondToInvitation } from '../../lib/rpc'
import { peekJoinCode } from '../../lib/pendingJoin'

function RoundCard({ round, isHost }: { round: MyRoundRow; isHost: boolean }) {
  const { t } = useTranslation()
  return (
    <Link to={`/rounds/${round.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="card" style={{ borderLeft: `4px solid ${round.accent_color}` }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>
            {round.accent_emoji} {round.name}
            {/* The dinners you run and the dinners you were invited to look
                identical in this list, and they are not the same job. The
                toque says which ones are yours to steer. */}
            {isHost && (
              <span className="toque" title={t('rounds.youHost')} aria-label={t('rounds.youHost')}>
                🧑‍🍳
              </span>
            )}
          </strong>
          <span className="row">
            {!round.approved && <span className="badge">{t('rounds.pendingApproval')}</span>}
            <span className="badge">{t(`rounds.phase.${round.status}`)}</span>
          </span>
        </div>
      </div>
    </Link>
  )
}

export function MyRoundsPage() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: rounds, isLoading } = useMyRounds(profile?.id)

  // Someone followed a round link, was sent to sign up, and has just landed
  // here. Take them back to the invitation they were following rather than
  // dropping them on an empty list with no explanation.
  const pendingCode = peekJoinCode()
  useEffect(() => {
    if (pendingCode) navigate(`/join?code=${encodeURIComponent(pendingCode)}`, { replace: true })
  }, [pendingCode, navigate])

  const [showPast, setShowPast] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const { data: invitations } = useQuery({
    queryKey: ['invitations', profile?.id],
    enabled: !!profile?.id,
    queryFn: getMyInvitations,
  })

  // Cancelled and archived rounds are kept, not deleted — but a list that
  // only grows is its own problem, so they fold away.
  const current = rounds?.filter((r) => !isPastRound(r)) ?? []
  const past = rounds?.filter(isPastRound) ?? []

  async function onRespond(invitationId: string, accept: boolean) {
    setError(null)
    setBusy(true)
    try {
      const memberId = await respondToInvitation(invitationId, accept)
      await queryClient.invalidateQueries({ queryKey: ['invitations'] })
      await queryClient.invalidateQueries({ queryKey: ['rounds', 'mine'] })
      if (accept && memberId) {
        const round = invitations?.find((i) => i.invitation_id === invitationId)
        if (round) navigate(`/rounds/${round.round_id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack sheet">
      <h1>{t('rounds.myRounds')}</h1>

      <div className="row">
        <Link to="/rounds/new">
          <button type="button">{t('rounds.create')}</button>
        </Link>
        <Link to="/join">
          <button type="button" className="secondary">
            {t('rounds.join')}
          </button>
        </Link>
      </div>

      {error && <div className="error">{error}</div>}

      {/* Shown only when there's something in it — an empty inbox on a
          first-run screen is noise, not reassurance. */}
      {invitations && invitations.length > 0 && (
        <>
          <h2>{t('rounds.invitations.title', { count: invitations.length })}</h2>
          <div className="stack">
            {invitations.map((inv) => (
              <div key={inv.invitation_id} className="card stack">
                <strong>
                  {inv.accent_emoji} {inv.round_name}
                </strong>
                <span className="muted">{inv.invited_day}</span>
                <div className="row">
                  <button type="button" disabled={busy} onClick={() => onRespond(inv.invitation_id, true)}>
                    {t('rounds.invitations.accept')}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => onRespond(inv.invitation_id, false)}
                  >
                    {t('rounds.invitations.decline')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {isLoading && <p className="muted">…</p>}

      {rounds && rounds.length === 0 && <p className="muted">{t('app.tagline')}</p>}

      <div className="stack">
        {current.map((r) => (
          <RoundCard key={r.id} round={r} isHost={r.host_id === profile?.id} />
        ))}
      </div>

      {past.length > 0 && (
        <div className="stack">
          <button type="button" className="secondary" onClick={() => setShowPast((v) => !v)}>
            {t('rounds.pastRounds', { count: past.length })}
          </button>
          {showPast &&
            past.map((r) => <RoundCard key={r.id} round={r} isHost={r.host_id === profile?.id} />)}
        </div>
      )}
    </div>
  )
}

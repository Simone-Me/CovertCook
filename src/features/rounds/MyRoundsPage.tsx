import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import { isPastRound, useMyRounds, type MyRoundRow } from './hooks'
import { roundDeletesAt } from '../../lib/rpc'
import { getMyInvitations, respondToInvitation } from '../../lib/rpc'
import { peekJoinCode } from '../../lib/pendingJoin'
import { HowItWorks } from './HowItWorks'
import { Fold } from '../../components/Fold'
import { themeMark } from '../../lib/themes'

function RoundCard({ round, isHost }: { round: MyRoundRow; isHost: boolean }) {
  const { t, i18n } = useTranslation()

  // Only on a dinner that is actually going: a live round has no finished_at
  // and nothing to count down.
  const deletesAt = roundDeletesAt(round.finished_at)

  // A dinner you left keeps its card and loses its link. There is nothing
  // behind it any more — the roster, the briefs and the chat all check for an
  // active seat and refuse — so a door that opens onto an error would be
  // worse than no door. It stays in the list because a dinner that vanishes
  // reads as data lost rather than as a room left (0051).
  const left = round.member_status !== 'ACTIVE'

  const card = (
      <div
        className={`card${left ? ' card--left' : ''}`}
        style={{ borderLeft: `4px solid ${round.accent_color}` }}
      >
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>
            {/* The pseudonym list's own mark (0072), so a dinner wears the
                same glyph in the list, at its own table and on every chef's
                face in the fridge. The random accent emoji stays on the
                invitations below, which arrive before there is a theme to
                read. */}
            {themeMark(round.name_theme)} {round.name}
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
            {left && <span className="badge">{t(`rounds.left.${round.member_status}`)}</span>}
            {!left && !round.approved && <span className="badge">{t('rounds.pendingApproval')}</span>}
            <span className="badge">{t(`rounds.phase.${round.status}`)}</span>
          </span>
        </div>
        {/* Said on the card while the dinner still exists, because the first
            anybody should learn of the rule is not a dinner that is no longer
            there. What survives is named in the same breath as what does
            not. */}
        {deletesAt && (
          <p className="muted" style={{ margin: '6px 0 0' }}>
            {t('rounds.deletesOn', { date: deletesAt.toLocaleDateString(i18n.language) })}
          </p>
        )}
      </div>
  )

  if (left) return card

  return (
    <Link to={`/rounds/${round.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      {card}
    </Link>
  )
}

export function MyRoundsPage() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { data: rounds, isLoading } = useMyRounds(profile?.id)

  // Someone followed a round link, was sent to sign up, and has just landed
  // here. Take them back to the invitation they were following rather than
  // dropping them on an empty list with no explanation.
  const pendingCode = peekJoinCode()
  useEffect(() => {
    if (pendingCode) navigate(`/join?code=${encodeURIComponent(pendingCode)}`, { replace: true })
  }, [pendingCode, navigate])

  // Said on arrival rather than on the page being left: the round page
  // disappears at the same moment, so a message shown there would be gone
  // before it was read.
  const leftName = (location.state as { leftRound?: string } | null)?.leftRound ?? null
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

      {leftName && <p className="notice">{t('rounds.left.done', { name: leftName })}</p>}

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

      {/* First run: the app explains itself, at length, because somebody who
          has just made an account and sees an empty list needs to know what
          the thing is for before being asked to press "create". */}
      {rounds && rounds.length === 0 && (
        <div className="card stack welcome">
          <HowItWorks />
        </div>
      )}

      <div className="stack">
        {current.map((r) => (
          <RoundCard key={r.id} round={r} isHost={r.host_id === profile?.id} />
        ))}
      </div>

      {/* And it does not vanish the moment somebody joins a dinner: that is
          precisely when they have seen enough of the app to have questions
          about it. Folded, at the foot, out of the way. */}
      {rounds && rounds.length > 0 && (
        <Fold title={t('welcome.readAgain')}>
          <HowItWorks compact />
        </Fold>
      )}

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

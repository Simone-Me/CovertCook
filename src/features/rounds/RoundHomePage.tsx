import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import { useRound, useRoundMembers } from './hooks'
import { RoundProgress } from './RoundProgress'
import { TableProps } from './TableProps'
import { Envelope } from './Envelope'
import { RemoveChef } from './RemoveChef'
import { HostPass, PassNote } from './HostAction'
import { MenuPanel } from './MenuPanel'
import { DietaryPanelGrid } from './DietaryPanelGrid'
import {
  advancePhase,
  approveMember,
  rejectMember,
  removeMember,
  REMOVE_REQUIRES_CONFIRMATION,
  assignmentExists,
  generateAssignment,
  nextPhaseFor,
  getDietaryPanel,
  getPendingMembers,
  getRoundProgress,
  getUnreadCount,
  getVoteProgress,
  inviteMember,
  publishResults,
  setVotingDeadline,
  skipVoting,
  type DeadlineMinutes,
  NO_SUCH_CHEF,
  ROUND_PHASE_ORDER,
  type RemovalMode,
} from '../../lib/rpc'

type OpenDrawer = 'chefs' | 'allergies' | 'info' | null

export function RoundHomePage() {
  const { t } = useTranslation()
  const { roundId } = useParams()
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const { data: round, isLoading: roundLoading } = useRound(roundId)
  const { data: members } = useRoundMembers(roundId)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteNote, setInviteNote] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const [open, setOpen] = useState<OpenDrawer>(null)

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

  const { data: pendingMembers } = useQuery({
    queryKey: ['rounds', roundId, 'pending-members'],
    enabled: !!roundId && !!round && round.host_id === profile?.id,
    queryFn: () => getPendingMembers(roundId as string),
  })

  // Counts only, never contents — the Executive Chef needs to know when
  // everyone has finished, not what anyone chose (0024).
  const { data: voteProgress } = useQuery({
    queryKey: ['rounds', roundId, 'vote-progress'],
    enabled: !!roundId && !!round && round.host_id === profile?.id && round.status === 'VOTING',
    queryFn: () => getVoteProgress(roundId as string),
    refetchInterval: 10000,
  })

  // Source for the Messaggi badge. Only once there is a chain to talk
  // across — before that there are no threads to be unread (0022).
  const { data: unread } = useQuery({
    queryKey: ['rounds', roundId, 'unread'],
    enabled: !!roundId && !!round && ROUND_PHASE_ORDER.indexOf(round.status) >= ROUND_PHASE_ORDER.indexOf('ASSIGNED'),
    queryFn: () => getUnreadCount(roundId as string),
    refetchInterval: 30000,
  })

  if (roundLoading || !round) return <p className="muted">…</p>

  const isHost = round.host_id === profile?.id
  const pendingById = new Map((pendingMembers ?? []).map((p) => [p.member_id, p]))
  const phaseIdx = ROUND_PHASE_ORDER.indexOf(round.status)
  const assigned = phaseIdx >= ROUND_PHASE_ORDER.indexOf('ASSIGNED')
  const nextPhase = nextPhaseFor(round.status, round.voting_enabled)
  const shareLink = `${import.meta.env.VITE_APP_BASE_URL}/join?code=${round.join_code}`
  const activeMembers = members?.filter((m) => m.status === 'ACTIVE') ?? []
  const activeApprovedCount = activeMembers.filter((m) => m.approved).length
  const pendingCount = pendingMembers?.length ?? 0

  const nextBlockedReason =
    round.status === 'LOCKED' && nextPhase === 'ASSIGNED' && !hasAssignment
      ? t('rounds.assignment.needed')
      : null

  // One reason per envelope for why it can't be opened yet, so a dimmed
  // drawer explains itself instead of just being unavailable.
  const waitBrief = !assigned ? t('rounds.waiting.assignment') : undefined
  const waitRecipe = phaseIdx < ROUND_PHASE_ORDER.indexOf('BRIEFS_CLOSED') ? t('rounds.waiting.briefs') : undefined
  const waitVote =
    phaseIdx < ROUND_PHASE_ORDER.indexOf('VOTING') ? t('rounds.waiting.vote') : undefined

  const resultsOpen = phaseIdx >= ROUND_PHASE_ORDER.indexOf('RESULTS')

  // The pass opens by itself only when the round is genuinely stuck on the
  // Executive Chef — an empty table, a menu that doesn't add up, a roulette
  // not yet spun, a dinner with no vote opened, results nobody has been
  // told. Anything else and it stays folded.
  const passWaiting =
    isHost &&
    ((round.status === 'OPEN' && activeApprovedCount < 3) ||
      (round.status === 'LOCKED' && !hasAssignment) ||
      round.status === 'DINNER' ||
      (resultsOpen && !round.results_published_at && round.voting_mode === 'LIVE'))

  function toggle(which: Exclude<OpenDrawer, null>) {
    setOpen((cur) => (cur === which ? null : which))
  }

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
    if (hasAssignment && !window.confirm(t('rounds.assignment.rerollConfirm'))) return
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

  async function onOpenVoting() {
    if (!roundId) return
    setError(null)
    try {
      await advancePhase(roundId, 'VOTING')
      queryClient.invalidateQueries({ queryKey: ['rounds', roundId] })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    }
  }

  async function onDeadline(value: string) {
    if (!roundId) return
    setError(null)
    try {
      await setVotingDeadline(roundId, value ? (Number(value) as DeadlineMinutes) : null)
      queryClient.invalidateQueries({ queryKey: ['rounds', roundId] })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    }
  }

  async function onSkipVoting() {
    if (!roundId) return
    setError(null)
    try {
      await skipVoting(roundId)
      queryClient.invalidateQueries({ queryKey: ['rounds', roundId] })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    }
  }

  async function onPublish() {
    if (!roundId) return
    setError(null)
    try {
      await publishResults(roundId)
      queryClient.invalidateQueries({ queryKey: ['rounds', roundId] })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    }
  }

  async function onInvite() {
    if (!roundId) return
    setInviteNote(null)
    setInviting(true)
    try {
      await inviteMember(roundId, inviteEmail)
      setInviteEmail('')
      setInviteNote(t('rounds.invitations.inviteSent'))
    } catch (err) {
      const message = err instanceof Error ? err.message : t('errors.generic')
      setInviteNote(message === NO_SUCH_CHEF ? t('rounds.invitations.noSuchChef') : message)
    } finally {
      setInviting(false)
    }
  }

  async function onApprove(memberId: string) {
    if (!roundId) return
    await approveMember(roundId, memberId)
    queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'members'] })
    queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'pending-members'] })
  }

  async function onReject(memberId: string) {
    if (!roundId) return
    await rejectMember(roundId, memberId)
    queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'members'] })
    queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'pending-members'] })
  }

  // No confirm() for the ordinary case: reaching this already took two
  // deliberate taps (the mark, then the named choice), and a modal on top
  // of that is a third click that teaches people to dismiss modals.
  //
  // The one that stays is REMOVE_REQUIRES_CONFIRMATION below, which is a
  // different question — both dishes are written and one is about to be
  // thrown away. That deserves an interruption.
  async function onRemove(memberId: string, mode: RemovalMode = 'COLLAPSE', confirmDishChange = false) {
    if (!roundId) return
    setError(null)
    try {
      await removeMember(roundId, memberId, confirmDishChange, mode)
      queryClient.invalidateQueries({ queryKey: ['rounds', roundId, 'members'] })
    } catch (err) {
      const message = err instanceof Error ? err.message : t('errors.generic')
      if (message === REMOVE_REQUIRES_CONFIRMATION) {
        if (window.confirm(t('rounds.removeDishConfirm'))) await onRemove(memberId, mode, true)
      } else {
        setError(message)
      }
    }
  }

  return (
    <div className="cloth" style={{ position: 'relative', minHeight: '100%', margin: -16, padding: 16 }}>
      <TableProps status={round.status} />

      <div className="stack" style={{ position: 'relative', zIndex: 2, gap: 11 }}>
        <div className="paper">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h1 style={{ margin: 0 }}>
              {round.accent_emoji} {round.name}
            </h1>
            {isHost && <Link to={`/rounds/${roundId}/settings`}>{t('rounds.settings.title')}</Link>}
          </div>
          <p className="muted" style={{ margin: '2px 0 0' }}>
            {t('rounds.seatCount', { count: activeApprovedCount })}
          </p>
        </div>

        <div className="paper">
          <RoundProgress round={round} isHost={isHost} />
        </div>

        {error && <div className="error">{error}</div>}

        {/* One pass, not a column of panels. Everything the Executive Chef
            is asked to do goes through here, and what shows depends on where
            the evening is — the same way a real pass only carries the orders
            that are up right now. It opens by itself when the round is
            actually blocked on them. */}
        {isHost && (
          <HostPass waiting={passWaiting}>

        {(round.status === 'DRAFT' || round.status === 'OPEN') && (
          <div className="stack">
            <span className="pass__section-title">{t('rounds.actions.fillTable')}</span>
            <label>{t('rounds.shareLink')}</label>
            <div className="row">
              <code style={{ fontSize: 18, letterSpacing: '0.08em' }}>{round.join_code}</code>
              <button type="button" className="secondary" onClick={() => navigator.clipboard.writeText(shareLink)}>
                {t('actions.copy')}
              </button>
            </div>

            <label htmlFor="invite-email">{t('rounds.invitations.invite')}</label>
            <div className="row">
              <input
                id="invite-email"
                type="email"
                placeholder={t('rounds.invitations.inviteEmail')}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <button
                type="button"
                className="secondary"
                disabled={inviting || !inviteEmail.trim()}
                onClick={onInvite}
              >
                {t('actions.add')}
              </button>
            </div>
            {inviteNote && <p className="muted">{inviteNote}</p>}
          </div>
        )}

        {/* Adding someone after the roulette has run isn't forbidden, just
            expensive — the chain is opened at one point to fit them in.
            One line, with the rest folded behind it. */}
        {assigned && (
          <PassNote short={t('rounds.lateJoinerShort')} long={t('rounds.lateJoinerWarning')} />
        )}

        {(round.status === 'DRAFT' || round.status === 'OPEN') && roundId && (
          <MenuPanel roundId={roundId} slotMode={round.slot_mode} />
        )}

        {(round.status === 'DINNER' || round.status === 'VOTING') && round.voting_mode !== 'DISABLED' && (
          <div className="stack">
            <span className="pass__section-title">{t('rounds.actions.voting')}</span>
            {round.status === 'DINNER' && (
              <button type="button" onClick={onOpenVoting}>
                {t('vote.openNow')}
              </button>
            )}

            {/* How many have finished, never who and never what. The count
                is the only thing that helps decide when to close. */}
            {round.status === 'VOTING' && voteProgress && (
              <p className="muted" style={{ margin: 0 }}>
                {t('vote.progress', { voted: voteProgress.voted, eligible: voteProgress.eligible })}
              </p>
            )}

            {round.status === 'VOTING' && (
              <div>
                <label htmlFor="deadline">{t('vote.deadline')}</label>
                <select id="deadline" defaultValue="" onChange={(e) => onDeadline(e.target.value)}>
                  <option value="">{t('vote.noDeadline')}</option>
                  <option value="5">5 min</option>
                  <option value="10">10 min</option>
                  <option value="60">1 h</option>
                  <option value="180">3 h</option>
                  <option value="1440">24 h</option>
                </select>
              </div>
            )}

            <button type="button" className="secondary" onClick={onSkipVoting}>
              {t('vote.skip')}
            </button>
          </div>
        )}

        {/* Results exist but only the Executive Chef can see them: LIVE
            means reading the room first, then announcing. */}
        {resultsOpen && !round.results_published_at && round.voting_mode === 'LIVE' && (
          <div className="stack">
            <span className="pass__section-title">{t('vote.publish')}</span>
            <PassNote short={t('vote.hostOnly')} />
            <button type="button" onClick={onPublish}>
              {t('vote.publish')}
            </button>
          </div>
        )}

        {round.status === 'LOCKED' && (
          <div className="stack">
            <span className="pass__section-title">{t('rounds.assignment.title')}</span>
            <PassNote short={hasAssignment ? t('rounds.assignment.ready') : t('rounds.assignment.explain')} />
            <button type="button" onClick={onGenerateAssignment} disabled={generating}>
              {hasAssignment ? t('rounds.assignment.reroll') : t('rounds.assignment.generate')}
            </button>
          </div>
        )}

        {/* Nothing is up right now — said rather than left blank, so an
            empty pass reads as calm instead of broken. */}
        {!passWaiting && round.status !== 'DRAFT' && round.status !== 'OPEN' &&
          round.status !== 'LOCKED' && round.status !== 'DINNER' && round.status !== 'VOTING' &&
          !(resultsOpen && !round.results_published_at && round.voting_mode === 'LIVE') && (
          <p className="muted" style={{ margin: 0 }}>{t('rounds.pass.nothing')}</p>
        )}

          </HostPass>
        )}

        {!isHost && round.status === 'LOCKED' && (
          <div className="paper">
            <p className="muted" style={{ margin: 0 }}>{t('rounds.assignment.waitingForHost')}</p>
          </div>
        )}

        {/* ---- Chefs: the roster, and where the host runs the door ---- */}
        <Envelope
          icon="👨‍🍳"
          name={t('rounds.drawers.chefs')}
          meta={t('rounds.seatCount', { count: activeApprovedCount })}
          badge={isHost && pendingCount > 0 ? pendingCount : undefined}
          tilt={1}
          onOpen={() => toggle('chefs')}
        >
          {open === 'chefs' && (
            <div className="stack">
              {activeMembers.map((m) => (
                <div key={m.id} className="row" style={{ justifyContent: 'space-between' }}>
                  <span>
                    {/* Pending members show their real name — approving a
                        pseudonym is approving nobody (0015). Once approved
                        they are their secret name to everyone, host too. */}
                    {/* Everyone in the list is a pseudonym, including you —
                        so without a mark there is no way to tell which
                        stranger you are. A wine ring, the same trace the
                        cloth picks up as the evening goes on. */}
                    <span className={m.profile_id === profile?.id ? 'chef-you' : undefined}>
                      {pendingById.get(m.id)?.real_name ?? m.secret_name}
                    </span>
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
                  {isHost && m.approved && m.role !== 'HOST' && (
                    <RemoveChef assigned={assigned} onRemove={(mode) => onRemove(m.id, mode)} />
                  )}
                </div>
              ))}



              {isHost && assigned && (
                <Link to={`/rounds/${roundId}/chain`}>{t('chain.title')}</Link>
              )}
            </div>
          )}
        </Envelope>

        {/* ---- The two heavy screens: these take over rather than expand ---- */}
        <Envelope
          icon="📝"
          name={t('rounds.drawers.myRecipe')}
          meta={progress ? `${progress.briefs_submitted} / ${progress.total_players}` : undefined}
          waitingFor={waitBrief}
          to={`/rounds/${roundId}/brief`}
          tilt={2}
        />

        <Envelope
          icon="◈"
          name={t('rounds.drawers.received')}
          meta={t('rounds.drawers.receivedMeta')}
          waitingFor={waitRecipe}
          to={`/rounds/${roundId}/recipe`}
          tilt={3}
        />

        <Envelope
          icon="✉"
          name={t('rounds.drawers.messages')}
          meta={t('rounds.drawers.messagesMeta')}
          badge={unread && unread > 0 ? unread : undefined}
          waitingFor={waitBrief}
          to={`/rounds/${roundId}/recipe`}
          tilt={4}
        />

        {/* Hidden entirely, not dimmed, when this round will never vote. */}
        {round.voting_mode !== 'DISABLED' && (
          <Envelope
            icon="🏆"
            name={t(resultsOpen ? 'rounds.drawers.results' : 'rounds.drawers.vote')}
            waitingFor={waitVote}
            to={`/rounds/${roundId}/${resultsOpen ? 'results' : 'ballot'}`}
            tilt={1}
          />
        )}
        {round.voting_mode === 'DISABLED' && resultsOpen && (
          <Envelope icon="🏆" name={t('rounds.drawers.results')} to={`/rounds/${roundId}/results`} tilt={1} />
        )}

        <Envelope
          icon="🌾"
          name={t('rounds.drawers.allergies')}
          meta={t('dietary.panelTitle')}
          tilt={2}
          onOpen={() => toggle('allergies')}
        >
          {open === 'allergies' && <DietaryPanelGrid entries={dietaryPanel} />}
        </Envelope>

        <Envelope
          icon="📍"
          name={t('rounds.drawers.info')}
          meta={round.location ?? undefined}
          tilt={3}
          onOpen={() => toggle('info')}
        >
          {open === 'info' && (
            <div className="stack">
              <p className="muted">{round.location ?? t('rounds.info.noLocation')}</p>
              <p className="muted">{round.dinner_at ?? t('rounds.info.noDate')}</p>
              {isHost && <Link to={`/rounds/${roundId}/settings`}>{t('rounds.settings.title')}</Link>}
              {isHost && assigned && <Link to={`/rounds/${roundId}/alerts`}>{t('alerts.title')}</Link>}
            </div>
          )}
        </Envelope>

        {isHost && nextPhase && (
          <div className="paper stack">
            {nextBlockedReason && <p className="muted">{nextBlockedReason}</p>}
            <button type="button" onClick={onAdvance} disabled={!!nextBlockedReason}>
              {t('actions.next')} → {t(`rounds.phase.${nextPhase}`)}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

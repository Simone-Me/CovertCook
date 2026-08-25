import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { useRound, useRoundMembers } from './hooks'
import { RoundProgress } from './RoundProgress'
import { TableProps } from './TableProps'
import { Envelope } from './Envelope'
import { CutleryLink } from '../../components/CutleryLink'
import { Icon } from '../../components/Icon'
import { InlineConfirm } from '../../components/InlineConfirm'
import { RemoveChef } from './RemoveChef'
import { HostPass, PassNote } from './HostAction'
import { MenuPanel } from './MenuPanel'
import { VoteCountdown } from '../vote/VoteCountdown'
import { DietaryPanelGrid } from './DietaryPanelGrid'
import {
  advancePhase,
  cancelLeaveRequest,
  leaveRound,
  notifyApproved,
  notifyRoundPhase,
  approveMember,
  rejectMember,
  removeMember,
  REMOVE_REQUIRES_CONFIRMATION,
  assignmentExists,
  generateAssignment,
  clearAssignment,
  BRIEFS_EXIST,
  nextPhaseFor,
  getDietaryPanel,
  getPendingMembers,
  getBoardUnread,
  getRoundProgress,
  getMyBriefDraft,
  getUnreadCount,
  getVoteProgress,
  inviteMember,
  publishResults,
  setVotingDeadline,
  setVotingMode,
  closeVotingIfComplete,
  DEADLINE_ALREADY_SET,
  skipVoting,
  type DeadlineMinutes,
  NO_SUCH_CHEF,
  ROUND_PHASE_ORDER,
  type RemovalMode,
  type VotingMode,
} from '../../lib/rpc'

type OpenDrawer = 'chefs' | 'allergies' | 'info' | null

// The two marks the Messages envelope can carry, in rank order — see
// messageMark below for which wins.

export function RoundHomePage() {
  const { t } = useTranslation()
  const { roundId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const { data: round, isLoading: roundLoading } = useRound(roundId)
  const { data: members, error: membersError } = useRoundMembers(roundId)
  const [error, setError] = useState<string | null>(null)
  const [passHelp, setPassHelp] = useState(false)
  const [leaveConfirm, setLeaveConfirm] = useState(false)
  const [leaveBusy, setLeaveBusy] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteNote, setInviteNote] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const [open, setOpen] = useState<OpenDrawer>(null)
  // Two decisions that used to be browser dialogs. Both are held here and
  // answered on the page, beside the control that raised them.
  const [rerollAsk, setRerollAsk] = useState(false)
  const [removeAsk, setRemoveAsk] = useState<{ memberId: string; mode: RemovalMode } | null>(null)

  const { data: dietaryPanel } = useQuery({
    queryKey: ['rounds', roundId, 'dietary-panel'],
    enabled: !!roundId,
    queryFn: () => getDietaryPanel(roundId as string),
  })

  // Your own recipe, not the table's tally. The envelope used to read
  // "1 / 3" — a number about everyone else, on the one drawer that is
  // entirely about you, so it looked like a score you were losing.
  const { data: myBrief } = useQuery({
    queryKey: ['rounds', roundId, 'my-brief-draft'],
    enabled: !!roundId && ROUND_PHASE_ORDER.indexOf(round?.status ?? 'DRAFT') >= ROUND_PHASE_ORDER.indexOf('ASSIGNED'),
    queryFn: () => getMyBriefDraft(roundId as string),
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

  // How far the table has got with its recipes. Back after the "1 / 3" on the
  // My recipe envelope was replaced by a glyph: the tally was the wrong thing
  // on a personal drawer, but it is exactly the right thing on the pass.
  const { data: progress } = useQuery({
    queryKey: ['rounds', roundId, 'progress'],
    enabled: !!roundId && !!round && round.status === 'ASSIGNED',
    queryFn: () => getRoundProgress(roundId as string),
    refetchInterval: 30000,
  })

  // The fridge half of the Messages mark. Chef outranks fridge, so this is
  // only ever consulted when no chef is waiting — see messageMark below.
  const { data: boardUnread } = useQuery({
    queryKey: ['rounds', roundId, 'board-unread'],
    enabled: !!roundId && !!round && ROUND_PHASE_ORDER.indexOf(round.status) >= ROUND_PHASE_ORDER.indexOf('ASSIGNED'),
    queryFn: () => getBoardUnread(roundId as string),
    refetchInterval: 30000,
  })

  // Ends a vote that is already over. Runs for everyone in the round, not the
  // host alone, and the RPC does nothing unless every eligible member has
  // actually voted — so the last person to vote does not have to go and find
  // the host to stop the waiting (0043).
  useQuery({
    queryKey: ['rounds', roundId, 'vote-autoclose'],
    enabled: !!roundId && !!round && round.status === 'VOTING' && round.voting_mode !== 'MANUAL',
    queryFn: async () => {
      const closed = await closeVotingIfComplete(roundId as string)
      if (closed) await queryClient.invalidateQueries({ queryKey: ['rounds', roundId] })
      return closed
    },
    refetchInterval: 15000,
  })

  // Source for the Messaggi badge. Only once there is a chain to talk
  // across — before that there are no threads to be unread (0022).
  const { data: unread } = useQuery({
    queryKey: ['rounds', roundId, 'unread'],
    enabled: !!roundId && !!round && ROUND_PHASE_ORDER.indexOf(round.status) >= ROUND_PHASE_ORDER.indexOf('ASSIGNED'),
    queryFn: () => getUnreadCount(roundId as string),
    refetchInterval: 30000,
  })

  // The Executive Chef is the one person at this table who is not anonymous:
  // PRESENTATION.md has them standing apart from the pseudonyms, the roster
  // already marks which seat is theirs, and organising is a public act. So the
  // roster names them — and names nobody else.
  const { data: hostName } = useQuery({
    queryKey: ['profiles', round?.host_id],
    enabled: !!round?.host_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', round?.host_id as string)
        .maybeSingle()
      return (data?.display_name as string | undefined) ?? null
    },
  })

  // 0051 made the round row readable to somebody who left it, so that it could
  // sit in their archive — which also made this page reachable by URL, by the
  // back button, or by a link somebody still had open. Everything inside
  // refuses a former member, so the roster call comes back 42501 and the page
  // used to render around a hole. It says what happened instead.
  const notAMember =
    membersError instanceof Error && /not a member of this round/i.test(membersError.message)

  if (notAMember) {
    return (
      <div className="stack sheet">
        <h1>{round?.name ?? t('rounds.myRounds')}</h1>
        <p className="muted">{t('rounds.left.noLongerIn')}</p>
        <Link to="/">
          <button type="button">{t('rounds.myRounds')}</button>
        </Link>
      </div>
    )
  }

  if (roundLoading || !round) return <p className="muted">…</p>

  // A dinner that has been archived or cancelled is a record (0054): the
  // database refuses every write to it, so the host's controls would only lead
  // to an error. Folding that into isHost turns the whole page read-only in
  // one line — the Executive Chef keeps the title and loses the powers, which
  // is what being over means.
  const frozen = round.status === 'ARCHIVED' || round.status === 'CANCELLED'
  const isHost = round.host_id === profile?.id && !frozen


  // Your own seat in this round, which the roster query already knows about.
  const myMembership = members?.find((m) => m.profile_id === profile?.id)
  const leaveIsFree = ['DRAFT', 'OPEN', 'LOCKED'].includes(round.status)
  const leaveAsked = !!myMembership?.removal_requested_at
  const isFinished = ['RESULTS', 'ARCHIVED', 'CANCELLED'].includes(round.status)

  async function onLeave() {
    if (!roundId) return
    setLeaveBusy(true)
    try {
      const outcome = await leaveRound(roundId)
      setLeaveConfirm(false)
      // Walking out means this round is no longer one of yours: the list has
      // to be re-read, or you are left looking at a dinner you have left.
      await queryClient.invalidateQueries({ queryKey: ['rounds'] })
      // The confirmation belongs on the page you land on, not the one you are
      // leaving: this page unmounts in the same tick.
      if (outcome === 'LEFT') {
        navigate('/', { replace: true, state: { leftRound: round?.name } })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setLeaveBusy(false)
    }
  }

  async function onCancelLeave() {
    if (!roundId) return
    setLeaveBusy(true)
    try {
      await cancelLeaveRequest(roundId)
      await queryClient.invalidateQueries({ queryKey: ['rounds'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setLeaveBusy(false)
    }
  }
  const pendingById = new Map((pendingMembers ?? []).map((p) => [p.member_id, p]))
  const phaseIdx = ROUND_PHASE_ORDER.indexOf(round.status)
  const assigned = phaseIdx >= ROUND_PHASE_ORDER.indexOf('ASSIGNED')
  const nextPhase = nextPhaseFor(round.status, round.voting_enabled)
  const shareLink = `${import.meta.env.VITE_APP_BASE_URL}/join?code=${round.join_code}`
  const activeMembers = members?.filter((m) => m.status === 'ACTIVE') ?? []
  const activeApprovedCount = activeMembers.filter((m) => m.approved).length

  const rosterMeta = hostName
    ? `${t('rounds.chefCount', { count: activeApprovedCount })} — ${t('rounds.executiveChef')} : ${hostName}`
    : t('rounds.chefCount', { count: activeApprovedCount })
  const pendingCount = pendingMembers?.length ?? 0

  // While the door is open the server sends no names but your own (0032), so
  // the list is seats rather than people. Everyone is uncovered at the same
  // instant when the round locks — see "Quando si scoprono i chef" in
  // DESIGN.md for why arrival order is the thing being hidden.
  const rosterCovered = round.status === 'DRAFT' || round.status === 'OPEN'

  // Read in the dinner's timezone, not the reader's: a guest flying in wants
  // the time they have to be at the door, not what their own phone calls that
  // instant. Hours and minutes only — no dinner ever started at a second past
  // the hour, and printing one invites the question of how precise this is.
  const when = round.dinner_at
    ? {
        date: new Date(round.dinner_at).toLocaleDateString(profile?.locale ?? 'en', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          timeZone: round.timezone,
        }),
        time: new Date(round.dinner_at).toLocaleTimeString(profile?.locale ?? 'en', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: round.timezone,
        }),
      }
    : null

  // One envelope, one mark, so it has to choose. A chef writing to you
  // personally always outranks the table being cheerful in the fridge — the
  // chef stays even when new fridge lines land on top of it. Only when
  // nobody has written to you does the fridge get the envelope.
  const messageMark =
    unread && unread > 0 ? (
      <Icon name="chefWrote" size={18} />
    ) : boardUnread && boardUnread > 0 ? (
      <Icon name="fridge" size={18} />
    ) : undefined

  // Three states, one glyph each: nothing written, saved but still yours,
  // gone to the cook. A draft counts as started only if something is
  // actually in it — an empty row saved by accident isn't progress.
  const briefState = !myBrief
    ? 'blank'
    : myBrief.status === 'SUBMITTED'
      ? 'sent'
      : myBrief.dish_name.trim() || myBrief.procedure.trim() || myBrief.ingredients.length > 0
        ? 'draft'
        : 'blank'

  const nextBlockedReason =
    round.status === 'LOCKED' && nextPhase === 'ASSIGNED' && !hasAssignment
      ? t('rounds.assignment.needed')
      : null

  // One reason per envelope for why it can't be opened yet, so a dimmed
  // drawer explains itself instead of just being unavailable.
  const waitBrief = !assigned ? t('rounds.waiting.assignment') : undefined
  // A recipe now lands the moment its author submits it (0035), so the drawer
  // opens as soon as the roulette has run. Waiting for BRIEFS_CLOSED here was
  // the last place still holding recipes back a whole phase — the server had
  // already stopped doing it.
  const waitRecipe = !assigned ? t('rounds.waiting.assignment') : undefined
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
      void notifyRoundPhase(roundId, nextPhase)
      queryClient.invalidateQueries({ queryKey: ['rounds', roundId] })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    }
  }

  // Undo for the roulette. Re-roll refuses once anyone has written, which is
  // right, but it left a host who wanted different courses stuck: the menu is
  // frozen while any pairing uses a course, so there was a button saying no
  // and none saying undo (0037).
  async function onClearAssignment() {
    if (!roundId) return
    setError(null)
    setGenerating(true)
    try {
      await clearAssignment(roundId)
      await queryClient.invalidateQueries({ queryKey: ['rounds', roundId] })
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      setError(raw === BRIEFS_EXIST ? t('rounds.assignment.clearBlocked') : raw || t('errors.generic'))
    } finally {
      setGenerating(false)
    }
  }

  async function onGenerateAssignment() {
    if (!roundId) return
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
      void notifyRoundPhase(roundId, 'VOTING')
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
      const raw = err instanceof Error ? err.message : ''
      setError(raw === DEADLINE_ALREADY_SET ? t('vote.deadlineSetAlready') : raw || t('errors.generic'))
    }
  }

  async function onVotingMode(mode: VotingMode) {
    if (!roundId) return
    setError(null)
    try {
      await setVotingMode(roundId, mode)
      await queryClient.invalidateQueries({ queryKey: ['rounds', roundId] })
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
    // The person who asked has been looking at "waiting for approval" with
    // nothing they can do about it. Tell them the door opened.
    void notifyApproved(memberId)
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
        setRemoveAsk({ memberId, mode })
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
            {isHost && <CutleryLink to={`/rounds/${roundId}/settings`} />}
          </div>
          <p className="muted" style={{ margin: '2px 0 0' }}>
            {t('rounds.seatCount', { count: activeApprovedCount })}
          </p>
        </div>

        <div className="paper">
          <RoundProgress round={round} isHost={isHost} />
        </div>

        {/* Said once, so the missing controls read as a rule rather than as
            something broken. */}
        {frozen && <p className="notice">{t('rounds.frozen')}</p>}

        {error && <div className="error">{error}</div>}

        {/* Everyone's clock, not the host's. A deadline only the Executive
            Chef could see was timing people out of a vote they had no reason
            to think was closing. */}
        {round.status === 'VOTING' && round.voting_closes_at && (
          <div className="paper">
            <VoteCountdown closesAt={round.voting_closes_at} />
          </div>
        )}

        {/* One pass, not a column of panels. Everything the Executive Chef
            is asked to do goes through here, and what shows depends on where
            the evening is — the same way a real pass only carries the orders
            that are up right now. It opens by itself when the round is
            actually blocked on them. */}
        {isHost && (
          <HostPass status={round.status} waiting={passWaiting}>

        {/* Not in DRAFT: a code handed out before the door is open produces
            people knocking at a dinner that does not accept them yet
            (join_round requires OPEN). The pass offers it the moment sign-ups
            actually start, and stops offering it the moment they close. */}
        {round.status === 'OPEN' && (
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

        {/* Second in the pass, and only a line: it is a thing to look at, not
            a thing to do, so it should not carry the weight of a button the
            width of the card. */}
        {assigned && (
          <Link to={`/rounds/${roundId}/chain`} className="pass__link">
            <Icon name="chain" size={22} />
            <span>
              <strong>{t('chain.title')}</strong> — {t('chain.open')}
            </span>
          </Link>
        )}

        {/* Once the roulette has run the only question left is how many
            recipes are in. A bar, because "5 of 8" is a fact and "62%" is a
            feeling, and the host wants both. */}
        {round.status === 'ASSIGNED' && progress && (
          <div className="stack">
            <span className="pass__section-title">{t('rounds.actions.writing')}</span>
            <div
              className="meter"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progress.total_players}
              aria-valuenow={progress.briefs_submitted}
            >
              <span
                className="meter__fill"
                style={{
                  width: `${progress.total_players ? (progress.briefs_submitted / progress.total_players) * 100 : 0}%`,
                }}
              />
            </div>
            <p className="muted" style={{ margin: 0 }}>
              {t('rounds.briefProgress', {
                done: progress.briefs_submitted,
                total: progress.total_players,
              })}
            </p>
          </div>
        )}

        {/* What this thing is, said once, on the only screen where the host
            has nothing else to do yet. Repeating "sign-ups are closed" at
            every later phase was telling them something they already knew
            about a door they had shut themselves — that guidance moved to
            settings, where somebody actually goes looking for it. */}
        {round.status === 'DRAFT' && (
          <>
            {/* An empty pass in DRAFT was a blank space above a paragraph
                explaining what the pass is, and the two read as one thing. The
                word says the state, the rule below separates it, and the
                explanation is behind the question mark — because it is worth
                reading once and never again. */}
            <p className="pass__empty" style={{ margin: 0 }}>
              <em>{t('rounds.pass.empty')}</em>
            </p>
            <hr className="pass__rule" />
            <div className="stack">
              <button
                type="button"
                className="pass__help"
                aria-expanded={passHelp}
                onClick={() => setPassHelp((v) => !v)}
              >
                <Icon name="help" size={18} />
                <span>{t('rounds.pass.whatIsItToggle')}</span>
              </button>
              {passHelp && (
                <p className="muted" style={{ margin: 0 }}>{t('rounds.pass.explain')}</p>
              )}
            </div>
          </>
        )}

        {/* Courses are decided once the table is final, not while it is still
            filling: the number of slots has to equal the number of chefs, and
            that number is only settled at LOCKED. Left in OPEN it was a sum
            that changed under the host every time somebody joined. */}
        {round.status === 'LOCKED' && roundId && (
          <MenuPanel roundId={roundId} slotMode={round.slot_mode} />
        )}

        {/* A hand-counted dinner has no deadline, no progress count and no
            ballots to wait for — it has a person with a phone and a room. So
            the whole online apparatus is replaced by one line and one way in. */}
        {(round.status === 'DINNER' || round.status === 'VOTING') && round.voting_mode === 'MANUAL' && (
          <div className="stack">
            <span className="pass__section-title">{t('rounds.actions.voting')}</span>
            <PassNote short={t('vote.manual.chosen')} long={t('vote.MANUALHint')} />
            {round.status === 'DINNER' ? (
              <button type="button" onClick={onOpenVoting}>
                {t('vote.openNow')}
              </button>
            ) : (
              <Link to={`/rounds/${roundId}/tally`}>
                <button type="button">{t('vote.manual.open')}</button>
              </Link>
            )}
          </div>
        )}

        {(round.status === 'DINNER' || round.status === 'VOTING') &&
          round.voting_mode !== 'DISABLED' &&
          round.voting_mode !== 'MANUAL' && (
          <div className="stack">
            <span className="pass__section-title">{t('rounds.actions.voting')}</span>

            {/* Chosen here rather than at creation. Three weeks before a
                dinner nobody knows whether the eight of them will be round a
                table with phones away or scattered home afterwards. */}
            {round.status === 'DINNER' && (
              <div>
                <label htmlFor="vote-style">{t('vote.style')}</label>
                <select
                  id="vote-style"
                  value={round.voting_mode}
                  onChange={(e) => onVotingMode(e.target.value as VotingMode)}
                >
                  <option value="LIVE">{t('rounds.voting.LIVE')}</option>
                  <option value="TIMED">{t('rounds.voting.TIMED')}</option>
                  <option value="MANUAL">{t('vote.MANUAL')}</option>
                </select>
                <p className="muted">{t(`rounds.voting.${round.voting_mode}Hint`)}</p>
              </div>
            )}

            {round.status === 'DINNER' && (
              <button type="button" onClick={onOpenVoting}>
                {t('vote.openNow')}
              </button>
            )}

            {/* How many have finished, never who and never what. A share as
                well as a count, because "5 of 8" and "62%" answer different
                questions and the host is asking both. */}
            {round.status === 'VOTING' && voteProgress && (
              <div className="stack">
                <div
                  className="meter"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={voteProgress.eligible}
                  aria-valuenow={voteProgress.voted}
                >
                  <span
                    className="meter__fill"
                    style={{
                      width: `${voteProgress.eligible ? (voteProgress.voted / voteProgress.eligible) * 100 : 0}%`,
                    }}
                  />
                </div>
                <p className="muted" style={{ margin: 0 }}>
                  {t('vote.turnout', {
                    voted: voteProgress.voted,
                    eligible: voteProgress.eligible,
                    percent: voteProgress.eligible
                      ? Math.round((voteProgress.voted / voteProgress.eligible) * 100)
                      : 0,
                  })}
                </p>
              </div>
            )}

            {/* TIMED only. LIVE means the Executive Chef reads the room and
                closes it themselves — offering a countdown there was the two
                modes doing the same thing, which made choosing between them
                pointless. Set once: replacing a live deadline would move a
                closing time while people were deciding whether they had time
                to think. */}
            {round.status === 'VOTING' && round.voting_mode === 'LIVE' && (
              <p className="muted" style={{ margin: 0 }}>{t('vote.liveNoDeadline')}</p>
            )}

            {round.status === 'VOTING' && round.voting_mode === 'TIMED' && (
              round.voting_closes_at && new Date(round.voting_closes_at) > new Date() ? (
                <div className="stack">
                  <p className="muted" style={{ margin: 0 }}>
                    {t('vote.deadlineSet', {
                      time: new Date(round.voting_closes_at).toLocaleTimeString(profile?.locale ?? 'en', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                        timeZone: round.timezone,
                      }),
                    })}
                  </p>
                  <button type="button" className="secondary" onClick={() => onDeadline('')}>
                    {t('vote.deadlineClear')}
                  </button>
                </div>
              ) : (
                <div>
                  <label htmlFor="deadline">{t('vote.deadline')}</label>
                  <select id="deadline" defaultValue="" onChange={(e) => onDeadline(e.target.value)}>
                    <option value="">{t('vote.noDeadline')}</option>
                    <option value="60">1 h</option>
                    <option value="180">3 h</option>
                    <option value="720">12 h</option>
                    <option value="1440">24 h</option>
                    <option value="2880">48 h</option>
                  </select>
                </div>
              )
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
            {/* Re-rolling replaces everyone's pairing, so it asks first —
                here, beside the button, not in a dialog over the page. */}
            {rerollAsk ? (
              <InlineConfirm
                title={t('rounds.assignment.reroll')}
                confirmLabel={t('rounds.assignment.reroll')}
                busy={generating}
                onConfirm={() => {
                  setRerollAsk(false)
                  onGenerateAssignment()
                }}
                onCancel={() => setRerollAsk(false)}
              >
                <p className="confirmbox__why">{t('rounds.assignment.rerollConfirm')}</p>
              </InlineConfirm>
            ) : (
            <button
              type="button"
              onClick={() => (hasAssignment ? setRerollAsk(true) : onGenerateAssignment())}
              disabled={generating}
            >
              {hasAssignment ? t('rounds.assignment.reroll') : t('rounds.assignment.generate')}
            </button>
            )}

            {/* Only while there is something to undo, and only worth offering
                because clearing is what unfreezes the menu. */}
            {hasAssignment && !rerollAsk && (
              <button type="button" className="secondary" onClick={onClearAssignment} disabled={generating}>
                {t('rounds.assignment.clear')}
              </button>
            )}
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
          icon={<Icon name="chefs" />}
          name={t('rounds.drawers.chefs')}
          meta={rosterMeta}
          badge={isHost && pendingCount > 0 ? pendingCount : undefined}
          tilt={1}
          onOpen={() => toggle('chefs')}
        >
          {open === 'chefs' && (
            <div className="stack">
              {activeMembers.map((m) => {
                // Pending members show their real name — approving a
                // pseudonym is approving nobody (0015). Once approved they
                // are their secret name to everyone, host too.
                const name = pendingById.get(m.id)?.real_name ?? m.secret_name
                return (
                <div key={m.id} className="row" style={{ justifyContent: 'space-between' }}>
                  <span>
                    {/* Everyone in the list is a pseudonym, including you —
                        so without a mark there is no way to tell which
                        stranger you are. A wine ring, the same trace the
                        cloth picks up as the evening goes on. */}
                    {/* A request to be let out, marked where the host is
                        already looking at who is in the room. */}
                    {isHost && m.removal_requested_at && (
                      <span className="chef-leaving">{t('rounds.leave.requested')}</span>
                    )}
                    {name ? (
                      <span className={m.profile_id === profile?.id ? 'chef-you' : undefined}>
                        {name}
                      </span>
                    ) : (
                      /* Nothing to uncover: the name never left the server.
                         The bar covers a placeholder, as .redact requires. */
                      <span className="redact">{t('rounds.chefCovered')}</span>
                    )}
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
                )
              })}

              {/* Says when the bars come off, so a covered list reads as a
                  rule of the game rather than something still loading. */}
              {/* Removing a chef when both dishes are already submitted throws
                  one of them away, so the question is asked in the roster
                  itself rather than over it. */}
              {removeAsk && (
                <InlineConfirm
                  title={t('rounds.remove')}
                  confirmLabel={t('rounds.remove')}
                  onConfirm={() => {
                    const ask = removeAsk
                    setRemoveAsk(null)
                    onRemove(ask.memberId, ask.mode, true)
                  }}
                  onCancel={() => setRemoveAsk(null)}
                >
                  <p className="confirmbox__why">{t('rounds.removeDishConfirm')}</p>
                </InlineConfirm>
              )}

              {rosterCovered && (
                <p className="muted" style={{ margin: 0 }}>{t('rounds.rosterCovered')}</p>
              )}

              {/* Your own way out, at the bottom of the roster because that is
                  where you are looking at who is in the room. What it does
                  depends entirely on when you press it, and the words change
                  with it rather than staying vague: while the door is open you
                  simply go; once the lottery has run, three other people's
                  evening is built on your pairing, so it becomes a request the
                  Executive Chef answers. */}
              {!isHost && myMembership?.status === 'ACTIVE' && !isFinished && (
                <div className="stack leave-seat">
                  {leaveAsked ? (
                    <>
                      <p className="muted" style={{ margin: 0 }}>{t('rounds.leave.asked')}</p>
                      <button type="button" className="secondary" disabled={leaveBusy} onClick={onCancelLeave}>
                        {t('rounds.leave.stayAfterAll')}
                      </button>
                    </>
                  ) : leaveConfirm ? (
                    <InlineConfirm
                      title={t(leaveIsFree ? 'rounds.leave.confirmNow' : 'rounds.leave.confirmAsk')}
                      confirmLabel={t(leaveIsFree ? 'rounds.leave.now' : 'rounds.leave.ask')}
                      busy={leaveBusy}
                      onConfirm={onLeave}
                      onCancel={() => setLeaveConfirm(false)}
                    >
                      <p className="confirmbox__why">
                        {t(leaveIsFree ? 'rounds.leave.whyNow' : 'rounds.leave.whyAsk')}
                      </p>
                    </InlineConfirm>
                  ) : (
                    <button type="button" className="secondary" onClick={() => setLeaveConfirm(true)}>
                      {t(leaveIsFree ? 'rounds.leave.now' : 'rounds.leave.ask')}
                    </button>
                  )}
                </div>
              )}




            </div>
          )}
        </Envelope>

        {/* ---- The two heavy screens: these take over rather than expand ---- */}
        <Envelope
          icon={<Icon name="myRecipe" />}
          name={t('rounds.drawers.myRecipe')}
          meta={assigned ? t(`briefs.state.${briefState}`) : undefined}
          waitingFor={waitBrief}
          to={`/rounds/${roundId}/brief`}
          tilt={2}
        />

        <Envelope
          icon={<Icon name="received" />}
          name={t('rounds.drawers.received')}
          meta={t('rounds.drawers.receivedMeta')}
          waitingFor={waitRecipe}
          to={`/rounds/${roundId}/recipe`}
          tilt={3}
        />

        <Envelope
          icon={<Icon name="messages" />}
          name={t('rounds.drawers.messages')}
          meta={t('rounds.drawers.messagesMeta')}
          badge={messageMark}
          waitingFor={waitBrief}
          to={`/rounds/${roundId}/messages`}
          tilt={4}
        />

        {/* Hidden entirely, not dimmed, when this round will never vote.
            Where it leads depends on how this dinner votes: a hand-counted
            round has no online ballot at all, so sending everybody to one was
            the envelope contradicting the choice the host had just made. */}
        {round.voting_mode !== 'DISABLED' && (
          <Envelope
            icon={<Icon name={resultsOpen ? 'winner' : round.voting_mode === 'MANUAL' ? 'hands' : 'ballot'} />}
            name={t(resultsOpen ? 'rounds.drawers.results' : 'rounds.drawers.vote')}
            waitingFor={
              waitVote ??
              // Members of a hand-counted round have nothing to open: they
              // raise a hand at the table. Only the host has a screen.
              (round.voting_mode === 'MANUAL' && !isHost && !resultsOpen
                ? t('vote.manual.atTheTable')
                : undefined)
            }
            to={
              resultsOpen
                ? `/rounds/${roundId}/results`
                : round.voting_mode === 'MANUAL'
                  ? `/rounds/${roundId}/tally`
                  : `/rounds/${roundId}/ballot`
            }
            tilt={1}
          />
        )}
        {round.voting_mode === 'DISABLED' && resultsOpen && (
          <Envelope icon={<Icon name="winner" />} name={t('rounds.drawers.results')} to={`/rounds/${roundId}/results`} tilt={1} />
        )}

        {/* The count on the flap, and nothing at all when it is zero: a badge
            reading 0 is a thing to check, and there is nothing to check. It is
            the one envelope where knowing there is something inside changes
            whether you open it before you start cooking. */}
        <Envelope
          icon={<Icon name="allergies" />}
          name={t('rounds.drawers.allergies')}
          meta={t('dietary.panelTitle')}
          badge={dietaryPanel && dietaryPanel.length > 0 ? dietaryPanel.length : undefined}
          tilt={2}
          onOpen={() => toggle('allergies')}
        >
          {open === 'allergies' && <DietaryPanelGrid entries={dietaryPanel} />}
        </Envelope>

        <Envelope
          icon={<Icon name="where" />}
          name={t('rounds.drawers.info')}
          meta={round.city ?? round.location ?? undefined}
          tilt={3}
          onOpen={() => toggle('info')}
        >
          {open === 'info' && (
            <div className="stack">
              {/* Everything a guest needs in order to turn up, each thing on
                  its own line. One free-text box used to carry all of it, so
                  the envelope could only show one line and it was usually the
                  wrong one (0034). Blank fields are omitted, not printed
                  empty. */}
              <dl className="info">
                <dt>{t('rounds.info.title')}</dt>
                <dd>{round.name}</dd>

                {round.city && (
                  <>
                    <dt>{t('rounds.info.city')}</dt>
                    <dd>{round.city}</dd>
                  </>
                )}

                {round.location && (
                  <>
                    <dt>{t('rounds.info.address')}</dt>
                    <dd>{round.location}</dd>
                  </>
                )}

                <dt>{t('rounds.info.date')}</dt>
                <dd>{when?.date ?? t('rounds.info.noDate')}</dd>

                {when && (
                  <>
                    <dt>{t('rounds.info.time')}</dt>
                    <dd>{when.time}</dd>
                  </>
                )}

                <dt>{t('rounds.settings.timezone')}</dt>
                <dd>{round.timezone}</dd>

                {round.notes && (
                  <>
                    <dt>{t('rounds.info.notes')}</dt>
                    <dd>{round.notes}</dd>
                  </>
                )}
              </dl>
              {/* Was a bare "Dinner settings" link, which reads as a place
                  rather than as an answer to the question the reader actually
                  has, which is "can I still change this?". The sentence says
                  yes, and the link lands on the venue fields instead of the
                  top of a long page. */}
              {isHost && (
                <p className="muted editable-note">
                  <em>
                    {t('rounds.settings.venueEditable')} —{' '}
                    <Link to={`/rounds/${roundId}/settings#location`}>
                      {t('rounds.settings.venueHere')}
                    </Link>
                  </em>
                </p>
              )}
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

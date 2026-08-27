import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useLocation, Link, Navigate } from 'react-router-dom'
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
  updateRoundDetails,
  getExclusionPairs,
  listRoundPeople,
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

  // A link that names a field should arrive at that field. The browser cannot
  // do it on its own here: the anchor does not exist yet when the URL is read,
  // because the page is still waiting for the round — and the sections are
  // folded, so scrolling to a closed one would land on a heading. Open it and
  // then scroll, once there is something to scroll to.
  const { hash } = useLocation()
  useEffect(() => {
    if (!hash || !round) return
    const target = document.querySelector(hash)
    if (!target) return
    target.closest('details')?.setAttribute('open', '')
    target.scrollIntoView({ block: 'center' })
  }, [hash, round])
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

  // Real names, host-only, from a function that never returns a pseudonym
  // (0053). Naming the pair by pseudonym would have forced the host to work
  // out which pseudonym is which person before they could exclude anybody —
  // exactly the knowledge the anonymity exists to withhold.
  const { data: people } = useQuery({
    queryKey: ['rounds', roundId, 'people'],
    // `enabled` cannot lean on isHost: that is derived after the early
    // return, and a hook may not appear on some renders and not others. The
    // function refuses non-hosts anyway.
    enabled: !!roundId,
    queryFn: () => listRoundPeople(roundId as string),
  })

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

  // Same rule as the round page: over is over, and the forms below would each
  // come back with the same refusal from the database.
  const frozen = round.status === 'ARCHIVED' || round.status === 'CANCELLED'
  const isHost = round.host_id === profile?.id && !frozen
  if (!isHost) {
    return <Navigate to={`/rounds/${roundId}`} replace />
  }

  const detailsLocked = ['DINNER', 'VOTING', 'RESULTS', 'ARCHIVED', 'CANCELLED'].includes(round.status)
  const previousPhase = previousPhaseFor(round.status, round.voting_enabled)
  const canCancel = !['RESULTS', 'ARCHIVED', 'CANCELLED'].includes(round.status)
  const preAssignment = ['DRAFT', 'OPEN', 'LOCKED'].includes(round.status)
  // "Classic" is not stored — it is what the creation form produces when the
  // host changes nothing, so it is derived from the same four defaults rather
  // than from a flag that could drift out of step with them.
  const isClassic =
    round.access === 'CODE' &&
    round.anonymity === 'ANONYMOUS' &&
    round.voting_mode === 'LIVE' &&
    round.slot_mode === 'FREE'
  const activeMembers = members?.filter((m) => m.status === 'ACTIVE' && m.approved) ?? []
  const activeApprovedCount = activeMembers.length


  const memberName = (id: string) =>
    people?.find((p) => p.member_id === id)?.display_name ?? id

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
      <Fold title={t('rounds.settings.filling')} defaultOpen={round.status === 'OPEN'}>
        <div className="card stack">
        {/* The code is only a way in while join_round will accept it, which is
            only in OPEN. Showing it at every other phase invited the host to
            hand out something that would be refused, and then to wonder why.
            What replaces it is the actual route: reopen sign-ups first. */}
        {round.status !== 'OPEN' ? (
          <div className="howto">
            <p className="howto__lead">{t('rounds.lateJoin.short')}</p>
            <ol className="howto__steps">
              {(t('rounds.lateJoin.steps', { returnObjects: true }) as string[]).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="howto__note is-good">{t('rounds.lateJoin.keeps')}</p>
            <p className="howto__note">{t('rounds.lateJoin.pauses')}</p>
            <p className="howto__note is-warn">{t('rounds.lateJoin.changes')}</p>
          </div>
        ) : (
        <>
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
        </>
        )}
        </div>
      </Fold>

      {/* What kind of dinner this is, in one place. The choices were made once
          in the creation form and then never shown again, so a host coming
          back weeks later had no way to remember whether they had turned
          voting off, or whether they were the one approving people — and no
          way to tell which of it is still changeable. */}
      <Fold title={t('rounds.settings.overview')} hint={t('rounds.settings.overviewHelp')}>
        <div className="card">
          <dl className="info">
            <dt>{t('rounds.settings.setupKind')}</dt>
            <dd>{isClassic ? t('rounds.setup.classic') : t('rounds.setup.custom')}</dd>

            <dt>{t('rounds.access.label')}</dt>
            <dd>
              {t(`rounds.access.${round.access}`)}
              <span className="fixed-note">{t('rounds.settings.fixedAtCreation')}</span>
            </dd>

            <dt>{t('rounds.anonymity.label')}</dt>
            <dd>
              {t(`rounds.anonymity.${round.anonymity}`)}
              <span className="fixed-note">{t('rounds.settings.fixedAtCreation')}</span>
            </dd>

            <dt>{t('rounds.voting.label')}</dt>
            <dd>
              {t(`rounds.voting.${round.voting_mode}`)}
              {/* MANUAL arrived with 0040 and never got a line here, so the
                  row printed its own key. The note underneath is the rule
                  rather than a live state: the method is settled when the vote
                  opens, and stays changeable until somebody has actually voted
                  (0043, 0045) — which is a thing worth knowing before the
                  evening, not a status to look up during it. */}
              {round.voting_mode === 'DISABLED' ? (
                <span className="fixed-note">{t('rounds.settings.votingNeverOn')}</span>
              ) : (
                <span className="fixed-note">{t('rounds.voting.chosenWhenOpening')}</span>
              )}
            </dd>

            <dt>{t('rounds.slotMode.label')}</dt>
            <dd>
              {t(`rounds.slotMode.${round.slot_mode}`)}
              <span className="fixed-note">
                {preAssignment ? t('rounds.settings.changeableNow') : t('rounds.settings.fixedNow')}
              </span>
            </dd>

            <dt>{t('rounds.requiresApproval')}</dt>
            <dd>{round.requires_approval ? t('rounds.settings.yes') : t('rounds.settings.no')}</dd>

            <dt>{t('rounds.maxPlayers')}</dt>
            <dd>{round.max_players ?? t('rounds.settings.noLimit')}</dd>

            <dt>{t('rounds.nameTheme.label')}</dt>
            <dd>
              {t(`rounds.nameTheme.${round.name_theme}`)}
              <span className="fixed-note">{t('rounds.settings.fixedAtCreation')}</span>
            </dd>

            {/* The one thing here that is genuinely for sale, and it is a
                look — said next to everything that isn't, so the difference
                is visible rather than asserted. */}
            <dt>{t('rounds.settings.themes')}</dt>
            <dd>
              {t('rounds.comingSoon')} · {t('pro.badge')}
              <span className="fixed-note">{t('rounds.settings.themesSoon')}</span>
            </dd>

            <dt>{t('rounds.settings.dinerInfo')}</dt>
            <dd>{detailsLocked ? t('rounds.settings.fixedNow') : t('rounds.settings.changeableNow')}</dd>
          </dl>

          {/* Pro is flavour, never access. Saying so where the switched-off
              options live is the only place a host would ask the question. */}
          <div className="profree">
            <p className="profree__head">{t('pro.title')}</p>
            <p className="profree__free">{t('pro.freeForever')}</p>
            <p className="profree__what">{t('pro.what')}</p>
          </div>
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
              {people?.map((p) => (
                <option key={p.member_id} value={p.member_id}>
                  {p.display_name}
                </option>
              ))}
            </select>
            <select value={exclusionB} onChange={(e) => setExclusionB(e.target.value)}>
              <option value="">—</option>
              {people?.map((p) => (
                <option key={p.member_id} value={p.member_id}>
                  {p.display_name}
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
          {/* The same red border the account deletion carries in the profile.
              Cancelling a dinner ends it for everyone at it — the recipes, the
              chain, the messages — and it was sitting in a plain card that
              looked like the settings above it. Two irreversible things in one
              app should announce themselves the same way, or the reader has to
              learn the warning twice. */}
          <div className="card stack card--danger">
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

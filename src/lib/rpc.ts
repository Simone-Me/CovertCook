// Thin, typed wrappers around the SECURITY DEFINER RPCs in
// supabase/migrations/. Keeping the raw `supabase.rpc(name, args)` calls in
// one place means the Postgres parameter names (which must match exactly,
// including the p_ prefix — PostgREST maps JSON keys to named function
// arguments) only need to be spelled correctly once.
import { supabase } from './supabase'
import { invokeFunction } from './functions'

// How someone gets a seat. CODE = share a code, anyone holding it can ask;
// INVITE = the host names existing accounts by username, who accept or
// decline in-app; CODE_AND_INVITE = both doors open, which is the ordinary
// case of a host who invites the four people they know and hands the code to
// whoever else turns up (0071). All three are enforced server-side now: the
// code is refused on an INVITE round and the guest list on a CODE one.
export type RoundAccess = 'CODE' | 'INVITE' | 'CODE_AND_INVITE'

export function accessAdmitsCode(access: RoundAccess) {
  return access === 'CODE' || access === 'CODE_AND_INVITE'
}

export function accessAdmitsInvites(access: RoundAccess) {
  return access === 'INVITE' || access === 'CODE_AND_INVITE'
}

// What members know about each other once seated. SPY sits between the
// other two: the host sees real names, nobody else does.
// The pseudonym sets a dinner can draw from (0038, 0072). The codes are rows
// in name_theme_catalogue — this union is the set the client knows how to
// describe, and listNameThemes() is what says which of them this account may
// actually use.
export type NameTheme = 'FOOD' | 'BRIGADE' | 'PASTA' | 'PATISSERIE' | 'BATTERIE'

// How the cloth is dressed (0072). Look only: nothing here touches a rule.
export type TableTheme =
  | 'CHECKS' | 'ELEGANT' | 'SCIFI' | 'BAROQUE' | 'HALLOWEEN' | 'XMAS' | 'CARNIVAL'

/** DEFAULT is what a dinner gets for free by default, FREE is the second one
 *  everybody also gets, PAID carries a price and is refused until it is
 *  owned — and nothing can be bought yet, so PAID means locked. */
export type ThemeTier = 'DEFAULT' | 'FREE' | 'PAID'

export interface NameThemeOption {
  code: NameTheme
  tier: ThemeTier
  price_cents: number | null
  /** The list's own mark, used wherever the dinner is one character wide. */
  mark: string
  owned: boolean
  /** Withdrawn while it is being worked on (0082): listed, never selectable,
   *  by anybody — Crème and ownership do not open a paused one. */
  paused: boolean
}

export interface TableThemeOption {
  code: TableTheme
  tier: ThemeTier
  price_cents: number | null
  owned: boolean
  /** Withdrawn while it is being worked on (0082): listed, never selectable,
   *  by anybody — Crème and ownership do not open a paused one. */
  paused: boolean
}

/** Raised by create_round when a theme is named that this account cannot use. */
export const THEME_LOCKED = 'THEME_LOCKED'

/** Raised by create_round when a free dinner asks for a PRO-only setting. */
export const PRO_REQUIRED = 'PRO_REQUIRED'

/**
 * Raised by the triggers in 0079 when a dinner built on something PRO has run
 * past its cover and its three days of grace. The dinner is on hold, not gone:
 * nothing is deleted, it simply stops moving until the host renews.
 */
export const PRO_LAPSED = 'PRO_LAPSED'

/** The grace after a subscription ends, in hours. Mirrors pro_grace() in
 *  0079 — the client only uses it to say the number out loud. */
export const PRO_GRACE_HOURS = 72

/**
 * How a dinner stands against its PRO cover.
 *
 * Three states and they are genuinely different: nothing to lose (it was never
 * PRO, or it uses nothing PRO), running out soon, and on hold. Only a dinner
 * that actually uses a PRO feature can be held — see round_uses_pro in 0079
 * for why, which is that on the day the free-for-all ends every dinner ever
 * created during it would otherwise stop at once.
 */
export type ProCover = 'NONE' | 'OK' | 'ENDING' | 'HELD'

export function roundProCover(round: {
  is_pro: boolean
  pro_until: string | null
  recipes_per_brief: number
  name_theme: NameTheme
  table_theme: TableTheme
  paidNameThemes?: string[]
  paidTableThemes?: string[]
}): ProCover {
  if (!round.is_pro || round.pro_until === null) return 'NONE'
  // Mirrors round_uses_pro(). The theme tiers come from the catalogue, so the
  // caller passes them when it has them; without them the recipe count alone
  // is the honest answer this side of the wire, and the server is the
  // authority either way.
  const usesPro =
    round.recipes_per_brief > 1 ||
    (round.paidNameThemes ?? []).includes(round.name_theme) ||
    (round.paidTableThemes ?? []).includes(round.table_theme)
  if (!usesPro) return 'NONE'

  const until = new Date(round.pro_until).getTime()
  const now = Date.now()
  if (until <= now) return 'HELD'
  // A fortnight is the window where saying something is useful rather than
  // nagging: long enough to renew without hurrying, short enough that the
  // dinner it is about is real.
  return until - now < 14 * 24 * 3600 * 1000 ? 'ENDING' : 'OK'
}

/**
 * How long until a subscription ends, in days, or null when it does not.
 *
 * The two moments worth interrupting somebody about are a month out and a week
 * out — far enough to act, close enough to matter — and everything between is
 * silence. A banner that appears the day after you subscribe is a banner
 * people learn to look past.
 */
export function proWarningLevel(status: ProStatus | null | undefined): 'MONTH' | 'WEEK' | null {
  if (!status || status.window_open || !status.expires_at) return null
  const days = (new Date(status.expires_at).getTime() - Date.now()) / (24 * 3600 * 1000)
  if (days < 0) return null
  if (days <= 7) return 'WEEK'
  if (days <= 30) return 'MONTH'
  return null
}

/**
 * What PRO is, for this account, right now (0075).
 *
 * `window_open` is the thing to read first: while the free-for-all is on,
 * `pro` is true for everybody and means nothing about whether they have paid.
 * Every screen that says "you have PRO" has to say which of the two it is, or
 * it is setting up a disappointment for the day the window shuts.
 */
export interface ProStatus {
  pro: boolean
  window_open: boolean
  window_until: string | null
  source: 'PURCHASE' | 'CODE' | 'GRANT' | null
  expires_at: string | null
  test_override: 'FORCE_ON' | 'FORCE_OFF' | null
}

export async function myProStatus() {
  const res = await supabase.rpc('my_pro_status', {})
  const rows = unwrap<ProStatus[]>(res)
  return rows[0] ?? null
}

/** Test-period only, and the server refuses it once the window shuts — see
 *  0075 for why a switch that outlives its window is a hole. */
export const TEST_WINDOW_CLOSED = 'TEST_WINDOW_CLOSED'

export async function setProTestOverride(mode: 'FORCE_ON' | 'FORCE_OFF' | null) {
  const res = await supabase.rpc('set_pro_test_override', { p_mode: mode })
  return unwrap(res)
}

/** Both refusals a code can give. Everything else — no such code, expired,
 *  used up — comes back as INVALID_CODE on purpose: distinguishing them would
 *  turn the field into an oracle for guessing the format of real ones. */
export const INVALID_CODE = 'INVALID_CODE'
export const ALREADY_REDEEMED = 'ALREADY_REDEEMED'

/** Returns what was handed over: 'PRO', 'NAME_THEME' or 'TABLE_THEME'. */
export async function redeemCode(code: string) {
  const res = await supabase.rpc('redeem_code', { p_code: code })
  return unwrap<string>(res)
}

export async function listNameThemes() {
  const res = await supabase.rpc('list_name_themes', {})
  return unwrap<NameThemeOption[]>(res)
}

export async function listTableThemes() {
  const res = await supabase.rpc('list_table_themes', {})
  return unwrap<TableThemeOption[]>(res)
}

export type RoundAnonymity = 'ANONYMOUS' | 'SPY' | 'OPEN'

/**
 * Whether this reader is entitled to real names on this round.
 *
 * The mirror of `names_are_open` in 0073, and kept in step with it by hand —
 * the cost of not asking the database, worth paying because the answer is two
 * columns the round row already carries and the alternative is a round-trip on
 * every screen that prints a name.
 *
 * The server is still the authority: every function that returns a name asks
 * the SQL version before it sends one, so the worst this can do when it drifts
 * is print a pseudonym where a real name was available. It can never invent a
 * name that was not sent.
 */
export function namesAreOpen(
  round: { anonymity: RoundAnonymity; status: RoundStatus },
  isHost: boolean,
) {
  return (
    round.anonymity === 'OPEN' ||
    (round.anonymity === 'SPY' && isHost) ||
    round.status === 'RESULTS' ||
    round.status === 'ARCHIVED' ||
    round.status === 'CANCELLED'
  )
}

// Not whether voting happens, but how. LIVE = the host opens it during dinner
// and publishes results when ready; TIMED = a deadline publishes them itself;
// MANUAL = hands up at the table; DISABLED = no voting.
//
// None of the four is final. DISABLED used to be — set_voting_mode refused to
// leave it — and 0078 took that door out: what actually needs protecting is a
// ballot somebody has already cast, and that is guarded separately.
export type VotingMode = 'LIVE' | 'TIMED' | 'DISABLED' | 'MANUAL'
export type SlotMode = 'FREE' | 'CATEGORIES'
export type RoundStatus =
  | 'DRAFT' | 'OPEN' | 'LOCKED' | 'ASSIGNED' | 'BRIEFS_CLOSED'
  | 'DINNER' | 'VOTING' | 'RESULTS' | 'ARCHIVED' | 'CANCELLED'

export type DietaryKind = 'ALLERGY_SEVERE' | 'ALLERGY_MILD' | 'DIET' | 'DISLIKE'

export interface DietaryEntryInput {
  kind: DietaryKind
  label: string
  note?: string
}

/**
 * The one error worth translating before anything else sees it.
 *
 * PostgREST answers `PGRST202` — "Could not find the function public.x in the
 * schema cache" — whenever the function is not there *for the role asking*.
 * From the browser that is almost never a typo in the name: it means the app is
 * talking to a database that has not run the migration the function arrives in.
 * Locally that is `.env.local` still pointing at the deployed project; in
 * production it is a deploy that went out ahead of its migrations.
 *
 * Left raw it reads like a bug in the code, and the search for it starts in
 * exactly the wrong place — which is an hour, every time. So it is named here,
 * once, at the only choke point every RPC in this file passes through.
 */
export const DATABASE_BEHIND = 'DATABASE_BEHIND'

function unwrap<T>({ data, error }: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (error) {
    if (error.code === 'PGRST202') {
      // Announced as well as thrown. Every call site already renders
      // `err.message` somewhere sensible, but this particular failure is not
      // about the screen it happened on — it is about the whole app pointing at
      // the wrong database — so it also raises a banner that outlives the page
      // you were on when you found it.
      window.dispatchEvent(new CustomEvent(DATABASE_BEHIND, { detail: error.message }))
      throw new Error(`${DATABASE_BEHIND}: ${error.message}`)
    }
    throw new Error(error.message)
  }
  return data as T
}

// Is this public name still free? Authenticated-only by design (0046), and
// advisory by nature: the answer can go stale between the keystroke and the
// submit, which is why complete_signup checks again and the unique index
// checks after that.
export async function displayNameAvailable(name: string): Promise<boolean> {
  const res = await supabase.rpc('display_name_available', { p_name: name })
  return unwrap<boolean>(res)
}

// The four moments that earn an interruption (0048). Everything else the round
// does — dinner starting, a setting changed, a phase nudged back — is silent on
// purpose: a notification nobody acts on teaches people to ignore the ones that
// matter. The two remaining emails (password reset, address change) are Auth's
// and are not part of this at all.
export type NotifiedMoment = 'ASSIGNED' | 'BRIEF_RECEIVED' | 'VOTING' | 'RESULTS'

const NOTIFIED_PHASES: Partial<Record<RoundStatus, NotifiedMoment>> = {
  ASSIGNED: 'ASSIGNED',
  VOTING: 'VOTING',
  RESULTS: 'RESULTS',
}

// Never awaited at the call site and silent on failure: the phase has already
// changed by the time this runs, and a dinner must not look like it failed to
// advance because a push service was slow. A phase nobody is notified about
// does not even reach the network.
export async function notifyRoundPhase(roundId: string, phase: RoundStatus) {
  const moment = NOTIFIED_PHASES[phase]
  if (!moment) return
  await notify(roundId, moment)
}

// Sent by the author the moment they submit, because since 0035 the recipe
// lands then rather than at a phase change. Who it reaches is resolved from the
// chain server-side — the sender neither names their cook nor learns of them.
export async function notifyMyCook(roundId: string) {
  await notify(roundId, 'BRIEF_RECEIVED')
}

// The two at the door (0052), addressed by membership rather than by round:
// joining hands back a membership id, and approving is about one person. Which
// of "asked to join" and "took a seat" this was is decided in the database from
// the seat itself, not guessed here.
export async function notifyHostOfArrival(memberId: string) {
  await notifyMember(memberId, 'JOIN_REQUESTED')
}

export async function notifyApproved(memberId: string) {
  await notifyMember(memberId, 'JOIN_APPROVED')
}

async function notifyMember(memberId: string, kind: 'JOIN_REQUESTED' | 'JOIN_APPROVED') {
  try {
    await supabase.functions.invoke('send-push', { body: { member_id: memberId, kind } })
  } catch {
    // Same posture as the rest: the door already opened.
  }
}

// The mirror image of the four moments (0059): those exclude whoever caused
// them, this one is the host and only the host. Fired by whoever caused the
// alert — reporting a phrase, backing out of a dish — and silent on failure
// like the rest, because the alert is already in the table whether or not a
// push service was reachable.
export async function notifyHostOfAlert(roundId: string) {
  try {
    await supabase.functions.invoke('send-push', { body: { round_id: roundId, kind: 'HOST_ALERT' } })
  } catch {
    // The alert is recorded. The interruption is a courtesy.
  }
}

async function notify(roundId: string, kind: NotifiedMoment) {
  try {
    await supabase.functions.invoke('send-push', { body: { round_id: roundId, kind } })
  } catch {
    // Nothing to do here: the thing that mattered already happened.
  }
}

export async function setNotificationsEnabled(enabled: boolean) {
  const res = await supabase.rpc('set_notifications_enabled', { p_enabled: enabled })
  return unwrap(res)
}

// Erasure, asked for rather than done: the account keeps working until the
// thirty days are up, because a mis-tap has to be recoverable (0049). Returns
// the date it becomes irreversible, so the interface can say it out loud
// instead of implying "soon".
export async function requestAccountDeletion(): Promise<string> {
  const res = await supabase.rpc('request_account_deletion')
  return unwrap<string>(res)
}

export async function cancelAccountDeletion() {
  const res = await supabase.rpc('cancel_account_deletion')
  return unwrap(res)
}

// Who is actually at this table, by name, for the host alone (0053).
// Deliberately carries no pseudonym: excluding a pair is a statement about two
// people, and pairing that list with the roster's would hand the host the
// mapping the round is keeping from them.
export interface RoundPerson {
  member_id: string
  display_name: string
}

export async function listRoundPeople(roundId: string): Promise<RoundPerson[]> {
  const res = await supabase.rpc('list_round_people', { p_round_id: roundId })
  return unwrap<RoundPerson[]>(res)
}

// Web push subscriptions. Writes go through RPCs rather than a table policy
// because the endpoint is a claim about a browser, and an insert policy would
// let a client claim somebody else's (0047).
export async function savePushSubscription(input: {
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string
}) {
  const res = await supabase.rpc('save_push_subscription', {
    p_endpoint: input.endpoint,
    p_p256dh: input.p256dh,
    p_auth: input.auth,
    p_user_agent: input.userAgent ?? null,
  })
  return unwrap(res)
}

export async function forgetPushSubscription(endpoint: string) {
  const res = await supabase.rpc('forget_push_subscription', { p_endpoint: endpoint })
  return unwrap(res)
}

// What the server knows about this browser, without the server having to hand
// back the keys that would let anything push to it (0056). `this_device` is the
// answer to the question that matters — the browser is holding a subscription,
// did it ever arrive here? — and `devices` separates "nothing works" from
// "nothing works on THIS phone".
export interface MyPushDevices {
  this_device: boolean
  devices: number
  last_seen: string | null
}

export async function myPushDevices(endpoint: string | null): Promise<MyPushDevices> {
  const res = await supabase.rpc('my_push_devices', { p_endpoint: endpoint })
  const rows = unwrap<MyPushDevices[]>(res)
  return rows[0] ?? { this_device: false, devices: 0, last_seen: null }
}

export interface TestPushResult {
  sent: number
  audience: number
  pruned?: number
  reason?: string
  notifications_enabled?: boolean
}

/**
 * The one push in this app that goes to the person who asked for it.
 *
 * Loud on failure, unlike every other notify() here. Those are fired at a
 * moment that has already happened and must never make a dinner look broken,
 * so they swallow everything — which is correct, and is also exactly why
 * "nothing arrives" has been impossible to diagnose: the six ways it can fail
 * server-side all look identical from a phone that stays quiet.
 *
 * This one is called by somebody staring at the screen waiting for it, so
 * every failure comes back with its own words, including the one hiding
 * inside a non-2xx body (the client SDK gives you a FunctionsHttpError and
 * keeps the response — 'send-push is not configured' lives in there, and it
 * is the single most likely answer).
 */
export async function sendTestPush(): Promise<TestPushResult> {
  // The body-reading that used to live here is now in invokeFunction, because
  // it was never specific to this call: every Edge Function in this app
  // answers with `{ error }` and the SDK discards all of them the same way.
  return await invokeFunction<TestPushResult>('send-push', { kind: 'TEST' })
}

export async function completeSignup(input: {
  displayName: string
  locale: string
  hasNoRestrictions: boolean
  dietaryEntries: DietaryEntryInput[]
}) {
  const res = await supabase.rpc('complete_signup', {
    p_display_name: input.displayName,
    p_locale: input.locale,
    p_has_no_restrictions: input.hasNoRestrictions,
    p_dietary_entries: input.hasNoRestrictions ? [] : input.dietaryEntries,
  })
  return unwrap(res)
}

export async function createRound(input: {
  name: string
  access: RoundAccess
  anonymity: RoundAnonymity
  slotMode?: SlotMode
  maxPlayers?: number | null
  dinnerAt?: string | null
  timezone?: string
  location?: string | null
  allowMutualPairs?: boolean
  requiresApproval?: boolean
  votingMode?: VotingMode
  nameTheme?: NameTheme
  tableTheme?: TableTheme
  recipesPerBrief?: number
}) {
  const res = await supabase.rpc('create_round', {
    p_name: input.name,
    p_access: input.access,
    p_anonymity: input.anonymity,
    p_slot_mode: input.slotMode ?? 'FREE',
    p_max_players: input.maxPlayers ?? null,
    p_dinner_at: input.dinnerAt ?? null,
    p_timezone: input.timezone ?? 'Europe/Paris',
    p_location: input.location ?? null,
    p_allow_mutual_pairs: input.allowMutualPairs ?? false,
    p_requires_approval: input.requiresApproval ?? true,
    p_voting_mode: input.votingMode ?? 'LIVE',
    p_name_theme: input.nameTheme ?? 'FOOD',
    p_table_theme: input.tableTheme ?? 'CHECKS',
    p_recipes_per_brief: input.recipesPerBrief ?? 1,
  })
  return unwrap<string>(res) // round id
}

// Host-only, and only on a SPY round — the RPC refuses outright anywhere
// else, so this can't leak by being called on the wrong round.
export interface MemberIdentity {
  member_id: string
  real_name: string
}

export async function getMemberIdentities(roundId: string) {
  const res = await supabase.rpc('get_member_identities', { p_round_id: roundId })
  return unwrap<MemberIdentity[]>(res)
}

// Raised by invite_member when nobody goes by that username. Surfaced as a
// named constant rather than prose so the UI can say "no chef by that name"
// in the user's own language.
export const NO_SUCH_CHEF = 'NO_SUCH_CHEF'

/** Raised when the round's access is CODE: there is no guest list to add to. */
export const NOT_BY_INVITATION = 'NOT_BY_INVITATION'

// By username, not by email (0071). The address was the one thing about an
// account its owner never chose to show anyone; `display_name` has been a
// unique identity since 0046 and is the name they picked themselves.
export async function inviteMember(roundId: string, username: string) {
  const res = await supabase.rpc('invite_member', { p_round_id: roundId, p_username: username })
  return unwrap<string>(res) // invitation id
}

export interface RoundInvitation {
  invitation_id: string
  round_id: string
  round_name: string
  accent_emoji: string
  invited_day: string
}

// The round's name comes back with the invitation because an invitee is
// not a member yet and cannot read `rounds` — without it they'd be looking
// at an invitation to a dinner they can't see the name of.
export async function getMyInvitations() {
  const res = await supabase.rpc('get_my_invitations', {})
  return unwrap<RoundInvitation[]>(res)
}

export async function respondToInvitation(invitationId: string, accept: boolean) {
  const res = await supabase.rpc('respond_to_invitation', {
    p_invitation_id: invitationId,
    p_accept: accept,
  })
  return unwrap<string | null>(res) // member id when accepted
}

// Mirrors v_forward_order in advance_phase (supabase/migrations/0006_phases.sql,
// extended by 0013_optional_voting.sql) — kept in one place so the frontend
// never has to re-derive "what's the next/previous phase" independently in
// more than one screen.
export const ROUND_PHASE_ORDER: RoundStatus[] = [
  'DRAFT', 'OPEN', 'LOCKED', 'ASSIGNED', 'BRIEFS_CLOSED', 'DINNER', 'VOTING', 'RESULTS', 'ARCHIVED',
]

// BRIEFS_CLOSED is gone from the journey (0035): a recipe reaches its cook the
// moment it is submitted, so a phase whose only job was "everyone has finished
// writing" was making the whole table wait for the slowest writer and then for
// the host to notice. The enum value survives in Postgres so rounds already
// parked there keep working; it is simply never somewhere new rounds are sent,
// and advance_phase steps over it in both directions.
const SKIPPED_PHASES: RoundStatus[] = ['BRIEFS_CLOSED']

export function visiblePhaseOrder(votingEnabled: boolean): RoundStatus[] {
  return ROUND_PHASE_ORDER.filter(
    (p) => !SKIPPED_PHASES.includes(p) && (votingEnabled || p !== 'VOTING'),
  )
}

// A round already parked in a skipped phase is not on the visible list, so
// indexOf would say -1 and strand it. Fall back to its position in the full
// order and pick the nearest visible neighbour in the direction asked for.
function neighbourPhase(
  status: RoundStatus,
  votingEnabled: boolean,
  direction: 1 | -1,
): RoundStatus | null {
  const order = visiblePhaseOrder(votingEnabled)
  const idx = order.indexOf(status)
  if (idx >= 0) {
    const next = idx + direction
    return next >= 0 && next < order.length ? order[next] : null
  }

  const full = ROUND_PHASE_ORDER.indexOf(status)
  if (full < 0) return null
  return (
    (direction === 1
      ? order.find((p) => ROUND_PHASE_ORDER.indexOf(p) > full)
      : [...order].reverse().find((p) => ROUND_PHASE_ORDER.indexOf(p) < full)) ?? null
  )
}

export function nextPhaseFor(status: RoundStatus, votingEnabled: boolean): RoundStatus | null {
  return neighbourPhase(status, votingEnabled, 1)
}

export function previousPhaseFor(status: RoundStatus, votingEnabled: boolean): RoundStatus | null {
  return neighbourPhase(status, votingEnabled, -1)
}

// The ticket is null on a deployment with no captcha configured (0063), where
// `join_round` asks for none — and where the Edge Function that mints them is
// not called at all.
export async function joinRound(input: { code: string; turnstileTicket: string | null }) {
  const res = await supabase.rpc('join_round', {
    p_code: input.code,
    p_turnstile_ticket: input.turnstileTicket,
  })
  return unwrap<string>(res) // round_members id
}

// What leaving costs depends on when you go (0050): before the lottery the
// seat empties on the spot; after it, this is a request the Executive Chef
// answers, and the answer decides whether the chain is reconnected.
export type LeaveOutcome = 'LEFT' | 'REQUESTED' | 'ALREADY_REQUESTED'

export async function cancelLeaveRequest(roundId: string) {
  const res = await supabase.rpc('cancel_leave_request', { p_round_id: roundId })
  return unwrap(res)
}

export async function leaveRound(roundId: string): Promise<LeaveOutcome> {
  const res = await supabase.rpc('leave_round', { p_round_id: roundId })
  return unwrap<LeaveOutcome>(res)
}

export async function approveMember(roundId: string, memberId: string) {
  const res = await supabase.rpc('approve_member', { p_round_id: roundId, p_member_id: memberId })
  return unwrap(res)
}

export async function rejectMember(roundId: string, memberId: string) {
  const res = await supabase.rpc('reject_member', { p_round_id: roundId, p_member_id: memberId })
  return unwrap(res)
}

export interface PendingMember {
  member_id: string
  real_name: string
  joined_day: string
}

// Host-only: the real names of people waiting to be let in. Not reachable
// as a plain table read — profiles_select_co_members needs both sides
// approved, so a pending member has no readable profile for anyone
// (0015_pending_member_identity.sql). Approving them ends this: from then
// on they are their secret name, to the host too.
export async function getPendingMembers(roundId: string) {
  const res = await supabase.rpc('get_pending_members', { p_round_id: roundId })
  return unwrap<PendingMember[]>(res)
}

// Feeds the Messaggi envelope's badge: messages addressed to me, across
// both of my conversations, that I haven't opened yet (0022).
export async function getUnreadCount(roundId: string) {
  const res = await supabase.rpc('get_unread_count', { p_round_id: roundId })
  return unwrap<number>(res)
}

// Stamps the other party's messages in one thread as read. Called when a
// thread is opened — a badge that clears on a timer stops meaning anything.
export async function markThreadRead(pairingId: string) {
  const res = await supabase.rpc('mark_thread_read', { p_pairing_id: pairingId })
  return unwrap(res)
}

// The cook's "seen, understood, no problem" — the answer that sits between
// silence and CANNOT_COOK, and the only way a sender learns their recipe
// landed at all.
export async function acknowledgeBrief(roundId: string) {
  const res = await supabase.rpc('acknowledge_brief', { p_round_id: roundId })
  return unwrap(res)
}

export async function transferHost(roundId: string, memberId: string) {
  const res = await supabase.rpc('transfer_host', { p_round_id: roundId, p_member_id: memberId })
  return unwrap(res)
}

export async function advancePhase(roundId: string, target: RoundStatus) {
  const res = await supabase.rpc('advance_phase', { p_round_id: roundId, p_target: target })
  return unwrap(res)
}

export async function generateAssignment(roundId: string) {
  const res = await supabase.rpc('generate_assignment', { p_round_id: roundId })
  return unwrap<number>(res) // new assignment_version
}

export async function assignmentExists(roundId: string) {
  const res = await supabase.rpc('assignment_exists', { p_round_id: roundId })
  return unwrap<boolean>(res)
}

export async function updateRoundDetails(input: {
  roundId: string
  location: string | null
  city: string | null
  notes: string | null
  dinnerAt: string | null
  timezone: string
}) {
  const res = await supabase.rpc('update_round_details', {
    p_round_id: input.roundId,
    p_location: input.location,
    p_city: input.city,
    p_notes: input.notes,
    p_dinner_at: input.dinnerAt,
    p_timezone: input.timezone,
  })
  return unwrap(res)
}

export interface RoundProgress {
  total_players: number
  briefs_submitted: number
  briefs_due_at: string | null
  missing_sender_display_names: string[] | null
}

export async function getRoundProgress(roundId: string) {
  const res = await supabase.rpc('get_round_progress', { p_round_id: roundId })
  const rows = unwrap<RoundProgress[]>(res)
  return rows[0] ?? null
}

export interface DietaryPanelEntry {
  kind: DietaryKind
  label: string
}

export async function getDietaryPanel(roundId: string) {
  const res = await supabase.rpc('get_dietary_panel', { p_round_id: roundId })
  return unwrap<DietaryPanelEntry[]>(res)
}

export type Course =
  | 'APERITIF'
  | 'SNACK'
  | 'STARTER'
  | 'FIRST'
  | 'MAIN'
  | 'SIDE'
  | 'CHEESE'
  | 'DESSERT'
  | 'DRINK'
  | 'OTHER'

/**
 * The order a meal is eaten in, which is the order a menu is printed in.
 *
 * The same order the `course` enum declares (0066), so a list the database
 * sorted and a list the client sorted agree. It lives here, once, because four
 * screens used to carry their own copy of it and adding a course meant finding
 * all four — the composer, the settings page, the recipe book's filter and the
 * results menu. Alphabetical would put the dessert second.
 */
export const COURSES: Course[] = [
  'APERITIF',
  'SNACK',
  'STARTER',
  'FIRST',
  'MAIN',
  'SIDE',
  'CHEESE',
  'DESSERT',
  'DRINK',
  'OTHER',
]

// ---------------------------------------------------------------------------
// Briefs (supabase/migrations/0007_briefs.sql)
// ---------------------------------------------------------------------------

export interface MyAssignment {
  pairing_id: string
  cook_secret_name: string
  cook_display_name: string | null
  course: Course
  slot_id: string
}

export async function getMyAssignment(roundId: string) {
  const res = await supabase.rpc('get_my_assignment', { p_round_id: roundId })
  const rows = unwrap<MyAssignment[]>(res)
  return rows[0] ?? null
}

export interface BriefIngredient {
  name: string
  quantity: number | null
  unit: string | null
}

/**
 * The recipe you were dealt — or the empty place where it will be.
 *
 * `brief_id` is null until somebody submits (0067), and every field below it is
 * null with it. The pairing and the course are true from the moment the
 * roulette runs, which is what lets the cook's page exist — and lets the
 * conversation on it exist — before the recipe does.
 */
export interface MyBrief {
  pairing_id: string
  brief_id: string | null
  /** 1, 2 or 3 — which of the sender's ideas this is (0077). */
  recipe_no: number
  /** The one being cooked. Exactly one offer per pairing carries it, and the
   *  database enforces that with a partial unique index, not a convention. */
  chosen: boolean
  dish_name: string | null
  course: Course
  procedure: string | null
  external_url: string | null
  difficulty: number | null
  est_cost: string | null
  prep_minutes: number | null
  note_to_cook: string | null
  contains_tags: string[]
  ingredients: BriefIngredient[]
  acknowledged: boolean
  /** Who wrote it, where this reader is entitled to know: an OPEN dinner, a
   *  SPY host, or any dinner that has finished (0073, wired here in 0081).
   *  Null everywhere else — and null is what the black bar in the thread is
   *  covering, which is the only honest way to redact in a browser. */
  sender_display_name: string | null
}

/**
 * Every recipe your sender offered you, and which of them is the dish.
 *
 * One row on a free dinner, up to three where the Executive Chef was PRO
 * (0077). The array shape is the honest one even at one — the caller that
 * wants "the dish" asks for it, and a caller that forgets gets a list rather
 * than silently the wrong recipe.
 */
export async function getMyBriefOffers(roundId: string) {
  const res = await supabase.rpc('get_my_brief', { p_round_id: roundId })
  return unwrap<MyBrief[]>(res)
}

/**
 * The dish, for every caller that only ever wanted the one.
 *
 * Falls back to the first row rather than to null when nothing is chosen,
 * because a pairing with nothing written still comes back as one row — the
 * LEFT join, all nulls but `pairing_id` — and several callers need exactly
 * that: the thread with the chef writing for you hangs off the pairing, and it
 * has to exist before the recipe does.
 */
export function pickChosenBrief(rows: MyBrief[]) {
  return rows.find((r) => r.chosen) ?? rows[0] ?? null
}

/** The cook picks the one that suits them. Nobody else may. */
export async function chooseBrief(briefId: string) {
  const res = await supabase.rpc('choose_brief', { p_brief_id: briefId })
  return unwrap(res)
}

/** Raised by choose_brief once the dinner is voting or over. */
export const CHOICE_CLOSED = 'CHOICE_CLOSED'

export async function saveBriefDraft(input: {
  roundId: string
  dishName: string
  course: Course
  ingredients: BriefIngredient[]
  procedure: string
  externalUrl: string | null
  difficulty: number | null
  estCost: string | null
  prepMinutes: number | null
  noteToCook: string | null
  containsTags: string[]
  containsTagsConfirmed: boolean
  /** Which of the sender's ideas this is, 1-based. Refused past the dinner's
   *  own `recipes_per_brief`, so a hand-made call cannot buy a second recipe. */
  position?: number
}) {
  const res = await supabase.rpc('save_brief_draft', {
    p_round_id: input.roundId,
    p_dish_name: input.dishName,
    p_course: input.course,
    p_ingredients: input.ingredients,
    p_procedure: input.procedure,
    p_external_url: input.externalUrl,
    p_difficulty: input.difficulty,
    p_est_cost: input.estCost,
    p_prep_minutes: input.prepMinutes,
    p_note_to_cook: input.noteToCook,
    p_position: input.position ?? 1,
    p_contains_tags: input.containsTags,
    p_contains_tags_confirmed: input.containsTagsConfirmed,
  })
  return unwrap<string>(res) // brief id
}

export async function submitBrief(roundId: string) {
  const res = await supabase.rpc('submit_brief', { p_round_id: roundId })
  return unwrap(res)
}

export interface MyBriefDraft {
  brief_id: string
  recipe_no: number
  // OFFERED is a recipe that was sent, is complete, and is not the one the
  // cook is making (0076). From the sender's side it is as final as SUBMITTED.
  status: 'DRAFT' | 'OFFERED' | 'SUBMITTED'
  dish_name: string
  course: Course
  procedure: string
  external_url: string | null
  difficulty: number | null
  est_cost: string | null
  prep_minutes: number | null
  note_to_cook: string | null
  contains_tags: string[]
  contains_tags_confirmed: boolean
  ingredients: BriefIngredient[]
}

/** All of them, lowest first. */
export async function getMyBriefDrafts(roundId: string) {
  const res = await supabase.rpc('get_my_brief_draft', { p_round_id: roundId })
  return unwrap<MyBriefDraft[]>(res)
}

// There was a `getMyBriefDraft` here — the same call, returning only the first
// row, for the callers that just want "has this person written anything?". It
// is gone on purpose. Two fetchers for one RPC meant two shapes could land
// under one React Query key, and that is precisely what emptied the screen:
// see the note above the query in RoundHomePage. A caller that wants the first
// one takes the first one, at the call site, where it is visible.

/** A second idea thought better of. Drafts only — an offer already in front of
 *  the cook is not the sender's to withdraw. */
export async function discardBriefDraft(roundId: string, position: number) {
  const res = await supabase.rpc('discard_brief_draft', {
    p_round_id: roundId,
    p_position: position,
  })
  return unwrap(res)
}

// ---------------------------------------------------------------------------
// Chat (supabase/migrations/0008_chat.sql)
// ---------------------------------------------------------------------------

// BOARD is the odd one out: those phrases go to the whole table through
// round_messages rather than to one pairing, so they must be filtered OUT
// of the thread pickers and IN on the board (0030).
export type MessageCategory =
  | 'CLARIFICATION' | 'SUBSTITUTION' | 'NUDGE' | 'CANNOT_COOK' | 'NO_BRIEF' | 'THANKS' | 'REPLY'
  | 'BOARD'
export type MessageSlotType = 'NONE' | 'INGREDIENT' | 'SHORT_TEXT'
export type MessageDirection = 'SENDER_TO_COOK' | 'COOK_TO_SENDER'

export interface MessageTemplate {
  id: string
  category: MessageCategory
  locale: string
  body: string
  slot_type: MessageSlotType
  // Only offered on the day itself (0037). "I'm running 30 minutes late" is
  // useless in the week before and would only lengthen the roller.
  day_of: boolean
}

export async function getMessageTemplates(locale: string) {
  const { data, error } = await supabase
    .from('message_templates')
    .select('id,category,locale,body,slot_type,day_of')
    .eq('locale', locale)
    .eq('active', true)
    // The Executive Chef's notices are BOARD phrases like any other and must
    // never be in a list somebody can pick from (0080). Filtered here as well
    // as refused in post_host_notice: this is the half that keeps them out of
    // sight, the server is the half that keeps them out of the table.
    .eq('host_only', false)
  if (error) throw new Error(error.message)
  return (data ?? []) as MessageTemplate[]
}

export async function sendMessage(input: { pairingId: string; templateId: string; slotValue: string | null }) {
  const res = await supabase.rpc('send_message', {
    p_pairing_id: input.pairingId,
    p_template_id: input.templateId,
    p_slot_value: input.slotValue,
  })
  const rows = unwrap<{ message_id: string; created_day: string }[]>(res)
  return rows[0]
}

export interface ThreadMessage {
  message_id: string
  direction: MessageDirection
  category: MessageCategory
  body: string
  slot_value: string | null
  created_day: string
  read_at: string | null
  reported: boolean
  is_mine: boolean
  other_party_secret_name: string | null
  other_party_display_name: string | null
}

export async function getThread(pairingId: string) {
  const res = await supabase.rpc('get_thread', { p_pairing_id: pairingId })
  return unwrap<ThreadMessage[]>(res)
}

export async function reportMessage(messageId: string, roundId?: string) {
  const res = await supabase.rpc('report_message', { p_message_id: messageId })
  // Not awaited: reporting has already happened, and it must not appear to have
  // failed because a push service was slow (0059).
  if (roundId) void notifyHostOfAlert(roundId)
  return unwrap(res)
}

export interface ReportedMessage {
  message_id: string
  pairing_id: string
  direction: MessageDirection
  category: MessageCategory
  body: string
  slot_value: string | null
  created_day: string
  // The seat, and the name it wore that evening (0059). Enough to warn and
  // enough to remove; deliberately not enough to know who it was.
  author_member_id: string
  author_secret_name: string | null
  // Present only where this host is entitled to it: a SPY or OPEN round, or
  // one that has finished (0073). Warning somebody is the start of talking to
  // a person, and on those rounds the host may know which one.
  author_display_name: string | null
  already_warned: boolean
}

export async function getReportedMessages(roundId: string) {
  const res = await supabase.rpc('get_reported_messages', { p_round_id: roundId })
  return unwrap<ReportedMessage[]>(res)
}

// ---------------------------------------------------------------------------
// Voting (supabase/migrations/0009_voting.sql)
// ---------------------------------------------------------------------------

export interface BallotOption {
  brief_id: string
  dish_name: string
  course: Course
  difficulty: number | null
  est_cost: string | null
  prep_minutes: number | null
}

export async function getBallotOptions(roundId: string) {
  const res = await supabase.rpc('get_ballot_options', { p_round_id: roundId })
  return unwrap<BallotOption[]>(res)
}

export interface BallotItemInput {
  brief_id: string
  rank: number
  originality_score?: number | null
  brief_respect_score?: number | null
}

export async function submitBallot(roundId: string, items: BallotItemInput[]) {
  const res = await supabase.rpc('submit_ballot', { p_round_id: roundId, p_items: items })
  return unwrap<string>(res) // ballot id
}

export interface RoundResult {
  brief_id: string
  dish_name: string
  course: Course
  borda_points: number
  avg_rank: number | null
  first_places: number
  // Null for a dish that never reached the table: there is no rank to give a
  // dish nobody could vote on (0057).
  final_rank: number | null
  award_keys: string[]
  served: boolean
}

export async function getResults(roundId: string) {
  const res = await supabase.rpc('get_results', { p_round_id: roundId })
  return unwrap<RoundResult[]>(res)
}

// ---------------------------------------------------------------------------
// The recipe book (supabase/migrations/0058_the_recipe_book.sql)
// ---------------------------------------------------------------------------

// What a dish was to you that evening. "Received" alone loses half of what a
// person made: the recipe you wrote and the recipe you cooked are two
// different things and the book labels them differently.
export type SavedRelation = 'COOKED' | 'WROTE' | 'TABLE'

export interface RoundRecipe {
  brief_id: string
  dish_name: string
  course: Course
  procedure: string
  external_url: string | null
  contains_tags: string[]
  ingredients: BriefIngredient[]
  author_secret_name: string | null
  // Null once that account has been erased. The card says "Former guest",
  // which is what erasure is for.
  author_display_name: string | null
  relation: SavedRelation
  already_saved: boolean
}

// The deliberate exposure (0058): every submitted recipe of one finished round,
// to its members. Nothing else in this app has ever read somebody else's brief.
export async function listRoundRecipes(roundId: string) {
  const res = await supabase.rpc('list_round_recipes', { p_round_id: roundId })
  return unwrap<RoundRecipe[]>(res)
}

// Returns how many rows were actually written, which is not always how many
// were asked for: anything already in the book is skipped rather than
// duplicated, and the sentence on screen reports what came back so it and the
// book cannot disagree.
export async function saveRecipes(roundId: string, briefIds: string[]): Promise<number> {
  const res = await supabase.rpc('save_recipes', { p_round_id: roundId, p_brief_ids: briefIds })
  return unwrap<number>(res)
}

export interface SavedRecipe {
  id: string
  source_brief_id: string | null
  round_id: string | null
  round_name: string
  dinner_at: string | null
  dish_name: string
  course: Course
  ingredients: BriefIngredient[]
  procedure: string
  external_url: string | null
  contains_tags: string[]
  author_display_name: string | null
  author_secret_name: string | null
  relation: SavedRelation
  note: string | null
  saved_at: string
  // False once the dinner it came from is gone. "This is the last copy" and
  // "you can save it again" are different sentences, and only one is true at
  // a time.
  origin_exists: boolean
}

export async function listMyRecipes() {
  const res = await supabase.rpc('list_my_recipes')
  return unwrap<SavedRecipe[]>(res)
}

export async function forgetRecipe(id: string) {
  const res = await supabase.rpc('forget_recipe', { p_id: id })
  return unwrap(res)
}

export async function markDishDelivery(roundId: string, briefId: string, delivered: boolean) {
  const res = await supabase.rpc('mark_dish_delivery', {
    p_round_id: roundId,
    p_brief_id: briefId,
    p_delivered: delivered,
  })
  return unwrap(res)
}

// ---------------------------------------------------------------------------
// Chain / manual assignment editing (supabase/migrations/0005_assignment.sql)
// ---------------------------------------------------------------------------

export interface ChainLink {
  sender_member_id: string
  sender_secret_name: string
  sender_display_name: string | null
  cook_member_id: string
  cook_secret_name: string
  cook_display_name: string | null
  slot_id: string
  course: Course
  lap: number
}

export async function getChain(roundId: string) {
  const res = await supabase.rpc('get_chain', { p_round_id: roundId })
  return unwrap<ChainLink[]>(res)
}

export async function setPairing(roundId: string, senderId: string, cookId: string) {
  const res = await supabase.rpc('set_pairing', { p_round_id: roundId, p_sender_id: senderId, p_cook_id: cookId })
  return unwrap(res)
}

// PostgREST surfaces a raised Postgres exception's MESSAGE text as
// error.message — splice_member/remove_member deliberately raise
// message = 'SPLICE_REQUIRES_CONFIRMATION' / 'REMOVE_REQUIRES_CONFIRMATION'
// (errcode P0001) so the frontend can recognise "needs a second, explicit
// confirm" without string-matching human-readable prose.
export const SPLICE_REQUIRES_CONFIRMATION = 'SPLICE_REQUIRES_CONFIRMATION'
export const REMOVE_REQUIRES_CONFIRMATION = 'REMOVE_REQUIRES_CONFIRMATION'

export async function spliceMember(roundId: string, memberId: string, confirmDishChange = false) {
  const res = await supabase.rpc('splice_member', {
    p_round_id: roundId,
    p_member_id: memberId,
    p_confirm_dish_change: confirmDishChange,
  })
  return unwrap(res)
}

// COLLAPSE reconnects the chain around the departing member (everyone keeps
// a dish, but the next cook is handed a different recipe); LEAVE changes
// nothing but the roster (nobody is disturbed, one dish goes uncooked).
// Only meaningful once an assignment exists — before that both behave the
// same. See 0016_removal_mode.sql.
export type RemovalMode = 'COLLAPSE' | 'LEAVE'

export async function removeMember(
  roundId: string,
  memberId: string,
  confirmDishChange = false,
  mode: RemovalMode = 'COLLAPSE',
) {
  const res = await supabase.rpc('remove_member', {
    p_round_id: roundId,
    p_member_id: memberId,
    p_confirm_dish_change: confirmDishChange,
    p_mode: mode,
  })
  return unwrap(res)
}

// ---------------------------------------------------------------------------
// Host alerts — direct table access (host_alerts has a host-scoped
// select/update grant + RLS policy, no dedicated RPC needed; see
// supabase/migrations/0014_brief_pairing_and_alerts.sql).
// ---------------------------------------------------------------------------

/**
 * WHAT HAPPENED, NOT WHICH ENUM VALUE IT WAS FILED UNDER.
 *
 * `host_alerts.kind` has five values and the app raises twelve different
 * events, because adding to a Postgres enum is a one-way door and the writing
 * side was right to avoid it: seven of them are stored as OTHER with the real
 * type in the payload. This union is the reading side of that — one name per
 * thing that can actually happen, resolved in SQL by
 * get_host_alerts_detailed (0080).
 *
 * UNKNOWN is not paranoia. A payload written by a migration this client has
 * never heard of has to land somewhere that can still be read and resolved.
 */
export type HostAlertType =
  | 'CANNOT_COOK'
  | 'NO_BRIEF'
  | 'DROPOUT'
  | 'ACCOUNT_CLOSED'
  | 'REPORTED_PRIVATE'
  | 'REPORTED_FRIDGE'
  | 'REPORTED_PHOTO'
  | 'ENTER_REQUEST'
  | 'LATE_ENTRY_CHAIN'
  | 'CLOSED_CHAIN'
  | 'ORFAN_MEAL'
  | 'ALLERGY_ALERT'
  | 'UNKNOWN'

export interface HostAlertDetail {
  alert_id: string
  alert_type: HostAlertType
  happened_at: string
  /** The seat the alert is about, as a pseudonym — or a real name at the door,
   *  where nobody has taken a seat yet and the host is entitled to know who is
   *  asking. */
  who: string | null
  /** The other half of a pair, when the event has two sides. */
  counterpart: string | null
  /** The seat to act on: approve it, warn it. Null when there is nothing to do
   *  to anybody. */
  seat_id: string | null
  /** The phrase a warning or a reveal is about. Only ever set for a message in
   *  a private thread: a fridge phrase lives in another table, and a warning
   *  records a `messages` id or nothing. */
  seat_message_id: string | null
  seat_pairing_id: string | null
  seat_photo_id: string | null
  photo_path: string | null
  /** What was said, in the reader's language, slot already filled in. */
  phrase: string | null
  dish: string | null
  /** The method, on CANNOT_COOK only: whether a refusal is fair is not a
   *  question anybody can answer without reading the recipe. */
  recipe: string | null
  labels: string[] | null
  already_warned: boolean
  /** Has it sorted itself out? The pair have spoken since, the person at the
   *  door is already in, the photograph is already down. */
  answered: boolean
}

export async function getHostAlertsDetailed(roundId: string) {
  const res = await supabase.rpc('get_host_alerts_detailed', { p_round_id: roundId })
  return unwrap<HostAlertDetail[]>(res)
}

/** The two things the Executive Chef can say to the whole table (0080). Fixed
 *  keys rather than a phrase id: a button means one thing. */
export type HostNotice = 'HOST_RECIPE_REVIEW' | 'HOST_ALLERGEN_CARE'

/** Raised when the same notice is already an hour old or less. A double press
 *  should not read as the host shouting. */
export const NOTICE_ALREADY_POSTED = 'NOTICE_ALREADY_POSTED'

export async function postHostNotice(roundId: string, key: HostNotice) {
  const res = await supabase.rpc('post_host_notice', { p_round_id: roundId, p_key: key })
  return unwrap(res)
}

/**
 * When a finished dinner deletes itself (0062).
 *
 * Twenty-one days from the moment it finished, not from the evening: a host who
 * takes a fortnight to publish the results should not find it gone the day they
 * do. Derived here from the same number the database uses rather than fetched,
 * because it is one addition and a round trip for it would be silly — but the
 * number lives in `round_deletes_at` in SQL, and if the policy ever changes,
 * both have to move.
 */
export const ROUND_KEPT_DAYS = 21

export function roundDeletesAt(finishedAt: string | null): Date | null {
  if (!finishedAt) return null
  const at = new Date(finishedAt)
  if (Number.isNaN(at.getTime())) return null
  return new Date(at.getTime() + ROUND_KEPT_DAYS * 24 * 60 * 60 * 1000)
}

// ---------------------------------------------------------------------------
// Shared costs (supabase/migrations/0065_shared_costs.sql)
// ---------------------------------------------------------------------------

export type CostMode = 'NONE' | 'SHARED'

/**
 * Money is integer cents, everywhere, all the way to the input box.
 *
 * A float would be fine for a while and then be wrong by a cent in a way nobody
 * could reproduce, on the one screen where being wrong by a cent is the whole
 * of what people notice.
 */
export function toCents(text: string): number | null {
  const cleaned = text.trim().replace(',', '.')
  if (cleaned === '') return null
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null
  return Math.round(Number(cleaned) * 100)
}

export function fromCents(cents: number, locale = 'en', currency = 'EUR'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100)
}

/** Raised when a live round is asked to start or stop splitting costs. The
 *  rule is settled at creation (0074) — only the number moves after that. */
export const MODE_SETTLED = 'MODE_SETTLED'

export async function setCostSettings(input: {
  roundId: string
  mode: CostMode
  budgetPerHead: number | null
  currency?: string
}) {
  const res = await supabase.rpc('set_cost_settings', {
    p_round_id: input.roundId,
    p_mode: input.mode,
    p_budget_per_head: input.budgetPerHead,
    p_currency: input.currency ?? 'EUR',
  })
  return unwrap(res)
}

/**
 * The number, on its own, for the whole life of the dinner (0074).
 *
 * Separate from setCostSettings because they are separate decisions: whether
 * the table splits at all is a deal struck before anybody shops, and the
 * ceiling is a thing that moves when the fish turns out to be expensive. Null
 * is a real answer — "we're splitting, with no ceiling".
 */
export async function setBudgetPerHead(roundId: string, budgetPerHead: number | null) {
  const res = await supabase.rpc('set_budget_per_head', {
    p_round_id: roundId,
    p_budget_per_head: budgetPerHead,
  })
  return unwrap(res)
}

export async function recordExpense(roundId: string, amountCents: number, note?: string | null) {
  const res = await supabase.rpc('record_expense', {
    p_round_id: roundId,
    p_amount_cents: amountCents,
    p_note: note ?? null,
  })
  return unwrap(res)
}

/**
 * What everybody may see while the dinner is running.
 *
 * Your own number, the table's total and average, and the budget — and
 * deliberately no per-person list. The steering signal without the comparison:
 * "everyone is around twelve and I am at thirty-five" is useful, "Marta is at
 * thirty-five" starts an argument at a table she is sitting at.
 */
export interface CostsSoFar {
  currency: string
  budget_per_head: number | null
  my_spend_cents: number
  total_cents: number
  average_cents: number
  people: number
  reported: number
}

export async function costsSoFar(roundId: string) {
  const res = await supabase.rpc('costs_so_far', { p_round_id: roundId })
  const rows = unwrap<CostsSoFar[]>(res)
  return rows[0] ?? null
}

export interface Settlement {
  member_id: string
  who: string
  is_me: boolean
  spent_cents: number
  share_cents: number
  // Positive: owed. Negative: owes. They sum to exactly zero.
  balance_cents: number
}

export async function settleCosts(roundId: string) {
  const res = await supabase.rpc('settle_costs', { p_round_id: roundId })
  return unwrap<Settlement[]>(res)
}

// ---------------------------------------------------------------------------
// The album (supabase/migrations/0060_the_album.sql)
// ---------------------------------------------------------------------------

export interface DinnerPhoto {
  id: string
  storage_path: string
  caption: string | null
  // A real name, not a pseudonym (0068). The table is already told in words who
  // holds the camera, so a pseudonym here would sit one line from that person's
  // real name and hand over the mapping the anonymity exists to protect.
  taken_by: string | null
  is_mine: boolean
  reported: boolean
  hidden: boolean
  // Already in your album, so the add control comes back pressed rather than
  // inviting somebody to keep the same picture twice.
  already_saved: boolean
  created_at: string
}

/** One line of the menu that was eaten, as the album prints it (0068). */
export interface AlbumMenuLine {
  course: Course
  dish: string
}

/**
 * One evening in your album — a **copy**, made when you pressed add (0068).
 *
 * Nothing arrives here by itself, and nothing here can be rewritten under you:
 * the dinner can be purged and the photographer can swap the picture out, and
 * what you kept stays what you kept. Same story as a recipe in the book (0058).
 */
export interface AlbumEntry {
  id: string
  // Null once the dinner has been deleted (0062). The photograph and the
  // evening's name survive it; there is simply nothing left behind it.
  round_id: string | null
  round_name: string
  dinner_at: string | null
  storage_path: string
  caption: string | null
  taken_by_name: string | null
  dinner_exists: boolean
  // The evening itself: what was on the table, in the order it was eaten. The
  // live menu while the dinner exists, the copy afterwards — which is what lets
  // an album outlive everything it came from.
  menu: AlbumMenuLine[]
  saved_at: string
}

/**
 * Raised by `record_photo` for anybody but the chef holding the camera — the
 * Executive Chef included, once they have handed it over.
 */
export const NOT_THE_PHOTOGRAPHER = 'NOT_THE_PHOTOGRAPHER'

/** Host-only. Real names, no seats and no pseudonyms — see 0068 part 2. */
export interface TableChef {
  profile_id: string
  real_name: string
}

export async function listTableChefs(roundId: string) {
  const res = await supabase.rpc('list_table_chefs', { p_round_id: roundId })
  return unwrap<TableChef[]>(res)
}

/**
 * Who holds the camera, to anybody at the table.
 *
 * Answers the right rather than the column: with nothing handed over it names
 * the host, because that is who may actually do it.
 */
export async function getPhotographer(roundId: string) {
  const res = await supabase.rpc('get_photographer', { p_round_id: roundId })
  const rows = unwrap<TableChef[]>(res)
  return rows[0] ?? null
}

/**
 * Hand the camera over, or take it back. While it is handed over the host
 * cannot take or replace the photograph — a right two people hold at once is a
 * suggestion, not a handover.
 */
export async function setPhotographer(roundId: string, profileId: string | null) {
  const res = await supabase.rpc('set_photographer', {
    p_round_id: roundId,
    p_profile_id: profileId,
  })
  return unwrap(res)
}

/** Keep this picture. The one act that puts anything in an album. */
export async function savePhoto(photoId: string) {
  const res = await supabase.rpc('save_photo', { p_photo_id: photoId })
  return unwrap<string>(res)
}

export async function forgetPhoto(id: string) {
  const res = await supabase.rpc('forget_photo', { p_id: id })
  return unwrap(res)
}

const PHOTO_BUCKET = 'dinner-photos'

/**
 * Upload the bytes, then record the row.
 *
 * In that order, and the caller must have stripped the file first
 * (lib/photo.ts) — this function takes a Blob and asks no questions about where
 * it came from, so the one place that guarantee can be made is the one place it
 * is made.
 *
 * The path is the round's folder plus a random name. That prefix is the whole
 * of what the storage policies check, and `record_photo` refuses a row whose
 * path claims a different dinner, so the two agree or neither happens.
 */
export async function uploadPhoto(roundId: string, blob: Blob, caption?: string): Promise<string> {
  const path = `${roundId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  })
  if (error) throw new Error(error.message)

  const res = await supabase.rpc('record_photo', {
    p_round_id: roundId,
    p_path: path,
    p_caption: caption ?? null,
  })
  return unwrap<string>(res)
}

/**
 * A URL that works for an hour and then does not.
 *
 * The bucket is private on purpose: a public URL is one that keeps working for
 * anybody who has ever seen it, long after the dinner and the app are done with
 * it. An hour is longer than anybody looks at an album and short enough that a
 * link pasted somewhere else dies on its own.
 */
export async function photoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600)
  if (error) return null
  return data?.signedUrl ?? null
}

export async function deletePhotoObject(path: string) {
  // Best effort, and deliberately not awaited into a failure: `hide_photo` has
  // already taken the picture out of everybody's album, so a bucket that
  // refuses the delete leaves bytes nobody can reach rather than a photograph
  // still on screen.
  await supabase.storage.from(PHOTO_BUCKET).remove([path])
}

export async function listRoundPhotos(roundId: string) {
  const res = await supabase.rpc('list_round_photos', { p_round_id: roundId })
  return unwrap<DinnerPhoto[]>(res)
}

export async function myAlbum() {
  const res = await supabase.rpc('my_album')
  return unwrap<AlbumEntry[]>(res)
}

export async function reportPhoto(photoId: string, roundId: string) {
  const res = await supabase.rpc('report_photo', { p_id: photoId })
  // Same pipeline as a reported phrase (0059), so the host finds both in one
  // inbox and is told about both the same way.
  void notifyHostOfAlert(roundId)
  return unwrap(res)
}

export async function hidePhoto(photoId: string) {
  const res = await supabase.rpc('hide_photo', { p_id: photoId })
  return unwrap(res)
}

// ---------------------------------------------------------------------------
// Moderation, by seat (supabase/migrations/0059_moderation_by_seat.sql)
// ---------------------------------------------------------------------------

// What is waiting, across every dinner this person runs. The one notification
// surface in this app that is not a push: the host has work to do rather than
// news to read, and work belongs in the app that holds it.
export interface OpenAlerts {
  round_id: string
  round_name: string
  open_alerts: number
  newest_at: string
}

export async function myOpenAlerts() {
  const res = await supabase.rpc('my_open_alerts')
  return unwrap<OpenAlerts[]>(res)
}

// Enough to act on, and deliberately not enough to name: the seat and the
// pseudonym it wore that evening. Which is all a warning or a removal needs.
export async function warnMember(input: {
  roundId: string
  memberId: string
  messageId?: string | null
  reason?: string | null
}) {
  const res = await supabase.rpc('warn_member', {
    p_round_id: input.roundId,
    p_member_id: input.memberId,
    p_message_id: input.messageId ?? null,
    p_reason: input.reason ?? null,
  })
  return unwrap(res)
}

export interface MyWarning {
  id: string
  reason: string | null
  created_at: string
}

export async function myWarnings(roundId: string) {
  const res = await supabase.rpc('my_warnings', { p_round_id: roundId })
  return unwrap<MyWarning[]>(res)
}

export async function acknowledgeWarning(id: string) {
  const res = await supabase.rpc('acknowledge_warning', { p_id: id })
  return unwrap(res)
}

// The one act here that needs a name, and therefore the one that is recorded.
// Requires a reason in writing and writes AUTHOR_REVEALED to audit_log — never
// a side effect of opening an alert.
export async function revealMessageAuthor(messageId: string, reason: string): Promise<string> {
  const res = await supabase.rpc('reveal_message_author', {
    p_message_id: messageId,
    p_reason: reason,
  })
  return unwrap<string>(res)
}

// Blocked by seat, so you never have to learn who somebody is to decide you
// would rather not sit with them again.
export async function blockMember(memberId: string) {
  const res = await supabase.rpc('block_member', { p_member_id: memberId })
  return unwrap(res)
}

export async function unblockUser(profileId: string) {
  const res = await supabase.rpc('unblock_user', { p_profile_id: profileId })
  return unwrap(res)
}

export interface BlockedUser {
  profile_id: string
  display_name: string
  created_at: string
}

export async function listMyBlocks() {
  const res = await supabase.rpc('list_my_blocks')
  return unwrap<BlockedUser[]>(res)
}

export async function resolveHostAlert(alertId: string) {
  const { error } = await supabase.from('host_alerts').update({ resolved_at: new Date().toISOString() }).eq('id', alertId)
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------------------
// Exclusions / slots — direct table access (host-write RLS + grants already
// exist on both tables, see supabase/migrations/0002_rls.sql).
// ---------------------------------------------------------------------------

export interface ExclusionPair {
  id: string
  round_id: string
  member_a: string
  member_b: string
}

export async function getExclusionPairs(roundId: string) {
  const { data, error } = await supabase.from('exclusion_pairs').select('id,round_id,member_a,member_b').eq('round_id', roundId)
  if (error) throw new Error(error.message)
  return (data ?? []) as ExclusionPair[]
}

export async function addExclusionPair(roundId: string, memberIdA: string, memberIdB: string) {
  const [member_a, member_b] = [memberIdA, memberIdB].sort()
  const { error } = await supabase.from('exclusion_pairs').insert({ round_id: roundId, member_a, member_b })
  if (error) throw new Error(error.message)
}

export async function removeExclusionPair(id: string) {
  const { error } = await supabase.from('exclusion_pairs').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export interface SlotRow {
  id: string
  round_id: string
  course: Course
}

/**
 * The courses this dinner is laid for.
 *
 * Ordered here rather than at two of the three call sites: the three of them
 * share one React Query key, so whichever ran last decided whether the menu
 * came back in course order or in whatever order Postgres felt like. One key,
 * one fetcher, one shape — the rule the blank screen taught us.
 */
export async function getSlots(roundId: string) {
  const { data, error } = await supabase
    .from('slots')
    .select('id,round_id,course')
    .eq('round_id', roundId)
    .order('course')
  if (error) throw new Error(error.message)
  return (data ?? []) as SlotRow[]
}

export async function addSlot(roundId: string, course: Course) {
  const { error } = await supabase.from('slots').insert({ round_id: roundId, course })
  if (error) throw new Error(error.message)
}

export async function removeSlot(id: string) {
  const { error } = await supabase.from('slots').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------------------
// Voting, phase 3 (0024 / 0025). LIVE and TIMED differ in who triggers the
// close and when results become visible — never in the phase machine.
// ---------------------------------------------------------------------------

export const RESULTS_NOT_PUBLISHED = 'RESULTS_NOT_PUBLISHED'
export const RESULTS_NOT_READY = 'RESULTS_NOT_READY'

// Fixed choices, not a free datetime: this is decided at a table with a
// glass in hand. null clears the deadline.
// Hours, not minutes. A vote that closes in five minutes is a vote nobody
// who stepped out to the kitchen gets to cast, and the deadline is only worth
// setting at all when it spans the part of the evening people are not looking
// at their phones.
export type DeadlineMinutes = 60 | 180 | 720 | 1440 | 2880

// Raised when a live deadline already exists. A deadline is a promise, so the
// first one sticks — clearing it is allowed, moving it is not (0043).
export const DEADLINE_ALREADY_SET = 'DEADLINE_ALREADY_SET'

// The style of the vote is decided when it is opened, not at creation — the
// host naming a dinner three weeks out has no idea yet whether everyone will
// be round a table with phones away (0043).
export async function setVotingMode(roundId: string, mode: VotingMode) {
  const res = await supabase.rpc('set_voting_mode', { p_round_id: roundId, p_mode: mode })
  return unwrap(res)
}

// Does nothing unless everyone has actually voted, which is why anybody in the
// round may call it: the last person to vote should not have to find the host
// to end a vote that is already over.
export async function closeVotingIfComplete(roundId: string) {
  const res = await supabase.rpc('close_voting_if_complete', { p_round_id: roundId })
  return unwrap<boolean>(res)
}

export async function setVotingDeadline(roundId: string, minutes: DeadlineMinutes | null) {
  const res = await supabase.rpc('set_voting_deadline', { p_round_id: roundId, p_minutes: minutes })
  return unwrap<string | null>(res)
}

export interface VoteProgress {
  voted: number
  eligible: number
}

// Counts only — the host must never learn a single ballot's contents.
export async function getVoteProgress(roundId: string) {
  const res = await supabase.rpc('get_vote_progress', { p_round_id: roundId })
  const rows = unwrap<VoteProgress[]>(res)
  return rows[0] ?? null
}

export async function publishResults(roundId: string) {
  const res = await supabase.rpc('publish_results', { p_round_id: roundId })
  return unwrap(res)
}

// Drops the ballot so it can be cast again. Replacing rather than editing:
// ballot_items cascade, so one delete leaves nothing half-rewritten.
export async function withdrawBallot(roundId: string) {
  const res = await supabase.rpc('withdraw_ballot', { p_round_id: roundId })
  return unwrap(res)
}

// Straight to the results without a vote, for the evening that ran long.
// Does not rewrite voting_mode — the round was a voting round.
export async function skipVoting(roundId: string) {
  const res = await supabase.rpc('skip_voting', { p_round_id: roundId })
  return unwrap(res)
}

// ---------------------------------------------------------------------------
// The menu (0026). slot_mode used to be decided in the seconds before a
// round existed and never again; it is now changeable until the table locks,
// because CATEGORIES only needs to be settled before briefs are written.
// ---------------------------------------------------------------------------

// Swapping one course for another in a single statement. The delete-then-add
// version left the menu one course short of the table between the two calls —
// exactly the condition generate_assignment refuses on (0036).
export async function changeCourse(roundId: string, slotId: string, course: Course) {
  const res = await supabase.rpc('change_course', {
    p_round_id: roundId,
    p_slot_id: slotId,
    p_course: course,
  })
  return unwrap(res)
}

// Raised by clear_assignment when somebody has already written. The roulette
// is a shuffle and a shuffle can be redone; a brief is work and is not thrown
// away by a button (0037).
export const BRIEFS_EXIST = 'BRIEFS_EXIST'

// Returns how many briefs it discarded, so the caller can tell the host what
// it cost. Without discardBriefs it raises BRIEFS_EXIST instead of deleting
// anything (0041).
export async function clearAssignment(roundId: string, discardBriefs = false) {
  const res = await supabase.rpc('clear_assignment', {
    p_round_id: roundId,
    p_discard_briefs: discardBriefs,
  })
  return unwrap<number>(res)
}

// ---------------------------------------------------------------------------
// Counting hands (0040 / 0041). Three passes — thirds, then seconds, then
// firsts — each recording how many hands went up for a dish, never whose.
// Points follow the places: 3rd = 1, 2nd = 2, 1st = 3, and the totals land in
// the same `results` table the online vote fills, so every screen after this
// is unchanged.
// ---------------------------------------------------------------------------

// Host-only, and only on a MANUAL round. The online ballot withholds who
// cooked what because that vote is blind; a show of hands is not — everyone
// watched that person carry the dish in (0042).
export interface ManualMenuRow {
  brief_id: string
  dish_name: string
  course: Course
  cook_name: string
}

export async function getManualMenu(roundId: string) {
  const res = await supabase.rpc('get_manual_menu', { p_round_id: roundId })
  return unwrap<ManualMenuRow[]>(res)
}

export interface ManualTallyRow {
  brief_id: string
  place: number
  voters: number
}

// A dish cannot get more hands than there are hands in the room, and one place
// cannot be handed out more times than there are people — everybody has
// exactly one third place to give. Both are typos rather than opinions (0045).
export const TOO_MANY_FOR_DISH = 'TOO_MANY_FOR_DISH'
export const TOO_MANY_FOR_PLACE = 'TOO_MANY_FOR_PLACE'
export const VOTES_ALREADY_CAST = 'VOTES_ALREADY_CAST'

// Asked, not derived from the member count: somebody who turned up without
// cooking still ate, and still gets a say.
export async function setManualVoters(roundId: string, voters: number | null) {
  const res = await supabase.rpc('set_manual_voters', { p_round_id: roundId, p_voters: voters })
  return unwrap(res)
}

export async function getManualTally(roundId: string) {
  const res = await supabase.rpc('get_manual_tally', { p_round_id: roundId })
  return unwrap<ManualTallyRow[]>(res)
}

export async function setManualTally(roundId: string, briefId: string, place: number, voters: number) {
  const res = await supabase.rpc('set_manual_tally', {
    p_round_id: roundId,
    p_brief_id: briefId,
    p_place: place,
    p_voters: voters,
  })
  return unwrap(res)
}

export async function closeManualVote(roundId: string) {
  const res = await supabase.rpc('close_manual_vote', { p_round_id: roundId })
  return unwrap(res)
}

export const MENU_LOCKED = 'MENU_LOCKED'

export async function setSlotMode(roundId: string, mode: SlotMode) {
  const res = await supabase.rpc('set_slot_mode', { p_round_id: roundId, p_mode: mode })
  return unwrap(res)
}

export interface MenuStatus {
  courses: number
  seats: number
}

// generate_assignment has always refused unless these two match — one
// course per chef, because every chef cooks exactly one dish. It was
// enforced and never shown, so being one short produced a refusal instead
// of a number.
export async function getMenuStatus(roundId: string) {
  const res = await supabase.rpc('get_menu_status', { p_round_id: roundId })
  const rows = unwrap<MenuStatus[]>(res)
  return rows[0] ?? null
}

export const COURSE_IN_USE = 'COURSE_IN_USE'

// Menu edits go through functions, not table writes: the preconditions are
// about the round's phase, not about who you are, and RLS can only answer
// the second question (0027).
export async function addCourse(roundId: string, course: Course) {
  const res = await supabase.rpc('add_course', { p_round_id: roundId, p_course: course })
  return unwrap<string>(res)
}

export async function removeCourse(roundId: string, slotId: string) {
  const res = await supabase.rpc('remove_course', { p_round_id: roundId, p_slot_id: slotId })
  return unwrap(res)
}

// ---------------------------------------------------------------------------
// The board (0030 / 0031 / 0033). Its own table rather than a loosened
// `messages`. It reads as a conversation now, one row per message, but the
// author never leaves Postgres and the only clock exposed is the day — the
// reader can place themselves via is_mine and nobody else (0033).
// ---------------------------------------------------------------------------

export interface BoardMessage {
  message_id: string
  body: string
  // The author's secret name (0037). A deliberate reversal of the board's
  // original unattributability: you can see who said what and pick the
  // conversation up later, at the cost of a pseudonym being followable
  // across an evening. Real identities are still the game's secret.
  // Null on a notice from the Executive Chef (0080), which is the one thing in
  // the fridge that comes from outside the table rather than from a seat at it.
  author_name: string | null
  is_mine: boolean
  reported: boolean
  // The seat behind the pseudonym (0059), so a phrase can be blocked without
  // anybody being named. Opaque: it adds nothing a reader did not already have
  // from `author_name`. Null for the same reason as above — and there is
  // nothing to block, because the host is not a seat.
  author_member_id: string | null
  from_host: boolean
}

export async function getBoard(roundId: string) {
  const res = await supabase.rpc('get_board', { p_round_id: roundId })
  return unwrap<BoardMessage[]>(res)
}

export async function postToBoard(roundId: string, templateId: string) {
  const res = await supabase.rpc('post_to_board', { p_round_id: roundId, p_template_id: templateId })
  return unwrap(res)
}

// How many board lines have appeared since you last opened the fridge. Your
// own never count — nothing you just said is news to you (0034).
export async function getBoardUnread(roundId: string) {
  const res = await supabase.rpc('get_board_unread', { p_round_id: roundId })
  return unwrap<number>(res)
}

export async function markBoardRead(roundId: string) {
  const res = await supabase.rpc('mark_board_read', { p_round_id: roundId })
  return unwrap(res)
}

export async function reportBoardMessage(messageId: string) {
  const res = await supabase.rpc('report_board_message', { p_message_id: messageId })
  return unwrap(res)
}

// Dishes carrying something somebody at this table flagged. Every diner can
// read it, not only the host — the point of informing instead of blocking is
// that the person with the allergy decides for themselves (0029).
export interface AllergenDish {
  dish_name: string
  labels: string[]
}

export async function getAllergenDishes(roundId: string) {
  const res = await supabase.rpc('get_allergen_dishes', { p_round_id: roundId })
  return unwrap<AllergenDish[]>(res)
}

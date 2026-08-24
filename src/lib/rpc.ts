// Thin, typed wrappers around the SECURITY DEFINER RPCs in
// supabase/migrations/. Keeping the raw `supabase.rpc(name, args)` calls in
// one place means the Postgres parameter names (which must match exactly,
// including the p_ prefix — PostgREST maps JSON keys to named function
// arguments) only need to be spelled correctly once.
import { supabase } from './supabase'

// How someone gets a seat. CODE = share a code, anyone holding it can ask;
// INVITE = the host names existing accounts, who accept or decline in-app.
// Replaces PUBLIC_LINK/PRIVATE_CODE, which were two names for one act.
export type RoundAccess = 'CODE' | 'INVITE'

// What members know about each other once seated. SPY sits between the
// other two: the host sees real names, nobody else does.
// The two pseudonym sets a dinner can draw from (0038). FOOD is herbs and
// spices; BRIGADE is the kitchen's own stations — saucier, pâtissier, aboyeur.
export type NameTheme = 'FOOD' | 'BRIGADE'

export type RoundAnonymity = 'ANONYMOUS' | 'SPY' | 'OPEN'

// Not whether voting happens, but how. LIVE = the host opens it during
// dinner and publishes results when ready; TIMED = a deadline publishes
// them itself; DISABLED = no voting, and that choice is final.
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

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
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

// Raised by invite_member when no account uses that address. Surfaced as a
// named constant rather than prose so the UI can say "no chef with this
// address" in the user's own language.
export const NO_SUCH_CHEF = 'NO_SUCH_CHEF'

export async function inviteMember(roundId: string, email: string) {
  const res = await supabase.rpc('invite_member', { p_round_id: roundId, p_email: email })
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

export async function joinRound(input: { code: string; turnstileTicket: string }) {
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

export type Course = 'STARTER' | 'MAIN' | 'DESSERT' | 'DRINK' | 'OTHER'

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

export interface MyBrief {
  pairing_id: string
  brief_id: string
  dish_name: string
  course: Course
  procedure: string
  external_url: string | null
  difficulty: number | null
  est_cost: string | null
  prep_minutes: number | null
  note_to_cook: string | null
  contains_tags: string[]
  ingredients: BriefIngredient[]
  acknowledged: boolean
}

export async function getMyBrief(roundId: string) {
  const res = await supabase.rpc('get_my_brief', { p_round_id: roundId })
  const rows = unwrap<MyBrief[]>(res)
  return rows[0] ?? null
}

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
  status: 'DRAFT' | 'SUBMITTED'
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

export async function getMyBriefDraft(roundId: string) {
  const res = await supabase.rpc('get_my_brief_draft', { p_round_id: roundId })
  const rows = unwrap<MyBriefDraft[]>(res)
  return rows[0] ?? null
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

export async function reportMessage(messageId: string) {
  const res = await supabase.rpc('report_message', { p_message_id: messageId })
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
  final_rank: number
  award_keys: string[]
}

export async function getResults(roundId: string) {
  const res = await supabase.rpc('get_results', { p_round_id: roundId })
  return unwrap<RoundResult[]>(res)
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

export type HostAlertKind = 'CANNOT_COOK' | 'NO_BRIEF' | 'DROPOUT' | 'REPORTED_MESSAGE' | 'OTHER'

export interface HostAlert {
  id: string
  round_id: string
  kind: HostAlertKind
  pairing_id: string | null
  payload: Record<string, unknown>
  created_at: string
  resolved_at: string | null
}

export async function getHostAlerts(roundId: string) {
  const { data, error } = await supabase
    .from('host_alerts')
    .select('id,round_id,kind,pairing_id,payload,created_at,resolved_at')
    .eq('round_id', roundId)
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as HostAlert[]
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

export async function getSlots(roundId: string) {
  const { data, error } = await supabase.from('slots').select('id,round_id,course').eq('round_id', roundId)
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
  author_name: string
  is_mine: boolean
  reported: boolean
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

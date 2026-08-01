// Thin, typed wrappers around the SECURITY DEFINER RPCs in
// supabase/migrations/. Keeping the raw `supabase.rpc(name, args)` calls in
// one place means the Postgres parameter names (which must match exactly,
// including the p_ prefix — PostgREST maps JSON keys to named function
// arguments) only need to be spelled correctly once.
import { supabase } from './supabase'

export type RoundVisibility = 'PUBLIC_LINK' | 'PRIVATE_CODE'
export type RoundAnonymity = 'ANONYMOUS' | 'OPEN'
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
  visibility: RoundVisibility
  anonymity: RoundAnonymity
  slotMode?: SlotMode
  maxPlayers?: number | null
  dinnerAt?: string | null
  timezone?: string
  location?: string | null
  allowMutualPairs?: boolean
  requiresApproval?: boolean
  votingEnabled?: boolean
}) {
  const res = await supabase.rpc('create_round', {
    p_name: input.name,
    p_visibility: input.visibility,
    p_anonymity: input.anonymity,
    p_slot_mode: input.slotMode ?? 'FREE',
    p_max_players: input.maxPlayers ?? null,
    p_dinner_at: input.dinnerAt ?? null,
    p_timezone: input.timezone ?? 'Europe/Paris',
    p_location: input.location ?? null,
    p_allow_mutual_pairs: input.allowMutualPairs ?? false,
    p_requires_approval: input.requiresApproval ?? true,
    p_voting_enabled: input.votingEnabled ?? true,
  })
  return unwrap<string>(res) // round id
}

// Mirrors v_forward_order in advance_phase (supabase/migrations/0006_phases.sql,
// extended by 0013_optional_voting.sql) — kept in one place so the frontend
// never has to re-derive "what's the next/previous phase" independently in
// more than one screen.
export const ROUND_PHASE_ORDER: RoundStatus[] = [
  'DRAFT', 'OPEN', 'LOCKED', 'ASSIGNED', 'BRIEFS_CLOSED', 'DINNER', 'VOTING', 'RESULTS', 'ARCHIVED',
]

export function visiblePhaseOrder(votingEnabled: boolean): RoundStatus[] {
  return votingEnabled ? ROUND_PHASE_ORDER : ROUND_PHASE_ORDER.filter((p) => p !== 'VOTING')
}

export function nextPhaseFor(status: RoundStatus, votingEnabled: boolean): RoundStatus | null {
  const order = visiblePhaseOrder(votingEnabled)
  const idx = order.indexOf(status)
  return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null
}

export function previousPhaseFor(status: RoundStatus, votingEnabled: boolean): RoundStatus | null {
  const order = visiblePhaseOrder(votingEnabled)
  const idx = order.indexOf(status)
  return idx > 0 ? order[idx - 1] : null
}

export async function joinRound(input: { code: string; turnstileTicket: string }) {
  const res = await supabase.rpc('join_round', {
    p_code: input.code,
    p_turnstile_ticket: input.turnstileTicket,
  })
  return unwrap<string>(res) // round_members id
}

export async function leaveRound(roundId: string) {
  const res = await supabase.rpc('leave_round', { p_round_id: roundId })
  return unwrap(res)
}

export async function approveMember(roundId: string, memberId: string) {
  const res = await supabase.rpc('approve_member', { p_round_id: roundId, p_member_id: memberId })
  return unwrap(res)
}

export async function rejectMember(roundId: string, memberId: string) {
  const res = await supabase.rpc('reject_member', { p_round_id: roundId, p_member_id: memberId })
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
  dinnerAt: string | null
  timezone: string
}) {
  const res = await supabase.rpc('update_round_details', {
    p_round_id: input.roundId,
    p_location: input.location,
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

export type MessageCategory =
  | 'CLARIFICATION' | 'SUBSTITUTION' | 'NUDGE' | 'CANNOT_COOK' | 'NO_BRIEF' | 'THANKS' | 'REPLY'
export type MessageSlotType = 'NONE' | 'INGREDIENT' | 'SHORT_TEXT'
export type MessageDirection = 'SENDER_TO_COOK' | 'COOK_TO_SENDER'

export interface MessageTemplate {
  id: string
  category: MessageCategory
  locale: string
  body: string
  slot_type: MessageSlotType
}

export async function getMessageTemplates(locale: string) {
  const { data, error } = await supabase
    .from('message_templates')
    .select('id,category,locale,body,slot_type')
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

export async function removeMember(roundId: string, memberId: string, confirmDishChange = false) {
  const res = await supabase.rpc('remove_member', {
    p_round_id: roundId,
    p_member_id: memberId,
    p_confirm_dish_change: confirmDishChange,
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

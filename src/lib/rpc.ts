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
  })
  return unwrap<string>(res) // round id
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

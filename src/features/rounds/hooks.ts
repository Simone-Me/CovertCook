import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type {
  NameTheme,
  RoundAccess,
  RoundAnonymity,
  RoundStatus,
  SlotMode,
  VotingMode,
} from '../../lib/rpc'

export interface RoundRow {
  id: string
  name: string
  status: RoundStatus
  access: RoundAccess
  anonymity: RoundAnonymity
  join_code: string
  accent_color: string
  accent_emoji: string
  host_id: string
  dinner_at: string | null
  timezone: string
  // location is the street, city is the city, notes is everything else a
  // guest might need (door code, what to bring). One box could not do all
  // three, which is why the envelope only ever showed one line (0034).
  location: string | null
  city: string | null
  notes: string | null
  voting_mode: VotingMode
  // When the vote shuts. Everyone reads it, not just the host — a countdown
  // only one person can see is not a deadline, it is a surprise (0024).
  voting_closes_at: string | null
  results_published_at: string | null
  // Generated in Postgres from voting_mode (0018) — the phase machine only
  // ever needed "does voting happen at all", so it still reads this.
  voting_enabled: boolean
  slot_mode: SlotMode
  // Which pseudonym set this dinner draws from (0038). Fixed at creation:
  // renaming people mid-game would orphan every message addressed to them.
  name_theme: NameTheme
  // How many hands are in the room for a MANUAL vote (0045).
  manual_voters: number | null
  requires_approval: boolean
  max_players: number | null
}

const ROUND_COLUMNS =
  'id,name,status,access,anonymity,join_code,accent_color,accent_emoji,host_id,dinner_at,timezone,location,city,notes,voting_mode,voting_enabled,voting_closes_at,results_published_at,slot_mode,name_theme,manual_voters,requires_approval,max_players'

// A round nobody is playing any more: cancelled, or finished and archived.
// Kept out of the main list rather than deleted — several people's writing
// lives in a round, and one person cancelling shouldn't erase it.
export function isPastRound(r: Pick<RoundRow, 'status'>) {
  return r.status === 'CANCELLED' || r.status === 'ARCHIVED'
}

export interface MyRoundRow extends RoundRow {
  approved: boolean
}

export function useMyRounds(uid: string | undefined) {
  return useQuery({
    queryKey: ['rounds', 'mine', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('round_members')
        .select(`approved, rounds(${ROUND_COLUMNS})`)
        .eq('profile_id', uid as string)
        .eq('status', 'ACTIVE')
        .order('joined_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((m) => ({
        ...(m.rounds as unknown as RoundRow),
        approved: m.approved,
      })) as MyRoundRow[]
    },
  })
}

export function useRound(roundId: string | undefined) {
  return useQuery({
    queryKey: ['rounds', roundId],
    enabled: !!roundId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rounds')
        .select(ROUND_COLUMNS)
        .eq('id', roundId as string)
        .single()
      if (error) throw error
      return data as RoundRow
    },
  })
}

export interface RoundMemberRow {
  id: string
  round_id: string
  profile_id: string
  // Null while sign-ups are still open: the roster is revealed to everyone at
  // once when the door closes, so that arrival order can't be read back as
  // identity (0032). Your own name is always present.
  secret_name: string | null
  role: 'HOST' | 'PLAYER'
  status: 'ACTIVE' | 'LEFT' | 'REMOVED'
  approved: boolean
}

export function useRoundMembers(roundId: string | undefined) {
  return useQuery({
    queryKey: ['rounds', roundId, 'members'],
    enabled: !!roundId,
    queryFn: async () => {
      // Not a table read: secret_name is withheld server-side until the round
      // locks, and the client no longer has SELECT on that column (0032).
      const { data, error } = await supabase.rpc('list_round_members', {
        p_round_id: roundId as string,
      })
      if (error) throw error
      return data as RoundMemberRow[]
    },
  })
}

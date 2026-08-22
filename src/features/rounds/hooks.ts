import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { RoundAccess, RoundAnonymity, RoundStatus, SlotMode, VotingMode } from '../../lib/rpc'

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
  location: string | null
  voting_mode: VotingMode
  results_published_at: string | null
  // Generated in Postgres from voting_mode (0018) — the phase machine only
  // ever needed "does voting happen at all", so it still reads this.
  voting_enabled: boolean
  slot_mode: SlotMode
}

const ROUND_COLUMNS =
  'id,name,status,access,anonymity,join_code,accent_color,accent_emoji,host_id,dinner_at,timezone,location,voting_mode,voting_enabled,results_published_at,slot_mode'

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
  secret_name: string
  role: 'HOST' | 'PLAYER'
  status: 'ACTIVE' | 'LEFT' | 'REMOVED'
  approved: boolean
}

export function useRoundMembers(roundId: string | undefined) {
  return useQuery({
    queryKey: ['rounds', roundId, 'members'],
    enabled: !!roundId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('round_members')
        .select('id,round_id,profile_id,secret_name,role,status,approved')
        .eq('round_id', roundId as string)
        .order('joined_at', { ascending: true })
      if (error) throw error
      return data as RoundMemberRow[]
    },
  })
}

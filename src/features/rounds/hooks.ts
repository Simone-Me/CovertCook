import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { RoundAnonymity, RoundStatus, RoundVisibility } from '../../lib/rpc'

export interface RoundRow {
  id: string
  name: string
  status: RoundStatus
  visibility: RoundVisibility
  anonymity: RoundAnonymity
  join_code: string
  accent_color: string
  accent_emoji: string
  host_id: string
  dinner_at: string | null
  timezone: string
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
        .select(
          'approved, rounds(id,name,status,visibility,anonymity,join_code,accent_color,accent_emoji,host_id,dinner_at,timezone)',
        )
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
        .select('id,name,status,visibility,anonymity,join_code,accent_color,accent_emoji,host_id,dinner_at,timezone')
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

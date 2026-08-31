import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type {
  NameTheme,
  RoundAccess,
  RoundAnonymity,
  RoundStatus,
  SlotMode,
  TableTheme,
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
  // How the cloth is dressed (0072). Also fixed at creation — the table is the
  // one thing everybody is looking at, and re-dressing it mid-evening changes
  // the room under people who are mid-sentence.
  table_theme: TableTheme
  // How many hands are in the room for a MANUAL vote (0045).
  manual_voters: number | null
  requires_approval: boolean
  max_players: number | null
  // Shared costs (0065). NONE for a dinner that splits nothing; budget is in
  // cents and null means "shared, no ceiling".
  cost_mode: 'NONE' | 'SHARED'
  budget_per_head: number | null
  currency: string
  // When the dinner stopped being live (0062). Null while it is still running.
  // Twenty-one days after this the whole round deletes itself, so this is also
  // what the countdown on a past dinner is computed from.
  finished_at: string | null
  // The chef the Executive Chef handed the camera to (0068). Null means the
  // host takes the photograph themselves. A profile rather than a seat, so it
  // can never be joined back to a pseudonym.
  photographer_profile_id: string | null
}

const ROUND_COLUMNS =
  'id,name,status,access,anonymity,join_code,accent_color,accent_emoji,host_id,dinner_at,timezone,location,city,notes,voting_mode,voting_enabled,voting_closes_at,results_published_at,slot_mode,name_theme,table_theme,manual_voters,requires_approval,max_players,finished_at,cost_mode,budget_per_head,currency,photographer_profile_id'

// A round nobody is playing any more: cancelled, or finished and archived.
// Kept out of the main list rather than deleted — several people's writing
// lives in a round, and one person cancelling shouldn't erase it.
export function isPastRound(r: Pick<RoundRow, 'status'> & { member_status?: string }) {
  // Two ways for a dinner to be over: it ended, or you are no longer at it.
  if (r.member_status && r.member_status !== 'ACTIVE') return true
  return r.status === 'CANCELLED' || r.status === 'ARCHIVED'
}

export interface MyRoundRow extends RoundRow {
  approved: boolean
  /** Your own standing in this round, which is not the round's own status:
   *  a dinner still running is over as far as somebody who walked out of it
   *  is concerned. */
  member_status: 'ACTIVE' | 'LEFT' | 'REMOVED'
}

export function useMyRounds(uid: string | undefined) {
  return useQuery({
    queryKey: ['rounds', 'mine', uid],
    enabled: !!uid,
    queryFn: async () => {
      // LEFT and REMOVED rows are fetched too. Filtering them out made a
      // dinner you walked out of vanish from your account entirely, which
      // reads as data loss rather than as leaving — you can no longer even
      // see that it happened. They belong in the archive.
      //
      // NOT `removal_requested_at`, and not by oversight. round_members has
      // column-level grants (0032 revoked the table and handed the columns
      // back one by one so secret_name could never leak), so a column added
      // later is unreadable here until somebody grants it — asking for one
      // fails the whole query with "permission denied for table
      // round_members", naming the table rather than the column. Granting it
      // would also be wrong: who asked to leave is for that person and the
      // host, and a column grant cannot say that. list_round_members decides
      // it instead, which is why the round page reads it and this list does
      // not.
      const { data, error } = await supabase
        .from('round_members')
        .select(`approved, status, rounds(${ROUND_COLUMNS})`)
        .eq('profile_id', uid as string)
        .in('status', ['ACTIVE', 'LEFT', 'REMOVED'])
        .order('joined_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((m) => ({
        ...(m.rounds as unknown as RoundRow),
        approved: m.approved,
        member_status: m.status,
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
  // Null for everybody but you, unless the round is OPEN, you are a SPY host,
  // or the reveal has happened (0053). It used to be present for every member
  // beside their pseudonym, and profiles are readable by co-members — two
  // calls and a join gave up the whole mapping.
  profile_id: string | null
  // Null while sign-ups are still open: the roster is revealed to everyone at
  // once when the door closes, so that arrival order can't be read back as
  // identity (0032). Your own name is always present.
  secret_name: string | null
  // The real one, and only where this reader is entitled to it: an OPEN round,
  // a SPY round read by its host, or a dinner that is over (0073). Where it is
  // present it is the name to print — a pseudonym beside a real name is a
  // second name to learn for nothing.
  display_name: string | null
  role: 'HOST' | 'PLAYER'
  status: 'ACTIVE' | 'LEFT' | 'REMOVED'
  approved: boolean
  /** Set when this player has asked to be let out of a round whose chain
   *  already exists (0050). Visible only to them and to the host. */
  removal_requested_at: string | null
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

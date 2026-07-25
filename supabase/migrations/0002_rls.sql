-- CovertCook — RLS: default-deny on every table, then the narrowest policy
-- that lets the UI render without ever exposing pairings/briefs/messages/
-- ballot_items directly. Those four are RPC-only for players, full stop —
-- not "no policy before phase X", but no player SELECT policy ever. Reads
-- happen through get_my_assignment / get_my_brief / get_thread / get_chain,
-- which is where identity-stripping is guaranteed to happen exactly once
-- instead of being re-derived (and possibly re-broken) by every future query.
--
-- RLS filters ROWS, not COLUMNS. A table can leak a sensitive column (e.g.
-- messages.created_at) even with a correct row-filtering policy, if the
-- client is allowed to SELECT that column directly via PostgREST. Rule for
-- this codebase: any column that must never leave the server sits in a
-- table with NO player-facing SELECT grant at all; it is only ever read
-- inside a SECURITY DEFINER function and returned with that column omitted.

alter table profiles enable row level security;
alter table dietary_entries enable row level security;
alter table rounds enable row level security;
alter table round_members enable row level security;
alter table exclusion_pairs enable row level security;
alter table slots enable row level security;
alter table pairings enable row level security;
alter table briefs enable row level security;
alter table brief_ingredients enable row level security;
alter table message_templates enable row level security;
alter table messages enable row level security;
alter table host_alerts enable row level security;
alter table secret_name_words enable row level security;
alter table ballots enable row level security;
alter table ballot_items enable row level security;
alter table results enable row level security;
alter table awards enable row level security;
alter table invites enable row level security;
alter table audit_log enable row level security;

-- No blanket grants: PostgREST only exposes what an explicit GRANT + POLICY
-- together allow. Revoke the default PUBLIC grants defensively (belt and
-- braces on top of RLS, in case a future migration adds a policy without
-- thinking about grants).
revoke all on pairings, briefs, brief_ingredients, messages, ballot_items,
  secret_name_words, audit_log from anon, authenticated;

-- ---------------------------------------------------------------------------
-- helper: is this uid an ACTIVE+APPROVED member of this round?
-- ---------------------------------------------------------------------------

create or replace function is_round_member(p_round_id uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from round_members m
    where m.round_id = p_round_id
      and m.profile_id = p_uid
      and m.status = 'ACTIVE'
      and m.approved
  );
$$;

create or replace function is_round_host(p_round_id uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from rounds r
    where r.id = p_round_id and r.host_id = p_uid
  );
$$;

-- ---------------------------------------------------------------------------
-- profiles / dietary_entries
-- ---------------------------------------------------------------------------

create policy profiles_select_self on profiles
  for select using (id = auth.uid());

-- Players in a shared round need to resolve display names / secret names
-- for the round-scoped dietary panel and roster, never a bare cross-user
-- profile browse.
create policy profiles_select_co_members on profiles
  for select using (
    exists (
      select 1 from round_members mine
      join round_members theirs on theirs.round_id = mine.round_id
      where mine.profile_id = auth.uid()
        and mine.status = 'ACTIVE' and mine.approved
        and theirs.profile_id = profiles.id
        and theirs.status = 'ACTIVE' and theirs.approved
    )
  );

create policy profiles_update_self on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- profiles insert happens only via the complete_signup() RPC (security
-- definer), never a direct client insert, so the dietary-entries invariant
-- can't be bypassed. No INSERT policy is granted here on purpose.

create policy dietary_entries_select_self on dietary_entries
  for select using (
    profile_id = auth.uid()
  );

-- Round-mates need the deduplicated union (get_dietary_panel RPC), not raw
-- per-person rows tied to a name — this policy only covers a user's own
-- entries for their profile screen. The panel itself is RPC-only so it can
-- deduplicate and never say "Alex is allergic to X".
create policy dietary_entries_write_self on dietary_entries
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- rounds
-- ---------------------------------------------------------------------------

create policy rounds_select_member on rounds
  for select using (
    host_id = auth.uid() or is_round_member(id, auth.uid())
  );

create policy rounds_insert_as_host on rounds
  for insert with check (host_id = auth.uid());

create policy rounds_update_host_only on rounds
  for update using (host_id = auth.uid()) with check (host_id = auth.uid());

-- ---------------------------------------------------------------------------
-- round_members
-- ---------------------------------------------------------------------------

create policy round_members_select_same_round on round_members
  for select using (
    is_round_host(round_id, auth.uid()) or is_round_member(round_id, auth.uid())
    or profile_id = auth.uid() -- so a pending/unapproved joiner can see their own row
  );

-- Inserts happen via join_round(); updates (approve/remove/role transfer)
-- happen via approve_member/reject_member/remove_member/transfer_host. No
-- direct INSERT/UPDATE policy: a player must not be able to self-approve or
-- edit someone else's membership row.

-- ---------------------------------------------------------------------------
-- exclusion_pairs / slots — host configures, members can read (context, not secret)
-- ---------------------------------------------------------------------------

create policy exclusion_pairs_select on exclusion_pairs
  for select using (
    is_round_host(round_id, auth.uid()) or is_round_member(round_id, auth.uid())
  );

create policy exclusion_pairs_write_host on exclusion_pairs
  for all using (is_round_host(round_id, auth.uid()))
  with check (is_round_host(round_id, auth.uid()));

create policy slots_select on slots
  for select using (
    is_round_host(round_id, auth.uid()) or is_round_member(round_id, auth.uid())
  );

create policy slots_write_host on slots
  for all using (is_round_host(round_id, auth.uid()))
  with check (is_round_host(round_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- pairings / briefs / brief_ingredients / messages / ballot_items:
-- INTENTIONALLY NO SELECT POLICY FOR PLAYERS. Access only via RPC functions
-- (0003_functions.sql), which run as SECURITY DEFINER and therefore bypass
-- RLS entirely for their own internal reads — that's what lets a function
-- look up sender_id to check exclusions while never returning it.
-- ---------------------------------------------------------------------------

-- message_templates: read-only reference data, safe to expose directly.
create policy message_templates_select_active on message_templates
  for select using (active);

-- ---------------------------------------------------------------------------
-- host_alerts — host only
-- ---------------------------------------------------------------------------

create policy host_alerts_select_host on host_alerts
  for select using (is_round_host(round_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- ballots — a voter can see that their own ballot was submitted (not its
-- contents beyond what they wrote); ballot_items stay RPC-only always, since
-- exposing them would let a player read other people's rankings before
-- RESULTS regardless of ballots_anonymous.
-- ---------------------------------------------------------------------------

create policy ballots_select_own on ballots
  for select using (
    exists (
      select 1 from round_members m
      where m.id = ballots.voter_id and m.profile_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- results / awards — visible from RESULTS phase onward
-- ---------------------------------------------------------------------------

create policy results_select_after_reveal on results
  for select using (
    exists (
      select 1 from rounds r
      where r.id = results.round_id
        and r.status in ('RESULTS', 'ARCHIVED')
        and (is_round_host(r.id, auth.uid()) or is_round_member(r.id, auth.uid()))
    )
  );

create policy awards_select_after_reveal on awards
  for select using (
    exists (
      select 1 from rounds r
      where r.id = awards.round_id
        and r.status in ('RESULTS', 'ARCHIVED')
        and (is_round_host(r.id, auth.uid()) or is_round_member(r.id, auth.uid()))
    )
  );

-- ---------------------------------------------------------------------------
-- invites — host only; joining reads the invite through join_round(), not
-- a direct SELECT (an unauthenticated/unapproved browser must not be able to
-- enumerate invites for a round it isn't in).
-- ---------------------------------------------------------------------------

create policy invites_host_only on invites
  for all using (is_round_host(round_id, auth.uid()))
  with check (is_round_host(round_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- audit_log — host only, read-only from the client (writes happen inside
-- the SECURITY DEFINER functions themselves).
-- ---------------------------------------------------------------------------

create policy audit_log_select_host on audit_log
  for select using (round_id is not null and is_round_host(round_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- Table-level GRANTs. RLS is necessary but not sufficient: PostgREST checks
-- the ordinary GRANT system before a policy is ever evaluated, and Supabase
-- does not grant table access to anon/authenticated by default. Only tables
-- meant for direct client access (supabase-js .from()) get one here —
-- pairings/briefs/brief_ingredients/messages/ballot_items/
-- secret_name_words/audit_log/turnstile_tickets stay revoked above
-- (RPC-only). `anon` gets nothing: every RPC in this app requires
-- auth.uid(), so there is no unauthenticated read path to support.
-- ---------------------------------------------------------------------------

grant select, update on profiles to authenticated;
grant select, insert, update, delete on dietary_entries to authenticated;
grant select, insert, update on rounds to authenticated;
grant select on round_members to authenticated;
grant select, insert, update, delete on exclusion_pairs to authenticated;
grant select, insert, update, delete on slots to authenticated;
grant select on message_templates to authenticated;
grant select on host_alerts to authenticated;
grant select on ballots to authenticated;
grant select on results to authenticated;
grant select on awards to authenticated;
grant select, insert, update, delete on invites to authenticated;

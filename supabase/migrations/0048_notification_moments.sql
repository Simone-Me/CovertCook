-- What a notification is for, decided rather than inherited.
--
-- 0047 shipped push and wired it to "the round moved on", which is every
-- transition and therefore no decision at all. The four moments that earn an
-- interruption, and the reasoning for each:
--
--   ASSIGNED        your cook exists and you can finally write. This is the
--                   one that unblocks work.
--   BRIEF_RECEIVED  the recipe you have to cook has arrived. Per person, not
--                   per round: since 0035 a brief lands the moment its author
--                   submits, so waiting for a phase to announce it would
--                   re-introduce exactly the stall 0035 removed.
--   VOTING          the online ballot is open. Skipped for a MANUAL vote:
--                   hands go up at the table and everyone is in the room.
--   RESULTS         the scores, and the reveal.
--
-- Everything else — DINNER, a settings change, a phase nudged backwards — gets
-- nothing. A notification nobody acts on is how an app teaches people to
-- ignore it, and the two remaining mails (password reset, address change) are
-- Auth's own and unaffected by any of this.
--
-- BRIEF_RECEIVED SAYS NOTHING ABOUT WHO WROTE IT. The whole product is built
-- on the cook not knowing their sender until the reveal, and a lock screen is
-- the least private surface there is. The text is composed server-side in
-- send-push precisely so no caller can put a name in it.

-- ---------------------------------------------------------------------------
-- 1. One switch, per account, for every dinner.
--
-- The subscription rows in 0047 are per browser, because that is what the Push
-- API gives us — but "do I want to be notified" is a decision a person makes
-- once, not once per device. So the account carries the answer and the devices
-- carry the addresses.
--
-- The consequence, stated rather than discovered: turning notifications off on
-- the phone silences the laptop too, and turning them back on anywhere revives
-- both. That is what "valid for all your dinners" means, and it is why the
-- switch says so.
--
-- Per-dinner preferences are v2 (ROADMAP.md §1): they need a per-round row and
-- a place in the round UI to set it, and neither is worth building before
-- anyone has been annoyed by the global one.
-- ---------------------------------------------------------------------------

alter table profiles
  add column if not exists notifications_enabled boolean not null default true;

comment on column profiles.notifications_enabled is
  'Account-level push switch, all rounds and all devices (0048). Per-round preferences are v2.';

create or replace function set_notifications_enabled(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  update profiles set notifications_enabled = coalesce(p_enabled, true) where id = v_uid;
end;
$$;

grant execute on function set_notifications_enabled(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The round-wide audience now respects that switch.
-- ---------------------------------------------------------------------------

create or replace function push_audience_for_round(p_round_id uuid, p_actor uuid)
returns table (endpoint text, p256dh text, auth text, locale text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.endpoint, s.p256dh, s.auth, p.locale
  from round_members m
  join push_subscriptions s on s.profile_id = m.profile_id
  join profiles p on p.id = m.profile_id
  where m.round_id = p_round_id
    and m.status = 'ACTIVE'
    and m.approved
    and m.profile_id <> p_actor
    and p.notifications_enabled;
$$;

revoke all on function push_audience_for_round(uuid, uuid) from public, anon, authenticated;
grant execute on function push_audience_for_round(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. The audience for "your recipe has arrived": one person, resolved from the
--    pairing rather than named by the caller.
--
-- The sender never learns who their cook is — they only ever address a
-- pseudonym — so the caller cannot be trusted to say who to notify, and is
-- never asked. It passes its own round, and the chain answers the rest.
--
-- Gated on the brief actually being SUBMITTED, which makes this impossible to
-- use as a doorbell: there is exactly one moment per pairing when it returns
-- anybody, and pressing it twice sends the same thing to the same phone under
-- the same tag, which replaces rather than stacks.
--
-- Follows the CURRENT assignment_version on purpose: after a splice, the
-- pairing that matters is the live one, not the one this sender started with.
-- ---------------------------------------------------------------------------

create or replace function push_audience_for_my_cook(p_round_id uuid, p_sender uuid)
returns table (endpoint text, p256dh text, auth text, locale text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.endpoint, s.p256dh, s.auth, p.locale
  from round_members me
  join rounds r on r.id = me.round_id
  join pairings pr
    on pr.round_id = r.id
   and pr.sender_id = me.id
   and pr.assignment_version = r.assignment_version
  join briefs b on b.pairing_id = pr.id and b.status = 'SUBMITTED'
  join round_members cook on cook.id = pr.cook_id and cook.status = 'ACTIVE' and cook.approved
  join profiles p on p.id = cook.profile_id and p.notifications_enabled
  join push_subscriptions s on s.profile_id = cook.profile_id
  where me.round_id = p_round_id
    and me.profile_id = p_sender;
$$;

revoke all on function push_audience_for_my_cook(uuid, uuid) from public, anon, authenticated;
grant execute on function push_audience_for_my_cook(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Is this round's vote one that happens on a phone?
--
-- send-push asks before announcing an online ballot, because a MANUAL round
-- counts hands at the table and a push there is an interruption advertising
-- something that is already happening in the room.
-- ---------------------------------------------------------------------------

create or replace function round_vote_is_online(p_round_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from rounds
    where id = p_round_id and voting_mode in ('LIVE', 'TIMED')
  );
$$;

revoke all on function round_vote_is_online(uuid) from public, anon, authenticated;
grant execute on function round_vote_is_online(uuid) to service_role;

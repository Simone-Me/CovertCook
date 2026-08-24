-- Two more moments, both at the door.
--
-- The four in 0048 all happen once a dinner is under way. The door has its own
-- pair, and they are the two where waiting in silence is worst:
--
--   * somebody asks to join, or simply takes a seat — the Executive Chef is
--     the only person who can act on the first, and is running the evening in
--     their head rather than watching a roster refresh.
--   * a request is accepted — the person who asked has been staring at a page
--     that says "waiting for approval" with nothing to do about it.
--
-- WHO IS TOLD, AND HOW LITTLE IS SAID. Neither notification carries a name.
-- The host's approval screen shows the real name of whoever is asking, because
-- approving a pseudonym is approving nobody (0015) — but that is a screen the
-- host chose to open, not a lock screen a stranger on a train can read over
-- their shoulder. The round's name is carried, because a host with two dinners
-- running needs to know which door somebody is at, and neither party learns
-- anything from it they did not already know.
--
-- WHY BOTH FUNCTIONS TAKE A MEMBER AND NOT A ROUND. join_round hands the
-- client a membership id and nothing else, and approve_member is about one
-- person. Passing the member is passing what the caller actually has; the
-- round is derived here, where it can be authorised at the same time.

-- ---------------------------------------------------------------------------
-- Someone is at the door: tell the host.
--
-- Authorised on the membership itself: you may announce your own arrival, and
-- nobody else's. That is why p_actor is checked against the member's profile
-- rather than against membership of the round — a player already inside must
-- not be able to make the host's phone ring on somebody else's behalf.
--
-- `approved` comes back so the caller does not have to decide which of the two
-- moments this was: a round that needs approval produces a request, one that
-- does not produces an arrival, and the difference is a column, not a guess.
-- ---------------------------------------------------------------------------

create or replace function push_audience_for_host(p_member_id uuid, p_actor uuid)
returns table (
  endpoint text,
  p256dh text,
  auth text,
  locale text,
  round_id uuid,
  round_name text,
  approved boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.endpoint, s.p256dh, s.auth, p.locale, r.id, r.name, joiner.approved
  from round_members joiner
  join rounds r on r.id = joiner.round_id
  join profiles p on p.id = r.host_id and p.notifications_enabled
  join push_subscriptions s on s.profile_id = r.host_id
  where joiner.id = p_member_id
    and joiner.profile_id = p_actor
    -- Telling the host about your own arrival is not news to you.
    and r.host_id <> p_actor;
$$;

revoke all on function push_audience_for_host(uuid, uuid) from public, anon, authenticated;
grant execute on function push_audience_for_host(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- The door opened: tell the person who was waiting.
--
-- Authorised the other way round — only the host of that member's round may
-- send it — and gated on the seat actually being approved, so the message
-- cannot arrive before the thing it announces.
-- ---------------------------------------------------------------------------

create or replace function push_audience_for_approved(p_member_id uuid, p_actor uuid)
returns table (
  endpoint text,
  p256dh text,
  auth text,
  locale text,
  round_id uuid,
  round_name text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.endpoint, s.p256dh, s.auth, p.locale, r.id, r.name
  from round_members m
  join rounds r on r.id = m.round_id
  join profiles p on p.id = m.profile_id and p.notifications_enabled
  join push_subscriptions s on s.profile_id = m.profile_id
  where m.id = p_member_id
    and m.status = 'ACTIVE'
    and m.approved
    and r.host_id = p_actor
    and m.profile_id <> p_actor;
$$;

revoke all on function push_audience_for_approved(uuid, uuid) from public, anon, authenticated;
grant execute on function push_audience_for_approved(uuid, uuid) to service_role;

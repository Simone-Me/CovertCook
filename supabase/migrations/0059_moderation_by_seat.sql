-- The host's alert centre (ROADMAP §7, step 3).
--
-- `host_alerts` has existed since 0001 with the right kinds, and a page to read
-- them since 0014. Two things were missing, and the second is the interesting
-- one:
--
--   1. Nothing ever told the host they were there. The alerts sat in a table
--      waiting for somebody to think of opening a page.
--   2. A reported message had no answer beyond reading it. The host could see
--      that something had been said and could do nothing about it.
--
-- MODERATE BY SEAT, NOT BY NAME. This is the design decision inside step 3 and
-- it decides the shape of everything below.
--
-- The host should see the message before they see who wrote it. Knowing the
-- author first is how a host's opinion of a person decides whether a message
-- was inappropriate — and the name is not needed to act, because every action
-- is about a seat: a warning is delivered to one, a removal takes one away.
-- Identity is only ever needed to reach somebody *outside* the game, which is a
-- different and much rarer act.
--
-- Half of that was already true by accident of good design: `pairings` has no
-- player SELECT policy at all, and `get_reported_messages` returned a pairing
-- id and a direction and nothing else. So the host could not name the author
-- even if they wanted to. What was missing was the opposite — enough to *act*.
-- This adds the seat and its pseudonym, and nothing more.
--
-- AND WHERE THAT PROMISE STOPS. "By seat" only anonymises in ANONYMOUS rounds.
-- In SPY the host sees every real name beside its pseudonym by definition, and
-- in OPEN everybody does. The interface has to say so rather than implying a
-- protection the round never offered — see `moderation.byPseudonym` in the
-- locale files, which is worded for both cases.

-- ---------------------------------------------------------------------------
-- 1. What a reported message actually is, including whose seat it came from.
--
-- The author is derived from the direction rather than stored: SENDER_TO_COOK
-- came from the pairing's sender, COOK_TO_SENDER from its cook. That is a fact
-- about the row, so deriving it cannot drift the way a copied column would.
-- ---------------------------------------------------------------------------

-- Dropped rather than replaced: `create or replace` will not change the row
-- type an OUT-parameter function returns, and this adds three columns to it.
drop function if exists get_reported_messages(uuid);

create function get_reported_messages(p_round_id uuid)
returns table (
  message_id uuid, pairing_id uuid, direction message_direction,
  category message_category, body text, slot_value text, created_day date,
  -- The seat, and the name that seat wore that evening. Enough to warn, enough
  -- to remove, and not enough to know who it was.
  author_member_id uuid,
  author_secret_name text,
  -- Whether this seat has already been warned about this message, so the host
  -- is not offered the same action twice with no memory of the first.
  already_warned boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_round_host(p_round_id, auth.uid()) then
    raise exception 'only the host can view reported messages';
  end if;

  return query
    select
      m.id, m.pairing_id, m.direction, t.category, t.body, m.slot_value, m.created_day,
      am.id,
      am.secret_name,
      exists (select 1 from member_warnings w where w.message_id = m.id)
    from messages m
    join pairings p on p.id = m.pairing_id
    join message_templates t on t.id = m.template_id
    join round_members am
      on am.id = case when m.direction = 'SENDER_TO_COOK' then p.sender_id else p.cook_id end
    where p.round_id = p_round_id and m.reported
    order by m.created_at;
end;
$$;

grant execute on function get_reported_messages(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. A warning, delivered to a seat.
--
-- The middle action, and the one that was missing: between reading a reported
-- message and removing somebody from a dinner there was nothing at all, so a
-- host with a rude phrase in front of them had a choice between shrugging and
-- ending somebody's evening.
--
-- It is addressed by member id, so the host never has to learn a name to send
-- it, and the person reads it on the round page — not by email, not by push
-- alone. A warning nobody is sure arrived is not a warning.
-- ---------------------------------------------------------------------------

create table if not exists member_warnings (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds (id) on delete cascade,
  member_id uuid not null references round_members (id) on delete cascade,
  -- What it was about, when it was about something specific. Null for a
  -- warning the host raised on their own.
  message_id uuid references messages (id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);

create index member_warnings_member_idx on member_warnings (member_id) where acknowledged_at is null;

alter table member_warnings enable row level security;

-- No policies and no grants: this table is read and written only through the
-- functions below, both of which decide who is entitled to what. A select
-- policy scoped to "your own seat" would have been correct and would also have
-- let a curious client enumerate the column list of a moderation record.

create or replace function warn_member(p_round_id uuid, p_member_id uuid, p_message_id uuid default null, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the host can warn a member';
  end if;

  if not exists (select 1 from round_members where id = p_member_id and round_id = p_round_id) then
    raise exception 'that seat is not at this dinner';
  end if;

  insert into member_warnings (round_id, member_id, message_id, reason)
  values (p_round_id, p_member_id, p_message_id, nullif(btrim(coalesce(p_reason, '')), ''));

  -- Moderation is the one thing in this app that should always be reviewable
  -- afterwards, including when the host was the one who got it wrong.
  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'MEMBER_WARNED', jsonb_build_object(
    'member_id', p_member_id, 'message_id', p_message_id
  ));
end;
$$;

grant execute on function warn_member(uuid, uuid, uuid, text) to authenticated;

-- What the warned person sees, on their own round page. Returns their own
-- warnings and nobody else's — the host's copy is the alert centre.
create or replace function my_warnings(p_round_id uuid)
returns table (id uuid, reason text, created_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select w.id, w.reason, w.created_at
  from member_warnings w
  join round_members m on m.id = w.member_id
  where m.round_id = p_round_id
    and m.profile_id = auth.uid()
    and w.acknowledged_at is null
  order by w.created_at;
$$;

grant execute on function my_warnings(uuid) to authenticated;

create or replace function acknowledge_warning(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update member_warnings w set acknowledged_at = now()
  from round_members m
  where w.id = p_id and m.id = w.member_id and m.profile_id = auth.uid()
    and w.acknowledged_at is null;
end;
$$;

grant execute on function acknowledge_warning(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The deliberate reveal.
--
-- Everything above works without a name. This is the one thing that does not:
-- reaching somebody outside the game — because the police are involved, or
-- because a host has to explain to a friend why they are no longer invited.
--
-- It is a separate act, it requires a reason in writing, and it is recorded in
-- `audit_log` under its own action so it can be counted. It is never a side
-- effect of opening an alert, which is the whole point: a host who reveals an
-- author has done something, rather than merely looked at a screen.
-- ---------------------------------------------------------------------------

create or replace function reveal_message_author(p_message_id uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round_id uuid;
  v_name text;
  v_member_id uuid;
begin
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'REVEAL_NEEDS_A_REASON';
  end if;

  select p.round_id,
         case when m.direction = 'SENDER_TO_COOK' then p.sender_id else p.cook_id end
    into v_round_id, v_member_id
  from messages m
  join pairings p on p.id = m.pairing_id
  where m.id = p_message_id;

  if v_round_id is null then raise exception 'message not found'; end if;
  if not is_round_host(v_round_id, v_uid) then
    raise exception 'only the host can do this';
  end if;
  -- Only for something somebody actually reported. A host cannot browse the
  -- chain by reporting nothing and revealing everything.
  if not exists (select 1 from messages where id = p_message_id and reported) then
    raise exception 'REVEAL_ONLY_FOR_REPORTED';
  end if;

  select pr.display_name into v_name
  from round_members rm join profiles pr on pr.id = rm.profile_id
  where rm.id = v_member_id;

  insert into audit_log (round_id, actor_id, action, payload)
  values (v_round_id, v_uid, 'AUTHOR_REVEALED', jsonb_build_object(
    'message_id', p_message_id, 'member_id', v_member_id, 'reason', left(btrim(p_reason), 500)
  ));

  return v_name;
end;
$$;

grant execute on function reveal_message_author(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Blocking.
--
-- Required by both stores the day free-text chat ships (DISTRIBUTION §1), and
-- worth having on its own. Blocked BY SEAT for the same reason everything else
-- here is: you block the person who said the thing, and you do not have to be
-- told who they are to do it.
--
-- What a block actually does, because a block that does nothing is worse than
-- no block at all:
--
--   * their messages leave your board immediately;
--   * you and they cannot take seats at the same dinner again — checked when
--     somebody joins, in both directions, because a block is a statement about
--     a pair rather than about one of them.
--
-- What it deliberately does NOT do is remove them from a dinner already under
-- way. Three other people's evening is built on the chain; a block cannot be
-- allowed to collapse it silently. Blocking somebody mid-dinner hides them and
-- takes effect properly at the next one.
-- ---------------------------------------------------------------------------

create table if not exists blocked_users (
  profile_id uuid not null references profiles (id) on delete cascade,
  blocked_profile_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, blocked_profile_id),
  check (profile_id <> blocked_profile_id)
);

alter table blocked_users enable row level security;

-- Readable by the person who made it and nobody else — including, deliberately,
-- the person blocked. Telling somebody they have been blocked is how a block
-- becomes an argument.
create policy blocked_users_select_own on blocked_users
  for select using (profile_id = auth.uid());

grant select on blocked_users to authenticated;

create or replace function block_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
  v_round uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select rm.profile_id, rm.round_id into v_target, v_round
  from round_members rm where rm.id = p_member_id;
  if v_target is null then raise exception 'seat not found'; end if;

  -- You have to have been at the same table. Otherwise a member id harvested
  -- from anywhere would be a way to act on a stranger.
  if not (is_round_member(v_round, v_uid) or is_round_host(v_round, v_uid)) then
    raise exception 'not a member of this round';
  end if;
  if v_target = v_uid then raise exception 'CANNOT_BLOCK_YOURSELF'; end if;

  insert into blocked_users (profile_id, blocked_profile_id)
  values (v_uid, v_target)
  on conflict do nothing;
end;
$$;

grant execute on function block_member(uuid) to authenticated;

-- Unblocking is by profile, not by seat: by the time somebody changes their
-- mind the dinner is over and the seat may not exist any more.
create or replace function unblock_user(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from blocked_users where profile_id = auth.uid() and blocked_profile_id = p_profile_id;
end;
$$;

grant execute on function unblock_user(uuid) to authenticated;

-- The list, with names, because this one is about people you have decided to
-- know: you blocked them, so you are entitled to see who you blocked.
create or replace function list_my_blocks()
returns table (profile_id uuid, display_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select b.blocked_profile_id, p.display_name, b.created_at
  from blocked_users b
  join profiles p on p.id = b.blocked_profile_id
  where b.profile_id = auth.uid()
  order by b.created_at desc;
$$;

grant execute on function list_my_blocks() to authenticated;

-- The board, with blocked authors removed. Same body as 0037 plus one clause:
-- a phrase from somebody you have blocked is simply not there for you, and is
-- untouched for everybody else.
-- Dropped rather than replaced: it gains a column, and `create or replace`
-- will not change an OUT-parameter row type.
drop function if exists get_board(uuid);

create function get_board(p_round_id uuid)
returns table (
  message_id uuid,
  body text,
  author_name text,
  is_mine boolean,
  reported boolean,
  -- The seat, so a phrase can be blocked without anybody being named. It adds
  -- nothing a reader did not already have: the pseudonym is right there in
  -- `author_name`, and this is only the opaque handle for acting on it.
  author_member_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_member_id uuid;
begin
  if not (is_round_host(p_round_id, v_uid) or is_round_member(p_round_id, v_uid)) then
    raise exception 'not a member of this round';
  end if;

  select id into v_member_id from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE';

  return query
  select rm.id, t.body, am.secret_name, rm.author_member_id = v_member_id, rm.reported, am.id
  from round_messages rm
  join message_templates t on t.id = rm.template_id
  join round_members am on am.id = rm.author_member_id
  where rm.round_id = p_round_id
    and rm.created_at > now() - interval '24 hours'
    and (not rm.reported or rm.author_member_id = v_member_id)
    and not exists (
      select 1 from blocked_users b
      where b.profile_id = v_uid and b.blocked_profile_id = am.profile_id
    )
  order by rm.created_at;
end;
$$;

grant execute on function get_board(uuid) to authenticated;

-- Joining, with the block honoured in both directions. Same body as 0023 plus
-- one check, placed after the code and the phase so a blocked pairing never
-- becomes a way to probe whether a code is valid.
create or replace function join_round(p_code text, p_turnstile_ticket uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_locale text;
  v_secret_name text;
  v_member_id uuid;
  v_seat_count int;
  v_existing round_members;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not exists (select 1 from profiles where id = v_uid) then
    raise exception 'complete signup before joining a round';
  end if;

  if not consume_turnstile_ticket(p_turnstile_ticket, 'JOIN_ROUND', p_code) then
    raise exception 'turnstile verification failed or expired';
  end if;

  select * into v_round from rounds where join_code = p_code for update;

  if not found then
    raise exception 'INVALID_CODE';
  end if;

  if v_round.status <> 'OPEN' then
    raise exception 'ROUND_NOT_OPEN';
  end if;

  select * into v_existing from round_members
  where round_id = v_round.id and profile_id = v_uid;

  if found then
    if v_existing.status = 'REMOVED' then
      raise exception 'WAS_REMOVED';
    elsif v_existing.status = 'LEFT' then
      raise exception 'PREVIOUSLY_LEFT';
    elsif v_existing.approved then
      raise exception 'ALREADY_MEMBER';
    else
      raise exception 'AWAITING_APPROVAL';
    end if;
  end if;

  -- In both directions, and said the same way whichever direction it was. The
  -- person who blocked knows why; the person who was blocked is not told that
  -- they were, because that is how a block becomes an argument.
  if exists (
    select 1
    from round_members rm
    join blocked_users b
      on (b.profile_id = v_uid and b.blocked_profile_id = rm.profile_id)
      or (b.profile_id = rm.profile_id and b.blocked_profile_id = v_uid)
    where rm.round_id = v_round.id and rm.status = 'ACTIVE'
  ) then
    raise exception 'BLOCKED_AT_THIS_TABLE';
  end if;

  if v_round.max_players is not null then
    select count(*) into v_seat_count from round_members
    where round_id = v_round.id and status = 'ACTIVE' and approved;
    if v_seat_count >= v_round.max_players then
      raise exception 'ROUND_FULL';
    end if;
  end if;

  select locale into v_locale from profiles where id = v_uid;
  select assign_secret_name(v_round.id, coalesce(v_locale, 'en')) into v_secret_name;

  insert into round_members (round_id, profile_id, secret_name, role, approved)
  values (v_round.id, v_uid, v_secret_name, 'PLAYER', not v_round.requires_approval)
  returning id into v_member_id;

  insert into audit_log (round_id, actor_id, action, payload)
  values (v_round.id, v_uid, 'MEMBER_JOINED', jsonb_build_object('approved', not v_round.requires_approval));

  if v_round.requires_approval then
    insert into host_alerts (round_id, kind, payload)
    values (v_round.id, 'OTHER', jsonb_build_object('type', 'JOIN_REQUEST', 'member_id', v_member_id));
  end if;

  return v_member_id;
end;
$$;

grant execute on function join_round(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Telling the host, in the app and on their phone.
--
-- `my_open_alerts` is the in-app half: what is waiting, across every dinner
-- this person runs, in one call the header can poll while the app is open. It
-- is the only notification surface in this app that is not a push, and it
-- exists because the host is the one person who has work to do rather than news
-- to read.
--
-- `push_audience_for_round_host` is the other half, and it is the mirror image
-- of every other audience here: those four exclude the host on purpose, and
-- this one is the host and nobody else.
-- ---------------------------------------------------------------------------

create or replace function my_open_alerts()
returns table (round_id uuid, round_name text, open_alerts int, newest_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.name, count(a.id)::int, max(a.created_at)
  from rounds r
  join host_alerts a on a.round_id = r.id and a.resolved_at is null
  where r.host_id = auth.uid()
    and r.status not in ('ARCHIVED', 'CANCELLED')
  group by r.id, r.name
  order by max(a.created_at) desc;
$$;

grant execute on function my_open_alerts() to authenticated;

create or replace function push_audience_for_round_host(p_round_id uuid, p_actor uuid)
returns table (endpoint text, p256dh text, auth text, locale text, round_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.endpoint, s.p256dh, s.auth, p.locale, r.name
  from rounds r
  join profiles p on p.id = r.host_id and p.notifications_enabled
  join push_subscriptions s on s.profile_id = r.host_id
  where r.id = p_round_id
    -- The caller has to have been at the table. Anyone in the round may cause
    -- an alert — reporting a phrase, backing out of a dish — and anyone in the
    -- round may therefore make the host's phone ring; nobody else can.
    and (is_round_member(p_round_id, p_actor) or is_round_host(p_round_id, p_actor))
    -- Not the host's own doing. A host who reports a message on their own board
    -- does not need to be told about it.
    and r.host_id <> p_actor;
$$;

revoke all on function push_audience_for_round_host(uuid, uuid) from public, anon, authenticated;
grant execute on function push_audience_for_round_host(uuid, uuid) to service_role;

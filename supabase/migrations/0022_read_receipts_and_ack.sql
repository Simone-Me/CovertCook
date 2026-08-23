-- Two signals the app was designed around but never actually produced.
--
-- 1. UNREAD MESSAGES. `messages.read_at` has existed since 0001 and nothing
--    has ever written to it, so there is no way to tell a chat with a new
--    question in it from one you finished reading yesterday. A collapsible
--    interface makes that worse than it was on the old flat page: what you
--    don't open, you don't see. The envelope badge needs a source.
--
-- 2. "SEEN, UNDERSTOOD, NO PROBLEM". A cook who receives a brief has two
--    ways to respond — say nothing, or raise CANNOT_COOK. There is nothing
--    between them, so a sender who wrote a recipe has no way to know it
--    landed, and the host's progress view can only count what was written,
--    never what was received.
--
-- Both are small. Neither changes the phase machine.

-- ---------------------------------------------------------------------------
-- 1. Read receipts
-- ---------------------------------------------------------------------------

-- Marks the *other* party's messages in one thread as read. Never your own:
-- read_at means "the recipient has seen this", and stamping your own
-- messages would make every thread look permanently caught-up.
create or replace function mark_thread_read(p_pairing_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_pairing pairings;
  v_my_member_id uuid;
  v_incoming message_direction;
begin
  select * into v_pairing from pairings where id = p_pairing_id;
  if not found then raise exception 'pairing not found'; end if;

  select id into v_my_member_id from round_members
  where round_id = v_pairing.round_id and profile_id = v_uid
    and status = 'ACTIVE' and approved;
  if not found then raise exception 'not an active member of this round'; end if;

  -- Which direction points at me. A pairing has exactly two participants,
  -- so anyone who is neither has no business marking it read.
  if v_my_member_id = v_pairing.cook_id then
    v_incoming := 'SENDER_TO_COOK';
  elsif v_my_member_id = v_pairing.sender_id then
    v_incoming := 'COOK_TO_SENDER';
  else
    raise exception 'not a party to this conversation';
  end if;

  update messages
  set read_at = now()
  where pairing_id = p_pairing_id
    and direction = v_incoming
    and read_at is null;
end;
$$;

grant execute on function mark_thread_read(uuid) to authenticated;

-- What the Messaggi envelope's badge counts: unread messages addressed to
-- me across both of my conversations in this round — the one with the chef
-- I write for, and the one with the chef who writes for me.
create or replace function get_unread_count(p_round_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_my_member_id uuid;
  v_count int;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  select id into v_my_member_id from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE' and approved;
  if not found then raise exception 'not an active member of this round'; end if;

  select count(*) into v_count
  from messages m
  join pairings p on p.id = m.pairing_id
  where p.round_id = p_round_id
    and p.assignment_version = v_round.assignment_version
    and m.read_at is null
    and (
      (p.cook_id = v_my_member_id and m.direction = 'SENDER_TO_COOK')
      or (p.sender_id = v_my_member_id and m.direction = 'COOK_TO_SENDER')
    );

  return v_count;
end;
$$;

grant execute on function get_unread_count(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Acknowledgement
-- ---------------------------------------------------------------------------

alter table briefs add column acknowledged_at timestamptz;

comment on column briefs.acknowledged_at is
  'When the Cook confirmed they have read the brief and see no problem. Distinct from CANNOT_COOK, which is the opposite answer; null means neither has happened yet.';

create or replace function acknowledge_brief(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_my_member_id uuid;
  v_updated int;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  select id into v_my_member_id from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE' and approved;
  if not found then raise exception 'not an active member of this round'; end if;

  -- Only the cook can acknowledge, and only a brief that has actually been
  -- handed to them — acknowledging your own writing would mean nothing.
  update briefs b
  set acknowledged_at = now()
  from pairings p
  where p.id = b.pairing_id
    and p.round_id = p_round_id
    and p.assignment_version = v_round.assignment_version
    and p.cook_id = v_my_member_id
    and b.status = 'SUBMITTED';
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception 'no submitted brief to acknowledge';
  end if;
end;
$$;

grant execute on function acknowledge_brief(uuid) to authenticated;

-- get_my_brief gains the flag so the Cook's own view can show whether they
-- already confirmed, rather than offering the button forever. Same body as
-- 0014 with one column added.
--
-- Dropped first, not just replaced: `create or replace` cannot change a
-- function's return type, and a RETURNS TABLE signature is its return type
-- — adding a column makes it "cannot change return type of existing
-- function". The 0013/0018 create_round changes hit the same rule.
drop function if exists get_my_brief(uuid);

create or replace function get_my_brief(p_round_id uuid)
returns table (
  pairing_id uuid,
  brief_id uuid,
  dish_name text,
  course course,
  procedure text,
  external_url text,
  difficulty int,
  est_cost text,
  prep_minutes int,
  note_to_cook text,
  contains_tags text[],
  ingredients jsonb,
  acknowledged boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_my_member_id uuid;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  select id into v_my_member_id from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE' and approved;
  if not found then raise exception 'not an active member of this round'; end if;

  if v_round.status not in ('BRIEFS_CLOSED', 'DINNER', 'VOTING', 'RESULTS', 'ARCHIVED') then
    raise exception 'briefs are not visible to cooks yet';
  end if;

  return query
    select
      p.id, b.id, b.dish_name, b.course, b.procedure, b.external_url, b.difficulty,
      b.est_cost, b.prep_minutes, b.note_to_cook, b.contains_tags,
      coalesce(
        (select jsonb_agg(jsonb_build_object('name', bi.name, 'quantity', bi.quantity, 'unit', bi.unit) order by bi.position)
         from brief_ingredients bi where bi.brief_id = b.id),
        '[]'::jsonb
      ),
      -- a timestamp would be a day-granularity question of its own; the
      -- Cook only needs to know whether they already answered
      (b.acknowledged_at is not null)
    from briefs b
    join pairings p on p.id = b.pairing_id
    where p.round_id = p_round_id
      and p.assignment_version = v_round.assignment_version
      and p.cook_id = v_my_member_id;
end;
$$;

grant execute on function get_my_brief(uuid) to authenticated;

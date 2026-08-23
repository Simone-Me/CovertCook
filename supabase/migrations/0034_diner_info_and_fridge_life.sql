-- Three things a dinner page kept failing to say, and one the fridge kept
-- saying for too long.

-- ---------------------------------------------------------------------------
-- 1. Where the dinner actually is.
--
-- `location` was one free-text box doing the work of a city and a street, so
-- the envelope could only ever show one line and it was usually the wrong
-- one. `notes` already existed and was unused by the UI. Splitting the city
-- out is what lets the envelope show "Lyon" without the reader opening it.
-- ---------------------------------------------------------------------------

alter table rounds add column if not exists city text;

comment on column rounds.city is
  'City only. The street goes in location, anything else in notes — the fridge-lid summary on the round page shows this one.';

drop function if exists update_round_details(uuid, text, timestamptz, text);

create or replace function update_round_details(
  p_round_id uuid,
  p_location text,
  p_city text,
  p_notes text,
  p_dinner_at timestamptz,
  p_timezone text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_status round_status;
begin
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the host can edit round details';
  end if;

  select status into v_status from rounds where id = p_round_id;
  if not found then
    raise exception 'round not found';
  end if;

  if v_status in ('DINNER', 'VOTING', 'RESULTS', 'ARCHIVED', 'CANCELLED') then
    raise exception 'diner details can no longer be edited once dinner has started';
  end if;

  update rounds
  set location = p_location,
      city = p_city,
      notes = p_notes,
      dinner_at = p_dinner_at,
      timezone = p_timezone
  where id = p_round_id;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'ROUND_DETAILS_UPDATED', jsonb_build_object(
    'location', p_location, 'city', p_city, 'notes', p_notes,
    'dinner_at', p_dinner_at, 'timezone', p_timezone
  ));
end;
$$;

grant execute on function update_round_details(uuid, text, text, text, timestamptz, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The fridge forgets after a day.
--
-- The board carries "what a lovely day!" and "don't burn a finger" — cheerful
-- noise that is worth reading for an evening and worth nothing after it. Left
-- alone it grows forever, so every dinner ever played keeps paying storage
-- for jokes nobody will read again.
--
-- Two halves, and both are needed. The read filter is the guarantee: whatever
-- is still on disk, nothing older than a day is served. The delete is the
-- housekeeping: posting is the only moment the board is written to anyway, so
-- it is the cheapest place to sweep, and it needs no scheduler.
--
-- Deleting only within the round being posted to keeps the sweep small and
-- keeps one busy dinner from paying for every other dinner's history.
-- ---------------------------------------------------------------------------

-- Dropped rather than replaced: created_day leaves the payload, and Postgres
-- will not change a function's OUT columns in place.
drop function if exists get_board(uuid);

create or replace function get_board(p_round_id uuid)
returns table (
  message_id uuid,
  body text,
  is_mine boolean,
  reported boolean
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

  -- created_day is gone from the payload too: with a day's retention the date
  -- is always today, so printing it was a line of text that never varied.
  return query
  select rm.id, t.body, rm.author_member_id = v_member_id, rm.reported
  from round_messages rm
  join message_templates t on t.id = rm.template_id
  where rm.round_id = p_round_id
    and rm.created_at > now() - interval '24 hours'
    and (not rm.reported or rm.author_member_id = v_member_id)
  order by rm.created_at;
end;
$$;

grant execute on function get_board(uuid) to authenticated;

create or replace function post_to_board(p_round_id uuid, p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_member_id uuid;
  v_category message_category;
  v_recent int;
begin
  select id into v_member_id from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE' and approved;
  if not found then raise exception 'not an active member of this round'; end if;

  select category into v_category from message_templates
  where id = p_template_id and active;
  if not found then raise exception 'unknown phrase'; end if;
  if v_category <> 'BOARD' then
    raise exception 'that phrase is not for the board';
  end if;

  -- Same 10/hour ceiling as the pairing threads, per person per round.
  select count(*) into v_recent from round_messages
  where round_id = p_round_id and author_member_id = v_member_id
    and created_at > now() - interval '1 hour';
  if v_recent >= 10 then
    raise exception 'RATE_LIMIT';
  end if;

  delete from round_messages
  where round_id = p_round_id and created_at <= now() - interval '24 hours';

  insert into round_messages (round_id, author_member_id, template_id)
  values (p_round_id, v_member_id, p_template_id);
end;
$$;

grant execute on function post_to_board(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Whether the fridge has anything new in it.
--
-- The Messages envelope can show one mark, and it has to choose: a chef
-- speaking to you personally always outranks the table being cheerful, so the
-- frontend only falls back to the fridge when there is no chef waiting. That
-- ranking is a UI decision and lives there; this side just answers "how many
-- board lines have appeared since you last looked".
--
-- Your own posts never count: nothing you just said is news to you.
-- ---------------------------------------------------------------------------

alter table round_members add column if not exists board_seen_at timestamptz;

create or replace function get_board_unread(p_round_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_member_id uuid;
  v_seen timestamptz;
  v_count int;
begin
  select id, board_seen_at into v_member_id, v_seen from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE';
  if not found then return 0; end if;

  select count(*) into v_count from round_messages
  where round_id = p_round_id
    and author_member_id <> v_member_id
    and not reported
    and created_at > now() - interval '24 hours'
    and (v_seen is null or created_at > v_seen);

  return v_count;
end;
$$;

grant execute on function get_board_unread(uuid) to authenticated;

-- Cleared by opening the fridge, never on a timer — the same rule the pairing
-- threads follow (0022). A badge that fades by itself stops meaning anything.
create or replace function mark_board_read(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update round_members
  set board_seen_at = now()
  where round_id = p_round_id and profile_id = auth.uid() and status = 'ACTIVE';
end;
$$;

grant execute on function mark_board_read(uuid) to authenticated;

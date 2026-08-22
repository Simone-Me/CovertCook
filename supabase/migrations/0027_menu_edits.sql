-- Editing the menu went through direct table CRUD against the host-write
-- RLS policy, which meant three different failures with no useful message:
--
--   1. Deleting a course after the roulette has run aborts with
--      "update or delete on table slots violates foreign key constraint
--      pairings_slot_id_fkey" — pairings.slot_id is NOT NULL and points at
--      it. Accurate, unreadable, and it also fires when switching the menu
--      back to free, since that deletes every course at once.
--   2. Nothing stopped the attempt in the first place, because RLS asks
--      "are you the host", not "is this still a menu anyone can change".
--   3. Everything else surfaced as a generic "something went wrong".
--
-- The fix is not a nicer error on the same path: it's that changing the
-- menu is a decision with preconditions, and preconditions belong in a
-- function rather than in a policy that only knows who you are.
--
-- The line is the same one set_slot_mode (0026) already draws: a course can
-- be added or removed until the roulette assigns it to somebody. After
-- that, a menu edit is really a re-roll, and it should be asked for as one.

create or replace function add_course(p_round_id uuid, p_course course)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_slot_id uuid;
begin
  select * into v_round from rounds where id = p_round_id for update;
  if not found then raise exception 'round not found'; end if;
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the Executive Chef can change the menu';
  end if;
  if v_round.status not in ('DRAFT', 'OPEN') then
    raise exception 'MENU_LOCKED';
  end if;
  if v_round.slot_mode <> 'CATEGORIES' then
    raise exception 'this dinner has no composed menu';
  end if;

  insert into slots (round_id, course) values (p_round_id, p_course)
  returning id into v_slot_id;
  return v_slot_id;
end;
$$;

grant execute on function add_course(uuid, course) to authenticated;

create or replace function remove_course(p_round_id uuid, p_slot_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
begin
  select * into v_round from rounds where id = p_round_id for update;
  if not found then raise exception 'round not found'; end if;
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the Executive Chef can change the menu';
  end if;
  if v_round.status not in ('DRAFT', 'OPEN') then
    raise exception 'MENU_LOCKED';
  end if;

  -- Belt and braces: the phase check above should already make this
  -- impossible, but a course that somebody is cooking must never vanish
  -- underneath them, whatever route got here.
  if exists (select 1 from pairings p where p.slot_id = p_slot_id) then
    raise exception 'COURSE_IN_USE';
  end if;

  delete from slots where id = p_slot_id and round_id = p_round_id;
end;
$$;

grant execute on function remove_course(uuid, uuid) to authenticated;

-- set_slot_mode deletes every course when switching back to free, so it
-- carries the same risk and needs the same guard — with a message that says
-- which of the two things went wrong.
create or replace function set_slot_mode(p_round_id uuid, p_mode slot_mode)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
begin
  select * into v_round from rounds where id = p_round_id for update;
  if not found then raise exception 'round not found'; end if;

  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the Executive Chef can change the menu';
  end if;

  if v_round.status not in ('DRAFT', 'OPEN') then
    raise exception 'MENU_LOCKED';
  end if;

  if v_round.slot_mode = p_mode then
    return;
  end if;

  if p_mode = 'FREE' then
    if exists (
      select 1 from pairings p join slots s on s.id = p.slot_id
      where s.round_id = p_round_id
    ) then
      raise exception 'COURSE_IN_USE';
    end if;
    delete from slots where round_id = p_round_id;
  end if;

  update rounds set slot_mode = p_mode where id = p_round_id;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'ROUND_UPDATED', jsonb_build_object('slot_mode', p_mode));
end;
$$;

grant execute on function set_slot_mode(uuid, slot_mode) to authenticated;

-- The direct-CRUD path that produced the raw constraint error is closed.
-- Reading stays open — players need to see the menu they're cooking for.
revoke insert, update, delete on slots from authenticated;

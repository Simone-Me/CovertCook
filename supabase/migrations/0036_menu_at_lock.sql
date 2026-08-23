-- The menu is composed when the table is final, and a course can be changed
-- rather than only added and thrown away.
--
-- Two problems, one window.
--
-- The menu had to balance against the number of chefs — one course per chef —
-- but it could only be edited in DRAFT and OPEN, which are exactly the phases
-- where that number keeps moving. Every new arrival broke the sum the host had
-- just finished making. LOCKED is the first moment the table is settled and
-- the last before the roulette runs, so that is where composing a menu
-- belongs, and the phase gates open to let it happen there.
--
-- COURSE_IN_USE stays and does the real protecting: once pairings exist, a
-- course somebody is cooking must never move underneath them, whatever phase
-- the round claims to be in.

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

  if v_round.status not in ('DRAFT', 'OPEN', 'LOCKED') then
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
  if v_round.status not in ('DRAFT', 'OPEN', 'LOCKED') then
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
  if v_round.status not in ('DRAFT', 'OPEN', 'LOCKED') then
    raise exception 'MENU_LOCKED';
  end if;

  if exists (select 1 from pairings p where p.slot_id = p_slot_id) then
    raise exception 'COURSE_IN_USE';
  end if;

  delete from slots where id = p_slot_id and round_id = p_round_id;
end;
$$;

-- Changing a course, rather than deleting one and adding another.
--
-- The two-step version was worse than clumsy: between the delete and the
-- insert the menu was one course short of the table, which is the exact
-- condition generate_assignment refuses on — so a host interrupted halfway
-- through was left with a dinner that would not start, and no clue why.
-- One statement, one lock, no window.
create or replace function change_course(p_round_id uuid, p_slot_id uuid, p_course course)
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
  if v_round.status not in ('DRAFT', 'OPEN', 'LOCKED') then
    raise exception 'MENU_LOCKED';
  end if;
  if v_round.slot_mode <> 'CATEGORIES' then
    raise exception 'this dinner has no composed menu';
  end if;

  -- Somebody is already cooking this one.
  if exists (select 1 from pairings p where p.slot_id = p_slot_id) then
    raise exception 'COURSE_IN_USE';
  end if;

  update slots set course = p_course
  where id = p_slot_id and round_id = p_round_id;

  if not found then
    raise exception 'no such course in this dinner';
  end if;
end;
$$;

grant execute on function change_course(uuid, uuid, course) to authenticated;

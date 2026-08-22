-- The menu could only ever be decided in the four seconds before a round
-- was created.
--
-- slot_mode was create-time-only, like every other round setting, and the
-- courses UI only exists for a CATEGORIES round — so a host who took the
-- default and later wanted a proper menu had no route to one. It looked
-- like the menu was broken; it was simply never offered again.
--
-- 0018's note said keeping it immutable was correct, and it was, but for a
-- narrower reason than "settings are immutable": CATEGORIES needs each
-- brief to know its course *before* it is written. That is only true once
-- the assignment exists. Before LOCKED there is no chain and no brief, so
-- switching is free — and this refuses at exactly that line rather than at
-- creation.
--
-- Switching to FREE deletes the slots. They describe a menu nobody is
-- cooking any more, and leaving them would let a later switch back to
-- CATEGORIES silently resurrect a menu the host thought they had thrown
-- away.

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

  -- Named, because the frontend has to explain it rather than repeat it.
  if v_round.status not in ('DRAFT', 'OPEN') then
    raise exception 'MENU_LOCKED';
  end if;

  if v_round.slot_mode = p_mode then
    return;
  end if;

  if p_mode = 'FREE' then
    delete from slots where round_id = p_round_id;
  end if;

  update rounds set slot_mode = p_mode where id = p_round_id;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'ROUND_UPDATED', jsonb_build_object('slot_mode', p_mode));
end;
$$;

grant execute on function set_slot_mode(uuid, slot_mode) to authenticated;

-- ---------------------------------------------------------------------------
-- What the host needs to see while composing a menu.
--
-- generate_assignment already refuses unless the courses add up to the
-- number of seated chefs — one course per chef, because every chef cooks
-- exactly one dish. That rule was enforced and never explained, so a host
-- who was one short met a refusal instead of a count. This returns both
-- numbers so the screen can show the arithmetic as it happens.
-- ---------------------------------------------------------------------------

create or replace function get_menu_status(p_round_id uuid)
returns table (courses int, seats int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not (is_round_host(p_round_id, v_uid) or is_round_member(p_round_id, v_uid)) then
    raise exception 'not a member of this round';
  end if;

  return query
  select
    (select count(*)::int from slots s where s.round_id = p_round_id),
    (select count(*)::int from round_members m
      where m.round_id = p_round_id and m.status = 'ACTIVE' and m.approved);
end;
$$;

grant execute on function get_menu_status(uuid) to authenticated;

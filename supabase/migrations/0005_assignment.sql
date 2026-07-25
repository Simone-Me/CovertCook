-- The secret graph: generation, splice (late joiner), manual edit, removal,
-- and the one function that's allowed to reveal it (get_chain, host-only,
-- behind the "host can play blind" spoiler gate).
--
-- generate_assignment deliberately does NOT return sender/cook identities —
-- only get_chain does, and every call to get_chain stamps host_saw_chain_at.
-- A host who re-rolls without calling get_chain never sees the pairing.

-- ---------------------------------------------------------------------------
-- generate_assignment — Sattolo-style single cycle over active+approved
-- members. Refused once any brief exists (checked before wiping anything).
-- sum(slots) must equal active player count in CATEGORIES mode; FREE mode
-- materialises exactly one OTHER slot per player so slot_id is never null.
-- ---------------------------------------------------------------------------

create or replace function generate_assignment(p_round_id uuid)
returns int -- the new assignment_version
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_members uuid[];
  v_slot_ids uuid[];
  v_n int;
  v_slot_count int;
  v_attempt int := 0;
  v_ok boolean;
  v_new_version int;
  i int;
  j int;
  tmp uuid;
begin
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the host can generate an assignment';
  end if;

  select * into v_round from rounds where id = p_round_id for update;

  if v_round.status <> 'LOCKED' then
    raise exception 'round must be LOCKED to generate or re-roll an assignment';
  end if;

  if exists (
    select 1 from briefs b join pairings p on p.id = b.pairing_id where p.round_id = p_round_id
  ) then
    raise exception 'cannot re-roll: briefs already exist for this round';
  end if;

  -- safe to wipe: the check above guarantees no brief references any
  -- existing pairing row for this round.
  delete from pairings where round_id = p_round_id;

  select array_agg(id) into v_members from round_members
  where round_id = p_round_id and status = 'ACTIVE' and approved;

  v_n := coalesce(array_length(v_members, 1), 0);
  if v_n < 3 then
    raise exception 'need at least 3 active, approved players';
  end if;

  if v_round.slot_mode = 'FREE' then
    delete from slots where round_id = p_round_id;
    insert into slots (round_id, course)
    select p_round_id, 'OTHER' from generate_series(1, v_n);
  end if;

  select array_agg(id) into v_slot_ids from slots where round_id = p_round_id;
  v_slot_count := coalesce(array_length(v_slot_ids, 1), 0);

  if v_slot_count <> v_n then
    raise exception 'slot count (%) must equal active player count (%) before assigning', v_slot_count, v_n;
  end if;

  if v_n = 2 and not v_round.allow_mutual_pairs then
    raise exception 'two players can only be assigned when mutual pairs are allowed';
  end if;

  v_new_version := v_round.assignment_version + 1;

  <<retry>>
  loop
    v_attempt := v_attempt + 1;
    if v_attempt > 1000 then
      raise exception 'could not find an assignment honouring every exclusion after 1000 attempts';
    end if;

    for i in reverse v_n..2 loop
      j := 1 + floor(random() * i)::int;
      tmp := v_members[i]; v_members[i] := v_members[j]; v_members[j] := tmp;
    end loop;

    v_ok := true;
    for i in 1..v_n loop
      if exists (
        select 1 from exclusion_pairs ep
        where ep.round_id = p_round_id
          and ((ep.member_a = v_members[i] and ep.member_b = v_members[(i % v_n) + 1])
            or (ep.member_a = v_members[(i % v_n) + 1] and ep.member_b = v_members[i]))
      ) then
        v_ok := false;
        exit;
      end if;
    end loop;

    exit retry when v_ok;
  end loop;

  for i in reverse v_slot_count..2 loop
    j := 1 + floor(random() * i)::int;
    tmp := v_slot_ids[i]; v_slot_ids[i] := v_slot_ids[j]; v_slot_ids[j] := tmp;
  end loop;

  for i in 1..v_n loop
    insert into pairings (round_id, sender_id, cook_id, slot_id, assignment_version, lap)
    values (p_round_id, v_members[i], v_members[(i % v_n) + 1], v_slot_ids[i], v_new_version, 0);
  end loop;

  update rounds set assignment_version = v_new_version where id = p_round_id;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'ASSIGNMENT_GENERATED', jsonb_build_object('version', v_new_version, 'attempts', v_attempt));

  return v_new_version;
end;
$$;

grant execute on function generate_assignment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- splice_member — insert a late joiner N into edge A->B: A->N, N->B.
-- Prefers an edge whose brief isn't submitted yet (content stays valid,
-- since dietary is round-wide, so only the addressee changes). If every
-- sender has submitted, requires p_confirm_dish_change=true, because B's
-- dish will be replaced by N's brand-new one.
-- ---------------------------------------------------------------------------

create or replace function splice_member(
  p_round_id uuid,
  p_member_id uuid,
  p_confirm_dish_change boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_member round_members;
  v_edge pairings;
  v_new_slot_id uuid;
  v_forced boolean := false;
begin
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the host can splice a member in';
  end if;

  select * into v_round from rounds where id = p_round_id for update;

  if v_round.status not in ('ASSIGNED', 'BRIEFS_CLOSED') then
    raise exception 'splice only applies once an assignment exists';
  end if;

  select * into v_member from round_members where id = p_member_id and round_id = p_round_id;
  if not found or v_member.status <> 'ACTIVE' or not v_member.approved then
    raise exception 'member must already be an active, approved round member';
  end if;

  if exists (
    select 1 from pairings
    where round_id = p_round_id and assignment_version = v_round.assignment_version
      and (sender_id = p_member_id or cook_id = p_member_id)
  ) then
    raise exception 'member is already in the chain';
  end if;

  select p.* into v_edge from pairings p
  where p.round_id = p_round_id and p.assignment_version = v_round.assignment_version
    and not exists (select 1 from briefs b where b.pairing_id = p.id and b.status = 'SUBMITTED')
  order by random() limit 1;

  if not found then
    v_forced := true;
    if not p_confirm_dish_change then
      raise exception using
        errcode = 'P0001',
        message = 'SPLICE_REQUIRES_CONFIRMATION',
        detail = 'Every sender has submitted; splicing replaces one already-cooked dish. Re-call with p_confirm_dish_change = true to proceed.';
    end if;

    select p.* into v_edge from pairings p
    where p.round_id = p_round_id and p.assignment_version = v_round.assignment_version
    order by random() limit 1;
  end if;

  -- A brand new dish is being introduced for N to write, so it needs its
  -- own slot; A's redirected edge keeps the original slot (same dish,
  -- same course, just a different cook).
  insert into slots (round_id, course) values (p_round_id, 'OTHER') returning id into v_new_slot_id;

  update pairings set cook_id = p_member_id where id = v_edge.id;

  insert into pairings (round_id, sender_id, cook_id, slot_id, assignment_version, lap)
  values (p_round_id, p_member_id, v_edge.cook_id, v_new_slot_id, v_round.assignment_version, v_edge.lap);

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'MEMBER_SPLICED', jsonb_build_object(
    'member_id', p_member_id,
    'inserted_after_sender', v_edge.sender_id,
    'inserted_before_cook', v_edge.cook_id,
    'replaced_submitted_dish', v_forced
  ));

  insert into host_alerts (round_id, kind, pairing_id, payload)
  values (p_round_id, 'OTHER', v_edge.id, jsonb_build_object(
    'type', 'SPLICE_NOTIFY',
    'affected_sender_member_id', v_edge.sender_id,
    'affected_cook_member_id', v_edge.cook_id,
    'new_member_id', p_member_id
  ));
end;
$$;

grant execute on function splice_member(uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- set_pairing — manual edit with automatic swap: setting sender X to cook
-- for Y requires Y's old sender to take over X's old cook, so every member
-- keeps exactly one outgoing and one incoming edge (still a valid cycle).
-- ---------------------------------------------------------------------------

create or replace function set_pairing(p_round_id uuid, p_sender_id uuid, p_cook_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_edge_x pairings; -- current pairing where sender = p_sender_id
  v_edge_z pairings; -- current pairing where cook = p_cook_id
begin
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the host can manually edit pairings';
  end if;

  if p_sender_id = p_cook_id then
    raise exception 'a member cannot cook for themself';
  end if;

  select * into v_round from rounds where id = p_round_id for update;

  if v_round.status not in ('ASSIGNED', 'BRIEFS_CLOSED') then
    raise exception 'pairings can only be edited once an assignment exists';
  end if;

  select * into v_edge_x from pairings
  where round_id = p_round_id and assignment_version = v_round.assignment_version and sender_id = p_sender_id;
  if not found then raise exception 'sender is not part of the current assignment'; end if;

  select * into v_edge_z from pairings
  where round_id = p_round_id and assignment_version = v_round.assignment_version and cook_id = p_cook_id;
  if not found then raise exception 'cook is not part of the current assignment'; end if;

  if v_edge_x.id = v_edge_z.id then
    raise exception 'that pairing already exists';
  end if;

  if not v_round.allow_mutual_pairs and v_edge_z.sender_id = p_cook_id then
    raise exception 'this swap would create a mutual pair, which this round disallows';
  end if;

  if exists (
    select 1 from exclusion_pairs ep
    where ep.round_id = p_round_id
      and ((ep.member_a = p_sender_id and ep.member_b = p_cook_id)
        or (ep.member_a = p_cook_id and ep.member_b = p_sender_id))
  ) then
    raise exception 'this pairing violates a configured exclusion';
  end if;

  -- swap: X's old cook now receives from Z's old sender, so both edges
  -- stay filled and the graph remains a single-in/single-out permutation.
  update pairings set cook_id = p_cook_id where id = v_edge_x.id;
  update pairings set cook_id = v_edge_x.cook_id where id = v_edge_z.id;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'PAIRING_MANUALLY_EDITED', jsonb_build_object(
    'sender_id', p_sender_id, 'new_cook_id', p_cook_id
  ));
end;
$$;

grant execute on function set_pairing(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- remove_member — closes A->X->B into A->B. Four cases depending on which
-- of A's or X's briefs were already submitted; the finished one survives,
-- reattributed via original_sender_id if the true author (X) is the one
-- leaving. Both submitted requires explicit confirmation (one dish is lost).
-- ---------------------------------------------------------------------------

create or replace function remove_member(
  p_round_id uuid,
  p_member_id uuid,
  p_confirm_dish_change boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_member round_members;
  v_edge_in pairings;  -- A -> X (X = p_member_id, as cook)
  v_edge_out pairings; -- X -> B (X = p_member_id, as sender)
  v_a_submitted boolean;
  v_x_submitted boolean;
  v_discarded_slot_id uuid;
begin
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the host can remove a member';
  end if;

  select * into v_round from rounds where id = p_round_id for update;

  select * into v_member from round_members where id = p_member_id and round_id = p_round_id;
  if not found or v_member.status <> 'ACTIVE' then
    raise exception 'member is not an active member of this round';
  end if;

  if v_member.role = 'HOST' then
    raise exception 'transfer_host before removing the host';
  end if;

  if v_round.status in ('DRAFT', 'OPEN', 'LOCKED') then
    update round_members set status = 'REMOVED', removed_at = now() where id = p_member_id;
    insert into audit_log (round_id, actor_id, action, payload)
    values (p_round_id, v_uid, 'MEMBER_REMOVED', jsonb_build_object('member_id', p_member_id));
    return;
  end if;

  select * into v_edge_in from pairings
  where round_id = p_round_id and assignment_version = v_round.assignment_version and cook_id = p_member_id;
  select * into v_edge_out from pairings
  where round_id = p_round_id and assignment_version = v_round.assignment_version and sender_id = p_member_id;

  if v_edge_in.id is null or v_edge_out.id is null then
    raise exception 'member is not part of the current assignment';
  end if;

  v_a_submitted := exists (select 1 from briefs where pairing_id = v_edge_in.id and status = 'SUBMITTED');
  v_x_submitted := exists (select 1 from briefs where pairing_id = v_edge_out.id and status = 'SUBMITTED');

  if v_a_submitted and v_x_submitted and not p_confirm_dish_change then
    raise exception using
      errcode = 'P0001',
      message = 'REMOVE_REQUIRES_CONFIRMATION',
      detail = 'Both the incoming and outgoing dish are already submitted; removing this member discards one (the departing member''s). Re-call with p_confirm_dish_change = true to proceed.';
  end if;

  if v_x_submitted and not v_a_submitted then
    -- keep the departing member's finished brief; reattribute the surviving
    -- pairing row to the active sender A, crediting X honestly via
    -- original_sender_id so the reveal doesn't lie about authorship.
    update pairings
    set sender_id = v_edge_in.sender_id,
        original_sender_id = coalesce(original_sender_id, v_edge_out.sender_id)
    where id = v_edge_out.id;
    delete from pairings where id = v_edge_in.id;
    v_discarded_slot_id := v_edge_in.slot_id;
  else
    -- keep A's brief (submitted, draft, or not started — irrelevant):
    -- redirect it to cook for B instead of the departing member.
    update pairings set cook_id = v_edge_out.cook_id where id = v_edge_in.id;
    delete from pairings where id = v_edge_out.id;
    v_discarded_slot_id := v_edge_out.slot_id;
  end if;

  delete from slots where id = v_discarded_slot_id;

  update round_members set status = 'REMOVED', removed_at = now() where id = p_member_id;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'MEMBER_REMOVED', jsonb_build_object(
    'member_id', p_member_id,
    'kept_departing_members_brief', (v_x_submitted and not v_a_submitted)
  ));

  insert into host_alerts (round_id, kind, payload)
  values (p_round_id, 'OTHER', jsonb_build_object(
    'type', 'CHAIN_CLOSED_BY_REMOVAL',
    'sender_id', v_edge_in.sender_id, 'cook_id', v_edge_out.cook_id
  ));
end;
$$;

grant execute on function remove_member(uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- get_chain — host only. Every call is "the host looked"; stamps
-- host_saw_chain_at the first time so the UI can show whether they peeked.
-- ---------------------------------------------------------------------------

create or replace function get_chain(p_round_id uuid)
returns table (
  sender_member_id uuid, sender_secret_name text, sender_display_name text,
  cook_member_id uuid, cook_secret_name text, cook_display_name text,
  slot_id uuid, course course, lap int
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
begin
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the host can view the chain';
  end if;

  select * into v_round from rounds where id = p_round_id;

  update rounds set host_saw_chain_at = now() where id = p_round_id and host_saw_chain_at is null;

  return query
    select
      p.sender_id, sm.secret_name, spr.display_name,
      p.cook_id, cm.secret_name, cpr.display_name,
      p.slot_id, s.course, p.lap
    from pairings p
    join round_members sm on sm.id = p.sender_id
    join round_members cm on cm.id = p.cook_id
    join profiles spr on spr.id = sm.profile_id
    join profiles cpr on cpr.id = cm.profile_id
    join slots s on s.id = p.slot_id
    where p.round_id = p_round_id and p.assignment_version = v_round.assignment_version
    order by p.lap, sm.secret_name;
end;
$$;

grant execute on function get_chain(uuid) to authenticated;

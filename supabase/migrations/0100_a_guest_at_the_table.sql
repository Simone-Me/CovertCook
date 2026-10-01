-- A guest: at the table, cooking their own dish, outside the chain.
--
-- A friend who wants to come to the dinner but not to write for anybody (or be
-- written for) was a choice between leaving them out and bending the game.
-- A guest keeps everything that makes the evening a dinner — a course on the
-- menu, a recipe of their own, a dish to vote on, a name at the table — and
-- drops the one thing that is the exchange itself.
--
-- HOW IT IS MODELLED. A guest's dish is a pairing with themselves (`is_self`).
-- Every function that reads recipes, ballots, progress or results already goes
-- through pairings and keeps working unchanged; only the chain views skip
-- is_self, and a trigger makes sure no chain surgery (swap, splice, removal)
-- can ever attach a guest to somebody else's dish.
--
-- WHO DECIDES, AND WHEN. The person themselves, while sign-ups are open
-- (set_my_guest). Once the roulette has dealt, the role is fixed.

alter table round_members add column if not exists is_guest boolean not null default false;
alter table pairings add column if not exists is_self boolean not null default false;

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'pairings'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%sender_id <> cook_id%'
  loop
    execute format('alter table pairings drop constraint %I', c);
  end loop;
end $$;

alter table pairings drop constraint if exists pairings_self_or_distinct;
alter table pairings add constraint pairings_self_or_distinct
  check ((is_self and sender_id = cook_id) or (not is_self and sender_id <> cook_id));

create or replace function guard_guest_pairings()
returns trigger
language plpgsql
as $$
begin
  if not new.is_self and exists (
    select 1 from round_members m where m.id in (new.sender_id, new.cook_id) and m.is_guest
  ) then
    raise exception 'GUEST_NOT_IN_CHAIN';
  end if;
  return new;
end;
$$;

drop trigger if exists pairings_guard_guests on pairings;
create trigger pairings_guard_guests
  before insert or update of sender_id, cook_id on pairings
  for each row execute function guard_guest_pairings();

create or replace function set_my_guest(p_round_id uuid, p_guest boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_member round_members;
  v_round rounds;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  select * into v_member from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE';
  if not found then raise exception 'not an active member of this round'; end if;

  if v_member.role = 'HOST' then
    raise exception 'GUEST_NOT_HOST';
  end if;

  if v_round.status <> 'OPEN' then
    raise exception 'GUEST_LOCKED';
  end if;

  update round_members set is_guest = p_guest where id = v_member.id;
end;
$$;

grant execute on function set_my_guest(uuid, boolean) to authenticated;

drop function if exists list_round_members(uuid);

create or replace function list_round_members(p_round_id uuid)
returns table (
  id uuid,
  round_id uuid,
  profile_id uuid,
  secret_name text,
  display_name text,
  role member_role,
  status member_status,
  approved boolean,
  removal_requested_at timestamptz,
  is_guest boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_revealed boolean;
  v_identities boolean;
  v_is_host boolean;
begin
  if not exists (
    select 1 from round_members m
    where m.round_id = p_round_id
      and m.profile_id = v_uid
      and m.status = 'ACTIVE'
  ) then
    raise exception 'not a member of this round' using errcode = '42501';
  end if;

  select * into v_round from rounds r where r.id = p_round_id;
  v_is_host := is_round_host(p_round_id, v_uid);

  v_revealed := v_round.status is distinct from 'DRAFT' and v_round.status is distinct from 'OPEN';
  v_identities := names_are_open(p_round_id, v_uid);

  return query
  select
    m.id,
    m.round_id,
    case when m.profile_id = v_uid or v_identities then m.profile_id end,
    case when v_revealed or m.profile_id = v_uid then m.secret_name end,
    case when v_identities then pr.display_name end,
    m.role,
    m.status,
    m.approved,
    case
      when m.profile_id = v_uid or v_is_host
      then m.removal_requested_at
    end,
    m.is_guest
  from round_members m
  join profiles pr on pr.id = m.profile_id
  where m.round_id = p_round_id
  -- Ordered by whichever name is actually printed, so the list reads
  -- alphabetically instead of arbitrarily — and never by anything that
  -- survives the mask, which would leak the order it is hiding.
  order by
    case when v_identities then lower(pr.display_name) end nulls last,
    case when v_revealed or m.profile_id = v_uid then m.secret_name end nulls first,
    m.id;
end;
$$;

grant execute on function list_round_members(uuid) to authenticated;

create or replace function generate_assignment(p_round_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_members uuid[];
  v_guests uuid[];
  v_guest_n int;
  v_slot_ids uuid[];
  v_threads text[];
  v_pool_n int;
  v_n int;
  v_slot_count int;
  v_attempt int := 0;
  v_ok boolean;
  v_new_version int;
  i int;
  j int;
  tmp uuid;
  tmps text;
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

  delete from pairings where round_id = p_round_id;

  -- Guests are at the table and cook their own dish, but stay out of the
  -- chain: nobody writes for them and they write for nobody (0100).
  select array_agg(id) into v_members from round_members
  where round_id = p_round_id and status = 'ACTIVE' and approved and not is_guest;
  select array_agg(id) into v_guests from round_members
  where round_id = p_round_id and status = 'ACTIVE' and approved and is_guest;

  v_n := coalesce(array_length(v_members, 1), 0);
  v_guest_n := coalesce(array_length(v_guests, 1), 0);
  if v_n < 3 then
    raise exception 'need at least 3 active, approved players';
  end if;

  if v_round.slot_mode = 'FREE' then
    delete from slots where round_id = p_round_id;
    insert into slots (round_id, course)
    select p_round_id, 'OTHER' from generate_series(1, v_n + v_guest_n);
  end if;

  select array_agg(id) into v_slot_ids from slots where round_id = p_round_id;
  v_slot_count := coalesce(array_length(v_slot_ids, 1), 0);

  if v_slot_count <> v_n + v_guest_n then
    raise exception 'slot count (%) must equal active player count (%) before assigning', v_slot_count, v_n + v_guest_n;
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

  -- One thread per cook, when the dinner asked for that. The pool is walked
  -- rather than sampled, so with enough values nobody shares one; with fewer
  -- values than cooks it wraps, which is the decision recorded in the header.
  if v_round.fil_rouge_scope = 'PER_COOK' then
    v_threads := v_round.fil_rouge_pool;
    v_pool_n := coalesce(array_length(v_threads, 1), 0);
    if v_pool_n > 1 then
      for i in reverse v_pool_n..2 loop
        j := 1 + floor(random() * i)::int;
        tmps := v_threads[i]; v_threads[i] := v_threads[j]; v_threads[j] := tmps;
      end loop;
    end if;
  end if;

  for i in 1..v_n loop
    insert into pairings (round_id, sender_id, cook_id, slot_id, assignment_version, lap, fil_rouge_code)
    values (p_round_id, v_members[i], v_members[(i % v_n) + 1], v_slot_ids[i], v_new_version, 0,
            case when v_pool_n > 0 then v_threads[((i - 1) % v_pool_n) + 1] end);
  end loop;

  -- A guest's dish is a pairing with themselves: same table, same recipe
  -- editor, same vote, and absent from the chain (get_chain skips is_self).
  for i in 1..v_guest_n loop
    insert into pairings (round_id, sender_id, cook_id, slot_id, assignment_version, lap, is_self, fil_rouge_code)
    values (p_round_id, v_guests[i], v_guests[i], v_slot_ids[v_n + i], v_new_version, 0, true,
            case when v_pool_n > 0 then v_threads[((v_n + i - 1) % v_pool_n) + 1] end);
  end loop;

  update rounds set assignment_version = v_new_version where id = p_round_id;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'ASSIGNMENT_GENERATED',
          jsonb_build_object('version', v_new_version, 'attempts', v_attempt,
                             'threads', coalesce(v_pool_n, 0)));

  return v_new_version;
end;
$$;

grant execute on function generate_assignment(uuid) to authenticated;

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
      and not p.is_self
    order by p.lap, sm.secret_name;
end;
$$;

create or replace function get_revealed_chain(p_round_id uuid)
returns table (
  sender_member_id uuid, sender_secret_name text, sender_display_name text,
  cook_member_id uuid, cook_secret_name text, cook_display_name text,
  slot_id uuid, course course, lap int
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_round rounds;
begin
  if not is_round_member(p_round_id, auth.uid()) then
    raise exception 'NOT_A_MEMBER';
  end if;

  select * into v_round from rounds where id = p_round_id;
  if v_round.status not in ('RESULTS', 'ARCHIVED') then
    raise exception 'NOT_REVEALED';
  end if;

  return query
    select
      p.sender_id, sm.secret_name, spr.display_name,
      p.cook_id, cm.secret_name, cpr.display_name,
      p.slot_id, s.course, p.lap
    from pairings p
    join round_members sm on sm.id = p.sender_id
    join round_members cm on cm.id = p.cook_id
    left join profiles spr on spr.id = sm.profile_id
    left join profiles cpr on cpr.id = cm.profile_id
    join slots s on s.id = p.slot_id
    where p.round_id = p_round_id and p.assignment_version = v_round.assignment_version
      and not p.is_self
    order by p.lap, sm.secret_name;
end;
$$;

create or replace function get_my_assignment(p_round_id uuid)
returns table (
  pairing_id uuid,
  cook_secret_name text,
  cook_display_name text,
  course course,
  slot_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_my_member_id uuid;
  v_open boolean;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  select id into v_my_member_id from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE' and approved;
  if not found then raise exception 'not an active member of this round'; end if;

  if v_round.status not in ('ASSIGNED', 'BRIEFS_CLOSED', 'DINNER', 'VOTING', 'RESULTS', 'ARCHIVED') then
    raise exception 'no assignment yet';
  end if;

  v_open := names_are_open(p_round_id, v_uid);

  return query
    select
      p.id,
      cm.secret_name,
      case when v_open then cpr.display_name else null end,
      s.course,
      p.slot_id
    from pairings p
    join round_members cm on cm.id = p.cook_id
    join profiles cpr on cpr.id = cm.profile_id
    join slots s on s.id = p.slot_id
    where p.round_id = p_round_id
      and p.assignment_version = v_round.assignment_version
      and p.sender_id = v_my_member_id
      and not p.is_self;
end;
$$;

create or replace function remove_member(
  p_round_id uuid,
  p_member_id uuid,
  p_confirm_dish_change boolean default false,
  p_mode removal_mode default 'COLLAPSE'
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

  -- A guest is not in the chain: removing them takes their own dish and its
  -- course away and touches nobody else's (0100).
  if v_member.is_guest then
    delete from pairings
    where round_id = p_round_id and assignment_version = v_round.assignment_version
      and sender_id = p_member_id and is_self;
    delete from slots s
    where s.round_id = p_round_id
      and not exists (select 1 from pairings p where p.slot_id = s.id)
      and v_round.slot_mode = 'FREE';
    update round_members set status = 'REMOVED', removed_at = now() where id = p_member_id;
    insert into audit_log (round_id, actor_id, action, payload)
    values (p_round_id, v_uid, 'MEMBER_REMOVED', jsonb_build_object('member_id', p_member_id, 'guest', true));
    return;
  end if;

  select * into v_edge_in from pairings
  where round_id = p_round_id and assignment_version = v_round.assignment_version and cook_id = p_member_id;
  select * into v_edge_out from pairings
  where round_id = p_round_id and assignment_version = v_round.assignment_version and sender_id = p_member_id;

  if v_edge_in.id is null or v_edge_out.id is null then
    raise exception 'member is not part of the current assignment';
  end if;

  -- LEAVE: the chain keeps its shape, one link just stops being cooked.
  if p_mode = 'LEAVE' then
    update briefs set delivered = false where pairing_id = v_edge_in.id;

    update round_members set status = 'REMOVED', removed_at = now() where id = p_member_id;

    insert into audit_log (round_id, actor_id, action, payload)
    values (p_round_id, v_uid, 'MEMBER_REMOVED', jsonb_build_object(
      'member_id', p_member_id, 'mode', 'LEAVE'
    ));

    insert into host_alerts (round_id, kind, pairing_id, payload)
    values (p_round_id, 'OTHER', v_edge_in.id, jsonb_build_object(
      'type', 'DISH_ORPHANED_BY_REMOVAL',
      'sender_id', v_edge_in.sender_id, 'departed_cook_id', p_member_id
    ));
    return;
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
    --
    -- Order matters: v_edge_in must go before v_edge_out takes its
    -- sender_id, or the unique constraint sees two rows with that sender
    -- and aborts. Both records are already in memory, so deleting first
    -- costs nothing.
    v_discarded_slot_id := v_edge_in.slot_id;
    delete from pairings where id = v_edge_in.id;
    update pairings
    set sender_id = v_edge_in.sender_id,
        original_sender_id = coalesce(original_sender_id, v_edge_out.sender_id)
    where id = v_edge_out.id;
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
    'mode', 'COLLAPSE',
    'kept_departing_members_brief', (v_x_submitted and not v_a_submitted)
  ));

  insert into host_alerts (round_id, kind, payload)
  values (p_round_id, 'OTHER', jsonb_build_object(
    'type', 'CHAIN_CLOSED_BY_REMOVAL',
    'sender_id', v_edge_in.sender_id, 'cook_id', v_edge_out.cook_id
  ));
end;
$$;


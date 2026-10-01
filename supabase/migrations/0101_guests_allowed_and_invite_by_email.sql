-- Two things asked for after 0100.
--
-- 1. Whether the dinner has guests at all. By default it does; the Executive
--    Chef can say that everybody cooks. Kept as its own switch rather than
--    inferred, because a dinner of guests only — nobody cooking for anybody —
--    is a kind of evening this app may grow, and the setting is where that
--    would hang.
--
-- 2. Inviting by e-mail address as well as by username. An address is the one
--    thing about an account its owner never chose to show anybody (0071), so
--    the answer must not depend on whether an account has it: found or not,
--    the host is told the same thing.

alter table rounds add column if not exists guests_allowed boolean not null default true;

drop function if exists set_draft_setup(uuid, round_access, round_anonymity, boolean, int, int);

create or replace function set_draft_setup(
  p_round_id uuid,
  p_access round_access,
  p_anonymity round_anonymity,
  p_requires_approval boolean,
  p_max_players int,
  p_recipes_per_brief int,
  p_guests_allowed boolean default true
)
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
    raise exception 'only the Executive Chef can change the setup';
  end if;

  if v_round.status <> 'DRAFT' then
    raise exception 'SETUP_LOCKED';
  end if;

  if p_max_players is not null and p_max_players < 3 then
    raise exception 'MAX_PLAYERS_RANGE';
  end if;

  if p_recipes_per_brief is null or p_recipes_per_brief not between 1 and 3 then
    raise exception 'RECIPES_PER_BRIEF_RANGE';
  end if;
  if p_recipes_per_brief > 1 and p_recipes_per_brief <> v_round.recipes_per_brief
     and not is_pro(v_uid) then
    raise exception 'PRO_REQUIRED';
  end if;

  update rounds
  set access = p_access,
      anonymity = p_anonymity,
      requires_approval = p_requires_approval,
      max_players = p_max_players,
      recipes_per_brief = p_recipes_per_brief,
      guests_allowed = p_guests_allowed
  where id = p_round_id;
end;
$$;

grant execute on function set_draft_setup(uuid, round_access, round_anonymity, boolean, int, int, boolean) to authenticated;

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

  -- The Executive Chef decides whether this dinner has guests at all (0101).
  -- Stepping back out of the role is always allowed.
  if p_guest and not v_round.guests_allowed then
    raise exception 'GUESTS_NOT_ALLOWED';
  end if;

  update round_members set is_guest = p_guest where id = v_member.id;
end;
$$;

create or replace function invite_member(p_round_id uuid, p_username text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_target uuid;
  v_recent int;
  v_invitation_id uuid;
begin
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the host can invite';
  end if;

  select * into v_round from rounds where id = p_round_id;
  if v_round.status not in ('DRAFT', 'OPEN') then
    raise exception 'invitations close once the round is locked';
  end if;

  -- The other half of the rule in join_round. A code-only dinner has no guest
  -- list, and offering one would be a second door the host did not open.
  if v_round.access = 'CODE' then
    raise exception 'NOT_BY_INVITATION';
  end if;

  select count(*) into v_recent from round_invitations
  where invited_by = v_uid and created_at > now() - interval '1 hour';
  if v_recent >= 30 then
    raise exception 'rate limit: at most 30 invitations per hour';
  end if;

  -- Case-insensitively, exactly as profiles_display_name_unique compares them
  -- (0046) — otherwise a host typing a friend's name in lower case would be
  -- told that friend does not exist. Anonymised profiles are excluded: the
  -- neutral token they all wear is not a person to invite.
  if position('@' in p_username) > 0 then
    -- An address, not a username (0101). The answer is the same whether or
    -- not an account has it: telling the host "no such address" would turn
    -- this box into a way to ask who is registered here. If there is one,
    -- the invitation arrives; if not, nothing does, and nobody can tell.
    select p.id into v_target
    from auth.users u join profiles p on p.id = u.id
    where p.anonymised_at is null
      and lower(u.email) = lower(btrim(p_username));
    if v_target is null or v_target = v_uid then
      return null;
    end if;
  else
    select id into v_target from profiles
    where anonymised_at is null
      and lower(display_name) = lower(btrim(p_username));

    if v_target is null then
      raise exception 'NO_SUCH_CHEF';
    end if;
  end if;

  if v_target = v_uid then
    raise exception 'you are already in this round';
  end if;

  if exists (
    select 1 from round_members
    where round_id = p_round_id and profile_id = v_target and status = 'ACTIVE'
  ) then
    if position('@' in p_username) > 0 then return null; end if;
    raise exception 'that chef is already at this table';
  end if;

  insert into round_invitations (round_id, profile_id, invited_by)
  values (p_round_id, v_target, v_uid)
  on conflict (round_id, profile_id) do update
    set created_at = now(), responded_at = null, accepted = null
  returning id into v_invitation_id;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'MEMBER_INVITED', jsonb_build_object('profile_id', v_target));

  return v_invitation_id;
end;
$$;

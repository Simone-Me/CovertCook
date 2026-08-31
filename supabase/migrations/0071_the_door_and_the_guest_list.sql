-- The door and the guest list, finally enforced.
--
-- TWO BUGS, ONE CAUSE. `rounds.access` has existed since 0018 and nothing has
-- ever read it. `join_round` accepts any code for any OPEN round, and
-- `invite_member` invites into any round at all — so "By invitation" was a
-- label on a form, not a rule. A host who chose it and then shared the code by
-- accident got exactly the dinner they had said they did not want, and were
-- never told.
--
-- So this file does three things:
--   1. the code only opens a door the host left open to codes;
--   2. an invitation is only offered where invitations are the way in;
--   3. an invitation names a chef by their username, not by the address they
--      signed up with.
--
-- ON (3). The address was always the wrong handle. It is the one thing about
-- an account its owner has not chosen to show anybody: to invite a friend you
-- had to know, or ask for, the mailbox they registered with — which is both
-- more than you need and more than they may want to hand over. `display_name`
-- has been a unique identity since 0046, it is the name that is printed at the
-- reveal, and it is the name the person themselves picked. That is the handle.
--
-- The address lookup is dropped rather than kept alongside: two ways to name
-- the same person is two error messages, two rate limits, and an enumeration
-- surface kept alive for no one's benefit. PostgREST matches RPCs by argument
-- name, so the rename from p_email to p_username is itself the cut-over.

-- ---------------------------------------------------------------------------
-- 1. The code opens only what the host opened to codes.
--
-- INVALID_CODE rather than a truthful "this dinner is invitation-only": the
-- caller is holding a code for a round they were never given a way into, and
-- confirming that the code is real tells a stranger the dinner exists. The
-- host's own screen never offers the code on such a round, so nobody who was
-- meant to be here can reach this line.
-- ---------------------------------------------------------------------------

create or replace function join_round(p_code text, p_turnstile_ticket uuid default null)
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

  if captcha_required() then
    if p_turnstile_ticket is null then
      raise exception 'CAPTCHA_REQUIRED';
    end if;
    if not consume_turnstile_ticket(p_turnstile_ticket, 'JOIN_ROUND', p_code) then
      raise exception 'turnstile verification failed or expired';
    end if;
  end if;

  select * into v_round from rounds where join_code = p_code for update;

  if not found then
    raise exception 'INVALID_CODE';
  end if;

  -- The new line. A code is not a way in where the host said it would not be.
  if v_round.access = 'INVITE' then
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

comment on function join_round(text, uuid) is
  'Takes a seat, on a round whose access admits codes. The turnstile ticket is '
  'required only when app_settings.captcha_required is true.';

-- ---------------------------------------------------------------------------
-- 2 and 3. An invitation names a username, and only where invitations are a
-- way in.
--
-- The enumeration trade-off from 0019 stands and gets better: telling the host
-- "no chef by that name" confirms a username is taken, which a username field
-- confirms anyway the moment somebody tries to register it. What it no longer
-- does is confirm that an *address* has an account here.
-- ---------------------------------------------------------------------------

drop function if exists invite_member(uuid, text);

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
  select id into v_target from profiles
  where anonymised_at is null
    and lower(display_name) = lower(btrim(p_username));

  if v_target is null then
    raise exception 'NO_SUCH_CHEF';
  end if;

  if v_target = v_uid then
    raise exception 'you are already in this round';
  end if;

  if exists (
    select 1 from round_members
    where round_id = p_round_id and profile_id = v_target and status = 'ACTIVE'
  ) then
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

grant execute on function invite_member(uuid, text) to authenticated;

comment on function invite_member(uuid, text) is
  'Invites an existing account by its unique username (profiles.display_name). '
  'Refuses on a CODE-only round: see 0071.';

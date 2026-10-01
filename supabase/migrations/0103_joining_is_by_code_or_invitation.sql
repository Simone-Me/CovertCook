-- Joining a dinner no longer involves a bot check.
--
-- The ticket table, its consume function and the settings flag that switched
-- them on were never turned on in any deployment. Joining is by code or by
-- invitation, nothing more, and the database now says only that.

drop function if exists join_round(text, uuid);

create or replace function join_round(p_code text)
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

grant execute on function join_round(text) to authenticated;

drop function if exists consume_turnstile_ticket(uuid, text, text);
drop function if exists captcha_required();
drop table if exists turnstile_tickets;
alter table app_settings drop column if exists captcha_required;

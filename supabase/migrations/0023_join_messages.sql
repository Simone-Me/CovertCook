-- join_round told the truth in a way that read as a rejection.
--
-- The membership check was a single existence test:
--
--   if exists (select 1 from round_members where round_id = ... and profile_id = ...)
--     then raise exception 'already a member of this round';
--
-- Correct — a row does exist — but that row covers four different
-- situations, and only one of them is "you're already in". Somebody who
-- asked to join a round that requires approval gets a row immediately,
-- unapproved, and then sees "already a member of this round" if they try
-- again or follow the link a second time. They are not a member. They are
-- waiting, which is the one thing the message didn't say.
--
-- Split into named outcomes the frontend can turn into real sentences:
--
--   ALREADY_MEMBER   — approved and seated; nothing to do
--   AWAITING_APPROVAL — asked, and the Executive Chef hasn't answered yet
--   PREVIOUSLY_LEFT  — left this round themselves
--   WAS_REMOVED      — removed by the Executive Chef
--
-- Named constants rather than prose for the same reason 0005 used
-- REMOVE_REQUIRES_CONFIRMATION: the client shouldn't match on English, and
-- these have to be sayable in both languages.
--
-- The last two are deliberately refused rather than silently re-joined.
-- Rejoining after being removed would undo the Executive Chef's decision,
-- and re-joining after leaving would mint a second secret name for the
-- same person in the same round. Both want a human, not a retry.

create or replace function join_round(p_code text, p_turnstile_ticket uuid)
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

  if not consume_turnstile_ticket(p_turnstile_ticket, 'JOIN_ROUND', p_code) then
    raise exception 'turnstile verification failed or expired';
  end if;

  select * into v_round from rounds where join_code = p_code for update;

  if not found then
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

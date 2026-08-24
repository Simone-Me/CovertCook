-- Leaving a dinner, and what it costs depending on when you go.
--
-- The rule was already right and already written (leave_round, 0004): while
-- the door is still open nobody is depending on you, so you walk out and that
-- is the end of it. Once the lottery has run you are a link in a chain — three
-- other people's evening is built on the pairing you are in — so leaving stops
-- being your decision alone and becomes a request the Executive Chef answers,
-- with the same choice remove_member has always offered: reconnect the chain,
-- or let the buffet be one dish shorter.
--
-- WHAT WAS MISSING WAS THE RECEIPT. Post-assignment, leave_round raised a host
-- alert and returned quietly: the person who pressed the button saw nothing
-- change, on a screen that looked exactly as it had a second earlier. That is
-- the same failure shape as the confirmation resend — an action that reports
-- nothing and might have done nothing. So the request is now stamped on the
-- membership, where both sides can see it: the player learns their request is
-- waiting, and the host sees who is asking without digging through alerts.
--
-- And pressing it twice does not queue two alerts. Somebody who hears nothing
-- back will press again; that is a person being reasonable, not a bug to guard
-- against with a disabled button alone.

alter table round_members
  add column if not exists removal_requested_at timestamptz;

comment on column round_members.removal_requested_at is
  'When this player asked to be let out of a round whose chain already exists (0050). Cleared if they change their mind; the host answers it with remove_member.';

-- The return type changes (void -> text), which CREATE OR REPLACE cannot do.
drop function if exists leave_round(uuid);

create or replace function leave_round(p_round_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_member round_members;
  v_round rounds;
begin
  select * into v_member from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE';

  if not found then
    raise exception 'not an active member of this round';
  end if;

  -- A dinner cannot lose the person running it. Same rule as account
  -- deletion, and the same remedy.
  if v_member.role = 'HOST' then
    raise exception 'transfer_host before leaving';
  end if;

  select * into v_round from rounds where id = p_round_id;

  if v_round.status in ('DRAFT', 'OPEN', 'LOCKED') then
    -- No pairings exist yet: nobody is depending on this seat, so it empties
    -- immediately and the round moves to their archive.
    update round_members
    set status = 'LEFT', left_at = now(), removal_requested_at = null
    where id = v_member.id;

    insert into audit_log (round_id, actor_id, action, payload)
    values (p_round_id, v_uid, 'MEMBER_LEFT', jsonb_build_object('member_id', v_member.id));

    return 'LEFT';
  end if;

  -- The chain exists. Ask, and wait.
  if v_member.removal_requested_at is not null then
    return 'ALREADY_REQUESTED'; -- pressing twice is patience, not a second request
  end if;

  update round_members set removal_requested_at = now() where id = v_member.id;

  insert into host_alerts (round_id, kind, pairing_id, payload)
  values (
    p_round_id,
    'DROPOUT',
    null,
    jsonb_build_object('member_id', v_member.id, 'secret_name', v_member.secret_name)
  );

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'MEMBER_LEFT_REQUESTED', jsonb_build_object('member_id', v_member.id));

  return 'REQUESTED';
end;
$$;

grant execute on function leave_round(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Changing your mind, while nobody has acted on it yet.
--
-- The request is a message, not a resignation: until the host answers it, the
-- player is still cooking and still expected at the table. Withdrawing it has
-- to be as easy as sending it, or the button becomes one people are afraid to
-- press.
-- ---------------------------------------------------------------------------

create or replace function cancel_leave_request(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_member round_members;
begin
  select * into v_member from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE';

  if not found then
    raise exception 'not an active member of this round';
  end if;

  update round_members set removal_requested_at = null where id = v_member.id;

  -- Resolve the alert too, or the host is left holding a question that no
  -- longer has anybody behind it.
  update host_alerts
  set resolved_at = now()
  where round_id = p_round_id
    and kind = 'DROPOUT'
    and resolved_at is null
    and (payload->>'member_id')::uuid = v_member.id;
end;
$$;

grant execute on function cancel_leave_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- A bug in 0049, found in review: erasure emptied a seat the host still had
-- to repair.
--
-- anonymise_profile marked EVERY active membership as LEFT, including in
-- rounds whose assignment already exists — which is precisely what
-- leave_round refuses to do, and for a reason that turns out to be sharper
-- than "consistency": remove_member starts by checking the member is ACTIVE
-- and raises 'member is not an active member of this round' otherwise. So the
-- seat was emptied and the one function that can repair the chain was locked
-- out of it at the same moment. The host would have been handed a DROPOUT
-- alert they could not act on.
--
-- Now it mirrors leave_round exactly: empty the seat only while nobody
-- depends on it, and once the chain exists leave the member standing until
-- the Executive Chef decides what the departure costs.
-- ---------------------------------------------------------------------------

create or replace function anonymise_profile(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile profiles;
  v_member record;
  v_round rounds;
begin
  select * into v_profile from profiles where id = p_profile_id;
  if not found or v_profile.anonymised_at is not null then
    return; -- already gone, or never existed: doing it twice must be harmless
  end if;

  for v_member in
    select m.* from round_members m
    where m.profile_id = p_profile_id and m.status = 'ACTIVE'
  loop
    select * into v_round from rounds where id = v_member.round_id;

    if v_round.status in ('RESULTS', 'ARCHIVED', 'CANCELLED') then
      continue; -- a finished dinner is a record, not a game to leave
    end if;

    if v_round.status in ('DRAFT', 'OPEN', 'LOCKED') then
      update round_members
      set status = 'LEFT', left_at = now(), removal_requested_at = null
      where id = v_member.id;
    else
      -- The chain is load-bearing. The seat stays ACTIVE — remove_member
      -- needs it that way — and the host is told, with the reason.
      update round_members set removal_requested_at = now() where id = v_member.id;

      insert into host_alerts (round_id, kind, payload)
      values (
        v_member.round_id,
        'DROPOUT',
        jsonb_build_object('member_id', v_member.id, 'reason', 'ACCOUNT_DELETED')
      );
    end if;
  end loop;

  delete from dietary_entries where profile_id = p_profile_id;
  delete from push_subscriptions where profile_id = p_profile_id;
  delete from round_invitations where profile_id = p_profile_id and responded_at is null;

  update profiles
  set display_name = case when locale = 'fr' then 'Ancien convive' else 'Former guest' end,
      avatar_url = null,
      has_no_restrictions = true,
      notifications_enabled = false,
      deletion_requested_at = null,
      anonymised_at = now()
  where id = p_profile_id;

  insert into audit_log (actor_id, action, payload)
  values (p_profile_id, 'ACCOUNT_ANONYMISED', '{}'::jsonb);
end;
$$;

revoke all on function anonymise_profile(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The roster has to carry the request, or nobody can see it.
--
-- list_round_members (0032) hands back a fixed column list, deliberately —
-- it is the one place secret_name is allowed out, and it is written as an
-- explicit list so a new column cannot leak by being added to the table.
-- Which means a new column has to be added here on purpose, and this one is:
-- without it the player who asked to leave sees no change, and the host has
-- to read the alerts page to find out who is asking.
--
-- Everything else about the function is unchanged, including the reveal gate
-- and the ordering that keeps arrival order unreadable.
-- ---------------------------------------------------------------------------

drop function if exists list_round_members(uuid);

create or replace function list_round_members(p_round_id uuid)
returns table (
  id uuid,
  round_id uuid,
  profile_id uuid,
  secret_name text,
  role member_role,
  status member_status,
  approved boolean,
  removal_requested_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status round_status;
  v_revealed boolean;
begin
  if not exists (
    select 1 from round_members m
    where m.round_id = p_round_id
      and m.profile_id = v_uid
      and m.status = 'ACTIVE'
  ) then
    raise exception 'not a member of this round' using errcode = '42501';
  end if;

  select r.status into v_status from rounds r where r.id = p_round_id;

  v_revealed := v_status is distinct from 'DRAFT' and v_status is distinct from 'OPEN';

  return query
  select
    m.id,
    m.round_id,
    m.profile_id,
    case when v_revealed or m.profile_id = v_uid then m.secret_name end,
    m.role,
    m.status,
    m.approved,
    -- Visible to the host, who has to answer it, and to the person who asked,
    -- who needs to see that they did. Nobody else's departure is anybody
    -- else's business.
    case
      when m.profile_id = v_uid or is_round_host(p_round_id, v_uid)
      then m.removal_requested_at
    end
  from round_members m
  where m.round_id = p_round_id
  order by
    case when v_revealed or m.profile_id = v_uid then m.secret_name end
      nulls first,
    m.id;
end;
$$;

revoke all on function list_round_members(uuid) from public;
grant execute on function list_round_members(uuid) to authenticated;

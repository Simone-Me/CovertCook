-- In-app invitations: the host names an existing account by the address it
-- signed up with, and that person finds an invitation waiting when they
-- open the app, to accept or decline.
--
-- Deliberately NOT email. The address is only a handle for finding an
-- account; the invitation itself is a row. That means this ships without
-- waiting on a mail provider, which `send-invite` still is. Sending an
-- actual "you've been invited" email later is a nicety layered on top, not
-- a prerequisite.
--
-- Its own table rather than a new member_status, because round_members
-- requires a secret_name (not null, unique per round) — minting one for
-- someone who may decline would burn a name from a finite per-round list
-- for nothing. On accept, the member row is created properly, with the
-- secret name assigned at that moment, exactly as join_round does it.

create table round_invitations (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  invited_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  accepted boolean,

  unique (round_id, profile_id)
);

create index round_invitations_profile_id_idx on round_invitations (profile_id);

alter table round_invitations enable row level security;

-- Read-only exposure, and only of your own row: everything that writes
-- goes through the RPCs below so the guards can't be skipped.
create policy round_invitations_select_own on round_invitations
  for select using (profile_id = auth.uid());

create policy round_invitations_select_host on round_invitations
  for select using (is_round_host(round_id, auth.uid()));

grant select on round_invitations to authenticated;

-- ---------------------------------------------------------------------------
-- invite_member
--
-- Note the deliberate trade-off: telling the host "no chef with that
-- address" confirms whether an address is registered, which is a mild
-- account-enumeration surface. The alternative — always saying "sent" —
-- silently swallows exactly the typo this feature exists to prevent, so
-- usability wins here. The per-hour cap below is what keeps it from being
-- usable as a bulk probe.
-- ---------------------------------------------------------------------------

create or replace function invite_member(p_round_id uuid, p_email text)
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

  select count(*) into v_recent from round_invitations
  where invited_by = v_uid and created_at > now() - interval '1 hour';
  if v_recent >= 30 then
    raise exception 'rate limit: at most 30 invitations per hour';
  end if;

  select u.id into v_target from auth.users u
  where lower(u.email) = lower(trim(p_email));

  if v_target is null or not exists (select 1 from profiles where id = v_target) then
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

-- ---------------------------------------------------------------------------
-- get_my_invitations — the inbox on the home screen.
--
-- Returns the round's name and accent itself rather than expecting the
-- client to read `rounds`: an invitee is not a member yet, so
-- rounds_select_member gives them nothing. Without this they'd see an
-- invitation to a dinner whose name they can't read.
-- ---------------------------------------------------------------------------

create or replace function get_my_invitations()
returns table (
  invitation_id uuid,
  round_id uuid,
  round_name text,
  accent_emoji text,
  invited_day date
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  return query
  select i.id, r.id, r.name, r.accent_emoji, i.created_at::date
  from round_invitations i
  join rounds r on r.id = i.round_id
  where i.profile_id = v_uid
    and i.responded_at is null
    and r.status in ('DRAFT', 'OPEN')
  order by i.created_at desc;
end;
$$;

grant execute on function get_my_invitations() to authenticated;

-- ---------------------------------------------------------------------------
-- respond_to_invitation — accepting mints the member row, secret name and
-- all, the same way join_round does. An invited member skips approval:
-- the host already chose them by name, so asking them to approve the
-- person they just invited would be theatre.
-- ---------------------------------------------------------------------------

create or replace function respond_to_invitation(p_invitation_id uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_inv round_invitations;
  v_round rounds;
  v_locale text;
  v_secret_name text;
  v_member_id uuid;
  v_seats int;
begin
  select * into v_inv from round_invitations
  where id = p_invitation_id and profile_id = v_uid;
  if not found then
    raise exception 'invitation not found';
  end if;
  if v_inv.responded_at is not null then
    raise exception 'this invitation has already been answered';
  end if;

  update round_invitations
  set responded_at = now(), accepted = p_accept
  where id = p_invitation_id;

  if not p_accept then
    return null;
  end if;

  select * into v_round from rounds where id = v_inv.round_id for update;
  if v_round.status not in ('DRAFT', 'OPEN') then
    raise exception 'this dinner is no longer taking new chefs';
  end if;

  if v_round.max_players is not null then
    select count(*) into v_seats from round_members
    where round_id = v_inv.round_id and status = 'ACTIVE';
    if v_seats >= v_round.max_players then
      raise exception 'this dinner is full';
    end if;
  end if;

  select locale into v_locale from profiles where id = v_uid;
  select assign_secret_name(v_inv.round_id, coalesce(v_locale, 'en')) into v_secret_name;

  insert into round_members (round_id, profile_id, secret_name, role, approved)
  values (v_inv.round_id, v_uid, v_secret_name, 'PLAYER', true)
  returning id into v_member_id;

  insert into audit_log (round_id, actor_id, action, payload)
  values (v_inv.round_id, v_uid, 'INVITATION_ACCEPTED', jsonb_build_object('member_id', v_member_id));

  return v_member_id;
end;
$$;

grant execute on function respond_to_invitation(uuid, boolean) to authenticated;

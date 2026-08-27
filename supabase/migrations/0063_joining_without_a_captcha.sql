-- Joining a dinner stops depending on an Edge Function that has nothing to do.
--
-- THE SYMPTOM. `POST /functions/v1/verify-turnstile 503` on a local stack, and
-- nobody can take a seat. The function is not there, or did not boot, and the
-- whole join path is behind it.
--
-- THE ACTUAL PROBLEM, which is worse than the symptom. With no Turnstile keys
-- configured, that function does nothing: it recognises a placeholder token the
-- frontend sends when it has no site key, skips the verification entirely, and
-- inserts a row. So a deployment with no captcha still cannot seat anybody
-- unless an Edge Function is up — a network round trip, a container, and a cold
-- start, to rubber-stamp a value the client made up. The bypass moved the
-- dependency rather than removing it.
--
-- AND IT WAS NEVER PROTECTION. This is the part worth being blunt about: with
-- no `TURNSTILE_SECRET_KEY`, the old path accepted `dev-placeholder-token` from
-- anybody who sent it, in production as readily as on a laptop. It is listed in
-- README.md as a known simplification to remove before real use. Nothing below
-- weakens anything, because there was nothing there.
--
-- SO THE QUESTION MOVES INTO THE DATABASE, where it can be answered without a
-- network call and where the answer is a fact anybody can read rather than the
-- absence of an environment variable on a container nobody is looking at.
--
--   captcha_required = false  (the default) — join_round takes no ticket, the
--                              frontend never calls the function, and there is
--                              no bot protection. Which was already true.
--   captcha_required = true   — a ticket is required and consumed exactly as
--                              before, and a call with none is refused. Turn
--                              this on in the same breath as setting the keys.
--
-- The dev placeholder can now go from the Edge Function entirely: with the flag
-- off nothing calls it, and with the flag on it demands a real token verified
-- against a real secret. That closes the hole rather than documenting it.

-- ---------------------------------------------------------------------------
-- 1. One row, for the handful of things that are true of the deployment rather
--    than of a dinner.
--
-- A table rather than a GUC or an environment variable: it is inspectable, it
-- survives a container restart, and turning the captcha on is then a statement
-- in the database next to the schema it guards — not a value set once in a
-- dashboard nobody opens again.
-- ---------------------------------------------------------------------------

create table if not exists app_settings (
  -- Exactly one row, enforced rather than hoped for. A settings table with two
  -- rows is a settings table where half the app reads the wrong one.
  id boolean primary key default true check (id),
  captcha_required boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into app_settings (id) values (true) on conflict (id) do nothing;

alter table app_settings enable row level security;

-- Readable by anyone signed in, and by nobody writable. Whether this
-- deployment asks for a captcha is not a secret — the widget on the page
-- announces it — and the interface is allowed to know so it can stop calling a
-- function that will not be there.
create policy app_settings_select on app_settings for select using (true);
grant select on app_settings to anon, authenticated;

create or replace function captcha_required()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select captcha_required from app_settings where id), false);
$$;

grant execute on function captcha_required() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. join_round asks the database instead of the network.
--
-- The ticket becomes optional in the signature and stays mandatory in fact
-- whenever the deployment says so. Same body as 0059 otherwise — the block
-- check, the seat count, the pseudonym, all unchanged.
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

  -- The only line that changed. When the deployment asks for a captcha the
  -- ticket is required and burned exactly as before; when it does not, there is
  -- nothing to burn and nothing to call.
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

  -- In both directions, and said the same way whichever direction it was (0059).
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
  'Takes a seat. The turnstile ticket is required only when app_settings.'
  'captcha_required is true — turn that on in the same breath as configuring '
  'TURNSTILE_SECRET_KEY, or the widget will collect tokens nothing checks.';

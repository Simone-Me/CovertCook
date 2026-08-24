-- Web push: where a browser's subscription lives.
--
-- WHY THIS IS A TABLE OF DEVICES, NOT OF PEOPLE. A push subscription belongs
-- to one browser on one machine — the phone on the sofa and the laptop at work
-- are two, and revoking one must not silence the other. So the endpoint is the
-- identity here, unique on its own, and `profile_id` is what it currently
-- belongs to rather than what it is keyed by. A shared tablet where two
-- flatmates take turns produces one endpoint that changes hands: the upsert
-- below reassigns it instead of failing, which is why this is an RPC and not
-- a plain insert policy.
--
-- WHAT IS STORED IS A CAPABILITY, NOT A SECRET OF OURS. The endpoint plus the
-- two keys are exactly what is needed to send that browser an encrypted
-- message, and nothing else — no device name, no OS, no location. `user_agent`
-- is kept only so a person can recognise which of their own devices a row is
-- when the settings screen eventually lists them, and it is theirs to read.
--
-- ROADMAP.md §1 argued for email over push and it argued well: the one moment
-- that needs instant delivery is the moment everyone is at the same table. What
-- changed is not the argument but the platform — the app is now installed on a
-- home screen, which is the prerequisite iOS imposes, so push has become
-- possible without a store listing. Email is still the right channel for the
-- asynchronous moments; this is for the ones that are not.

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index push_subscriptions_profile_id_idx on push_subscriptions (profile_id);

alter table push_subscriptions enable row level security;

-- Reading and deleting your own rows is ordinary self-service. Writing is not:
-- an insert policy would let a client claim any endpoint string it likes,
-- including one belonging to somebody else's browser, so writes go through the
-- RPC below and the table takes no INSERT or UPDATE grant at all.
create policy push_subscriptions_select_own on push_subscriptions
  for select using (profile_id = auth.uid());

create policy push_subscriptions_delete_own on push_subscriptions
  for delete using (profile_id = auth.uid());

grant select, delete on push_subscriptions to authenticated;

-- ---------------------------------------------------------------------------
-- save_push_subscription — idempotent by endpoint.
--
-- The browser hands back the same endpoint every time it is asked, until the
-- push service rotates it. Re-subscribing on every app start is normal and
-- must not accumulate rows, so this is an upsert that also refreshes
-- last_seen_at: a subscription nobody has confirmed in months is the first
-- thing to prune when this table needs pruning.
-- ---------------------------------------------------------------------------

create or replace function save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns void
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

  if coalesce(btrim(p_endpoint), '') = ''
     or coalesce(btrim(p_p256dh), '') = ''
     or coalesce(btrim(p_auth), '') = '' then
    raise exception 'incomplete subscription';
  end if;

  insert into push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent)
  values (v_uid, p_endpoint, p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 200))
  on conflict (endpoint) do update
    set profile_id = excluded.profile_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        last_seen_at = now();
end;
$$;

grant execute on function save_push_subscription(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- forget_push_subscription
--
-- Deleting by endpoint rather than by id, because the browser knows its
-- endpoint and has no idea what row it became. Scoped to the caller: the
-- endpoint alone must never be enough to silence somebody else's phone.
-- ---------------------------------------------------------------------------

create or replace function forget_push_subscription(p_endpoint text)
returns void
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

  delete from push_subscriptions
  where endpoint = p_endpoint and profile_id = v_uid;
end;
$$;

grant execute on function forget_push_subscription(text) to authenticated;

-- ---------------------------------------------------------------------------
-- push_audience_for_round — service_role only, and deliberately so.
--
-- This returns endpoints and encryption keys. Handing that to a browser, even
-- the host's, would let one player silence or spoof another's device, so the
-- function is revoked from both client roles and reachable only by the
-- send-push Edge Function, which holds the service key.
--
-- Excludes the person who caused the notification: being told about your own
-- action is noise, and the host is the one who presses the button.
--
-- Carries each recipient's locale, because a push has no time to ask: the body
-- is composed before the browser is ever reached, so the language has to
-- travel with the address.
-- ---------------------------------------------------------------------------

create or replace function push_audience_for_round(p_round_id uuid, p_actor uuid)
returns table (endpoint text, p256dh text, auth text, locale text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.endpoint, s.p256dh, s.auth, p.locale
  from round_members m
  join push_subscriptions s on s.profile_id = m.profile_id
  join profiles p on p.id = m.profile_id
  where m.round_id = p_round_id
    and m.status = 'ACTIVE'
    and m.approved
    and m.profile_id <> p_actor;
$$;

-- PUBLIC first, and that is the whole point: Postgres grants EXECUTE on every
-- new function to PUBLIC, so revoking from `anon, authenticated` alone leaves
-- both roles able to call it through the grant they inherit. Verified by
-- asking has_function_privilege rather than by reading the REVOKE and
-- believing it.
revoke all on function push_audience_for_round(uuid, uuid) from public, anon, authenticated;

-- And then hand it back to exactly one role. Revoking from PUBLIC takes it
-- away from service_role too, which is the role send-push connects as — so
-- without this line the fix above silently breaks the only caller.
grant execute on function push_audience_for_round(uuid, uuid) to service_role;

-- The same latent hole, found by the same check, in a function that has been
-- shipped since 0003: `revoke all on turnstile_tickets` locked the table but
-- not the function that consumes its rows, so any signed-in caller could burn
-- a ticket they somehow learned the id of. Nothing in the app calls it — it is
-- reached only from inside other SECURITY DEFINER functions, which run as the
-- owner and are unaffected by this.
revoke all on function consume_turnstile_ticket(uuid, text, text) from public, anon, authenticated;

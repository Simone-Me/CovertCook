-- "I installed it and nothing arrives."
--
-- Push has seven places to fail and, until this migration, six of them failed
-- silently. The browser may have no Push API (iOS in a tab); the permission
-- may be granted, refused, or refused permanently; the service worker may not
-- be registered; the subscription may exist in the browser but never have
-- reached this table; the row may be here but belong to a VAPID key the
-- deployment has since rotated; the Edge Function may be missing its secrets;
-- and the audience query may correctly exclude the only person testing.
--
-- That last one is the trap, and it is not a bug: `push_audience_for_round`
-- excludes the actor on purpose, because being notified of your own button
-- press is noise. But somebody testing alone IS the actor for every phase
-- change they can reach, so a perfectly working installation delivers exactly
-- nothing to the only phone watching. There is no way to tell that apart from
-- a broken one by pressing the buttons harder.
--
-- So: one audience of one, addressed to the caller's own devices, for a
-- notification the caller asked for by name. It is the only push in this app
-- that goes to the person who triggered it, and that is its entire purpose.

-- ---------------------------------------------------------------------------
-- push_audience_for_me — service_role only, like every other audience here.
--
-- The rule that makes this safe is that it takes no endpoint, no profile and
-- no round: it takes the id of whoever is already authenticated at the Edge
-- Function, and answers with that person's own devices. There is nothing to
-- aim it at somebody else with.
--
-- Two things it deliberately does NOT check.
--
--   `notifications_enabled` — the account switch answers "should the app
--   interrupt me about dinners", and this is not the app interrupting anybody:
--   it is a person pressing a button labelled "send me one now". Refusing it
--   would also destroy the diagnosis, since "off" and "broken" would once
--   again look the same. The column is returned instead, so the interface can
--   say what it is.
--
--   Whether the subscription still works — that is the answer, not a
--   precondition, and it comes back from the push service as 404/410 and gets
--   pruned by the sender like any other dead endpoint.
-- ---------------------------------------------------------------------------

create or replace function push_audience_for_me(p_uid uuid)
returns table (
  endpoint text,
  p256dh text,
  auth text,
  locale text,
  notifications_enabled boolean,
  user_agent text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.endpoint, s.p256dh, s.auth, p.locale, p.notifications_enabled, s.user_agent
  from push_subscriptions s
  join profiles p on p.id = s.profile_id
  where s.profile_id = p_uid;
$$;

revoke all on function push_audience_for_me(uuid) from public, anon, authenticated;
grant execute on function push_audience_for_me(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- my_push_devices — the same rows, minus the keys, for the browser.
--
-- The endpoint and its two keys are a capability: whoever holds them can push
-- to that phone or unsubscribe it. The settings screen needs none of that. It
-- needs to answer one question — "did the subscription this browser is holding
-- ever reach the server?" — which needs the endpoint compared, not read.
--
-- So the comparison happens here, in the database, and what comes back is a
-- boolean plus a count of the OTHER devices on the account. A person with the
-- app on a phone and a laptop should be told the laptop is registered, because
-- "nothing arrives on my phone" and "nothing arrives anywhere" are different
-- faults.
--
-- RLS on push_subscriptions would have allowed a plain select of the caller's
-- own rows, keys and all. This exists so the settings page never has to ask
-- for them.
-- ---------------------------------------------------------------------------

create or replace function my_push_devices(p_endpoint text default null)
returns table (this_device boolean, devices int, last_seen timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1 from push_subscriptions
      where profile_id = auth.uid()
        and p_endpoint is not null
        and endpoint = p_endpoint
    ),
    (select count(*)::int from push_subscriptions where profile_id = auth.uid()),
    (select max(last_seen_at) from push_subscriptions where profile_id = auth.uid());
$$;

grant execute on function my_push_devices(text) to authenticated;

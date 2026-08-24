-- Deleting an account: what it costs, who it costs it to, and why it cannot
-- be a DELETE.
--
-- THE ERROR THAT PROVES THE POINT. Deleting a user in the Supabase dashboard
-- fails with a foreign key violation on `audit_log_actor_id_fkey`. The chain
-- is: auth.users -> profiles (ON DELETE CASCADE, from 0001) -> and then
-- everything that references profiles WITHOUT a cascade — audit_log first,
-- but round_members, rounds.host_id and invites.created_by immediately behind
-- it. audit_log is not the problem; it is the first row Postgres happened to
-- check.
--
-- WHY NOT JUST CASCADE THE REST. Because a round is not one person's data. A
-- brief is a recipe somebody wrote FOR SOMEONE ELSE, sitting in that person's
-- history; a ballot is part of how a dish was ranked; a pairing is a link in a
-- chain seven other people are standing in. Cascading a player away deletes an
-- evening that seven other people also lived.
--
-- SO THE PROFILE SURVIVES, EMPTIED. The FK from profiles to auth.users is
-- dropped, which is the one change that makes everything else possible: the
-- auth row (email, password, sessions) can now be deleted outright while the
-- profile stays as an anonymous placeholder holding the round together. Once
-- the link to a person is severed beyond recovery, what remains is no longer
-- personal data, which is what erasure asks for.
--
-- AND ROUNDS ARE LEFT, NOT SCRUBBED. Asked for directly: their messages and
-- recipes in a live round should be handled "as if they left the game". That
-- machinery already exists and already has the right rule — leave_round
-- (0004) removes cleanly while the round is still DRAFT/OPEN/LOCKED, and once
-- an assignment exists it refuses to touch the chain itself and raises a
-- DROPOUT alert so the Executive Chef decides what the departure costs
-- (remove_member, 0016: reconnect the chain, or leave the buffet one dish
-- short). Account deletion reuses exactly that rather than inventing a second,
-- quieter way to tear a chain.
--
-- ONE HONEST GAP. Supabase access tokens are stateless and live about an hour.
-- Deleting the auth row ends the sessions but cannot invalidate a token
-- already in somebody's browser, so there is a window in which a
-- just-deleted account can still act. It belongs to the person who asked for
-- the deletion, which is why this is recorded rather than defended against
-- with a check on every write path in the app.

-- ---------------------------------------------------------------------------
-- 1. Break the cascade. This is the change that unblocks the dashboard.
-- ---------------------------------------------------------------------------

alter table profiles drop constraint if exists profiles_id_fkey;

comment on column profiles.id is
  'Same uuid as the auth user who created it, but no longer a foreign key (0049): the auth row must be deletable while this row survives, anonymised, holding rounds together.';

alter table profiles
  add column if not exists deletion_requested_at timestamptz;

comment on column profiles.deletion_requested_at is
  'When erasure was asked for. The account keeps working until it is due — a mis-tap has to be recoverable, and cancelling is a click (0049).';

-- ---------------------------------------------------------------------------
-- 2. What erasure actually does.
--
-- Hard-deleted, because it is theirs alone and useful to nobody else:
--   * dietary_entries — GDPR Article 9 health data. No trace, no exceptions.
--   * push_subscriptions — addresses of their devices.
--   * round_invitations addressed to them — an invitation to nobody.
-- Kept, because it belongs to the evening rather than the person:
--   * round_members (and the secret name that labels their seat)
--   * briefs, messages, ballots, results
-- Emptied:
--   * display_name, avatar_url
--
-- The retired name is deliberately the same for everybody, which the partial
-- unique index from 0046 allows precisely because it excludes anonymised rows.
-- Two people who leave are indistinguishable, and that is the point.
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

  -- Leave every round still in progress, by the rules that already govern
  -- leaving one.
  for v_member in
    select m.* from round_members m
    where m.profile_id = p_profile_id and m.status = 'ACTIVE'
  loop
    select * into v_round from rounds where id = v_member.round_id;

    if v_round.status in ('RESULTS', 'ARCHIVED', 'CANCELLED') then
      continue; -- a finished dinner is a record, not a game to leave
    end if;

    update round_members set status = 'LEFT', left_at = now() where id = v_member.id;

    if v_round.status not in ('DRAFT', 'OPEN', 'LOCKED') then
      -- An assignment exists, so the chain is load-bearing and only the host
      -- may repair it. Same alert leave_round raises, for the same reason.
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
-- 3. Whatever deletes the auth row, the profile is emptied with it.
--
-- Belt and braces, and the braces matter: deleting a user from the dashboard
-- or the admin API does not call our RPC, and without this the profile would
-- be left standing with a real name and a list of allergies attached to
-- nobody. The trigger makes the safe outcome the automatic one.
-- ---------------------------------------------------------------------------

create or replace function on_auth_user_deleted()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform anonymise_profile(old.id);
  return old;
end;
$$;

drop trigger if exists anonymise_profile_on_user_delete on auth.users;
create trigger anonymise_profile_on_user_delete
  before delete on auth.users
  for each row execute function on_auth_user_deleted();

-- ---------------------------------------------------------------------------
-- 4. The person's own path: ask, wait, or change your mind.
--
-- The wait is the "progressive" part. Thirty days is the industry norm and
-- both app stores accept it as long as it is disclosed, which the interface
-- has to say out loud. Nothing else changes while it runs: the rounds are left
-- at the moment of erasure, not at the moment of asking, so cancelling
-- restores an account that never lost anything.
--
-- A host cannot walk out of a dinner they are running. Same rule leave_round
-- has always had, and the same remedy: transfer_host, or cancel the round.
-- ---------------------------------------------------------------------------

create or replace function request_account_deletion()
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_due timestamptz := now() + interval '30 days';
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if exists (
    select 1 from rounds r
    join round_members m on m.round_id = r.id and m.profile_id = v_uid and m.status = 'ACTIVE'
    where r.host_id = v_uid and r.status not in ('RESULTS', 'ARCHIVED', 'CANCELLED')
  ) then
    raise exception 'hosting_a_live_round';
  end if;

  update profiles set deletion_requested_at = now() where id = v_uid;
  return v_due;
end;
$$;

grant execute on function request_account_deletion() to authenticated;

create or replace function cancel_account_deletion()
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

  update profiles set deletion_requested_at = null
  where id = v_uid and anonymised_at is null;
end;
$$;

grant execute on function cancel_account_deletion() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The job that finishes it.
--
-- Called by a scheduled workflow rather than pg_cron, for the same reason the
-- keep-alive ping is external: this project's scheduler already lives in
-- GitHub Actions and one place to look is better than two.
--
-- Deletes the auth row itself, which is what actually ends the account —
-- email, password and sessions go with it. Possible only because §1 dropped
-- the cascade; before that, this line would have taken the profile, and the
-- profile would have taken the round.
-- ---------------------------------------------------------------------------

create or replace function purge_due_deletions()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_count int := 0;
begin
  for v_id in
    select id from profiles
    where anonymised_at is null
      and deletion_requested_at is not null
      and deletion_requested_at < now() - interval '30 days'
  loop
    perform anonymise_profile(v_id);
    delete from auth.users where id = v_id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function purge_due_deletions() from public, anon, authenticated;
grant execute on function purge_due_deletions() to service_role;

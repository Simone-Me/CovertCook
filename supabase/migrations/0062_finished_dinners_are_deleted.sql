-- A dinner that finished three weeks ago deletes itself.
--
-- This is the last line of ROADMAP §7 step 4, and it was deliberately held back
-- until the two things that make it defensible existed: **a recipe worth
-- keeping is in somebody's book (0058), and an evening worth remembering is in
-- their album (0058 + 0061).** Deleting first would have proved that false.
--
-- WHAT IS ACTUALLY BEING DELETED. Not the memory of the evening — the machinery
-- of the game. The chain of who cooked for whom, the private threads, the
-- ballots, the roster, the pseudonyms, the recipes as they sat in the round.
-- All of it is about running a dinner, and three weeks after the plates were
-- cleared it is dead weight that keeps somebody's writing and somebody's
-- pairing on a server for no purpose. Keeping it forever is the choice that
-- would need defending, not this.
--
-- WHAT SURVIVES, and both were built to:
--
--   * every recipe anybody chose to keep, copied whole into their book;
--   * the photograph each person added, with the dinner's name and date printed
--     on it.
--
-- TWENTY-ONE DAYS, counted from when the dinner FINISHED rather than from when
-- it happened. A round that sat in ARCHIVED because nobody pressed anything is
-- finished; a round still being voted on is not, whatever its date says. And
-- the clock starts at the archive rather than at the dinner so that a host who
-- takes a fortnight to publish the results does not find the evening gone the
-- day they do.

-- ---------------------------------------------------------------------------
-- 1. When it finished.
--
-- A trigger rather than a line in `advance_phase`, because there are several
-- ways into ARCHIVED and CANCELLED — the host stepping forward, a cancellation,
-- and whatever the next one turns out to be — and a stamp that only some of
-- them set is worse than none. This one cannot be missed.
-- ---------------------------------------------------------------------------

alter table rounds add column if not exists finished_at timestamptz;

comment on column rounds.finished_at is
  'When the dinner stopped being live. The 21-day clock in purge_old_rounds '
  'runs from here, not from dinner_at.';

create or replace function stamp_round_finished()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('ARCHIVED', 'CANCELLED')
     and old.status is distinct from new.status
     and new.finished_at is null then
    new.finished_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists rounds_finished_at on rounds;
-- Before `rounds_frozen`, alphabetically and therefore in fact: that one
-- refuses updates to an already-frozen round, and this one has to run on the
-- update that freezes it.
create trigger rounds_finished_at
  before update on rounds
  for each row execute function stamp_round_finished();

-- The backfill that used to live here has moved to the end of section 2, and
-- moving it is a bug fix rather than tidying. It stamps every already-finished
-- dinner — and stamping a finished dinner is an UPDATE on a frozen round, which
-- is exactly what 0054's guard refuses. It cannot run until that guard has been
-- taught the escape hatch a few lines below.
--
-- IT PASSED EVERYWHERE IT WAS EVER TESTED. `supabase db reset` runs the
-- migrations against an empty database, so at this point in the file there are
-- no archived rounds, the UPDATE matches zero rows, and a trigger that never
-- fires cannot refuse. It only fails where there is something to stamp — which
-- is to say, only in production. See the CHANGELOG for 2026-08-28 (3).

-- ---------------------------------------------------------------------------
-- 2. The way through the freeze.
--
-- 0054 puts a trigger on every table belonging to a round that refuses INSERT,
-- UPDATE **and DELETE** once the round is frozen. That is what makes a finished
-- dinner a record — and it also means `delete from rounds where ...` fails: the
-- cascade into round_members, pairings, briefs and the rest is refused by the
-- guard, row by row.
--
-- So there is one door, it is named, and it is opened from inside
-- `purge_old_rounds` alone. `set_config(..., true)` makes it local to the
-- transaction, so it closes itself even if the purge raises halfway through.
--
-- A client cannot open it: PostgREST executes functions, never arbitrary SQL,
-- and there is no RPC here that calls set_config. The one function that does is
-- revoked from every client role.
-- ---------------------------------------------------------------------------

create or replace function refuse_if_round_frozen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round_id uuid;
  v_row jsonb := to_jsonb(coalesce(new, old));
begin
  -- The purge is the one caller entitled to take a frozen dinner apart.
  if coalesce(current_setting('covertcook.purging', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  v_round_id := (v_row ->> tg_argv[0])::uuid;

  if v_round_id is not null and round_is_frozen(v_round_id) then
    raise exception 'this dinner is over and can no longer be changed'
      using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

-- And the rounds table's own guard. The purge does not need it — it deletes
-- rather than updates, and that trigger is BEFORE UPDATE only — but the escape
-- hatch should be one idea rather than "one for the children and not the
-- parent", or the next person to need it finds half a mechanism.
create or replace function refuse_if_round_already_frozen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('covertcook.purging', true), '') = 'on' then
    return new;
  end if;

  if old.status in ('ARCHIVED', 'CANCELLED') then
    raise exception 'this dinner is over and can no longer be changed'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- The three that reach a round through something else, same door.
create or replace function refuse_if_brief_round_frozen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round_id uuid;
begin
  if coalesce(current_setting('covertcook.purging', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  select p.round_id into v_round_id
  from pairings p where p.id = coalesce(new.pairing_id, old.pairing_id);

  if v_round_id is not null and round_is_frozen(v_round_id) then
    raise exception 'this dinner is over and can no longer be changed'
      using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function refuse_if_ingredient_round_frozen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round_id uuid;
begin
  if coalesce(current_setting('covertcook.purging', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  select p.round_id into v_round_id
  from briefs b join pairings p on p.id = b.pairing_id
  where b.id = coalesce(new.brief_id, old.brief_id);

  if v_round_id is not null and round_is_frozen(v_round_id) then
    raise exception 'this dinner is over and can no longer be changed'
      using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function refuse_if_ballot_item_round_frozen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round_id uuid;
begin
  if coalesce(current_setting('covertcook.purging', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  select b.round_id into v_round_id
  from ballots b where b.id = coalesce(new.ballot_id, old.ballot_id);

  if v_round_id is not null and round_is_frozen(v_round_id) then
    raise exception 'this dinner is over and can no longer be changed'
      using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

-- Everything already finished gets today's date rather than its real one.
--
-- Deliberately generous: the alternative is that this migration deploys and
-- every dinner older than three weeks disappears the same night, without anyone
-- having been told the rule exists or having had a chance to keep anything from
-- them. Three weeks from now is the earliest any existing dinner can go.
--
-- Through the same door the purge uses, and it has to be: an already-archived
-- dinner is frozen, and stamping one is an update on a frozen round. The door
-- is transaction-local — `set_config(..., true)` — and it is shut again on the
-- next line rather than left open for the rest of the file, because everything
-- after this point should be refused by the guards exactly as a client would
-- be.
do $$
begin
  perform set_config('covertcook.purging', 'on', true);
  update rounds set finished_at = now()
  where status in ('ARCHIVED', 'CANCELLED') and finished_at is null;
  perform set_config('covertcook.purging', 'off', true);
end $$;

-- ---------------------------------------------------------------------------
-- 3. The purge.
--
-- Called by a scheduled workflow rather than pg_cron, like the account purge in
-- 0049 and for the same reason: this project's scheduler already lives in
-- GitHub Actions and one place to look beats two.
--
-- One round at a time rather than one big DELETE, so that a single dinner
-- refusing to go — a foreign key nobody thought about, a constraint added
-- later — costs that dinner and not the whole run.
-- ---------------------------------------------------------------------------

create or replace function purge_old_rounds(p_days int default 21)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_count int := 0;
begin
  perform set_config('covertcook.purging', 'on', true);

  for v_id in
    select id from rounds
    where status in ('ARCHIVED', 'CANCELLED')
      and finished_at is not null
      and finished_at < now() - make_interval(days => greatest(p_days, 1))
  loop
    delete from rounds where id = v_id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function purge_old_rounds(int) from public, anon, authenticated;
grant execute on function purge_old_rounds(int) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Saying so, before it happens.
--
-- A dinner that will be deleted has to say when, on itself, while it still
-- exists — otherwise the first anybody learns of the rule is a dinner that is
-- not there any more. The date is derived rather than stored: one number, in
-- one place, and changing the policy changes every screen at once.
-- ---------------------------------------------------------------------------

create or replace function round_deletes_at(p_finished_at timestamptz)
returns timestamptz
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_finished_at + interval '21 days';
$$;

grant execute on function round_deletes_at(timestamptz) to authenticated;

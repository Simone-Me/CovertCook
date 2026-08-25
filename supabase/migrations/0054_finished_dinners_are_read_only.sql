-- A finished dinner stops being editable, by anybody.
--
-- Until now ARCHIVED and CANCELLED were labels rather than states: the host
-- could still rename the round, move the date, approve somebody, remove a
-- chef, add a course; players could still post. Nothing stopped it, because
-- almost every write path checks *who* is asking and only some of them check
-- *when*. An evening that has happened is a record, and a record that can be
-- edited afterwards is not one.
--
-- WHY A TRIGGER AND NOT A CHECK IN EACH RPC. There are roughly seventy
-- functions and a dozen of them write. Adding a guard to each means finding
-- each, editing each, and remembering the rule the next time one is written —
-- and the one that gets forgotten is the hole. A trigger sits under all of
-- them: every path, including ones that do not exist yet, including a direct
-- table write, hits the same rule in the same place.
--
-- THE TRANSITION ITSELF STAYS OPEN. Freezing on `OLD.status` rather than on
-- the new one is what lets advance_phase move a round *into* ARCHIVED or
-- CANCELLED. It is the last write a round accepts.
--
-- WHAT IS DELIBERATELY NOT FROZEN: erasing an account (0049) already skips
-- rounds that have finished, and the recipe book will copy rather than
-- reference (ROADMAP §5), so neither needs a way in.

create or replace function round_is_frozen(p_round_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from rounds
    where id = p_round_id and status in ('ARCHIVED', 'CANCELLED')
  );
$$;

-- Generic guard. The trigger passes the name of the column holding the round
-- id, so one function covers every table that carries one.
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
  v_round_id := (v_row ->> tg_argv[0])::uuid;

  if v_round_id is not null and round_is_frozen(v_round_id) then
    raise exception 'this dinner is over and can no longer be changed'
      using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

-- `rounds` is its own case: freeze on the OLD status so the move into
-- ARCHIVED is allowed and everything after it is not.
create or replace function refuse_if_round_already_frozen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status in ('ARCHIVED', 'CANCELLED') then
    raise exception 'this dinner is over and can no longer be changed'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Tables that reach a round through something else. Written out rather than
-- generalised: a wrong join here would either block a live dinner or leave a
-- finished one open, and both are worse than three extra functions.
create or replace function refuse_if_brief_round_frozen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round_id uuid;
begin
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
  select b.round_id into v_round_id
  from ballots b where b.id = coalesce(new.ballot_id, old.ballot_id);

  if v_round_id is not null and round_is_frozen(v_round_id) then
    raise exception 'this dinner is over and can no longer be changed'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists rounds_frozen on rounds;
create trigger rounds_frozen
  before update on rounds
  for each row execute function refuse_if_round_already_frozen();

do $$
declare
  t text;
begin
  foreach t in array array[
    'round_members', 'slots', 'pairings', 'exclusion_pairs',
    'messages_placeholder', -- messages reach a round through pairings, below
    'round_messages', 'host_alerts', 'ballots', 'invites',
    'round_invitations', 'manual_tally', 'results', 'awards'
  ]
  loop
    continue when t = 'messages_placeholder';
    execute format('drop trigger if exists %I_frozen on %I', t, t);
    execute format(
      'create trigger %I_frozen before insert or update or delete on %I
         for each row execute function refuse_if_round_frozen(%L)',
      t, t, 'round_id');
  end loop;
end $$;

drop trigger if exists briefs_frozen on briefs;
create trigger briefs_frozen
  before insert or update or delete on briefs
  for each row execute function refuse_if_brief_round_frozen();

drop trigger if exists messages_frozen on messages;
create trigger messages_frozen
  before insert or update or delete on messages
  for each row execute function refuse_if_brief_round_frozen();

drop trigger if exists brief_ingredients_frozen on brief_ingredients;
create trigger brief_ingredients_frozen
  before insert or update or delete on brief_ingredients
  for each row execute function refuse_if_ingredient_round_frozen();

drop trigger if exists ballot_items_frozen on ballot_items;
create trigger ballot_items_frozen
  before insert or update or delete on ballot_items
  for each row execute function refuse_if_ballot_item_round_frozen();

comment on function round_is_frozen(uuid) is
  'A dinner that has been archived or cancelled. Every table that belongs to a round refuses writes for one (0054).';

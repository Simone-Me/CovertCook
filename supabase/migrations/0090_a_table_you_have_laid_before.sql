-- ---------------------------------------------------------------------------
-- A TABLE YOU HAVE LAID BEFORE.
--
-- The creation screen now opens on a grid of ready-made dinners — the classic
-- game, a party, a quiet one — and the moment that existed, the obvious
-- missing card was the host's own: the fifteen answers they give every time,
-- kept under a name they chose, sitting on the same grid as the four the app
-- ships.
--
-- WHY A TABLE AND NOT A BROWSER'S LOCAL STORAGE. A saved setup is not a
-- preference like a theme toggle; it is the shape of the dinners somebody
-- runs, and it has to be there on the phone they organise from as well as on
-- the laptop they wrote it on. Local storage would also lose it silently on a
-- cleared cache, which is exactly how a feature stops being trusted.
--
-- WHY JSONB AND NOT SEVENTEEN COLUMNS. What a setup contains is a client
-- decision that moves whenever the form does — the fil rouge added three
-- fields to it in 0085, the shared menu another in 0087 — and a column per
-- answer would make every one of those a migration plus a backfill. Nothing in
-- here is ever queried by its contents: a row is read whole, by its owner, and
-- handed straight back to the form. The client validates what it reads,
-- because a document written by an old version of the app is the normal case,
-- not the exceptional one.
--
-- NO SECURITY DEFINER FUNCTION, and that is the point of it being an ordinary
-- table: there is nothing here that belongs to anybody else, nothing to strip
-- on the way out, and nothing a policy cannot say. `profile_id = auth.uid()`
-- IS the whole rule.
-- ---------------------------------------------------------------------------

create table if not exists round_presets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  name text not null,
  setup jsonb not null,
  created_at timestamptz not null default now(),
  constraint round_presets_name_length check (char_length(btrim(name)) between 1 and 40)
);

comment on table round_presets is
  'A host''s own creation settings, saved under a name and shown on the grid beside the four the app ships (0090). Read whole by its owner and never queried by content.';

-- One name per account: saving "Sunday" twice means replacing the first one,
-- and the client upserts on exactly this pair.
--
-- A PLAIN CONSTRAINT AND NOT AN EXPRESSION INDEX, which is a client-shaped
-- decision rather than a database-shaped one: PostgREST can only be pointed at
-- a real unique constraint by column name, so `lower(btrim(name))` — tidier
-- here — would have left the client doing delete-then-insert, which is two
-- round trips and a window where the host has neither the old card nor the new
-- one. The trimming happens in the trigger below instead, so the constraint
-- sees the same string the grid will show.
alter table round_presets drop constraint if exists round_presets_one_name;
alter table round_presets add constraint round_presets_one_name unique (profile_id, name);

create index if not exists round_presets_owner_idx
  on round_presets (profile_id, created_at desc);

-- A dozen is not a limit anybody will feel, and it is the difference between a
-- shelf and a place to put things nobody ever reads. It is also what stops a
-- lost loop in a client writing rows forever.
create or replace function round_presets_cap()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Trimmed here rather than trusted from the client, because the unique
  -- constraint above is what has to see it: " Sunday" and "Sunday" are one
  -- card to a person, and two rows to Postgres.
  new.name := btrim(new.name);
  if tg_op = 'INSERT'
     and (select count(*) from round_presets p where p.profile_id = new.profile_id) >= 12 then
    raise exception 'TOO_MANY_PRESETS';
  end if;
  return new;
end;
$$;

drop trigger if exists round_presets_cap_trigger on round_presets;
create trigger round_presets_cap_trigger
  before insert or update on round_presets
  for each row execute function round_presets_cap();

alter table round_presets enable row level security;

drop policy if exists round_presets_own_select on round_presets;
create policy round_presets_own_select on round_presets
  for select using (profile_id = auth.uid());

drop policy if exists round_presets_own_insert on round_presets;
create policy round_presets_own_insert on round_presets
  for insert with check (profile_id = auth.uid());

drop policy if exists round_presets_own_update on round_presets;
create policy round_presets_own_update on round_presets
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists round_presets_own_delete on round_presets;
create policy round_presets_own_delete on round_presets
  for delete using (profile_id = auth.uid());

grant select, insert, update, delete on round_presets to authenticated;

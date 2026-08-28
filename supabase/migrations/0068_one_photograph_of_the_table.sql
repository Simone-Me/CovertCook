-- One photograph of the table, taken by one named person, and kept by whoever
-- wants to keep it.
--
-- 0060 chose the other answer, and said so: "one photo per dinner immediately
-- asks who gets to be the photographer, so one each says everybody may add
-- theirs". What one-each actually produced is a strip of near identical
-- pictures of the same table taken four minutes apart, no two of them the one
-- anybody would have chosen — and an album that is a scroll of them, which is
-- not an album, it is a camera roll.
--
-- SO THE QUESTION GETS ITS ANSWER, AND IT IS A ROLE RATHER THAN A PERMISSION.
-- The dinner has somebody whose dinner it is, and every other decision about
-- the evening is already theirs. But the person running a dinner is usually the
-- person carrying plates at the end of it, so they can hand the camera to one
-- named chef — and **handing it over means giving it up**. While the delegation
-- stands the Executive Chef cannot take or replace the photograph; the chef
-- holding the camera can. A right two people hold at once is not a handover, it
-- is a suggestion, and the table would have no way of knowing who was actually
-- going to do it. Which is why everybody at the dinner is told, in words, whose
-- job it is.
--
-- AND NOTHING LANDS IN ANYBODY'S ALBUM BY ITSELF. This is the rule 0058 already
-- established for recipes and it is the right one for photographs too: a
-- keepsake is something you chose to keep. `saved_photos` is `saved_recipes`
-- with a picture in it — a **copy**, made when somebody presses add, precisely
-- so that it survives the dinner being purged (0062) and cannot be rewritten
-- under them when the photographer swaps the picture out.
--
-- AND THE PHOTOGRAPHS START APPEARING AGAIN. There is a bug in here that has
-- made every album on the service empty since 0061, and it is the reason this
-- migration exists at all — see part 7.

-- ---------------------------------------------------------------------------
-- 1. Who holds the camera.
--
-- On `rounds`, not on a table of its own: it is one nullable person per dinner,
-- set and cleared by the host like every other property of the evening, and the
-- round row is already fetched on every screen that needs to ask.
--
-- The PROFILE, not the seat. Deliberately, and it is what keeps this from being
-- a hole in the anonymity: `list_round_members` hands out `member_id` beside
-- `secret_name` and withholds `profile_id` until the reveal, precisely so that
-- no client can build the map from a pseudonym to a person. A photographer
-- stored as a member_id, picked from a list showing real names, would hand that
-- map to the host in one join. A profile_id joins to nothing the client sees.
-- ---------------------------------------------------------------------------

alter table rounds
  add column if not exists photographer_profile_id uuid references profiles (id) on delete set null;

comment on column rounds.photographer_profile_id is
  'The chef the Executive Chef handed the camera to, and while it is set the '
  'host cannot take the photograph themselves. Null means the host holds it. '
  'A profile, never a seat: a member_id here would be joinable to a pseudonym '
  'and would leak the roster (0068).';

-- ---------------------------------------------------------------------------
-- 2. Handing the camera over, and saying so out loud.
--
-- `list_table_chefs` is the picker, and everything about it is subtraction. It
-- returns real names, because the host is choosing a person in a room and
-- "Saffron" is not a person in a room. It returns no member_id and no
-- pseudonym, because those two beside a real name are the whole secret of the
-- game. It is ordered by name rather than by anything the roster is ordered by,
-- so position cannot be read as a correlation either.
--
-- The host already knows who is at their own dinner — they approved every one
-- of them. Nothing here is a disclosure. The mapping is, and it is not here.
-- ---------------------------------------------------------------------------

create or replace function list_table_chefs(p_round_id uuid)
returns table (profile_id uuid, real_name text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the Executive Chef can do this' using errcode = '42501';
  end if;

  return query
    select pr.id, pr.display_name
    from round_members m
    join profiles pr on pr.id = m.profile_id
    where m.round_id = p_round_id
      and m.status = 'ACTIVE'
      and m.approved
      and m.profile_id <> v_uid
    order by lower(pr.display_name);
end;
$$;

grant execute on function list_table_chefs(uuid) to authenticated;

create or replace function set_photographer(p_round_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the Executive Chef can do this' using errcode = '42501';
  end if;

  -- Null takes it back, and taking it back is as visible as handing it over:
  -- `get_photographer` says who holds it either way, to everybody.
  if p_profile_id is not null and not exists (
    select 1 from round_members m
    where m.round_id = p_round_id
      and m.profile_id = p_profile_id
      and m.status = 'ACTIVE'
      and m.approved
  ) then
    raise exception 'NOT_AT_THIS_TABLE';
  end if;

  update rounds set photographer_profile_id = p_profile_id where id = p_round_id;
end;
$$;

grant execute on function set_photographer(uuid, uuid) to authenticated;

-- Who holds the camera, to anybody at the table — the question the whole table
-- has to be able to answer, because otherwise four people wait for each other
-- and nobody takes the picture.
--
-- IT ANSWERS THE RIGHT, NOT THE COLUMN: when nothing has been handed over it
-- names the host, because that is who may actually do it. And it answers with a
-- REAL NAME, which is safe for the same reason the Executive Chef's own name is
-- already printed on the roster: naming a person at a dinner reveals nothing
-- about which pseudonym they wore. What would leak is a real name beside a
-- pseudonym — see the note on `taken_by` in list_round_photos below.
create or replace function get_photographer(p_round_id uuid)
returns table (profile_id uuid, real_name text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
begin
  if not (is_round_host(p_round_id, v_uid) or is_round_member(p_round_id, v_uid)) then
    raise exception 'not a member of this round';
  end if;

  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  return query
    select pr.id, pr.display_name
    from profiles pr
    where pr.id = coalesce(v_round.photographer_profile_id, v_round.host_id);
end;
$$;

grant execute on function get_photographer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. What the photograph row has to carry.
--
-- `menu` is the evening itself: the courses and the dishes that reached the
-- table, in the order they were eaten. It is copied rather than joined because
-- three weeks later there is nothing to join to.
-- ---------------------------------------------------------------------------

alter table dinner_photos
  add column if not exists menu jsonb not null default '[]'::jsonb;

comment on column dinner_photos.menu is
  'The menu that was eaten, as [{course, dish}], copied at upload so it can '
  'outlive the dinner. While the round still exists the live one is preferred '
  '— a dish struck off after the photograph was taken should not stay on the '
  'menu printed under it.';

-- ---------------------------------------------------------------------------
-- 4. One per dinner instead of one per person.
--
-- The existing rows have to be reconciled with that before the index can hold
-- it, and there is no way to do it that keeps every photograph on screen. The
-- host's is kept where there is one, otherwise the most recent — the one taken
-- last is the one taken at the end, which is the photograph this feature was
-- always asking for.
--
-- The others are HIDDEN, not deleted. That is the same act the host already has
-- (0060), the row and the bytes both survive it, and it is reversible by hand
-- if a dinner turns out to have lost the picture somebody cared about.
-- ---------------------------------------------------------------------------

with ranked as (
  select
    p.id,
    row_number() over (
      partition by p.round_id
      order by
        -- coalesce, because a row whose owner is null would otherwise sort
        -- FIRST: `desc` puts nulls before trues, and the photograph with no
        -- owner left would win the dinner.
        coalesce(r.host_id = p.taken_by_profile_id, false) desc,
        p.created_at desc
    ) as rank
  from dinner_photos p
  left join rounds r on r.id = p.round_id
  where p.round_id is not null and p.hidden_at is null
)
update dinner_photos p
set hidden_at = now()
from ranked
where ranked.id = p.id and ranked.rank > 1;

alter table dinner_photos drop constraint if exists dinner_photos_round_id_member_id_key;

-- Partial, on both counts. `round_id is not null` because a purged dinner is no
-- longer a dinner to be one-per — and NULLs are distinct anyway, so this only
-- makes the intent legible. `hidden_at is null` because a photograph that was
-- taken down is a record of something that happened, not a slot still occupied:
-- the next one takes the place, the removed one keeps its row.
create unique index if not exists dinner_photos_one_per_round
  on dinner_photos (round_id)
  where round_id is not null and hidden_at is null;

-- ---------------------------------------------------------------------------
-- 5. The album is a thing you choose to keep.
--
-- `saved_photos` is `saved_recipes` (0058) with a picture in it, and it is the
-- same table for the same three reasons:
--
--   * NOTHING ARRIVES BY ITSELF. Being at a dinner is not choosing to keep a
--     picture of it. The results screen offers, you press add, and that is the
--     only way anything reaches an album — which is also what makes the album
--     worth opening: everything in it was chosen.
--   * IT IS A COPY. The dinner is deleted after twenty-one days (0062) and the
--     photograph may be swapped out by the photographer at any point before
--     that. A reference would give you an album that empties itself and rewrites
--     itself; a copy gives you the picture you kept.
--   * ITS OWN TABLE, because 0054 refuses every write to a round's tables once
--     it is archived — and saving from a finished dinner is the only moment
--     anybody ever does this. `saved_photos`, like `saved_recipes`, is
--     deliberately absent from that trigger list.
--
-- What it does NOT copy is the bytes: the picture stays in the bucket, one
-- object however many people keep it, and part 7's read policy is what lets a
-- keeper still see it after the dinner it came from is gone.
-- ---------------------------------------------------------------------------

create table if not exists saved_photos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,

  -- Where it came from. Both nullable and both ON DELETE SET NULL: the copy is
  -- the point, and it has to survive its origin being deleted.
  source_photo_id uuid references dinner_photos (id) on delete set null,
  round_id uuid references rounds (id) on delete set null,

  -- The evening, copied, so the card can still say which dinner this was after
  -- the dinner is gone.
  round_name text not null default '',
  dinner_at timestamptz,
  menu jsonb not null default '[]'::jsonb,
  -- The name under the picture. A real name, because by the time anybody is
  -- keeping a photograph the person who took it is a publicly named role.
  taken_by_name text,

  storage_path text not null,
  caption text,
  saved_at timestamptz not null default now(),

  -- One save per picture per person, which is what makes the add control a
  -- switch rather than a counter. Keyed on the path rather than on the source
  -- row: if the photographer replaces the dinner's photograph, the new one is a
  -- different picture and keeping it is a different decision.
  unique (profile_id, storage_path)
);

create index if not exists saved_photos_profile_idx on saved_photos (profile_id, saved_at desc);

alter table saved_photos enable row level security;

-- No policies and no grants: every read and write goes through the functions
-- below, the same posture `saved_recipes` and `dinner_photos` take.

-- ---------------------------------------------------------------------------
-- 6. record_photo, save_photo, forget_photo, my_album.
-- ---------------------------------------------------------------------------

-- The menu that reached the table, in the order it was eaten. `delivered` is
-- what 0057 uses to strike a dish off the service menu, and a dish nobody made
-- has no place in a photograph of the meal.
--
-- NOT GRANTED TO ANYBODY. It asks no question about who is calling — it cannot,
-- because it is called for dinners that no longer exist and have no roster left
-- to check against. Handed to `authenticated` it would be a way to read the dish
-- names of any dinner in the service by id, weeks before its own table is
-- allowed to see them. Its callers are SECURITY DEFINER and do their own
-- checking; they reach it because they run as the owner, not because the caller
-- may.
create or replace function round_menu_snapshot(p_round_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('course', b.course, 'dish', b.dish_name)
      order by b.course, b.dish_name
    ),
    '[]'::jsonb
  )
  from briefs b
  join pairings pa on pa.id = b.pairing_id
  join rounds r on r.id = pa.round_id
  where pa.round_id = p_round_id
    and pa.assignment_version = r.assignment_version
    and b.status = 'SUBMITTED'
    and b.delivered;
$$;

revoke all on function round_menu_snapshot(uuid) from public, anon, authenticated;

create or replace function record_photo(p_round_id uuid, p_path text, p_caption text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_member round_members;
  v_may boolean;
  v_existing uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  if v_round.status not in ('DINNER', 'VOTING', 'RESULTS', 'ARCHIVED') then
    raise exception 'ALBUM_NOT_OPEN_YET';
  end if;

  select * into v_member from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE' and approved;
  if not found then raise exception 'not an active member of this round'; end if;

  -- The chef holding the camera, and nobody else — including the Executive
  -- Chef, who gave it away. Handing it over has to mean giving it up, or the
  -- table has no way of knowing whose job it actually is.
  --
  -- `is not distinct from` rather than `=`: photographer_profile_id is null on
  -- most dinners, and `null = uid` is null, which an IF quietly treats as
  -- false — the refusal would never fire and everybody could upload.
  v_may := (v_round.photographer_profile_id is null and v_round.host_id = v_uid)
        or (v_round.photographer_profile_id is not distinct from v_uid);
  if not v_may then
    raise exception 'NOT_THE_PHOTOGRAPHER';
  end if;

  if p_path is null or p_path not like p_round_id::text || '/%' then
    raise exception 'PHOTO_PATH_MISMATCH';
  end if;

  select id into v_existing from dinner_photos
  where round_id = p_round_id and hidden_at is null;

  -- Replacing is an edit to the one row, not a second row. What it leaves
  -- behind is the old object in the bucket, unreferenced by `dinner_photos` —
  -- and still referenced by anybody who kept it, which is why nothing sweeps
  -- the bucket by "has no dinner_photos row" and why part 7's read policy asks
  -- `saved_photos` as well.
  if v_existing is not null then
    update dinner_photos set
      storage_path = p_path,
      caption = nullif(btrim(coalesce(p_caption, '')), ''),
      round_name = v_round.name,
      dinner_at = v_round.dinner_at,
      taken_by_profile_id = v_uid,
      taken_by_name = v_member.secret_name,
      member_id = v_member.id,
      menu = round_menu_snapshot(p_round_id),
      reported = false,
      created_at = now()
    where id = v_existing
    returning id into v_id;
    return v_id;
  end if;

  insert into dinner_photos (
    round_id, member_id, storage_path, caption,
    round_name, dinner_at, taken_by_profile_id, taken_by_name, menu
  )
  values (
    p_round_id, v_member.id, p_path, nullif(btrim(coalesce(p_caption, '')), ''),
    v_round.name, v_round.dinner_at, v_uid, v_member.secret_name,
    round_menu_snapshot(p_round_id)
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function record_photo(uuid, text, text) to authenticated;

-- Keeping it. The one act that puts anything in an album.
create or replace function save_photo(p_photo_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_photo dinner_photos;
  v_taken_by text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_photo from dinner_photos where id = p_photo_id;
  if not found then raise exception 'photo not found'; end if;
  if v_photo.hidden_at is not null then raise exception 'PHOTO_REMOVED'; end if;

  -- You were at that table. The dinner has to still exist for this, and that is
  -- correct rather than a limitation: a purged dinner has no results screen to
  -- press add on.
  if v_photo.round_id is null or not is_round_member(v_photo.round_id, v_uid) then
    raise exception 'not a member of this round';
  end if;

  -- A real name under the picture, and it is safe here for the reason set out
  -- above get_photographer: the photographer is a publicly named role by the
  -- time anybody is keeping anything, and no pseudonym travels with it.
  select pr.display_name into v_taken_by
  from profiles pr where pr.id = v_photo.taken_by_profile_id;

  insert into saved_photos (
    profile_id, source_photo_id, round_id, round_name, dinner_at,
    menu, taken_by_name, storage_path, caption
  )
  values (
    v_uid, v_photo.id, v_photo.round_id,
    coalesce(nullif(v_photo.round_name, ''), (select r.name from rounds r where r.id = v_photo.round_id), ''),
    v_photo.dinner_at,
    round_menu_snapshot(v_photo.round_id),
    v_taken_by,
    v_photo.storage_path,
    v_photo.caption
  )
  on conflict (profile_id, storage_path) do nothing
  returning id into v_id;

  -- Already kept. Not an error: the control is a switch, and pressing it twice
  -- has to mean the same thing as pressing it once.
  if v_id is null then
    select id into v_id from saved_photos
    where profile_id = v_uid and storage_path = v_photo.storage_path;
  end if;

  return v_id;
end;
$$;

grant execute on function save_photo(uuid) to authenticated;

create or replace function forget_photo(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  delete from saved_photos where id = p_id and profile_id = v_uid;
  if not found then raise exception 'PHOTO_NOT_IN_YOUR_ALBUM'; end if;
end;
$$;

grant execute on function forget_photo(uuid) to authenticated;

-- One dinner's photograph, to the people who were at it — plus whether it is
-- already in your album, so the add control can come back already pressed
-- rather than inviting somebody to keep the same picture twice.
--
-- `taken_by` IS NOW A REAL NAME, and that is a correction rather than a
-- loosening. It used to be the seat's pseudonym, which was right when everybody
-- added their own. It is wrong now: the table is told in words who holds the
-- camera (`get_photographer`, a real name), so a pseudonym on the picture that
-- person took would sit one line away from their real name and hand over the
-- mapping the whole design exists to protect. One public fact, said once.
--
-- DROPPED RATHER THAN REPLACED, and it has to be: `already_saved` is a new OUT
-- parameter, and `create or replace` refuses to change the row type an
-- OUT-parameter function returns — "cannot change return type of existing
-- function". That error aborts the whole migration, which is worse than it
-- sounds: Supabase runs each file as one transaction, so *nothing* in this
-- file lands, `rounds` never gets its photographer column, and the app talks
-- to a database one version behind itself. 0057 hit this and wrote it down.
-- This file did it anyway.
drop function if exists list_round_photos(uuid);

create function list_round_photos(p_round_id uuid)
returns table (
  id uuid,
  storage_path text,
  caption text,
  taken_by text,
  is_mine boolean,
  reported boolean,
  hidden boolean,
  already_saved boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not (is_round_host(p_round_id, v_uid) or is_round_member(p_round_id, v_uid)) then
    raise exception 'not a member of this round';
  end if;

  return query
    select
      p.id, p.storage_path, p.caption,
      pr.display_name,
      p.taken_by_profile_id = v_uid,
      p.reported,
      p.hidden_at is not null,
      exists (
        select 1 from saved_photos s
        where s.profile_id = v_uid and s.storage_path = p.storage_path
      ),
      p.created_at
    from dinner_photos p
    left join profiles pr on pr.id = p.taken_by_profile_id
    where p.round_id = p_round_id
      and (p.hidden_at is null or p.taken_by_profile_id = v_uid)
      -- Somebody you have blocked (0059) is not in your album either. A block
      -- that stops their words and keeps their pictures is half a block.
      and not exists (
        select 1 from blocked_users b
        where b.profile_id = v_uid and b.blocked_profile_id = p.taken_by_profile_id
      )
    order by p.created_at;
end;
$$;

grant execute on function list_round_photos(uuid) to authenticated;

-- The album: what you chose to keep, newest evening first. It reads
-- `saved_photos` and nothing else, so it answers identically before and after
-- the dinner is purged — which is the whole promise the deletion was justified
-- by.
drop function if exists my_album();

create function my_album()
returns table (
  id uuid,
  round_id uuid,
  round_name text,
  dinner_at timestamptz,
  storage_path text,
  caption text,
  taken_by_name text,
  -- False once the dinner has been deleted. The album still shows the
  -- photograph and its evening; there is simply nothing left behind it.
  dinner_exists boolean,
  menu jsonb,
  saved_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    s.id,
    s.round_id,
    s.round_name,
    s.dinner_at,
    s.storage_path,
    s.caption,
    s.taken_by_name,
    s.round_id is not null,
    -- The live menu while there is a dinner to read it from, the copy
    -- afterwards. A host who strikes a dish off after somebody kept the
    -- photograph should not leave the album printing a course nobody ate.
    case when s.round_id is not null then round_menu_snapshot(s.round_id) else s.menu end,
    s.saved_at
  from saved_photos s
  where s.profile_id = auth.uid()
  order by coalesce(s.dinner_at, s.saved_at) desc, s.saved_at desc;
$$;

grant execute on function my_album() to authenticated;

-- Taking one down reaches the copies. Moderation that leaves the picture in
-- nine albums has not removed anything, and this is the one place in the app
-- where a copy is deliberately not sovereign.
create or replace function hide_photo(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_photo dinner_photos;
begin
  select * into v_photo from dinner_photos p where p.id = p_id;
  if not found then raise exception 'photo not found'; end if;

  -- The host of the dinner it belonged to, while there is one; or the person
  -- who put it there, always — taking your own photograph back should not stop
  -- working because the evening was deleted.
  if not (
    v_photo.taken_by_profile_id = v_uid
    or (v_photo.round_id is not null and is_round_host(v_photo.round_id, v_uid))
  ) then
    raise exception 'only the host or the person who added it can remove it';
  end if;

  update dinner_photos set hidden_at = now() where id = p_id;
  delete from saved_photos where storage_path = v_photo.storage_path;

  if v_photo.round_id is not null then
    insert into audit_log (round_id, actor_id, action, payload)
    values (v_photo.round_id, v_uid, 'PHOTO_REMOVED', jsonb_build_object('photo_id', p_id));
  end if;
end;
$$;

grant execute on function hide_photo(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. The bug: every album has been empty since 0061.
--
-- 0061 rewrote the bucket's read policy from `is_round_member(folder, uid)` to
-- a pair of EXISTS over `dinner_photos`, so that a photograph could still be
-- read after its dinner was purged. The logic is right. The privilege is not.
--
-- `dinner_photos` has RLS on and — by design, stated in 0060 — **no policies
-- and no grants**: every read of it goes through a SECURITY DEFINER function.
-- A storage policy is not one of those. It is evaluated as the caller, so the
-- subquery runs as `authenticated`, which has no SELECT on the table, and the
-- whole expression fails with "permission denied for table dinner_photos".
--
-- The failure is invisible in exactly the way that matters: uploading works,
-- the row is written, `list_round_photos` (a definer function) returns it, the
-- tile appears — and then `createSignedUrl` is refused, the client turns that
-- into a null URL, and the placeholder sits there. A photograph that uploaded
-- successfully and cannot be looked at, with no error anywhere.
--
-- The fix is the posture the rest of the schema already has: the policy asks a
-- SECURITY DEFINER function a yes/no question, and that function is the only
-- thing that touches the tables.
-- ---------------------------------------------------------------------------

create or replace function photo_object_visible(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    -- You kept it. The rule that survives everything: the dinner being purged,
    -- the photograph being replaced, the row it came from losing its round.
    exists (
      select 1 from saved_photos s
      where s.storage_path = p_path and s.profile_id = auth.uid()
    )
    -- Or you are at that table now, which is what lets the results screen show
    -- it to people who have not decided whether to keep it yet.
    or exists (
      select 1 from dinner_photos p
      where p.storage_path = p_path
        and (
          p.taken_by_profile_id = auth.uid()
          or (p.round_id is not null and is_round_member(p.round_id, auth.uid()))
        )
    );
$$;

grant execute on function photo_object_visible(text) to authenticated;

-- Deleting the bytes is the person who put them there, or the host of the
-- dinner they belong to. The folder is asked as well as the row, because
-- replacing a photograph leaves the previous object with no row at all and the
-- host has to remain able to sweep it.
--
-- `split_part` rather than `storage.foldername`, which does the same job: this
-- function has to be creatable on a bare Postgres, where there is no storage
-- schema and a SQL body naming one fails at CREATE. Every path this bucket
-- holds is `<round_id>/<uuid>.jpg`, enforced by record_photo, so the first
-- segment is the round or the path is not one of ours.
create or replace function photo_object_deletable(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1 from dinner_photos p
      where p.storage_path = p_path
        and (
          p.taken_by_profile_id = auth.uid()
          or (p.round_id is not null and is_round_host(p.round_id, auth.uid()))
        )
    )
    or (
      split_part(p_path, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
      and is_round_host(split_part(p_path, '/', 1)::uuid, auth.uid())
    );
$$;

grant execute on function photo_object_deletable(text) to authenticated;

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'storage schema absent — skipping policy updates (bare Postgres)';
    return;
  end if;

  execute $p$drop policy if exists dinner_photos_read on storage.objects$p$;
  execute $p$
    create policy dinner_photos_read on storage.objects
      for select to authenticated
      using (bucket_id = 'dinner-photos' and photo_object_visible(name))
  $p$;

  -- Writing still asks about the folder, and has to: at upload time there is no
  -- row yet to own. `record_photo` is what refuses a path in somebody else's
  -- dinner, and what refuses an upload from anybody but the chef holding the
  -- camera.
  execute $p$drop policy if exists dinner_photos_write on storage.objects$p$;
  execute $p$
    create policy dinner_photos_write on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'dinner-photos'
        and is_round_member((storage.foldername(name))[1]::uuid, auth.uid())
      )
  $p$;

  execute $p$drop policy if exists dinner_photos_delete on storage.objects$p$;
  execute $p$
    create policy dinner_photos_delete on storage.objects
      for delete to authenticated
      using (bucket_id = 'dinner-photos' and photo_object_deletable(name))
  $p$;
end $$;

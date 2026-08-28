-- Before a dinner can be deleted, the album has to survive it.
--
-- The promise attached to deleting old dinners is "everything worth keeping is
-- already in the recipe book and the album". The recipe book keeps that promise
-- today — 0058 copies the recipe and references only the author, precisely so a
-- deleted dinner cannot empty it. **The album does not.** `dinner_photos` was
-- written while rounds were permanent, and every road out of it leads back
-- through the round:
--
--   * `round_id references rounds on delete cascade` — the row goes with it;
--   * `member_id references round_members on delete cascade` — and round_members
--     goes with the round too, so the row goes twice over;
--   * `my_album()` joins `rounds` for the name and `round_members` for "was I
--     there", so even a surviving row would be invisible;
--   * and the storage read policy asks `is_round_member(...)`, which after the
--     round is gone answers no for everybody — so the bytes would still be in
--     the bucket and nobody, including the person who took the photograph,
--     could ever see them again.
--
-- Deleting a dinner in that state would quietly destroy the thing the deletion
-- was justified by. So this migration does to the album what 0058 did to the
-- book: copy what has to outlive the dinner, reference what must not be frozen.
--
-- WHAT SURVIVES, AND WHAT DOES NOT. After a dinner is gone you keep **your own**
-- photograph, with the dinner's name and date printed on it. You do not keep
-- everybody else's. That asymmetry is deliberate and it is the same one the
-- book already has: a recipe is in your book because you chose to copy it, and
-- other people's photographs were never copied anywhere — they were shown to
-- you because you were at that table, and the table is what is being deleted.

-- ---------------------------------------------------------------------------
-- 1. The copies.
-- ---------------------------------------------------------------------------

alter table dinner_photos
  add column if not exists round_name text not null default '',
  add column if not exists dinner_at timestamptz,
  -- The person, not the seat. `member_id` dies with the round; this is what
  -- says whose photograph it is once there is no round left to ask.
  add column if not exists taken_by_profile_id uuid references profiles (id) on delete cascade,
  -- The pseudonym they wore that evening, copied for the same reason 0058
  -- copies it: it is a label on a card, not an identity, and it means nothing
  -- outside the dinner it came from.
  add column if not exists taken_by_name text;

update dinner_photos p
set round_name = coalesce(r.name, ''),
    dinner_at = r.dinner_at,
    taken_by_profile_id = m.profile_id,
    taken_by_name = m.secret_name
from rounds r, round_members m
where r.id = p.round_id and m.id = p.member_id
  and p.taken_by_profile_id is null;

-- ---------------------------------------------------------------------------
-- 2. The foreign keys stop being fatal.
--
-- SET NULL rather than CASCADE on both: the row is the album's, and the album
-- is not part of the dinner. `taken_by_profile_id` keeps its cascade on
-- purpose — a photograph with no owner is unreachable by anyone and would be
-- data kept for nobody, which erasure (0049) exists to prevent.
-- ---------------------------------------------------------------------------

alter table dinner_photos drop constraint if exists dinner_photos_round_id_fkey;
alter table dinner_photos add constraint dinner_photos_round_id_fkey
  foreign key (round_id) references rounds (id) on delete set null;
alter table dinner_photos alter column round_id drop not null;

alter table dinner_photos drop constraint if exists dinner_photos_member_id_fkey;
alter table dinner_photos add constraint dinner_photos_member_id_fkey
  foreign key (member_id) references round_members (id) on delete set null;
alter table dinner_photos alter column member_id drop not null;

-- One photograph per person per dinner still holds while the dinner exists, and
-- stops constraining anything once round_id is null (NULLs are distinct), which
-- is the correct behaviour: there is no dinner left to be one-per.
create index if not exists dinner_photos_owner_idx on dinner_photos (taken_by_profile_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. record_photo fills the copies in.
-- ---------------------------------------------------------------------------

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

  if p_path is null or p_path not like p_round_id::text || '/%' then
    raise exception 'PHOTO_PATH_MISMATCH';
  end if;

  insert into dinner_photos (
    round_id, member_id, storage_path, caption,
    round_name, dinner_at, taken_by_profile_id, taken_by_name
  )
  values (
    p_round_id, v_member.id, p_path, nullif(btrim(coalesce(p_caption, '')), ''),
    v_round.name, v_round.dinner_at, v_uid, v_member.secret_name
  )
  on conflict (round_id, member_id) do update
    set storage_path = excluded.storage_path,
        caption = excluded.caption,
        round_name = excluded.round_name,
        dinner_at = excluded.dinner_at,
        hidden_at = null,
        reported = false,
        created_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function record_photo(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. my_album reads the copies, and answers after the dinner is gone.
--
-- Two ways a row reaches you, and the second is the one that survives:
--   * you were at that dinner and it still exists — you see everybody's;
--   * or it is yours — you see it forever, wherever the dinner went.
-- ---------------------------------------------------------------------------

drop function if exists my_album();

create function my_album()
returns table (
  id uuid,
  round_id uuid,
  round_name text,
  dinner_at timestamptz,
  storage_path text,
  caption text,
  is_mine boolean,
  -- False once the dinner has been deleted. The album still shows the
  -- photograph and its evening's name; there is simply nowhere to go back to.
  dinner_exists boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.id,
    p.round_id,
    -- The copy, falling back to the live row only for photographs taken before
    -- this migration on a dinner that still exists.
    coalesce(nullif(p.round_name, ''), r.name, ''),
    coalesce(p.dinner_at, r.dinner_at),
    p.storage_path,
    p.caption,
    p.taken_by_profile_id = auth.uid(),
    p.round_id is not null,
    p.created_at
  from dinner_photos p
  left join rounds r on r.id = p.round_id
  where p.hidden_at is null
    and (
      p.taken_by_profile_id = auth.uid()
      or (p.round_id is not null and is_round_member(p.round_id, auth.uid()))
    )
    and not exists (
      select 1 from blocked_users b
      where b.profile_id = auth.uid() and b.blocked_profile_id = p.taken_by_profile_id
    )
  order by coalesce(p.dinner_at, p.created_at) desc, p.created_at;
$$;

grant execute on function my_album() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. list_round_photos leans on the copied owner too.
--
-- It still needs the round — it is one dinner's album, and a deleted dinner has
-- no page — but "is this mine" and "have I blocked them" now come from the
-- copied profile rather than from a seat that will not always be there.
-- ---------------------------------------------------------------------------

create or replace function list_round_photos(p_round_id uuid)
returns table (
  id uuid,
  storage_path text,
  caption text,
  taken_by text,
  is_mine boolean,
  reported boolean,
  hidden boolean,
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
      coalesce(p.taken_by_name, m.secret_name),
      p.taken_by_profile_id = v_uid,
      p.reported,
      p.hidden_at is not null,
      p.created_at
    from dinner_photos p
    left join round_members m on m.id = p.member_id
    where p.round_id = p_round_id
      and (p.hidden_at is null or p.taken_by_profile_id = v_uid)
      and not exists (
        select 1 from blocked_users b
        where b.profile_id = v_uid and b.blocked_profile_id = p.taken_by_profile_id
      )
    order by p.created_at;
end;
$$;

grant execute on function list_round_photos(uuid) to authenticated;

-- hide_photo loses its dependence on the seat for the same reason.
create or replace function hide_photo(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round_id uuid;
  v_owner uuid;
begin
  select p.round_id, p.taken_by_profile_id into v_round_id, v_owner
  from dinner_photos p where p.id = p_id;
  if not found then raise exception 'photo not found'; end if;

  -- The host of the dinner it belonged to, while there is one; or the person
  -- who put it there, always — taking your own photograph back should not stop
  -- working because the evening was deleted.
  if not (v_owner = v_uid or (v_round_id is not null and is_round_host(v_round_id, v_uid))) then
    raise exception 'only the host or the person who added it can remove it';
  end if;

  update dinner_photos set hidden_at = now() where id = p_id;

  if v_round_id is not null then
    insert into audit_log (round_id, actor_id, action, payload)
    values (v_round_id, v_uid, 'PHOTO_REMOVED', jsonb_build_object('photo_id', p_id));
  end if;
end;
$$;

grant execute on function hide_photo(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The storage policies stop asking a question the round can no longer answer.
--
-- `is_round_member` is the right rule while the dinner exists and is a dead end
-- once it does not. Owning the row is the rule that survives, so both are here:
-- read it if you were at that table, or if it is yours.
-- ---------------------------------------------------------------------------

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
      using (
        bucket_id = 'dinner-photos'
        and (
          exists (
            select 1 from dinner_photos p
            where p.storage_path = storage.objects.name
              and p.taken_by_profile_id = auth.uid()
          )
          or exists (
            select 1 from dinner_photos p
            where p.storage_path = storage.objects.name
              and p.round_id is not null
              and is_round_member(p.round_id, auth.uid())
          )
        )
      )
  $p$;

  -- Writing still asks about the folder, and has to: at upload time there is no
  -- row yet to own.
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
      using (
        bucket_id = 'dinner-photos'
        and exists (
          select 1 from dinner_photos p
          where p.storage_path = storage.objects.name
            and (
              p.taken_by_profile_id = auth.uid()
              or (p.round_id is not null and is_round_host(p.round_id, auth.uid()))
            )
        )
      )
  $p$;
end $$;

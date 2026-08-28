-- The album (ROADMAP §7, step 4): one photograph of the table, per person, per
-- dinner, becoming a record of every evening.
--
-- It comes last of the four on purpose, and it is the one that changes the
-- arithmetic: **text is free, photographs are not.** Three things it drags in,
-- none of them optional, and two of them are why step 3 had to exist first.
--
--   1. STORAGE, NOT THE DATABASE. A Supabase bucket with its own policies. The
--      free tier is 1 GB; at ~200 KB a photo that is a few thousand dinners.
--      The bucket is private — reading goes through a signed URL, so a
--      photograph of somebody's flat is not a public URL that outlives the
--      dinner and gets indexed.
--   2. EXIF. A phone photograph carries GPS coordinates. Uploading one
--      unstripped publishes the address of somebody's flat to everybody at the
--      table. That is stripped in the browser before the bytes leave it
--      (src/lib/photo.ts) — the only place it *can* be done, because by the
--      time the file is here it has already travelled.
--   3. IT IS USER-GENERATED CONTENT. Report and remove have to exist for a
--      photograph exactly as they do for a phrase, which is why step 3 (0059)
--      came first: this hangs off the same alert pipeline rather than growing
--      a second one.
--
-- ONE PER PERSON PER DINNER, and that is a decision rather than a limit. "A
-- photo of the table at the end" could have been one photo per dinner, which
-- immediately asks who gets to be the photographer. One each says everybody may
-- add theirs, bounds what a dinner can cost to a number that is known in
-- advance (the seats), and makes the upload control a switch rather than a
-- feed.
--
-- AND IT IS NOT FROZEN WITH THE DINNER. 0054 refuses every write to a round's
-- own tables once it is archived, which is right for the game and wrong for
-- this: the photograph is taken at the *end*, and the album is looked at
-- afterwards. `dinner_photos` is deliberately absent from that trigger list,
-- for the same reason `saved_recipes` is (0058).

create table if not exists dinner_photos (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds (id) on delete cascade,
  -- The seat, not the profile, so a photograph belongs to somebody's place at
  -- that table — and so it can be reported and acted on the same way a phrase
  -- is (0059), without anybody being named.
  member_id uuid not null references round_members (id) on delete cascade,

  -- Where the bytes are. Always `<round_id>/<something>`, which is what the
  -- storage policies below read to decide who may see it.
  storage_path text not null unique,
  caption text check (caption is null or char_length(caption) <= 140),

  reported boolean not null default false,
  -- Removed by the host. The row stays: a record that something was taken down
  -- is worth more than a gap, and the object itself is deleted separately.
  hidden_at timestamptz,
  created_at timestamptz not null default now(),

  unique (round_id, member_id)
);

create index dinner_photos_round_idx on dinner_photos (round_id, created_at desc);

alter table dinner_photos enable row level security;

-- No policies and no grants. Every read and write goes through the functions
-- below, which is the same posture `briefs` and `push_subscriptions` take and
-- for the same reason: the interesting question is never "which rows" but "who
-- is asking and what are they entitled to see".

-- ---------------------------------------------------------------------------
-- record_photo — called after the bytes are in the bucket.
--
-- The upload happens first, directly from the browser to storage, and then this
-- records it. The other order would need this function to hand out a signed
-- upload URL, which is more moving parts for the same result. What it costs is
-- that a failed call here leaves an object nobody references. The bucket is
-- private and the path is a uuid, so an orphan is unreachable rather than
-- dangerous — it costs storage and nothing else, and a sweep that lists objects
-- with no matching row can collect them whenever that starts to matter.
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
  v_member_id uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  -- Not before the food. A photograph of the table is a photograph of the
  -- evening, and an album that fills up during sign-ups is a different feature
  -- nobody asked for.
  if v_round.status not in ('DINNER', 'VOTING', 'RESULTS', 'ARCHIVED') then
    raise exception 'ALBUM_NOT_OPEN_YET';
  end if;

  select id into v_member_id from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE' and approved;
  if not found then raise exception 'not an active member of this round'; end if;

  -- The path has to be inside this round's folder, because that prefix is the
  -- whole of what the storage policies check. A row claiming a path outside it
  -- would be a row pointing at somebody else's dinner.
  if p_path is null or p_path not like p_round_id::text || '/%' then
    raise exception 'PHOTO_PATH_MISMATCH';
  end if;

  insert into dinner_photos (round_id, member_id, storage_path, caption)
  values (p_round_id, v_member_id, p_path, nullif(btrim(coalesce(p_caption, '')), ''))
  on conflict (round_id, member_id) do update
    set storage_path = excluded.storage_path,
        caption = excluded.caption,
        hidden_at = null,
        reported = false,
        created_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function record_photo(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- list_round_photos — one dinner's album, to the people who were at it.
--
-- Carries the seat's pseudonym rather than a name, like everything else that
-- crosses the table. A hidden photograph is absent for everyone except the
-- person who took it, who is told it was removed rather than left to wonder
-- where it went.
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
  v_member_id uuid;
begin
  if not (is_round_host(p_round_id, v_uid) or is_round_member(p_round_id, v_uid)) then
    raise exception 'not a member of this round';
  end if;

  -- Qualified, and it has to be: this function's OUT parameters include `id`,
  -- and inside a plpgsql body an unqualified `id` resolves to that variable
  -- rather than to the column, which fails as an ambiguous reference.
  select rm.id into v_member_id from round_members rm
  where rm.round_id = p_round_id and rm.profile_id = v_uid;

  return query
    select
      p.id, p.storage_path, p.caption, m.secret_name,
      p.member_id = v_member_id,
      p.reported,
      p.hidden_at is not null,
      p.created_at
    from dinner_photos p
    join round_members m on m.id = p.member_id
    where p.round_id = p_round_id
      and (p.hidden_at is null or p.member_id = v_member_id)
      -- Somebody you have blocked (0059) is not in your album either. A block
      -- that stops their words and keeps their pictures is half a block.
      and not exists (
        select 1 from blocked_users b
        where b.profile_id = v_uid and b.blocked_profile_id = m.profile_id
      )
    order by p.created_at;
end;
$$;

grant execute on function list_round_photos(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- my_album — every evening, in one call, newest first.
--
-- The dinner's name and date travel with each row because that is what an album
-- is indexed by in somebody's head: not "photo 47" but "the one at Marta's in
-- March".
-- ---------------------------------------------------------------------------

create or replace function my_album()
returns table (
  id uuid,
  round_id uuid,
  round_name text,
  dinner_at timestamptz,
  storage_path text,
  caption text,
  is_mine boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.id, r.id, r.name, r.dinner_at, p.storage_path, p.caption,
    m.profile_id = auth.uid(),
    p.created_at
  from dinner_photos p
  join rounds r on r.id = p.round_id
  join round_members m on m.id = p.member_id
  join round_members me on me.round_id = p.round_id and me.profile_id = auth.uid()
  where p.hidden_at is null
    and not exists (
      select 1 from blocked_users b
      where b.profile_id = auth.uid() and b.blocked_profile_id = m.profile_id
    )
  order by coalesce(r.dinner_at, p.created_at) desc, p.created_at;
$$;

grant execute on function my_album() to authenticated;

-- ---------------------------------------------------------------------------
-- report_photo / hide_photo — the same two acts a phrase gets (0059).
--
-- Reporting raises a host alert on the pipeline that already exists, so a
-- photograph and a phrase arrive in the same inbox and are answered with the
-- same controls. Hiding is the host's, and it is the removal the stores require
-- for user-generated content: it is gone for everybody the moment it happens,
-- and the object is deleted separately by whoever put it there or by the host.
-- ---------------------------------------------------------------------------

create or replace function report_photo(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round_id uuid;
begin
  select round_id into v_round_id from dinner_photos where id = p_id;
  if v_round_id is null then raise exception 'photo not found'; end if;

  if not is_round_member(v_round_id, v_uid) then
    raise exception 'not a member of this round';
  end if;

  update dinner_photos set reported = true where id = p_id;

  -- 'OTHER' with a typed payload rather than a new enum value: Postgres will
  -- not let a value added by ALTER TYPE be used in the same migration, and this
  -- is the shape the join requests already use.
  insert into host_alerts (round_id, kind, payload)
  values (v_round_id, 'OTHER', jsonb_build_object('type', 'REPORTED_PHOTO', 'photo_id', p_id));
end;
$$;

grant execute on function report_photo(uuid) to authenticated;

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
  select p.round_id, m.profile_id into v_round_id, v_owner
  from dinner_photos p join round_members m on m.id = p.member_id
  where p.id = p_id;
  if v_round_id is null then raise exception 'photo not found'; end if;

  -- The host, because it is their dinner and the stores require somebody able
  -- to take content down; or the person who put it there, because taking your
  -- own photograph back should not need asking.
  if not (is_round_host(v_round_id, v_uid) or v_owner = v_uid) then
    raise exception 'only the host or the person who added it can remove it';
  end if;

  update dinner_photos set hidden_at = now() where id = p_id;

  insert into audit_log (round_id, actor_id, action, payload)
  values (v_round_id, v_uid, 'PHOTO_REMOVED', jsonb_build_object('photo_id', p_id));
end;
$$;

grant execute on function hide_photo(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The bucket and its policies.
--
-- Guarded, because the `storage` schema belongs to Supabase and is not present
-- in a bare Postgres — which is exactly where the smoke tests run. Without the
-- guard this file would be untestable outside a full local stack, and an
-- untested migration is how a policy ships inverted.
--
-- PRIVATE, not public. A public bucket hands out a URL that works forever, for
-- anyone who has ever seen it, long after the dinner and the app are done with
-- it. Reading goes through a short-lived signed URL instead.
--
-- The first path segment is the round id, and every policy below is that one
-- fact: you may write into the folder of a dinner you are seated at, and read
-- from the folder of a dinner you were at.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'storage schema absent — skipping bucket and policies (bare Postgres)';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'dinner-photos', 'dinner-photos', false,
    -- Two megabytes is generous for something the browser has already
    -- downscaled to 1600px; it is here to stop an untouched 12 MP original
    -- rather than to squeeze the ones that went through the app.
    2 * 1024 * 1024,
    array['image/jpeg', 'image/webp']
  )
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  execute $p$drop policy if exists dinner_photos_read on storage.objects$p$;
  execute $p$
    create policy dinner_photos_read on storage.objects
      for select to authenticated
      using (
        bucket_id = 'dinner-photos'
        and is_round_member((storage.foldername(name))[1]::uuid, auth.uid())
      )
  $p$;

  execute $p$drop policy if exists dinner_photos_write on storage.objects$p$;
  execute $p$
    create policy dinner_photos_write on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'dinner-photos'
        and is_round_member((storage.foldername(name))[1]::uuid, auth.uid())
      )
  $p$;

  -- Deleting is the person who put it there, or the host taking it down. The
  -- row is hidden by `hide_photo` either way; this is what removes the bytes.
  execute $p$drop policy if exists dinner_photos_delete on storage.objects$p$;
  execute $p$
    create policy dinner_photos_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'dinner-photos'
        and (
          is_round_host((storage.foldername(name))[1]::uuid, auth.uid())
          or exists (
            select 1 from dinner_photos p
            join round_members m on m.id = p.member_id
            where p.storage_path = storage.objects.name and m.profile_id = auth.uid()
          )
        )
      )
  $p$;
end $$;

-- Signup, round creation, joining, approval, and host transfer.
-- Every function here validates auth.uid() itself rather than trusting a
-- caller-supplied profile/member id, except where explicitly noted.

-- ---------------------------------------------------------------------------
-- complete_signup — the ONLY way a profiles row is created. Enforces the
-- "≥1 dietary_entries row OR has_no_restrictions" invariant that a table
-- CHECK constraint can't express across two tables.
-- ---------------------------------------------------------------------------

create or replace function complete_signup(
  p_display_name text,
  p_locale text,
  p_has_no_restrictions boolean,
  p_dietary_entries jsonb -- [{kind, label, note}], ignored if p_has_no_restrictions
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_entry jsonb;
  v_count int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if exists (select 1 from profiles where id = v_uid) then
    raise exception 'profile already exists';
  end if;

  v_count := coalesce(jsonb_array_length(p_dietary_entries), 0);
  if not p_has_no_restrictions and v_count = 0 then
    raise exception 'declare at least one dietary entry or set has_no_restrictions';
  end if;

  insert into profiles (id, display_name, locale, has_no_restrictions)
  values (v_uid, p_display_name, coalesce(p_locale, 'fr'), p_has_no_restrictions);

  if not p_has_no_restrictions then
    for v_entry in select * from jsonb_array_elements(p_dietary_entries)
    loop
      insert into dietary_entries (profile_id, kind, label, note)
      values (v_uid, (v_entry->>'kind')::dietary_kind, v_entry->>'label', v_entry->>'note');
    end loop;
  end if;

  insert into audit_log (actor_id, action, payload)
  values (v_uid, 'SIGNUP_COMPLETED', jsonb_build_object('has_no_restrictions', p_has_no_restrictions));
end;
$$;

grant execute on function complete_signup(text, text, boolean, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- helpers: join codes (no O/0/I/1), accent palette, secret names
-- ---------------------------------------------------------------------------

create or replace function generate_unambiguous_code(p_length int default 8)
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_result text := '';
  i int;
begin
  for i in 1..p_length loop
    v_result := v_result || substr(v_alphabet, (floor(random() * length(v_alphabet)) + 1)::int, 1);
  end loop;
  return v_result;
end;
$$;

create or replace function pick_round_accent(out color text, out emoji text)
language sql
volatile
set search_path = public, pg_temp
as $$
  with palette(color, emoji) as (
    values
      ('#E4572E', '🍅'), ('#29335C', '🍆'), ('#F3A712', '🌽'),
      ('#7B9E3F', '🥦'), ('#C81D6B', '🍓'), ('#1B998B', '🥑'),
      ('#8E44AD', '🍇'), ('#2E86AB', '🫐'), ('#D6A34A', '🧄'),
      ('#B33A3A', '🌶️'), ('#3E7C59', '🍏'), ('#A65398', '🍠')
  )
  select color, emoji from palette order by random() limit 1;
$$;

create or replace function assign_secret_name(p_round_id uuid, p_locale text default 'fr')
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_word text;
  v_attempt int := 0;
  v_prefix text := case when p_locale = 'en' then 'Chef' else 'Chef' end;
begin
  loop
    v_attempt := v_attempt + 1;

    select word into v_word from secret_name_words
    where locale = p_locale order by random() limit 1;

    if v_word is null then
      select word into v_word from secret_name_words order by random() limit 1;
    end if;

    if v_word is null then
      v_word := substr(md5(random()::text), 1, 6);
    end if;

    v_name := v_prefix || ' ' || v_word;

    exit when v_attempt > 50 or not exists (
      select 1 from round_members where round_id = p_round_id and secret_name = v_name
    );
  end loop;

  if exists (select 1 from round_members where round_id = p_round_id and secret_name = v_name) then
    v_name := v_name || ' ' || substr(md5(random()::text), 1, 3);
  end if;

  return v_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_round
-- ---------------------------------------------------------------------------

create or replace function create_round(
  p_name text,
  p_visibility round_visibility,
  p_anonymity round_anonymity,
  p_slot_mode slot_mode default 'FREE',
  p_max_players int default null,
  p_dinner_at timestamptz default null,
  p_timezone text default 'Europe/Paris',
  p_location text default null,
  p_allow_mutual_pairs boolean default false,
  p_requires_approval boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round_id uuid;
  v_code text;
  v_accent record;
  v_locale text;
  v_secret_name text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select locale into v_locale from profiles where id = v_uid;
  if not found then
    raise exception 'complete signup before creating a round';
  end if;

  select * into v_accent from pick_round_accent();

  loop
    v_code := generate_unambiguous_code(8);
    exit when not exists (select 1 from rounds where join_code = v_code);
  end loop;

  insert into rounds (
    name, host_id, visibility, anonymity, slot_mode, max_players,
    dinner_at, timezone, location, allow_mutual_pairs, requires_approval,
    join_code, accent_color, accent_emoji
  ) values (
    p_name, v_uid, p_visibility, p_anonymity, p_slot_mode, p_max_players,
    p_dinner_at, coalesce(p_timezone, 'Europe/Paris'), p_location,
    p_allow_mutual_pairs, p_requires_approval,
    v_code, v_accent.color, v_accent.emoji
  )
  returning id into v_round_id;

  select assign_secret_name(v_round_id, coalesce(v_locale, 'fr')) into v_secret_name;

  insert into round_members (round_id, profile_id, secret_name, role, approved)
  values (v_round_id, v_uid, v_secret_name, 'HOST', true);

  insert into audit_log (round_id, actor_id, action, payload)
  values (v_round_id, v_uid, 'ROUND_CREATED', jsonb_build_object('name', p_name));

  return v_round_id;
end;
$$;

grant execute on function create_round(
  text, round_visibility, round_anonymity, slot_mode, int,
  timestamptz, text, text, boolean, boolean
) to authenticated;

-- ---------------------------------------------------------------------------
-- join_round — only while OPEN; a round in DRAFT hasn't been shared yet.
-- ---------------------------------------------------------------------------

create or replace function join_round(p_code text, p_turnstile_ticket uuid)
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
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not exists (select 1 from profiles where id = v_uid) then
    raise exception 'complete signup before joining a round';
  end if;

  if not consume_turnstile_ticket(p_turnstile_ticket, 'JOIN_ROUND', p_code) then
    raise exception 'turnstile verification failed or expired';
  end if;

  select * into v_round from rounds where join_code = p_code for update;

  if not found then
    raise exception 'invalid code';
  end if;

  if v_round.status <> 'OPEN' then
    raise exception 'round is not open for joining';
  end if;

  if exists (select 1 from round_members where round_id = v_round.id and profile_id = v_uid) then
    raise exception 'already a member of this round';
  end if;

  if v_round.max_players is not null then
    select count(*) into v_seat_count from round_members
    where round_id = v_round.id and status = 'ACTIVE' and approved;
    if v_seat_count >= v_round.max_players then
      raise exception 'round is full';
    end if;
  end if;

  select locale into v_locale from profiles where id = v_uid;
  select assign_secret_name(v_round.id, coalesce(v_locale, 'fr')) into v_secret_name;

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

-- ---------------------------------------------------------------------------
-- approve_member / reject_member
-- ---------------------------------------------------------------------------

create or replace function approve_member(p_round_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_updated int;
begin
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the host can approve members';
  end if;

  update round_members
  set approved = true
  where id = p_member_id and round_id = p_round_id and status = 'ACTIVE' and not approved;
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception 'no pending join request for this member';
  end if;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'MEMBER_APPROVED', jsonb_build_object('member_id', p_member_id));
end;
$$;

create or replace function reject_member(p_round_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_updated int;
begin
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the host can reject members';
  end if;

  update round_members
  set status = 'REMOVED', removed_at = now()
  where id = p_member_id and round_id = p_round_id and not approved;
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception 'no pending join request for this member';
  end if;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'MEMBER_REJECTED', jsonb_build_object('member_id', p_member_id));
end;
$$;

grant execute on function approve_member(uuid, uuid) to authenticated;
grant execute on function reject_member(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- leave_round
-- ---------------------------------------------------------------------------

create or replace function leave_round(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_member round_members;
  v_round rounds;
begin
  select * into v_member from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE';

  if not found then
    raise exception 'not an active member of this round';
  end if;

  if v_member.role = 'HOST' then
    raise exception 'transfer_host before leaving';
  end if;

  select * into v_round from rounds where id = p_round_id;

  if v_round.status in ('DRAFT', 'OPEN', 'LOCKED') then
    -- no pairings exist yet: a clean, immediate removal
    update round_members set status = 'LEFT', left_at = now() where id = v_member.id;
  else
    -- an assignment exists; only remove_member (host-driven) may touch the
    -- chain safely. Raise the alert and let the host decide when to act.
    insert into host_alerts (round_id, kind, payload)
    values (p_round_id, 'DROPOUT', jsonb_build_object('member_id', v_member.id));
  end if;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'MEMBER_LEFT_REQUESTED', jsonb_build_object('member_id', v_member.id));
end;
$$;

grant execute on function leave_round(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- transfer_host — atomic; previous host loses rights immediately.
-- ---------------------------------------------------------------------------

create or replace function transfer_host(p_round_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_new_host round_members;
begin
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the current host can transfer';
  end if;

  select * into v_new_host from round_members
  where id = p_member_id and round_id = p_round_id and status = 'ACTIVE' and approved;

  if not found then
    raise exception 'target is not an active, approved member';
  end if;

  update round_members set role = 'PLAYER' where round_id = p_round_id and role = 'HOST';
  update round_members set role = 'HOST' where id = p_member_id;
  update rounds set host_id = v_new_host.profile_id where id = p_round_id;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'HOST_TRANSFERRED', jsonb_build_object('new_host_member_id', p_member_id));
end;
$$;

grant execute on function transfer_host(uuid, uuid) to authenticated;

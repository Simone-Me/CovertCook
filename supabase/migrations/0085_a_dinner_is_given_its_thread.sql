-- A DINNER IS GIVEN ITS THREAD.
--
-- `0083` built the catalogue and the weekly draw; nothing was attached to a
-- dinner. This is the attachment: three columns on the round, one on the
-- pairing, the rule about when it can still be changed, and the one reader the
-- four screens that show a fil rouge all call.
--
-- ---------------------------------------------------------------------------
-- THE VALUE IS COPIED, NEVER REFERENCED
--
-- The shelf rotates every Sunday. A dinner that stored "whatever the draw is
-- offering" would lose its fil rouge mid-week, and a dinner is often set up
-- three weeks before it happens — people would write recipes against a theme
-- that had already been taken off the shelf.
--
-- So `rounds.fil_rouge_code` holds the CODE ITSELF, and once written nothing
-- takes it away. The draw is asked one question, once, at the moment of
-- choosing: may this host pick this, today. After that the dinner owns it.
-- Same reasoning as the recipe book in ROADMAP §5 — the recipe is copied, only
-- the author is a reference.
--
-- ---------------------------------------------------------------------------
-- TWO SHAPES, AND WHY BOTH EXIST
--
-- SHARED — one value for the whole table. Six blue dishes are a spectacle, and
-- the shared constraint is what makes the menu worth photographing.
--
-- PER_COOK — every cook gets a different one, dealt by the roulette. It reads
-- badly on colours (six unrelated colours is just a dinner) and beautifully on
-- countries: six countries on one table is a world tour in an evening, which
-- is a better dinner than six people all cooking Japanese.
--
-- IT DOES NOT LEAK THE CHAIN. Worth stating because it looks like it might. A
-- per-cook value is known to exactly two people: the cook, who has to know
-- what they are cooking, and their sender, who has to know it to write for
-- them. On a shared menu (0086's territory) "blue: tiramisu" tells the cook
-- nothing they did not know and the sender nothing they did not write. To
-- everybody else it is noise, because nobody knows who was given blue.
--
-- THE POOL IS FROZEN TOO. For PER_COOK the host picks a CATEGORY and the
-- roulette deals the values — but the roulette runs at LOCKED, possibly weeks
-- after the choice, by which time the draw has moved. So the values available
-- at the moment of choosing are stamped on the round as `fil_rouge_pool`, and
-- that is what gets dealt. Without it a host would choose "a country each" in
-- one week and get a different continent's worth in another.
--
-- WHEN THE POOL IS SMALLER THAN THE TABLE the values repeat. Refusing would
-- block a dinner for a reason the Executive Chef cannot see and cannot fix.

-- ---------------------------------------------------------------------------
-- 1. The columns.
-- ---------------------------------------------------------------------------

alter table rounds add column if not exists fil_rouge_category text
  references fil_rouge_category (code);
alter table rounds add column if not exists fil_rouge_code text;
alter table rounds add column if not exists fil_rouge_scope text;
alter table rounds add column if not exists fil_rouge_pool text[];

comment on column rounds.fil_rouge_code is
  'The chosen value, copied not referenced: the weekly draw can never take back a fil rouge a dinner already holds. Null when the scope is PER_COOK.';
comment on column rounds.fil_rouge_pool is
  'PER_COOK only: the values the draw was offering when the host chose, frozen so the roulette deals from the same shelf the host was looking at.';

alter table rounds drop constraint if exists rounds_fil_rouge_shape;
alter table rounds add constraint rounds_fil_rouge_shape check (
  -- No fil rouge at all: every column empty. This is the default and stays
  -- the default — a classic dinner is never asked the question.
  (fil_rouge_category is null and fil_rouge_code is null
     and fil_rouge_scope is null and fil_rouge_pool is null)
  or (
    fil_rouge_category is not null
    and fil_rouge_scope in ('SHARED', 'PER_COOK')
    -- One value for the table, or a pool to deal from. Never both, never
    -- neither.
    and (fil_rouge_scope = 'SHARED') = (fil_rouge_code is not null)
    and (fil_rouge_scope = 'PER_COOK') = (fil_rouge_pool is not null)
  )
);

alter table pairings add column if not exists fil_rouge_code text;

comment on column pairings.fil_rouge_code is
  'PER_COOK only: the value this cook was dealt. Written by generate_assignment, read by the cook and by their sender, and by nobody else.';

-- ---------------------------------------------------------------------------
-- 2. May this host choose this, today.
--
-- Asked at the moment of choosing and never again. `list_fil_rouge` answers
-- the same question for a whole shelf; this is the scalar the writers use, so
-- the rule lives in one place and a picker cannot be talked past by a crafted
-- request.
-- ---------------------------------------------------------------------------

create or replace function fil_rouge_available(p_category text, p_code text, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select l.offered from list_fil_rouge() l
    where l.category = p_category and l.code = p_code
  ), false);
$$;

revoke all on function fil_rouge_available(text, text, uuid) from public;
grant execute on function fil_rouge_available(text, text, uuid) to authenticated;

-- What this fil rouge would put on the table that somebody at it has said
-- they cannot eat.
--
-- IT INFORMS, IT DOES NOT REFUSE — the rule `0069` restored for briefs, and
-- for the same reason: the Executive Chef is the one person who can still
-- change the theme, so tell them while they are choosing rather than refusing
-- afterwards. A fil rouge of "cheese" on a table with a vegan is not an error,
-- it is a decision, and it should be a knowing one.
create or replace function fil_rouge_clash(p_round_id uuid, p_category text, p_codes text[])
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct de.label), '{}')
  from fil_rouge_catalogue c
  join round_members m on m.round_id = p_round_id and m.status = 'ACTIVE' and m.approved
  join dietary_entries de on de.profile_id = m.profile_id
  where c.category = p_category
    and c.code = any(p_codes)
    and de.kind in ('ALLERGY_SEVERE', 'DIET')
    and de.label = any(c.contains_tags);
$$;

grant execute on function fil_rouge_clash(uuid, text, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Setting it, and the moment it stops being settable.
--
-- Frozen once the roulette has dealt, not once the dinner starts. People write
-- against the fil rouge, so it has to be fixed before the first person can
-- read it — and the first person can read it the moment pairings exist.
-- ---------------------------------------------------------------------------

create or replace function set_fil_rouge(
  p_round_id uuid,
  p_category text default null,
  p_code text default null,
  p_scope text default 'SHARED'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_pool text[];
begin
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the host can set the fil rouge';
  end if;

  select * into v_round from rounds where id = p_round_id for update;
  if not found then raise exception 'round not found'; end if;

  if v_round.status not in ('DRAFT', 'OPEN', 'LOCKED') then
    raise exception 'FIL_ROUGE_FROZEN';
  end if;

  if exists (
    select 1 from pairings p
    where p.round_id = p_round_id and p.assignment_version = v_round.assignment_version
  ) then
    raise exception 'FIL_ROUGE_FROZEN';
  end if;

  -- Clearing it. Allowed for as long as setting it is.
  if p_category is null then
    update rounds set fil_rouge_category = null, fil_rouge_code = null,
                      fil_rouge_scope = null, fil_rouge_pool = null
    where id = p_round_id;
    insert into audit_log (round_id, actor_id, action, payload)
    values (p_round_id, v_uid, 'FIL_ROUGE_SET', jsonb_build_object('cleared', true));
    return;
  end if;

  if p_scope not in ('SHARED', 'PER_COOK') then
    raise exception 'FIL_ROUGE_SCOPE';
  end if;

  if p_scope = 'SHARED' then
    if p_code is null then raise exception 'FIL_ROUGE_CODE_REQUIRED'; end if;
    if not fil_rouge_available(p_category, p_code, v_uid) then
      raise exception 'FIL_ROUGE_LOCKED';
    end if;
    update rounds set fil_rouge_category = p_category, fil_rouge_code = p_code,
                      fil_rouge_scope = 'SHARED', fil_rouge_pool = null
    where id = p_round_id;
  else
    -- The shelf as it stands right now, kept. See the header: the roulette
    -- runs later and must deal from what the host was shown.
    select coalesce(array_agg(l.code), '{}') into v_pool
    from list_fil_rouge() l
    where l.category = p_category and l.offered;

    if coalesce(array_length(v_pool, 1), 0) = 0 then
      raise exception 'FIL_ROUGE_LOCKED';
    end if;

    update rounds set fil_rouge_category = p_category, fil_rouge_code = null,
                      fil_rouge_scope = 'PER_COOK', fil_rouge_pool = v_pool
    where id = p_round_id;
  end if;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'FIL_ROUGE_SET', jsonb_build_object(
    'category', p_category, 'code', p_code, 'scope', p_scope,
    'pool_size', coalesce(array_length(v_pool, 1), 0)));
end;
$$;

grant execute on function set_fil_rouge(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Choosing it while creating the dinner.
--
-- Dropped and recreated rather than overloaded: an overload whose extra
-- arguments all have defaults is ambiguous to PostgREST, which resolves an RPC
-- by the names it was given.
-- ---------------------------------------------------------------------------

drop function if exists create_round(
  text, round_access, round_anonymity, slot_mode, int,
  timestamptz, text, text, boolean, boolean, voting_mode, text, text, int
);

create or replace function create_round(
  p_name text,
  p_access round_access,
  p_anonymity round_anonymity,
  p_slot_mode slot_mode default 'FREE',
  p_max_players int default null,
  p_dinner_at timestamptz default null,
  p_timezone text default 'Europe/Paris',
  p_location text default null,
  p_allow_mutual_pairs boolean default false,
  p_requires_approval boolean default true,
  p_voting_mode voting_mode default 'LIVE',
  p_name_theme text default 'FOOD',
  p_table_theme text default 'CHECKS',
  p_recipes_per_brief int default 1,
  p_fil_rouge_category text default null,
  p_fil_rouge_code text default null,
  p_fil_rouge_scope text default 'SHARED'
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
  v_pro boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  v_pro := is_pro(v_uid);

  if not theme_available('NAME_THEME', p_name_theme, v_uid) then
    raise exception 'THEME_LOCKED';
  end if;

  if not theme_available('TABLE_THEME', p_table_theme, v_uid) then
    raise exception 'THEME_LOCKED';
  end if;

  if p_recipes_per_brief is null or p_recipes_per_brief not between 1 and 3 then
    raise exception 'RECIPES_PER_BRIEF_RANGE';
  end if;
  if p_recipes_per_brief > 1 and not v_pro then
    raise exception 'PRO_REQUIRED';
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
    name, host_id, access, anonymity, slot_mode, max_players,
    dinner_at, timezone, location, allow_mutual_pairs, requires_approval,
    voting_mode, name_theme, table_theme, recipes_per_brief, is_pro, pro_until,
    join_code, accent_color, accent_emoji
  ) values (
    p_name, v_uid, p_access, p_anonymity, p_slot_mode, p_max_players,
    p_dinner_at, coalesce(p_timezone, 'Europe/Paris'), p_location,
    p_allow_mutual_pairs, p_requires_approval, p_voting_mode, p_name_theme,
    p_table_theme, p_recipes_per_brief, v_pro,
    case when v_pro then pro_cover_until(v_uid) end,
    v_code, v_accent.color, v_accent.emoji
  )
  returning id into v_round_id;

  select assign_secret_name(v_round_id, coalesce(v_locale, 'fr')) into v_secret_name;

  insert into round_members (round_id, profile_id, secret_name, role, approved)
  values (v_round_id, v_uid, v_secret_name, 'HOST', true);

  -- After the membership row, because set_fil_rouge asks whether the caller
  -- hosts this round and is_round_host reads that row.
  if p_fil_rouge_category is not null then
    perform set_fil_rouge(v_round_id, p_fil_rouge_category, p_fil_rouge_code,
                          coalesce(p_fil_rouge_scope, 'SHARED'));
  end if;

  insert into audit_log (round_id, actor_id, action, payload)
  values (v_round_id, v_uid, 'ROUND_CREATED',
          jsonb_build_object('name', p_name, 'name_theme', p_name_theme,
                             'table_theme', p_table_theme,
                             'recipes_per_brief', p_recipes_per_brief,
                             'fil_rouge_category', p_fil_rouge_category,
                             'is_pro', v_pro));

  return v_round_id;
end;
$$;

grant execute on function create_round(
  text, round_access, round_anonymity, slot_mode, int,
  timestamptz, text, text, boolean, boolean, voting_mode, text, text, int,
  text, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The roulette deals the thread too.
--
-- Identical to 0005 in every respect but the last loop: the pairing now
-- carries a value when the dinner asked for one each. Dealt from the frozen
-- pool, shuffled, and repeating only once the pool is smaller than the table.
-- ---------------------------------------------------------------------------

create or replace function generate_assignment(p_round_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_members uuid[];
  v_slot_ids uuid[];
  v_threads text[];
  v_pool_n int;
  v_n int;
  v_slot_count int;
  v_attempt int := 0;
  v_ok boolean;
  v_new_version int;
  i int;
  j int;
  tmp uuid;
  tmps text;
begin
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the host can generate an assignment';
  end if;

  select * into v_round from rounds where id = p_round_id for update;

  if v_round.status <> 'LOCKED' then
    raise exception 'round must be LOCKED to generate or re-roll an assignment';
  end if;

  if exists (
    select 1 from briefs b join pairings p on p.id = b.pairing_id where p.round_id = p_round_id
  ) then
    raise exception 'cannot re-roll: briefs already exist for this round';
  end if;

  delete from pairings where round_id = p_round_id;

  select array_agg(id) into v_members from round_members
  where round_id = p_round_id and status = 'ACTIVE' and approved;

  v_n := coalesce(array_length(v_members, 1), 0);
  if v_n < 3 then
    raise exception 'need at least 3 active, approved players';
  end if;

  if v_round.slot_mode = 'FREE' then
    delete from slots where round_id = p_round_id;
    insert into slots (round_id, course)
    select p_round_id, 'OTHER' from generate_series(1, v_n);
  end if;

  select array_agg(id) into v_slot_ids from slots where round_id = p_round_id;
  v_slot_count := coalesce(array_length(v_slot_ids, 1), 0);

  if v_slot_count <> v_n then
    raise exception 'slot count (%) must equal active player count (%) before assigning', v_slot_count, v_n;
  end if;

  if v_n = 2 and not v_round.allow_mutual_pairs then
    raise exception 'two players can only be assigned when mutual pairs are allowed';
  end if;

  v_new_version := v_round.assignment_version + 1;

  <<retry>>
  loop
    v_attempt := v_attempt + 1;
    if v_attempt > 1000 then
      raise exception 'could not find an assignment honouring every exclusion after 1000 attempts';
    end if;

    for i in reverse v_n..2 loop
      j := 1 + floor(random() * i)::int;
      tmp := v_members[i]; v_members[i] := v_members[j]; v_members[j] := tmp;
    end loop;

    v_ok := true;
    for i in 1..v_n loop
      if exists (
        select 1 from exclusion_pairs ep
        where ep.round_id = p_round_id
          and ((ep.member_a = v_members[i] and ep.member_b = v_members[(i % v_n) + 1])
            or (ep.member_a = v_members[(i % v_n) + 1] and ep.member_b = v_members[i]))
      ) then
        v_ok := false;
        exit;
      end if;
    end loop;

    exit retry when v_ok;
  end loop;

  for i in reverse v_slot_count..2 loop
    j := 1 + floor(random() * i)::int;
    tmp := v_slot_ids[i]; v_slot_ids[i] := v_slot_ids[j]; v_slot_ids[j] := tmp;
  end loop;

  -- One thread per cook, when the dinner asked for that. The pool is walked
  -- rather than sampled, so with enough values nobody shares one; with fewer
  -- values than cooks it wraps, which is the decision recorded in the header.
  if v_round.fil_rouge_scope = 'PER_COOK' then
    v_threads := v_round.fil_rouge_pool;
    v_pool_n := coalesce(array_length(v_threads, 1), 0);
    if v_pool_n > 1 then
      for i in reverse v_pool_n..2 loop
        j := 1 + floor(random() * i)::int;
        tmps := v_threads[i]; v_threads[i] := v_threads[j]; v_threads[j] := tmps;
      end loop;
    end if;
  end if;

  for i in 1..v_n loop
    insert into pairings (round_id, sender_id, cook_id, slot_id, assignment_version, lap, fil_rouge_code)
    values (p_round_id, v_members[i], v_members[(i % v_n) + 1], v_slot_ids[i], v_new_version, 0,
            case when v_pool_n > 0 then v_threads[((i - 1) % v_pool_n) + 1] end);
  end loop;

  update rounds set assignment_version = v_new_version where id = p_round_id;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'ASSIGNMENT_GENERATED',
          jsonb_build_object('version', v_new_version, 'attempts', v_attempt,
                             'threads', coalesce(v_pool_n, 0)));

  return v_new_version;
end;
$$;

grant execute on function generate_assignment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The one reader.
--
-- Four screens show a fil rouge and they want three different things: the
-- table's own (everywhere), the one I must cook (the cook view), and the one
-- the person I am writing for must cook (the brief editor). One call answers
-- all three, so no screen has to work out which question it is asking.
--
-- `my_code` and `my_cook_code` are null on a SHARED dinner, where `code` is
-- the answer to everything, and on a dinner with no fil rouge at all.
-- ---------------------------------------------------------------------------

create or replace function get_fil_rouge(p_round_id uuid)
returns table (
  category text,
  scope text,
  code text,
  my_code text,
  my_cook_code text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_member_id uuid;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  if not (is_round_host(p_round_id, v_uid) or is_round_member(p_round_id, v_uid)) then
    raise exception 'not a member of this round';
  end if;

  select id into v_member_id from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE';

  return query
  select
    v_round.fil_rouge_category,
    v_round.fil_rouge_scope,
    v_round.fil_rouge_code,
    (select p.fil_rouge_code from pairings p
      where p.round_id = p_round_id
        and p.assignment_version = v_round.assignment_version
        and p.cook_id = v_member_id),
    (select p.fil_rouge_code from pairings p
      where p.round_id = p_round_id
        and p.assignment_version = v_round.assignment_version
        and p.sender_id = v_member_id);
end;
$$;

grant execute on function get_fil_rouge(uuid) to authenticated;

comment on function get_fil_rouge(uuid) is
  'The dinner''s thread, and mine, and my cook''s. Reads pairings, which have no player-facing SELECT policy — which is why it is a function and not a view.';

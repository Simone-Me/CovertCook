-- Two or three recipes per cook, and the cook picks.
--
-- THE PROBLEM WITH ONE. A sender writes the dish they would love to eat, and
-- the cook opens it to find something they cannot make on a Tuesday, or cannot
-- afford this week, or have no oven for. The chain has no give in it: the
-- recipe is the recipe. The way out was always meant to be the private thread
-- ("could we swap the veal?"), and that works when the problem is one
-- ingredient and not when the problem is the whole dish.
--
-- So a sender may offer up to three, and the cook chooses the one that suits
-- them. The sender still writes for a person rather than for a menu — three
-- ideas for the same cook, not three dishes for the table — and the choosing
-- is a small kindness that costs the sender nothing.
--
-- WHAT IS PRO ABOUT IT. Writing more is more work for the sender and more
-- generosity toward the cook; it is not an advantage over anybody. That is the
-- line README draws for what may ever be sold, and it is why the *number* is
-- the paid part while the game is untouched: a free dinner is a whole dinner.
-- And because 0075 stamps PRO on the dinner rather than the player, a guest at
-- a PRO host's table writes three without owning anything.
--
-- 0076 added the third status. This is everything that uses it.

-- ---------------------------------------------------------------------------
-- 1. How many a dinner asks for.
-- ---------------------------------------------------------------------------

alter table rounds
  add column if not exists recipes_per_brief int not null default 1
    check (recipes_per_brief between 1 and 3);

comment on column rounds.recipes_per_brief is
  'How many recipes each sender may offer their cook (0077). 1 for a free dinner; up to 3 where the Executive Chef was PRO at creation. Fixed: raising it mid-round would ask people who have already finished to write again.';

-- ---------------------------------------------------------------------------
-- 2. Three per pairing instead of one.
--
-- The old constraint is dropped by name — it is the one 0001 created
-- implicitly with `pairing_id uuid not null unique`.
--
-- THE PARTIAL UNIQUE INDEX IS THE LOAD-BEARING LINE. It is what makes
-- "exactly one SUBMITTED per pairing" a fact about the database rather than a
-- promise made by two functions, and it is why the eight untouched readers
-- downstream cannot be shown two dishes for one seat even if choose_brief has
-- a bug in it.
-- ---------------------------------------------------------------------------

alter table briefs
  add column if not exists position int not null default 1 check (position between 1 and 3);

alter table briefs drop constraint if exists briefs_pairing_id_key;

create unique index if not exists briefs_pairing_position_key
  on briefs (pairing_id, position);

create unique index if not exists briefs_one_dish_per_pairing
  on briefs (pairing_id) where status = 'SUBMITTED';

comment on index briefs_one_dish_per_pairing is
  'Exactly one brief per pairing is the dish. Everything downstream that enumerates a round''s dishes filters on SUBMITTED and relies on this.';

-- ---------------------------------------------------------------------------
-- 3. create_round learns the number, and refuses to sell it for nothing.
-- ---------------------------------------------------------------------------

drop function if exists create_round(
  text, round_access, round_anonymity, slot_mode, int,
  timestamptz, text, text, boolean, boolean, voting_mode, text, text
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
  p_recipes_per_brief int default 1
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
    voting_mode, name_theme, table_theme, recipes_per_brief, is_pro,
    join_code, accent_color, accent_emoji
  ) values (
    p_name, v_uid, p_access, p_anonymity, p_slot_mode, p_max_players,
    p_dinner_at, coalesce(p_timezone, 'Europe/Paris'), p_location,
    p_allow_mutual_pairs, p_requires_approval, p_voting_mode, p_name_theme,
    p_table_theme, p_recipes_per_brief, v_pro,
    v_code, v_accent.color, v_accent.emoji
  )
  returning id into v_round_id;

  select assign_secret_name(v_round_id, coalesce(v_locale, 'fr')) into v_secret_name;

  insert into round_members (round_id, profile_id, secret_name, role, approved)
  values (v_round_id, v_uid, v_secret_name, 'HOST', true);

  insert into audit_log (round_id, actor_id, action, payload)
  values (v_round_id, v_uid, 'ROUND_CREATED',
          jsonb_build_object('name', p_name, 'name_theme', p_name_theme,
                             'table_theme', p_table_theme,
                             'recipes_per_brief', p_recipes_per_brief,
                             'is_pro', v_pro));

  return v_round_id;
end;
$$;

grant execute on function create_round(
  text, round_access, round_anonymity, slot_mode, int,
  timestamptz, text, text, boolean, boolean, voting_mode, text, text, int
) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Writing one of them.
--
-- The only change to the shape of this function is `p_position`, and the only
-- change to its behaviour is which row it lands on. Everything a draft was
-- allowed to be, it still is.
-- ---------------------------------------------------------------------------

drop function if exists save_brief_draft(uuid, text, course, jsonb, text, text, int, text, int, text, text[], boolean);

create or replace function save_brief_draft(
  p_round_id uuid,
  p_dish_name text,
  p_course course,
  p_ingredients jsonb, -- [{name, quantity, unit}]
  p_procedure text,
  p_external_url text,
  p_difficulty int,
  p_est_cost text,
  p_prep_minutes int,
  p_note_to_cook text,
  p_contains_tags text[],
  p_contains_tags_confirmed boolean,
  p_position int default 1
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_pairing pairings;
  v_brief_id uuid;
  v_ing jsonb;
  v_name text;
  v_pos int := 0;
  v_link text;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  if v_round.status <> 'ASSIGNED' then
    raise exception 'ROUND_NOT_ACCEPTING';
  end if;
  if v_round.briefs_due_at is not null and now() >= v_round.briefs_due_at then
    raise exception 'DEADLINE_PASSED';
  end if;

  -- Checked against the dinner rather than against the enum: a free dinner
  -- must not gain a second recipe because a hand-made call asked for one.
  if p_position is null or p_position < 1 or p_position > v_round.recipes_per_brief then
    raise exception 'RECIPE_SLOT_UNAVAILABLE';
  end if;

  v_link := nullif(btrim(coalesce(p_external_url, '')), '');
  if v_link is not null and v_link !~ '^https?://' then
    raise exception 'LINK_MALFORMED';
  end if;

  select p.* into v_pairing from pairings p
  join round_members rm on rm.id = p.sender_id
  where p.round_id = p_round_id and p.assignment_version = v_round.assignment_version
    and rm.profile_id = v_uid;
  if not found then raise exception 'you are not a sender in this round''s current assignment'; end if;

  insert into briefs (
    pairing_id, position, dish_name, course, procedure, external_url, difficulty,
    est_cost, prep_minutes, note_to_cook, contains_tags, contains_tags_confirmed, status
  ) values (
    v_pairing.id, p_position, coalesce(p_dish_name, ''), p_course, coalesce(p_procedure, ''), v_link, p_difficulty,
    p_est_cost, p_prep_minutes, p_note_to_cook, coalesce(p_contains_tags, '{}'), coalesce(p_contains_tags_confirmed, false), 'DRAFT'
  )
  on conflict (pairing_id, position) do update set
    dish_name = excluded.dish_name,
    course = excluded.course,
    procedure = excluded.procedure,
    external_url = excluded.external_url,
    difficulty = excluded.difficulty,
    est_cost = excluded.est_cost,
    prep_minutes = excluded.prep_minutes,
    note_to_cook = excluded.note_to_cook,
    contains_tags = excluded.contains_tags,
    contains_tags_confirmed = excluded.contains_tags_confirmed,
    updated_at = now()
  where briefs.status = 'DRAFT'
  returning id into v_brief_id;

  if v_brief_id is null then
    raise exception 'ALREADY_SUBMITTED';
  end if;

  delete from brief_ingredients where brief_id = v_brief_id;
  for v_ing in select * from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb))
  loop
    v_name := btrim(coalesce(v_ing->>'name', ''));
    continue when v_name = '';
    v_pos := v_pos + 1;
    insert into brief_ingredients (brief_id, position, name, quantity, unit)
    values (v_brief_id, v_pos, left(v_name, 80), nullif(v_ing->>'quantity', '')::numeric, nullif(btrim(coalesce(v_ing->>'unit', '')), ''));
  end loop;

  return v_brief_id;
end;
$$;

grant execute on function save_brief_draft(uuid, text, course, jsonb, text, text, int, text, int, text, text[], boolean, int) to authenticated;

-- A second idea, thought better of. Only a draft, and only your own: an offer
-- already in front of the cook is not yours to withdraw.
create or replace function discard_brief_draft(p_round_id uuid, p_position int)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  delete from briefs b
  using pairings p, round_members rm
  where b.pairing_id = p.id
    and rm.id = p.sender_id
    and rm.profile_id = v_uid
    and p.round_id = p_round_id
    and p.assignment_version = v_round.assignment_version
    and b.position = p_position
    and b.status = 'DRAFT';
end;
$$;

grant execute on function discard_brief_draft(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Sending them.
--
-- One press sends everything that has been written, because that is what the
-- sender means by "done": they wrote two ideas, both are ready, and asking
-- them to press send twice is asking them to understand the data model.
--
-- Every non-empty draft is validated by the same rules a single recipe has
-- always had to pass, and the refusals still name a field — but they now name
-- the recipe too, because "the method is too short" is unhelpful when there
-- are three methods on the page.
-- ---------------------------------------------------------------------------

create or replace function submit_brief(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_my_member_id uuid;
  v_pairing_id uuid;
  v_brief briefs;
  v_ingredient_count int;
  v_flagged text[];
  v_link text;
  v_procedure text;
  v_written int := 0;
  v_first boolean := true;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  if v_round.status <> 'ASSIGNED' then
    raise exception 'ROUND_NOT_ACCEPTING';
  end if;
  if v_round.briefs_due_at is not null and now() >= v_round.briefs_due_at then
    raise exception 'DEADLINE_PASSED';
  end if;

  select id into v_my_member_id from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE' and approved;
  if not found then raise exception 'not an active member of this round'; end if;

  select p.id into v_pairing_id from pairings p
  where p.round_id = p_round_id
    and p.assignment_version = v_round.assignment_version
    and p.sender_id = v_my_member_id;
  if not found then raise exception 'NOTHING_WRITTEN'; end if;

  if exists (select 1 from briefs where pairing_id = v_pairing_id and status <> 'DRAFT') then
    raise exception 'ALREADY_SUBMITTED';
  end if;

  -- A blank second slot is not a recipe somebody forgot to finish, it is a
  -- second idea they decided against. Dropped quietly rather than refused.
  delete from briefs b
  where b.pairing_id = v_pairing_id
    and b.status = 'DRAFT'
    and btrim(coalesce(b.dish_name, '')) = ''
    and btrim(coalesce(b.procedure, '')) = ''
    and btrim(coalesce(b.external_url, '')) = ''
    and not exists (select 1 from brief_ingredients bi where bi.brief_id = b.id);

  for v_brief in
    select * from briefs where pairing_id = v_pairing_id and status = 'DRAFT' order by position
  loop
    v_written := v_written + 1;
    v_link := btrim(coalesce(v_brief.external_url, ''));
    v_procedure := btrim(coalesce(v_brief.procedure, ''));

    if btrim(coalesce(v_brief.dish_name, '')) = '' then
      raise exception 'DISH_NAME_MISSING:%', v_brief.position;
    end if;
    if char_length(v_brief.dish_name) < 3 or char_length(v_brief.dish_name) > 80 then
      raise exception 'DISH_NAME_LENGTH:%', v_brief.position;
    end if;
    if v_link <> '' and v_link !~ '^https?://' then
      raise exception 'LINK_MALFORMED:%', v_brief.position;
    end if;

    select count(*) into v_ingredient_count
    from brief_ingredients
    where brief_id = v_brief.id and btrim(coalesce(name, '')) <> '';

    -- A link is a whole recipe on its own: it carries the method and the list.
    if v_link = '' then
      if v_procedure = '' and v_ingredient_count < 1 then
        raise exception 'RECIPE_TOO_EMPTY:%', v_brief.position;
      end if;
      if v_procedure = '' then
        raise exception 'PROCEDURE_MISSING:%', v_brief.position;
      end if;
      if char_length(v_procedure) < 30 then
        raise exception 'PROCEDURE_TOO_SHORT:%', v_brief.position;
      end if;
      if v_ingredient_count < 1 then
        raise exception 'INGREDIENTS_MISSING:%', v_brief.position;
      end if;
    end if;
  end loop;

  if v_written = 0 then
    raise exception 'NOTHING_WRITTEN';
  end if;

  -- The lowest-numbered one is the dish until the cook says otherwise. A cook
  -- who does not care is not made to choose, and nothing downstream ever meets
  -- a pairing with no dish on it.
  for v_brief in
    select * from briefs where pairing_id = v_pairing_id and status = 'DRAFT' order by position
  loop
    update briefs
    -- Cast explicitly: a CASE over two string literals is `text`, and the
    -- column is an enum.
    set status = (case when v_first then 'SUBMITTED' else 'OFFERED' end)::brief_status,
        submitted_at = now(),
        delivered = v_first
    where id = v_brief.id;
    v_first := false;
  end loop;

  -- Allergens, over every recipe that was offered rather than only the one
  -- being cooked: the cook may swap to any of them, and a note that only
  -- covers the default would be silent about exactly the case where somebody
  -- changed the dish late.
  select coalesce(array_agg(distinct de.label), '{}') into v_flagged
  from dietary_entries de
  join round_members m on m.profile_id = de.profile_id
  join briefs b on b.pairing_id = v_pairing_id and b.status in ('SUBMITTED', 'OFFERED')
  where m.round_id = p_round_id and m.status = 'ACTIVE' and m.approved
    and de.kind in ('ALLERGY_SEVERE', 'DIET')
    and de.label = any(b.contains_tags);

  if array_length(v_flagged, 1) > 0 then
    insert into host_alerts (round_id, kind, pairing_id, payload)
    values (p_round_id, 'OTHER', v_pairing_id, jsonb_build_object(
      'type', 'ALLERGEN_ON_TABLE',
      'dish_name', (select dish_name from briefs where pairing_id = v_pairing_id and status = 'SUBMITTED'),
      'labels', v_flagged
    ));
  end if;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'BRIEF_SUBMITTED', jsonb_build_object(
    'pairing_id', v_pairing_id, 'recipes', v_written, 'flagged', v_flagged
  ));
end;
$$;

grant execute on function submit_brief(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Reading them, as the sender and as the cook.
-- ---------------------------------------------------------------------------

drop function if exists get_my_brief_draft(uuid);

create or replace function get_my_brief_draft(p_round_id uuid)
returns table (
  brief_id uuid,
  -- Named `recipe_no` rather than `position`: the latter is a reserved word in
  -- a RETURNS TABLE list, and an OUT parameter sharing a name with the column
  -- it carries is the shadowing trap the note on `status` below describes.
  recipe_no int,
  status brief_status,
  dish_name text,
  course course,
  procedure text,
  external_url text,
  difficulty int,
  est_cost text,
  prep_minutes int,
  note_to_cook text,
  contains_tags text[],
  contains_tags_confirmed boolean,
  ingredients jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_my_member_id uuid;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  -- round_members.status is qualified because this function's own RETURNS
  -- TABLE declares a column named `status`, and PL/pgSQL puts OUT parameters
  -- in scope for the whole body.
  select id into v_my_member_id from round_members
  where round_id = p_round_id and profile_id = v_uid and round_members.status = 'ACTIVE' and approved;
  if not found then raise exception 'not an active member of this round'; end if;

  if v_round.status not in ('ASSIGNED', 'BRIEFS_CLOSED', 'DINNER', 'VOTING', 'RESULTS', 'ARCHIVED') then
    raise exception 'no assignment yet';
  end if;

  return query
    select
      b.id, b.position, b.status, b.dish_name, b.course, b.procedure, b.external_url, b.difficulty,
      b.est_cost, b.prep_minutes, b.note_to_cook, b.contains_tags, b.contains_tags_confirmed,
      coalesce(
        (select jsonb_agg(jsonb_build_object('name', bi.name, 'quantity', bi.quantity, 'unit', bi.unit) order by bi.position)
         from brief_ingredients bi where bi.brief_id = b.id),
        '[]'::jsonb
      )
    from briefs b
    join pairings p on p.id = b.pairing_id
    where p.round_id = p_round_id
      and p.assignment_version = v_round.assignment_version
      and p.sender_id = v_my_member_id
    order by b.position;
end;
$$;

grant execute on function get_my_brief_draft(uuid) to authenticated;

-- The cook's page. One row per recipe offered, `chosen` marking the one that
-- is the dish. Still LEFT-joined and still hiding drafts: a sender halfway
-- through writing shows the same waiting page as one who has not started.
drop function if exists get_my_brief(uuid);

create or replace function get_my_brief(p_round_id uuid)
returns table (
  pairing_id uuid,
  brief_id uuid,
  recipe_no int,
  chosen boolean,
  dish_name text, course course, procedure text,
  external_url text, difficulty integer, est_cost text, prep_minutes integer,
  note_to_cook text, contains_tags text[], ingredients jsonb, acknowledged boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_my_member_id uuid;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  select id into v_my_member_id from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE' and approved;
  if not found then raise exception 'not an active member of this round'; end if;

  if v_round.status in ('DRAFT', 'OPEN', 'LOCKED') then
    raise exception 'briefs are not visible to cooks yet';
  end if;

  return query
    select
      p.id,
      b.id,
      coalesce(b.position, 1),
      coalesce(b.status = 'SUBMITTED', false),
      b.dish_name,
      -- The slot when there is no recipe, because the slot is what the cook
      -- was actually dealt and it is true from the moment the roulette runs.
      coalesce(b.course, s.course),
      b.procedure, b.external_url, b.difficulty,
      b.est_cost, b.prep_minutes, b.note_to_cook,
      coalesce(b.contains_tags, '{}'::text[]),
      coalesce(
        (select jsonb_agg(jsonb_build_object('name', bi.name, 'quantity', bi.quantity, 'unit', bi.unit) order by bi.position)
         from brief_ingredients bi where bi.brief_id = b.id),
        '[]'::jsonb
      ),
      coalesce(b.acknowledged_at is not null, false)
    from pairings p
    join slots s on s.id = p.slot_id
    left join briefs b on b.pairing_id = p.id and b.status in ('SUBMITTED', 'OFFERED')
    where p.round_id = p_round_id
      and p.assignment_version = v_round.assignment_version
      and p.cook_id = v_my_member_id
    order by b.position;
end;
$$;

grant execute on function get_my_brief(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Choosing.
--
-- The cook, and nobody else — not the sender, who would be taking back the
-- choice they just gave, and not the Executive Chef, who does not know what is
-- in anybody's kitchen.
--
-- The swap is two updates in one statement's worth of care: the partial unique
-- index refuses two SUBMITTED rows on one pairing, so the old one is stood
-- down first. Anything already scored is out of reach — a dish that has been
-- voted on is a dish that was eaten.
-- ---------------------------------------------------------------------------

create or replace function choose_brief(p_brief_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_brief briefs;
  v_pairing pairings;
  v_round rounds;
  v_my_member_id uuid;
begin
  select * into v_brief from briefs where id = p_brief_id;
  if not found then raise exception 'no such recipe'; end if;

  select * into v_pairing from pairings where id = v_brief.pairing_id;
  select * into v_round from rounds where id = v_pairing.round_id;

  select id into v_my_member_id from round_members
  where round_id = v_round.id and profile_id = v_uid and status = 'ACTIVE' and approved;
  if not found or v_my_member_id <> v_pairing.cook_id then
    raise exception 'only the cook chooses which recipe they are making';
  end if;

  -- Up to and including the dinner itself: somebody standing in a kitchen at
  -- six o'clock changing their mind is the case this feature is for. After
  -- that the dish has been eaten and voted on.
  if v_round.status not in ('ASSIGNED', 'BRIEFS_CLOSED', 'DINNER') then
    raise exception 'CHOICE_CLOSED';
  end if;

  if v_brief.status not in ('SUBMITTED', 'OFFERED') then
    raise exception 'that recipe was never offered to you';
  end if;

  if v_brief.status = 'SUBMITTED' then
    return; -- already the dish
  end if;

  update briefs set status = 'OFFERED', delivered = false
  where pairing_id = v_brief.pairing_id and status = 'SUBMITTED';

  update briefs set status = 'SUBMITTED', delivered = true
  where id = p_brief_id;

  insert into audit_log (round_id, actor_id, action, payload)
  values (v_round.id, v_uid, 'BRIEF_CHOSEN',
          jsonb_build_object('brief_id', p_brief_id, 'pairing_id', v_brief.pairing_id));
end;
$$;

grant execute on function choose_brief(uuid) to authenticated;

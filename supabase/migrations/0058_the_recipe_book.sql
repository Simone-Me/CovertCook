-- The recipe book (ROADMAP §5, and step 2 of §7).
--
-- THE GATE THIS OPENS, SAID OUT LOUD. `briefs` has no SELECT policy at all —
-- not a narrow one, none — and the only reader has ever been `get_my_brief`,
-- which returns the recipe written *for you*. The ballot shows dish names and
-- never bodies. So "keep the recipes from that dinner" is not a feature that
-- reads existing data: it is a **new, deliberate exposure**, and this file is
-- where it happens. `list_round_recipes` opens every submitted recipe of one
-- round to the members of that round, once the round has reached RESULTS and
-- the host has actually published them.
--
-- That is defensible — the reveal has happened, everyone has eaten every dish,
-- the secrecy has done its job — and it is still a decision rather than an
-- implementation detail, so it is written here rather than assumed.
--
-- WHAT IT DOES NOT OPEN, WHICH MATTERS MORE. It says who *wrote* each recipe.
-- It never says who *cooked* it. Those two facts side by side are the chain,
-- and the chain is the game: knowing the author of a dish and the cook of the
-- same dish reconstructs a link the round spent the whole evening hiding. Only
-- the author travels, and `relation` carries the rest — your own two roles that
-- evening, which you already knew.
--
-- COPY THE RECIPE, REFERENCE THE PERSON. The split is the whole design:
--
--   * The recipe is COPIED — title, ingredients, method, link, allergen tags,
--     frozen at the moment of saving. Reference-only was right while rounds
--     were permanent; the day old dinners can be deleted, a book of references
--     empties itself, which is the one thing a recipe book must never do. A
--     saved recipe is a copy in your kitchen, not a bookmark in somebody
--     else's.
--   * The author is a REFERENCE — `author_profile_id`, never a snapshot of
--     their name. Erasure anonymises a profile (0049), and a frozen name would
--     keep somebody in ten other people's books after they asked to be
--     forgotten. Referenced, they become "Former guest" there, which is
--     exactly what erasure is for.
--   * The pseudonym is COPIED, because it is not an identity. "Chef Basilic"
--     was the name you knew them by *that evening* and means nothing outside
--     that dinner: a label on the card, never a filter — filtering a book by
--     it would group strangers together.
--
-- WHY ITS OWN TABLE, AND NOT A FLAG ON `briefs`. Two reasons, and the second
-- is fatal on its own. A saved recipe must outlive the dinner. And 0054 puts
-- triggers on every table that belongs to a round, refusing all writes once it
-- is archived — a "saved" flag inside `briefs` would be refused by the
-- database at exactly the moment somebody saves a recipe from a finished
-- dinner, which is the only moment they ever do it. `saved_recipes` is
-- deliberately absent from that trigger list.

-- Which of the three things a dish was to you that evening. "Received" alone
-- loses half of what a person made: the recipe you wrote and the recipe you
-- cooked are two different objects and both are worth keeping.
do $$ begin
  create type saved_relation as enum ('COOKED', 'WROTE', 'TABLE');
exception when duplicate_object then null;
end $$;

create table if not exists saved_recipes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,

  -- Where it came from. Both nullable and both ON DELETE SET NULL: the copy is
  -- the point, and it has to survive its origin being deleted.
  source_brief_id uuid references briefs (id) on delete set null,
  round_id uuid references rounds (id) on delete set null,

  -- The evening, copied, so a card can still say where it came from after the
  -- dinner is gone.
  round_name text not null default '',
  dinner_at timestamptz,

  -- The recipe, copied whole. Shown as one card and cooked from as one thing,
  -- so the ingredients travel with it rather than staying in the table they
  -- live in today.
  dish_name text not null,
  course course not null,
  ingredients jsonb not null default '[]'::jsonb,
  procedure text not null default '',
  external_url text,
  -- Not decoration: cooking this again, for different people, makes the
  -- allergens matter again.
  contains_tags text[] not null default '{}',

  author_profile_id uuid references profiles (id) on delete set null,
  author_secret_name text,

  relation saved_relation not null default 'TABLE',
  -- Per entry, not per recipe: it is your comment on your copy.
  note text,
  saved_at timestamptz not null default now(),

  -- One save per recipe per person. This single line is what makes the save
  -- control a switch instead of a counter — without it, arming the panel a
  -- second time and confirming would add a second copy of everything.
  unique (profile_id, source_brief_id)
);

create index saved_recipes_profile_idx on saved_recipes (profile_id, saved_at desc);

alter table saved_recipes enable row level security;

-- Reading and deleting your own book is ordinary self-service. Writing is not:
-- an insert policy would let a client write any text it liked into a row that
-- claims to be a copy of somebody's recipe, so writes go through save_recipes
-- and the table takes no INSERT or UPDATE grant at all. `note` therefore has no
-- way in yet, and that is on purpose: the column is here because the shape of
-- the entry is settled (it is your comment on your copy), the editor is not
-- built, and a half-wired note is worse than none.
create policy saved_recipes_select_own on saved_recipes
  for select using (profile_id = auth.uid());

create policy saved_recipes_delete_own on saved_recipes
  for delete using (profile_id = auth.uid());

grant select, delete on saved_recipes to authenticated;

-- ---------------------------------------------------------------------------
-- list_round_recipes — the exposure, and the only one.
--
-- Every submitted recipe of one round, to a member of that round, once the
-- results are readable. The gate is deliberately the same one `get_results`
-- uses, because the save button lives on the results menu: a person who cannot
-- see the scores cannot see the recipes either, and there is one rule to
-- reason about instead of two.
--
-- `already_saved` is what lets the interface come back armed with the right
-- boxes already ticked. Without it the switch would offer to save what it
-- already saved, the unique index would silently refuse it, and the count on
-- screen would disagree with the book.
-- ---------------------------------------------------------------------------

create or replace function list_round_recipes(p_round_id uuid)
returns table (
  brief_id uuid,
  dish_name text,
  course course,
  procedure text,
  external_url text,
  contains_tags text[],
  ingredients jsonb,
  author_secret_name text,
  author_display_name text,
  relation saved_relation,
  already_saved boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_is_host boolean;
  v_me uuid;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  v_is_host := is_round_host(p_round_id, v_uid);

  if not (v_is_host or is_round_member(p_round_id, v_uid)) then
    raise exception 'not a member of this round';
  end if;

  -- Not the authorisation — that is the line above. This is only which of the
  -- three labels each dish gets, and it is read without a status filter so a
  -- host who is also playing still sees their own two roles.
  select id into v_me from round_members
  where round_id = p_round_id and profile_id = v_uid;

  if v_round.status not in ('RESULTS', 'ARCHIVED') then
    raise exception 'RESULTS_NOT_READY';
  end if;
  if not v_is_host and not results_are_public(v_round) then
    raise exception 'RESULTS_NOT_PUBLISHED';
  end if;

  return query
    select
      b.id,
      b.dish_name,
      b.course,
      b.procedure,
      b.external_url,
      b.contains_tags,
      coalesce(
        (select jsonb_agg(jsonb_build_object('name', bi.name, 'quantity', bi.quantity, 'unit', bi.unit) order by bi.position)
         from brief_ingredients bi where bi.brief_id = b.id),
        '[]'::jsonb
      ),
      sm.secret_name,
      -- The author, resolved now rather than frozen. Somebody who has since
      -- asked to be forgotten reads as nothing here, and the interface says
      -- "Former guest" — which is what erasure is for.
      sp.display_name,
      case
        when p.sender_id = v_me then 'WROTE'::saved_relation
        when p.cook_id = v_me then 'COOKED'::saved_relation
        else 'TABLE'::saved_relation
      end,
      exists (
        select 1 from saved_recipes sr
        where sr.profile_id = v_uid and sr.source_brief_id = b.id
      )
    from briefs b
    join pairings p on p.id = b.pairing_id
    join round_members sm on sm.id = p.sender_id
    join profiles sp on sp.id = sm.profile_id
    where p.round_id = p_round_id
      and p.assignment_version = v_round.assignment_version
      -- A draft is not a recipe. Nothing to save, and the button does not
      -- appear for it.
      and b.status = 'SUBMITTED'
    order by b.course, b.dish_name;
end;
$$;

grant execute on function list_round_recipes(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- save_recipes — one confirm, one batch, no duplicates.
--
-- Takes the whole selection rather than one dish at a time: the interface arms,
-- the reader taps four names, and one press writes four rows. Saving on every
-- tap would make a mis-tap a row in somebody's book, and would turn a moment of
-- choosing into four round trips over a phone connection at a dinner table.
--
-- Returns how many were actually written, which is not always how many were
-- asked for: anything already in the book is skipped by the unique index, and
-- that is the correct outcome rather than an error. The interface reports the
-- number it gets back, so the sentence on screen and the book agree.
-- ---------------------------------------------------------------------------

create or replace function save_recipes(p_round_id uuid, p_brief_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_is_host boolean;
  v_me uuid;
  v_written int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_brief_ids is null or array_length(p_brief_ids, 1) is null then return 0; end if;

  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  v_is_host := is_round_host(p_round_id, v_uid);

  if not (v_is_host or is_round_member(p_round_id, v_uid)) then
    raise exception 'not a member of this round';
  end if;

  -- Not the authorisation — that is the line above. This is only which of the
  -- three labels each dish gets, and it is read without a status filter so a
  -- host who is also playing still sees their own two roles.
  select id into v_me from round_members
  where round_id = p_round_id and profile_id = v_uid;

  if v_round.status not in ('RESULTS', 'ARCHIVED') then
    raise exception 'RESULTS_NOT_READY';
  end if;
  if not v_is_host and not results_are_public(v_round) then
    raise exception 'RESULTS_NOT_PUBLISHED';
  end if;

  insert into saved_recipes (
    profile_id, source_brief_id, round_id, round_name, dinner_at,
    dish_name, course, ingredients, procedure, external_url, contains_tags,
    author_profile_id, author_secret_name, relation
  )
  select
    v_uid,
    b.id,
    p_round_id,
    v_round.name,
    v_round.dinner_at,
    b.dish_name,
    b.course,
    coalesce(
      (select jsonb_agg(jsonb_build_object('name', bi.name, 'quantity', bi.quantity, 'unit', bi.unit) order by bi.position)
       from brief_ingredients bi where bi.brief_id = b.id),
      '[]'::jsonb
    ),
    b.procedure,
    b.external_url,
    b.contains_tags,
    sm.profile_id,
    sm.secret_name,
    case
      when p.sender_id = v_me then 'WROTE'::saved_relation
      when p.cook_id = v_me then 'COOKED'::saved_relation
      else 'TABLE'::saved_relation
    end
  from briefs b
  join pairings p on p.id = b.pairing_id
  join round_members sm on sm.id = p.sender_id
  where b.id = any(p_brief_ids)
    -- The ids come from a client and are checked against the round rather than
    -- trusted: a hand-made call naming a brief from somebody else's dinner
    -- matches nothing here and writes nothing.
    and p.round_id = p_round_id
    and p.assignment_version = v_round.assignment_version
    and b.status = 'SUBMITTED'
  on conflict (profile_id, source_brief_id) do nothing;

  get diagnostics v_written = row_count;
  return v_written;
end;
$$;

grant execute on function save_recipes(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- list_my_recipes — the book.
--
-- Everything, in one call, newest dinner first: that is what somebody is
-- looking for the morning after an evening. A few dozen rows a year, so the
-- filtering — by course, by dinner, by allergen, by text — happens in the
-- browser on data already loaded. Paging and indexes here would be building for
-- a size this will not reach.
--
-- The author's name is read now rather than stored, so an account that has been
-- erased since reads as null and the card says "Former guest".
-- ---------------------------------------------------------------------------

create or replace function list_my_recipes()
returns table (
  id uuid,
  source_brief_id uuid,
  round_id uuid,
  round_name text,
  dinner_at timestamptz,
  dish_name text,
  course course,
  ingredients jsonb,
  procedure text,
  external_url text,
  contains_tags text[],
  author_display_name text,
  author_secret_name text,
  relation saved_relation,
  note text,
  saved_at timestamptz,
  -- False once the dinner it came from has been deleted. The delete
  -- confirmation needs it: "this is the last copy" is a different sentence
  -- from "you can save it again", and only one of them is true at a time.
  origin_exists boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    sr.id, sr.source_brief_id, sr.round_id, sr.round_name, sr.dinner_at,
    sr.dish_name, sr.course, sr.ingredients, sr.procedure, sr.external_url,
    sr.contains_tags,
    ap.display_name, sr.author_secret_name, sr.relation, sr.note, sr.saved_at,
    sr.source_brief_id is not null
  from saved_recipes sr
  left join profiles ap on ap.id = sr.author_profile_id
  where sr.profile_id = auth.uid()
  order by coalesce(sr.dinner_at, sr.saved_at) desc, sr.course, sr.dish_name;
$$;

grant execute on function list_my_recipes() to authenticated;

-- ---------------------------------------------------------------------------
-- forget_recipe — your copy, and only ever your copy.
--
-- The delete policy above would have been enough on its own. This exists so
-- the client has one named call for the act, and so the refusal is a sentence
-- rather than "0 rows affected" — a delete that silently matched nothing is
-- indistinguishable from a delete that worked, and the difference matters when
-- the thing being deleted may be the last copy in the world.
-- ---------------------------------------------------------------------------

create or replace function forget_recipe(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  delete from saved_recipes where id = p_id and profile_id = v_uid;
  if not found then raise exception 'RECIPE_NOT_IN_YOUR_BOOK'; end if;
end;
$$;

grant execute on function forget_recipe(uuid) to authenticated;

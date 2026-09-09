-- LE FIL ROUGE: a constraint the whole table cooks against.
--
-- Everything in this app so far tells you WHO to write for. Nothing tells you
-- WHAT to write, and a blank page addressed to a stranger is the hardest form
-- a recipe brief can take. The fil rouge is the answer: one direction, chosen
-- by the Executive Chef when the dinner is set up, that every recipe is
-- written against — a colour, a letter, a country, a technique, an ingredient,
-- an era.
--
-- IT IS A SUGGESTION AND NOTHING CHECKS IT. No validation refuses a recipe for
-- being off-theme, because the game is social and the table is the judge. What
-- the app does is carry the theme to the four places where it has to be read
-- (the writer, the cook, the ballot, the menu) and then get out of the way.
--
-- WHY IT IS NOT CALLED A THEME. Two things in this schema are already called
-- one: `name_theme_catalogue` (the pseudonym word lists) and
-- `table_theme_catalogue` (the cloth). A third would make every column name in
-- the app ambiguous. The interface calls this the fil rouge — the thread
-- running through an evening — and so does the schema.
--
-- ---------------------------------------------------------------------------
-- WHAT IS FREE, AND WHY IT IS NOT A TIER ON EVERY ROW
--
-- `0072` answered "what is free" with a tier per row, because a cloth is
-- either yours or it is not, for ever. That shape does not fit here, because
-- what is free changes with the week.
--
-- A short list is never rationed. Ten colours, twelve techniques: they are
-- shown whole and they are free, all of them, always. Rationing a list of ten
-- does not create desire, it creates a shelf with seven locks on it for the
-- price of a coffee, and that reads as meanness rather than as an offer.
--
-- A long list rotates. There are 176 countries; showing all of them is a
-- scrolling atlas nobody reads to the end of, and locking all but a few is the
-- meanness above at a larger scale. So the week draws from it, everybody gets
-- the draw for nothing, and Crème is what opens the rest of the group the draw
-- came from. The constraint is the fun — that is why Crème opens the group and
-- not the whole world.
--
-- `rotates` and `draw_size` are therefore DATA, on the category row. Whether a
-- list rotates, and how much of it shows, is an UPDATE and not a migration —
-- the same instinct as prices in `0072`. Today only the world rotates; the
-- staples and the eras are set up to and can be switched either way once
-- anybody has actually used them.
--
-- ---------------------------------------------------------------------------
-- THE DRAW HAS NO JOB AND NO TABLE
--
-- The obvious build is a weekly cron that writes "this week's selection" into
-- a table. This app already carries four scheduled workflows and every one of
-- them is a thing that can fail at four in the morning; a fifth that fails
-- leaves the shelf empty on a Sunday.
--
-- So the draw is COMPUTED, not stored. Each list has a stable shuffled order
-- (an md5 of the code with a seed — same order every time, in every session,
-- on every client), and the week index walks that order. Nothing repeats until
-- the list is exhausted, which is the bag-of-names behaviour a plain random
-- pick does not give: with a random pick Italy can come three weeks running
-- while Peru never arrives.
--
-- When a list is exhausted it reshuffles, because the seed carries the tour
-- number. The second tour of the world is not the first one again.
--
-- WHY THERE IS NO "PROGRAMMED SKIP". It was asked for, to stop the order
-- feeling mechanical. It would do the opposite of what it was wanted for:
-- skipping ahead skips countries, and a skipped country does not come back
-- before the repeats start — which is precisely the flaw the walked shuffle
-- exists to fix. The order is already unreadable from outside; there is no
-- pattern on the shelf to break.
--
-- ---------------------------------------------------------------------------
-- SUNDAY NOON, IN PARIS
--
-- The week turns on Sunday at midday, which is when somebody sits down to
-- think about next weekend. It is midday IN PARIS, and the arithmetic below
-- converts to Paris wall-clock before subtracting — not because the audience
-- is French but because a fixed offset from UTC would move the changeover by
-- an hour twice a year, and a countdown that lies by an hour every October is
-- worse than no countdown.

-- ---------------------------------------------------------------------------
-- 1. The six categories.
--
-- A table rather than an enum: `0080` recorded why this schema stopped adding
-- values to enums, and a category needs to carry `rotates` and `draw_size`
-- anyway, which an enum cannot.
-- ---------------------------------------------------------------------------

create table if not exists fil_rouge_category (
  code text primary key,
  -- False: the whole list is shown, and it is free. True: the week draws from
  -- it, the draw is free, and the rest of the group is what Crème opens.
  rotates boolean not null default false,
  -- How many the draw offers. Meaningless when `rotates` is false. COUNTRY
  -- ignores it: its draw is one per macro-group, which is seven by
  -- construction rather than by a number in a column.
  draw_size int not null default 0,
  sort_order int not null default 0,
  constraint fil_rouge_category_draw check (draw_size >= 0)
);

comment on table fil_rouge_category is
  'The six kinds of fil rouge, and whether each one rotates weekly. Changing rotates/draw_size is an UPDATE, deliberately: how much of a list shows is a product decision that should not need a deploy.';

insert into fil_rouge_category (code, rotates, draw_size, sort_order) values
  ('COUNTRY',   true,  0, 10),
  ('COLOUR',    false, 0, 20),
  ('LETTER',    false, 0, 30),
  ('TECHNIQUE', false, 0, 40),
  ('STAPLE',    true,  6, 50),
  ('ERA',       true,  6, 60)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 2. The catalogue.
--
-- One table for all six, because the shelf reads them the same way and the
-- only thing that differs is whether `group_code` is filled — which only
-- COUNTRY does, because only the world has a middle layer between the category
-- and the value.
--
-- NO LABELS HERE. The visible words live in the client's translation files,
-- unlike the fridge phrases, which live in `message_templates` because a
-- player posts one and another player reads it in their own language. A
-- catalogue is static text the app ships; putting it in the database would
-- mean a migration every time a comma moves.
-- ---------------------------------------------------------------------------

create table if not exists fil_rouge_catalogue (
  category text not null references fil_rouge_category (code),
  code text not null,
  -- COUNTRY only: the micro-group ('1-A' … '7-B'). Null everywhere else.
  group_code text,
  -- COUNTRY only: the macro-group ('1' … '7'), carried rather than derived so
  -- the draw can group by it without parsing a string on every row.
  macro_code text,
  -- True for a value that is never in the free draw and always needs Crème.
  -- Today: the letters no home cook can build a dinner on in either language.
  -- A locked row is still SHOWN — a lock has to be visible to mean anything.
  premium boolean not null default false,
  -- What this value puts on the table, in the vocabulary of `foodTags.ts`, so
  -- the host can be told at the moment of choosing that the fil rouge they are
  -- about to impose collides with what somebody at the table has declared.
  -- Empty for everything that is not an ingredient: a colour has no allergen.
  contains_tags text[] not null default '{}',
  sort_order int not null default 0,
  primary key (category, code),
  -- A group belongs to the world or to nothing.
  constraint fil_rouge_groups_are_countries
    check ((group_code is null and macro_code is null) or category = 'COUNTRY')
);

create index if not exists fil_rouge_catalogue_group_idx
  on fil_rouge_catalogue (category, macro_code, group_code);

comment on table fil_rouge_catalogue is
  'Every fil rouge a dinner can be given. Codes are permanent: rounds store the code, so renaming one orphans every dinner that chose it.';

-- Visible to anyone signed in. A locked value has to be readable to be worth
-- unlocking, and there is nothing private on these rows.
alter table fil_rouge_category enable row level security;
alter table fil_rouge_catalogue enable row level security;

drop policy if exists fil_rouge_category_select on fil_rouge_category;
create policy fil_rouge_category_select on fil_rouge_category for select using (true);

drop policy if exists fil_rouge_catalogue_select on fil_rouge_catalogue;
create policy fil_rouge_catalogue_select on fil_rouge_catalogue for select using (true);

grant select on fil_rouge_category to authenticated;
grant select on fil_rouge_catalogue to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The five lists that do not rotate, and the one that does but is short.
--
-- The world is 176 rows and arrives in its own migration, because the data and
-- the engine should be revisable without touching each other.
--
-- HOUSE RULE for anything added later, inherited from the fridge phrases in
-- `0031`: nothing here may make a joke of a health condition, and nothing here
-- may reduce a place to a punchline.
-- ---------------------------------------------------------------------------

-- Ten colours, and only ten, because they have to be TOLD APART on a plate.
-- Gold was dropped as a second yellow. Grey was dropped because there is no
-- appetising grey food and a fil rouge that makes the dinner ugly is a
-- forfeit, not a constraint. Black stays: squid ink, black rice, black garlic,
-- sesame.
insert into fil_rouge_catalogue (category, code, sort_order) values
  ('COLOUR', 'RED', 10), ('COLOUR', 'ORANGE', 20), ('COLOUR', 'YELLOW', 30),
  ('COLOUR', 'GREEN', 40), ('COLOUR', 'BLUE', 50), ('COLOUR', 'PURPLE', 60),
  ('COLOUR', 'PINK', 70), ('COLOUR', 'WHITE', 80), ('COLOUR', 'BLACK', 90),
  ('COLOUR', 'BROWN', 100)
on conflict do nothing;

-- Every letter, but six of them are Crème. K, Q, W, X, Y and Z are not hard,
-- they are unbuildable — in French and in English both — and the ballot now
-- has a line asking how well the dish honoured the fil rouge, so an impossible
-- letter is a scoring penalty handed out by the app. Behind Crème they are a
-- declared hard mode: whoever picks one knows what they are doing.
insert into fil_rouge_catalogue (category, code, premium, sort_order)
select 'LETTER', l, l in ('K','Q','W','X','Y','Z'), ascii(l)
from unnest(string_to_array('A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z', ',')) as l
on conflict do nothing;

-- Twelve techniques, and the test each one had to pass: it must work for a
-- DESSERT as well as for a main. That is what ruled out breaded and marinated.
-- It also ruled out the two that were proposed as costs — the dinner already
-- has a budget per head (`0065`, `0074`) and two systems telling one person
-- how much to spend, in different units, is worse than one.
insert into fil_rouge_catalogue (category, code, sort_order) values
  ('TECHNIQUE', 'NO_OVEN', 10), ('TECHNIQUE', 'RAW_ONLY', 20),
  ('TECHNIQUE', 'GRILLED', 30), ('TECHNIQUE', 'FRIED', 40),
  ('TECHNIQUE', 'STEAMED', 50), ('TECHNIQUE', 'ONE_PAN', 60),
  ('TECHNIQUE', 'SERVED_COLD', 70), ('TECHNIQUE', 'ALL_LIQUID', 80),
  ('TECHNIQUE', 'NO_KNIFE', 90), ('TECHNIQUE', 'ONE_BITE', 100),
  ('TECHNIQUE', 'UNDER_A_CRUST', 110), ('TECHNIQUE', 'ROLLED', 120)
on conflict do nothing;

-- Twenty staples. This is the ONE category where `contains_tags` earns its
-- keep: a fil rouge of "cheese" imposed on a table with a vegan and a lactose
-- allergy is a trap the host should be told about while they are still
-- choosing, not discovered by six senders one at a time.
insert into fil_rouge_catalogue (category, code, contains_tags, sort_order) values
  ('STAPLE', 'EGG',       array['EGG','VEGAN'],                  10),
  ('STAPLE', 'POTATO',    '{}',                                  20),
  ('STAPLE', 'TOMATO',    '{}',                                  30),
  ('STAPLE', 'RICE',      '{}',                                  40),
  ('STAPLE', 'BREAD',     array['GLUTEN'],                       50),
  ('STAPLE', 'CHEESE',    array['MILK','NO_DAIRY','VEGAN'],      60),
  ('STAPLE', 'CHOCOLATE', array['MILK'],                         70),
  ('STAPLE', 'LEMON',     '{}',                                  80),
  ('STAPLE', 'MUSHROOM',  '{}',                                  90),
  ('STAPLE', 'PULSES',    '{}',                                 100),
  ('STAPLE', 'FISH',      array['FISH','VEGETARIAN','VEGAN'],   110),
  ('STAPLE', 'HONEY',     array['VEGAN'],                       120),
  ('STAPLE', 'APPLE',     '{}',                                 130),
  ('STAPLE', 'PUMPKIN',   '{}',                                 140),
  ('STAPLE', 'GARLIC',    '{}',                                 150),
  ('STAPLE', 'ONION',     '{}',                                 160),
  ('STAPLE', 'BUTTER',    array['MILK','NO_DAIRY','VEGAN'],     170),
  ('STAPLE', 'ALMOND',    array['NUTS','VEGAN'],                180),
  ('STAPLE', 'CREAM',     array['MILK','NO_DAIRY','VEGAN'],     190),
  ('STAPLE', 'CHILLI',    '{}',                                 200)
on conflict do nothing;

-- Twelve eras, and half of them are not history. "Sunday at your
-- grandmother's" is the best fil rouge in this whole migration and it is not a
-- period, it is a memory — which is why the category is eras AND memory rather
-- than a timeline.
insert into fil_rouge_catalogue (category, code, sort_order) values
  ('ERA', 'ANCIENT_ROME', 10), ('ERA', 'MEDIEVAL', 20),
  ('ERA', 'VERSAILLES', 30), ('ERA', 'TWENTIES', 40),
  ('ERA', 'FIFTIES_AMERICA', 50), ('ERA', 'SEVENTIES', 60),
  ('ERA', 'EIGHTIES', 70), ('ERA', 'THE_FUTURE', 80),
  ('ERA', 'SCHOOL_CANTEEN', 90), ('ERA', 'FAMILY_PICNIC', 100),
  ('ERA', 'SUNDAY_AT_GRANDMAS', 110), ('ERA', 'CAMPING', 120)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 4. The week.
--
-- Immutable rather than stable on purpose: with the moment passed in there is
-- nothing here that depends on the session — which is what lets a test ask
-- what the shelf will hold in eleven weeks without waiting eleven weeks.
-- ---------------------------------------------------------------------------

create or replace function fil_rouge_week(p_at timestamptz)
returns int
language sql
immutable
set search_path = public, pg_temp
as $$
  -- Both sides are Paris wall-clock before the subtraction, so the changeover
  -- stays at noon on the ground through both daylight-saving switches. The
  -- anchor is Sunday 4 January 2026, midday.
  select floor(
    extract(epoch from (
      timezone('Europe/Paris', p_at) - timestamp '2026-01-04 12:00:00'
    )) / 604800
  )::int;
$$;

comment on function fil_rouge_week(timestamptz) is
  'Weeks elapsed since Sunday 4 Jan 2026 noon Paris. The whole rotation is a function of this number, which is why nothing has to be stored.';

-- When the current week ends: what the countdown on the shelf counts down to.
create or replace function fil_rouge_turns_at(p_at timestamptz)
returns timestamptz
language sql
stable
set search_path = public, pg_temp
as $$
  select timezone(
    'Europe/Paris',
    timestamp '2026-01-04 12:00:00' + ((fil_rouge_week(p_at) + 1) * interval '7 days')
  );
$$;

grant execute on function fil_rouge_week(timestamptz) to authenticated;
grant execute on function fil_rouge_turns_at(timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The draw.
--
-- Two shapes, because the world has a middle layer and nothing else does.
--
-- FLAT (staples, eras): walk one shuffled order of the whole list, `draw_size`
-- values per week. Each week's values are computed from an absolute index, so
-- a week that straddles the end of a tour correctly takes the tail of one and
-- the head of the next — no value is skipped and none is served twice in a
-- tour.
--
-- THE WORLD: one country per macro-group, so all seven regions are on the
-- shelf every week and no part of the world is ever the one that got left out.
-- Inside a macro-group the micro-groups are walked in a FIXED shuffled order —
-- fixed, not reshuffled per tour, because a micro-group's position is what
-- tells the country walk how many times that group has been visited. Reshuffle
-- the groups and the two walks lose each other. The countries inside a group
-- do reshuffle each tour, which is where "the second tour is a different
-- order" actually lives.
-- ---------------------------------------------------------------------------

create or replace function fil_rouge_flat_draw(p_category text, p_week int)
returns table (code text)
language sql
stable
set search_path = public, pg_temp
as $$
  with cat as (
    select c.draw_size from fil_rouge_category c
    where c.code = p_category and c.rotates and c.draw_size > 0
  ),
  n as (
    select count(*)::int as total from fil_rouge_catalogue
    where category = p_category and not premium
  ),
  -- TWICE the week's size, then the first `draw_size` distinct. A week whose
  -- window crosses the end of a tour reads the tail of one shuffle and the
  -- head of the next, and those two are independent — so the same value can
  -- fall in both halves. Reading double and taking distinct is what stops one
  -- week offering the same thing twice; the extra half is never used otherwise.
  slots as (
    select generate_series(greatest(p_week, 0) * cat.draw_size,
                           greatest(p_week, 0) * cat.draw_size + 2 * cat.draw_size - 1) as i
    from cat, n where n.total > 0
  ),
  picks as (
    select i, i / n.total as tour, i % n.total as pos from slots, n
  ),
  walked as (
    select picks.i, chosen.code
    from picks
    join lateral (
      select c.code
      from fil_rouge_catalogue c
      where c.category = p_category and not c.premium
      order by md5(p_category || ':' || picks.tour || ':' || c.code)
      offset picks.pos limit 1
    ) chosen on true
  ),
  deduped as (
    select distinct on (w.code) w.code, w.i from walked w order by w.code, w.i
  )
  select d.code from deduped d
  order by d.i
  limit (select draw_size from cat);
$$;

create or replace function fil_rouge_world_draw(p_week int)
returns table (macro_code text, group_code text, code text)
language sql
stable
set search_path = public, pg_temp
as $$
  with w as (select greatest(p_week, 0) as n),
  groups as (
    select distinct c.macro_code, c.group_code
    from fil_rouge_catalogue c where c.category = 'COUNTRY'
  ),
  -- Fixed order, no tour in the seed: a micro-group's position is what tells
  -- the country walk below how many times that group has come round, so the
  -- two walks have to agree on it for ever.
  ranked as (
    select g.macro_code, g.group_code,
           count(*) over (partition by g.macro_code) as n_groups,
           (row_number() over (partition by g.macro_code
                               order by md5('MICRO:' || g.group_code)) - 1) as rk
    from groups g
  ),
  chosen as (
    select r.macro_code, r.group_code, (select n from w) / r.n_groups as visit
    from ranked r where r.rk = (select n from w) % r.n_groups
  ),
  sized as (
    select ch.*, greatest((
      select count(*) from fil_rouge_catalogue c
      where c.category = 'COUNTRY' and c.group_code = ch.group_code and not c.premium
    ), 1) as n_countries
    from chosen ch
  )
  select s.macro_code, s.group_code, picked.code
  from sized s
  join lateral (
    select c.code
    from fil_rouge_catalogue c
    where c.category = 'COUNTRY' and c.group_code = s.group_code and not c.premium
    order by md5('CTRY:' || s.group_code || ':'
                 || (s.visit / s.n_countries) || ':' || c.code)
    offset (s.visit % s.n_countries) limit 1
  ) picked on true;
$$;

grant execute on function fil_rouge_flat_draw(text, int) to authenticated;
grant execute on function fil_rouge_world_draw(int) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The shelf, in one call.
--
-- `offered` is what this account may choose right now, and it is the only
-- question a picker should ever have to ask. `drawn` marks the week's official
-- value: a Crème host sees the whole group open but still sees which one the
-- rest of the world is cooking to, because that shared week is the thing worth
-- protecting — if Crème simply picked from 176 countries the common evening
-- would dissolve.
-- ---------------------------------------------------------------------------

create or replace function list_fil_rouge()
returns table (
  category text,
  code text,
  group_code text,
  macro_code text,
  drawn boolean,
  offered boolean,
  premium boolean,
  contains_tags text[]
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_week int := fil_rouge_week(now());
  v_pro boolean := is_pro(auth.uid());
begin
  return query
  with world as (select * from fil_rouge_world_draw(v_week)),
  flat as (
    select fc.code as category, d.code
    from fil_rouge_category fc
    cross join lateral fil_rouge_flat_draw(fc.code, v_week) d
    where fc.rotates and fc.code <> 'COUNTRY'
  ),
  -- The groups the week put on the shelf. Crème opens these, and only these.
  open_groups as (select w.group_code from world w)
  select
    c.category,
    c.code,
    c.group_code,
    c.macro_code,
    case
      when c.category = 'COUNTRY' then exists (select 1 from world w where w.code = c.code)
      when cat.rotates then exists (select 1 from flat f where f.category = c.category and f.code = c.code)
      else false
    end,
    case
      -- Locked outright: nothing but Crème opens it, and no draw ever reaches it.
      when c.premium then v_pro
      -- A short list is whole and free.
      when not cat.rotates then true
      -- The world: this week's country for everybody, this week's groups for Crème.
      when c.category = 'COUNTRY' then
        exists (select 1 from world w where w.code = c.code)
        or (v_pro and exists (select 1 from open_groups og where og.group_code = c.group_code))
      -- Any other rotating list: the draw for everybody, all of it for Crème.
      else v_pro or exists (select 1 from flat f where f.category = c.category and f.code = c.code)
    end,
    c.premium,
    c.contains_tags
  from fil_rouge_catalogue c
  join fil_rouge_category cat on cat.code = c.category
  order by cat.sort_order, c.macro_code nulls first, c.group_code nulls first, c.sort_order, c.code;
end;
$$;

grant execute on function list_fil_rouge() to authenticated;

comment on function list_fil_rouge() is
  'The whole catalogue with "may I choose this, this week" already answered. One call per picker, so no screen re-derives the rule and gets it wrong.';

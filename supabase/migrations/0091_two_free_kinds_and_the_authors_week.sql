-- ---------------------------------------------------------------------------
-- TWO KINDS ARE FREE OUTRIGHT, AND THE REST OPENS THROUGH THE AUTHOR'S WEEK.
--
-- WHAT WAS WRONG WITH THE DRAW AS A SHOPFRONT. 0083 gave every account the
-- week's draw for nothing and sold the rest, which sounds generous and reads
-- as arbitrary: a host arriving on a Tuesday found one country, one staple and
-- one era, none of them chosen by anybody, and twelve locked rows around each.
-- The free part of the product was a lottery ticket, and a lottery ticket is
-- not a thing you can plan a dinner around.
--
-- SO THE LINE MOVES TO WHERE IT IS EXPLAINABLE IN ONE SENTENCE: two whole
-- kinds are free — ONE INGREDIENT and ONE WAY OF COOKING — and they are the
-- two that need no context to be fun, work in any language, and cannot make an
-- evening impossible. Every dinner in the free app can have a thread, chosen
-- from twenty ingredients or twelve techniques, for as long as the app exists.
--
-- AND THE OTHER FOUR OPEN THROUGH A PERSON RATHER THAN THROUGH A LOTTERY. Each
-- week the author picks a handful of values across the world, the colours, the
-- letters and the eras, and those picks are free for everybody — with a note
-- saying WHY those ones this week: a season, a holiday, a memory, whatever the
-- week is actually about. That is a different promise from "the shuffle gave
-- you Tuvalu": it is an editor recommending an evening, which is worth coming
-- back for on a Sunday in a way a random row never was.
--
-- THE COMPUTED DRAW IS NOT DELETED. Where the author has not picked for a
-- category in a given week, `fil_rouge_flat_draw` and `fil_rouge_world_draw`
-- still answer, exactly as they do today. The app is never left with nothing
-- free to offer because somebody did not get round to a week — and the
-- fallback is per CATEGORY, not per week, so a week with only a country chosen
-- still draws its own letter.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The two free kinds.
--
-- A column on the category rather than a list in a function: which kinds are
-- free is a product decision that should move with an UPDATE, exactly as
-- `rotates` and `draw_size` already do (0083).
-- ---------------------------------------------------------------------------

alter table fil_rouge_category add column if not exists free boolean not null default false;

comment on column fil_rouge_category.free is
  'The whole kind is free: every value, to every account, for ever. The rest of the catalogue opens through the author''s week or through Crème (0091).';

update fil_rouge_category set free = (code in ('STAPLE', 'TECHNIQUE'));

-- ---------------------------------------------------------------------------
-- 2. The author's week.
--
-- WRITTEN FROM THE SQL EDITOR AND NOWHERE ELSE, which is the same decision
-- 0075 took for redeem codes: an in-app admin surface would add a third
-- privilege level to an app that has two, and this is a handful of rows a week
-- typed by the one person who has the reasons. So the table is readable by
-- everybody signed in and writable by nobody through the API.
-- ---------------------------------------------------------------------------

create table if not exists fil_rouge_pick (
  -- The week number `fil_rouge_week()` computes. Picking for a future week is
  -- the normal case: the author is writing on Thursday for Sunday.
  week int not null,
  category text not null,
  code text not null,
  sort_order int not null default 0,
  primary key (week, category, code),
  constraint fil_rouge_pick_is_a_value
    foreign key (category, code) references fil_rouge_catalogue (category, code) on delete cascade
);

comment on table fil_rouge_pick is
  'The author''s selection for one week: a few values per kind, free for everybody that week. A kind with no row falls back to the computed draw (0091).';

create index if not exists fil_rouge_pick_week_idx on fil_rouge_pick (week, category);

-- The note that says why. Per locale, because it is prose rather than a label,
-- and prose does not go in the client's translation files: it changes every
-- week and the app would need a deploy to say what this week is about.
create table if not exists fil_rouge_note (
  week int not null,
  locale text not null,
  title text,
  body text not null,
  primary key (week, locale)
);

comment on table fil_rouge_note is
  'Why these values, this week — a season, a holiday, an anniversary. Shown above the kinds in the picker (0091).';

alter table fil_rouge_pick enable row level security;
alter table fil_rouge_note enable row level security;

drop policy if exists fil_rouge_pick_select on fil_rouge_pick;
create policy fil_rouge_pick_select on fil_rouge_pick for select using (true);

drop policy if exists fil_rouge_note_select on fil_rouge_note;
create policy fil_rouge_note_select on fil_rouge_note for select using (true);

grant select on fil_rouge_pick to authenticated;
grant select on fil_rouge_note to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The shelf, read through the new line.
--
-- `drawn` stops meaning "the shuffle reached it" and starts meaning "it is in
-- this week's selection" — which is what the mark on the row has always been
-- taken to mean by the people reading it.
--
-- `offered` is now three plain facts rather than four branches of a lottery:
-- a free kind, or this week's selection, or Crème. A premium row is still
-- Crème and nothing else: those are the letters no home cook can build a
-- dinner on, and an editor should not be able to hand somebody one by mistake.
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
  with picked as (
    select p.category, p.code from fil_rouge_pick p where p.week = v_week
  ),
  -- Which kinds the author actually spoke for this week. Everything else falls
  -- back to the machine, per kind.
  spoken as (select distinct pk.category from picked pk),
  world as (
    select w.code, w.group_code from fil_rouge_world_draw(v_week) w
    where not exists (select 1 from spoken s where s.category = 'COUNTRY')
  ),
  flat as (
    select fc.code as category, d.code
    from fil_rouge_category fc
    cross join lateral fil_rouge_flat_draw(fc.code, v_week) d
    where fc.rotates and fc.code <> 'COUNTRY'
      and not exists (select 1 from spoken s where s.category = fc.code)
  ),
  chosen as (
    select pk.category, pk.code from picked pk
    union all
    select 'COUNTRY', w.code from world w
    union all
    select f.category, f.code from flat f
  )
  select
    c.category,
    c.code,
    c.group_code,
    c.macro_code,
    exists (select 1 from chosen ch where ch.category = c.category and ch.code = c.code),
    case
      -- Never in any selection and never free: Crème or nothing.
      when c.premium then v_pro
      -- A free kind is whole and free, for ever.
      when cat.free then true
      -- This week's selection, for everybody.
      when exists (select 1 from chosen ch where ch.category = c.category and ch.code = c.code)
        then true
      else v_pro
    end,
    c.premium,
    c.contains_tags
  from fil_rouge_catalogue c
  join fil_rouge_category cat on cat.code = c.category
  order by cat.sort_order, c.macro_code nulls first, c.group_code nulls first, c.sort_order, c.code;
end;
$$;

grant execute on function list_fil_rouge() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Next Sunday, read today.
--
-- Same change, one week on: the author's picks for the coming week when there
-- are any, the machine's otherwise. A hard week is still answered by showing
-- the next one rather than by widening this one.
-- ---------------------------------------------------------------------------

create or replace function fil_rouge_upcoming()
returns table (category text, code text, group_code text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_next int := fil_rouge_week(now()) + 1;
begin
  return query
  with picked as (
    select p.category, p.code from fil_rouge_pick p where p.week = v_next
  ),
  spoken as (select distinct pk.category from picked pk)
  select ch.category, ch.code, c.group_code
  from (
    select pk.category, pk.code from picked pk
    union all
    select 'COUNTRY', w.code from fil_rouge_world_draw(v_next) w
    where not exists (select 1 from spoken s where s.category = 'COUNTRY')
    union all
    select fc.code, d.code
    from fil_rouge_category fc
    cross join lateral fil_rouge_flat_draw(fc.code, v_next) d
    where fc.rotates and fc.code <> 'COUNTRY'
      and not exists (select 1 from spoken s where s.category = fc.code)
  ) ch
  join fil_rouge_catalogue c on c.category = ch.category and c.code = ch.code
  order by ch.category, ch.code;
end;
$$;

grant execute on function fil_rouge_upcoming() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The note, in the reader's language.
--
-- Falls back to any locale that exists for the week rather than to silence:
-- a French reader seeing this week's reason in English has been told why;
-- seeing nothing has not.
-- ---------------------------------------------------------------------------

create or replace function fil_rouge_editorial()
returns table (title text, body text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_week int := fil_rouge_week(now());
  v_locale text := my_locale();
begin
  return query
  select n.title, n.body
  from fil_rouge_note n
  where n.week = v_week
  order by (n.locale = v_locale) desc, (n.locale = 'en') desc, n.locale
  limit 1;
end;
$$;

grant execute on function fil_rouge_editorial() to authenticated;

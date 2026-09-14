-- ---------------------------------------------------------------------------
-- THE SELECTION IS THE WHOLE SHELF NOW, AND THE MACHINE STOPS DRAWING.
--
-- Three things, and they are one thing.
--
-- 1. EVERY KIND IS IN THE WEEK, the two free ones included. An ingredient and a
--    way of cooking are open in full to everybody, so a pick in those kinds is
--    not a door — it is a recommendation, which is what the selection has
--    actually been since 0091. "One tomato week" is a better invitation to a
--    free account than a drawer with twenty equal rows in it.
--
-- 2. THE COMPUTED DRAW IS DELETED. `fil_rouge_flat_draw` and
--    `fil_rouge_world_draw` were the bag-of-names shuffle 0083 built to make a
--    weekly shelf without anybody choosing one. With a person choosing, they
--    are a second source of truth that quietly disagrees: the ingredients
--    drawer still marked six or seven rows "this week's pick" — the shuffle's
--    answer — beside the one the author had actually chosen. Two marks meaning
--    two different things under one word is worse than no mark at all.
--
--    So: gone, and with them `rotates` and `draw_size`, which existed only to
--    feed them. A week with no picks now has no marks and no free doors into
--    the four paid kinds, which is exactly what it is: a week nobody wrote.
--    The seeds at the foot are there so that is never the state on a fresh
--    database.
--
-- 3. AND `fil_rouge_upcoming` BECOMES WHAT IT ALWAYS SAID IT WAS: next week's
--    selection, read today, so a host who does not like this week's has a
--    reason to come back on Sunday rather than a disappointment.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The shelf: the week's picks, the two free kinds, and Crème.
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
  )
  select
    c.category,
    c.code,
    c.group_code,
    c.macro_code,
    exists (select 1 from picked pk where pk.category = c.category and pk.code = c.code),
    case
      -- Never in any selection and never free: Crème or nothing. Today this is
      -- the six letters no home cook can build a dinner on.
      when c.premium then v_pro
      -- A free kind is whole and free, for ever.
      when cat.free then true
      -- This week's one thread in this kind, for everybody.
      when exists (select 1 from picked pk where pk.category = c.category and pk.code = c.code)
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
-- 2. Next Sunday, read today.
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
  select p.category, p.code, c.group_code
  from fil_rouge_pick p
  join fil_rouge_catalogue c on c.category = p.category and c.code = p.code
  join fil_rouge_category cat on cat.code = p.category
  where p.week = v_next
  order by cat.sort_order;
end;
$$;

grant execute on function fil_rouge_upcoming() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The shuffle, retired.
--
-- Dropped rather than left standing: a function nobody calls is a function
-- somebody calls again by accident, and the two marks it produced are the bug
-- this migration exists to close.
-- ---------------------------------------------------------------------------

drop function if exists fil_rouge_flat_draw(text, int);
drop function if exists fil_rouge_world_draw(int);

alter table fil_rouge_category drop column if exists rotates;
alter table fil_rouge_category drop column if exists draw_size;

comment on table fil_rouge_category is
  'The six kinds of fil rouge, and whether each is free in full. What is on the shelf in a given week is the author''s selection (fil_rouge_pick) and nothing else since 0093.';

-- ---------------------------------------------------------------------------
-- 4. Four weeks, six kinds, chosen rather than shuffled.
--
-- The values are a starting point and the words under them are placeholders —
-- both are meant to be replaced, from the SQL editor:
--
--   select fil_rouge_week(now());                     -- which week is now
--   update fil_rouge_pick set code = 'PT'
--    where week = <n> and category = 'COUNTRY';
--   update fil_rouge_note set title = '…', body = '…'
--    where week = <n> and category = 'COUNTRY' and locale = 'fr';
--
-- The four weeks are built to read as four different evenings rather than four
-- rows: a Portuguese autumn, a Japanese week of rice and raw fish, Morocco with
-- its one-pan cooking, and Peru in the colours of its markets.
-- ---------------------------------------------------------------------------

with weeks as (
  select fil_rouge_week(now()) + n as week, n from generate_series(0, 3) as n
),
plan as (
  select * from (values
    ('COUNTRY',   array['PT', 'JP', 'MA', 'PE']),
    ('COLOUR',    array['GREEN', 'WHITE', 'ORANGE', 'PURPLE']),
    ('LETTER',    array['A', 'S', 'M', 'P']),
    ('TECHNIQUE', array['ONE_PAN', 'RAW_ONLY', 'GRILLED', 'SERVED_COLD']),
    ('STAPLE',    array['PUMPKIN', 'RICE', 'LEMON', 'POTATO']),
    ('ERA',       array['SUNDAY_AT_GRANDMAS', 'THE_FUTURE', 'SEVENTIES', 'FAMILY_PICNIC'])
  ) as t(category, codes)
)
insert into fil_rouge_pick (week, category, code)
select w.week, p.category, p.codes[w.n + 1]
from weeks w cross join plan p
where exists (
  select 1 from fil_rouge_catalogue c
  where c.category = p.category and c.code = p.codes[w.n + 1]
)
on conflict (week, category) do update set code = excluded.code;

insert into fil_rouge_note (week, locale, category, title, body)
select p.week, l.locale, p.category,
       case when l.locale = 'fr' then 'Le choix de la semaine' else 'This week''s pick' end,
       case when l.locale = 'fr'
            then 'Choix de la semaine, parce que c''est une nouveauté. Ce texte est un espace réservé : la vraie raison s''écrit ici.'
            else 'The pick of the week, because it is new. This text is a placeholder: the real reason goes here.'
       end
from fil_rouge_pick p
cross join (values ('en'), ('fr')) as l(locale)
where p.week >= fil_rouge_week(now())
on conflict (week, locale, category) do nothing;

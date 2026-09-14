-- ---------------------------------------------------------------------------
-- ONE THREAD PER KIND PER WEEK, AND A REASON WRITTEN FOR EACH.
--
-- 0091 let the author pick any number of values per kind per week. In practice
-- that is a shelf again — four countries and three colours is a list somebody
-- has to read rather than a recommendation somebody made — and the whole point
-- of moving the free door from a shuffle to a person was that a person
-- RECOMMENDS. One country. One colour. One letter. One era. Four sentences a
-- week, each saying why.
--
-- SO THE NOTE BECOMES PER-PICK. It was one paragraph for the whole week, which
-- could only ever be about the week in general; now every pick carries its own
-- title and its own reason, because "Portugal, because the sardine season ends
-- on Sunday" is the thing worth reading and "this week is about autumn" is not.
--
-- THE TWO FREE KINDS ARE NOT IN THE SELECTION and never were: an ingredient and
-- a way of cooking are open in full to everybody, so choosing one of them FOR
-- the table would be a recommendation about something nobody is locked out of.
-- The selection is the door into the four that are Crème.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. One pick per kind per week.
--
-- The primary key does the enforcing. Any week that already carries two values
-- for one kind keeps the first by sort order and then by code, which is
-- arbitrary and safe: nothing has shipped yet, and an arbitrary survivor is
-- better than a migration that refuses to run.
-- ---------------------------------------------------------------------------

delete from fil_rouge_pick p
where exists (
  select 1 from fil_rouge_pick q
  where q.week = p.week and q.category = p.category
    and (q.sort_order, q.code) < (p.sort_order, p.code)
);

alter table fil_rouge_pick drop constraint if exists fil_rouge_pick_pkey;
alter table fil_rouge_pick add primary key (week, category);

comment on table fil_rouge_pick is
  'The author''s thread for one kind in one week — exactly one, enforced by the key (0092). A kind with no row falls back to the computed draw.';

-- ---------------------------------------------------------------------------
-- 2. A reason per pick, rather than per week.
-- ---------------------------------------------------------------------------

alter table fil_rouge_note add column if not exists category text;

-- Anything written under the old shape was about the week as a whole; there is
-- no honest way to attach it to one of four picks, and nothing has shipped.
delete from fil_rouge_note where category is null;

alter table fil_rouge_note alter column category set not null;
alter table fil_rouge_note drop constraint if exists fil_rouge_note_pkey;
alter table fil_rouge_note add primary key (week, locale, category);

comment on table fil_rouge_note is
  'Why this thread, this week, in this language — one row per pick (0092). Title and body are shown together in the selection drawer.';

-- ---------------------------------------------------------------------------
-- 3. Reading the selection: the pick, and the words that go with it.
--
-- One call rather than two, because a pick with no reason and a reason with no
-- pick are both useless: the drawer shows a line per kind and needs both ends
-- of it. The locale falls back to whatever exists — a French reader given the
-- reason in English has been told why; given nothing has not.
-- ---------------------------------------------------------------------------

drop function if exists fil_rouge_editorial();

create function fil_rouge_editorial()
returns table (category text, code text, title text, body text)
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
  select p.category, p.code, n.title, n.body
  from fil_rouge_pick p
  join fil_rouge_category c on c.code = p.category
  left join lateral (
    select x.title, x.body
    from fil_rouge_note x
    where x.week = p.week and x.category = p.category
    order by (x.locale = v_locale) desc, (x.locale = 'en') desc, x.locale
    limit 1
  ) n on true
  where p.week = v_week
  order by c.sort_order;
end;
$$;

grant execute on function fil_rouge_editorial() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Four weeks of placeholders, so the drawer has something true in it.
--
-- THESE ARE MEANT TO BE REPLACED, and they say so in their own text. They
-- exist because an empty selection is indistinguishable from a broken one:
-- with no rows the shelf falls back to the computed draw and the drawer has no
-- reason to show, which looks exactly like the feature not working.
--
-- TO EDIT A WEEK, from the Supabase SQL editor:
--
--   select fil_rouge_week(now());                    -- which week is now
--   update fil_rouge_pick set code = 'PT'
--    where week = <n> and category = 'COUNTRY';      -- change the thread
--   update fil_rouge_note set title = '…', body = '…'
--    where week = <n> and category = 'COUNTRY' and locale = 'fr';
--
-- Codes come from fil_rouge_catalogue: ISO-3166 alpha-2 for COUNTRY, and the
-- upper-case words listed in 0083 for the rest.
-- ---------------------------------------------------------------------------

with weeks as (
  select fil_rouge_week(now()) + generate_series(0, 3) as week,
         generate_series(0, 3) as n
),
plan as (
  select * from (values
    ('COUNTRY', array['PT', 'JP', 'MA', 'PE']),
    ('COLOUR',  array['GREEN', 'RED', 'WHITE', 'ORANGE']),
    ('LETTER',  array['A', 'S', 'M', 'P']),
    ('ERA',     array['SUNDAY_AT_GRANDMAS', 'TWENTIES', 'SEVENTIES', 'MEDIEVAL'])
  ) as t(category, codes)
)
insert into fil_rouge_pick (week, category, code)
select w.week, p.category, p.codes[w.n + 1]
from weeks w cross join plan p
where exists (
  select 1 from fil_rouge_catalogue c
  where c.category = p.category and c.code = p.codes[w.n + 1]
)
on conflict (week, category) do nothing;

insert into fil_rouge_note (week, locale, category, title, body)
select p.week, l.locale, p.category,
       case when l.locale = 'fr' then 'Le choix du mois' else 'This month''s pick' end,
       case when l.locale = 'fr'
            then 'Choix du mois, parce que c''est une nouveauté. Ce texte est un espace réservé : il sera remplacé par la vraie raison de la semaine.'
            else 'The pick of the month, because it is new. This text is a placeholder: the real reason for the week goes here.'
       end
from fil_rouge_pick p
cross join (values ('en'), ('fr')) as l(locale)
where p.week >= fil_rouge_week(now())
on conflict (week, locale, category) do nothing;

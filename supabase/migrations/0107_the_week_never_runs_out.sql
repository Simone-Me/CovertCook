-- The pick of the week never runs out.
--
-- 0093 seeded four weeks of picks and left the rest to be written by hand.
-- Nobody wrote week five, so from then on fil_rouge_editorial() returned no
-- rows and the drawer — which only shows when there is something in it —
-- disappeared, which looks exactly like the feature having been removed.
--
-- Now a week the author has not written still has a selection: for every
-- kind, one value drawn from that kind's catalogue, deterministically from the
-- week number (same for everybody, different every Sunday). A hand-written
-- pick for a kind always wins over the draw for that kind, and its note still
-- appears; a drawn value simply has no note under it.
--
-- To write a week by hand, as before:
--   select fil_rouge_week(now());
--   insert into fil_rouge_pick (week, category, code) values (<n>, 'COUNTRY', 'PT');

create or replace function fil_rouge_picks_for(p_week int)
returns table (category text, code text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with authored as (
    select p.category, p.code
    from fil_rouge_pick p
    where p.week = p_week
  ),
  numbered as (
    select c.category, c.code,
           row_number() over (partition by c.category order by c.sort_order, c.code) - 1 as n,
           count(*) over (partition by c.category) as total
    from fil_rouge_catalogue c
    where not c.premium
  ),
  drawn as (
    -- A stride that is not a multiple of any catalogue size worth worrying
    -- about, offset per kind, so the kinds do not all advance in lockstep and
    -- a value does not come back for many weeks.
    select n.category, n.code
    from numbered n
    join fil_rouge_category k on k.code = n.category
    where n.n = ((p_week * 7 + k.sort_order) % n.total + n.total) % n.total
      and not exists (select 1 from authored a where a.category = n.category)
  )
  select category, code from authored
  union all
  select category, code from drawn;
$$;

grant execute on function fil_rouge_picks_for(int) to authenticated;

-- 0092's definition, reading the week through fil_rouge_picks_for.
create or replace function fil_rouge_editorial()
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
  from fil_rouge_picks_for(v_week) p
  join fil_rouge_category c on c.code = p.category
  left join lateral (
    select x.title, x.body
    from fil_rouge_note x
    where x.week = v_week and x.category = p.category
    order by (x.locale = v_locale) desc, (x.locale = 'en') desc, x.locale
    limit 1
  ) n on true
  order by c.sort_order;
end;
$$;

-- 0093's definition, likewise: next Sunday's line is never empty either.
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
  from fil_rouge_picks_for(v_next) p
  join fil_rouge_catalogue c on c.category = p.category and c.code = p.code
  join fil_rouge_category cat on cat.code = p.category
  order by cat.sort_order;
end;
$$;

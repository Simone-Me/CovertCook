-- An admin writes the week, from inside the app.
--
-- Until now the only way to choose the pick of the week was the SQL editor,
-- so in practice nobody did (0107). This adds the smallest admin there can be:
-- a list of accounts allowed in, and three functions behind it — read the
-- coming weeks, set a kind's pick for a week with its notes, or clear it back
-- to the automatic draw.
--
-- Becoming an admin is deliberately NOT something the app can do. It is one
-- statement in the SQL editor, by whoever owns the project:
--
--   insert into app_admins (profile_id)
--   select id from profiles where display_name = '<your username>';

create table if not exists app_admins (
  profile_id uuid primary key references profiles (id) on delete cascade,
  added_at timestamptz not null default now()
);

comment on table app_admins is
  'Accounts allowed into the admin screens (0108). Granted from the SQL editor only; no policy lets the client read or write it.';

alter table app_admins enable row level security;
-- No policies: the table is reached only through the functions below.

create or replace function is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from app_admins where profile_id = auth.uid());
$$;

grant execute on function is_app_admin() to authenticated;

-- The coming weeks, one row per kind per week: what is on the shelf (written
-- or drawn), whether a person wrote it, and the notes in every language.
create or replace function admin_fil_rouge_weeks(p_count int default 8)
returns table (
  week int,
  starts_on date,
  category text,
  code text,
  authored boolean,
  notes jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_now int := fil_rouge_week(now());
begin
  if not is_app_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  return query
  select w.n,
         -- Week 0 begins on Sunday 4 January 2026 (fil_rouge_week, 0083).
         (date '2026-01-04' + (w.n * 7))::date,
         p.category,
         p.code,
         exists (select 1 from fil_rouge_pick a where a.week = w.n and a.category = p.category),
         coalesce((
           select jsonb_object_agg(x.locale, jsonb_build_object('title', x.title, 'body', x.body))
           from fil_rouge_note x
           where x.week = w.n and x.category = p.category
         ), '{}'::jsonb)
  from generate_series(v_now, v_now + greatest(1, least(p_count, 52)) - 1) as w(n)
  cross join lateral fil_rouge_picks_for(w.n) p
  join fil_rouge_category c on c.code = p.category
  order by w.n, c.sort_order;
end;
$$;

grant execute on function admin_fil_rouge_weeks(int) to authenticated;

-- Set one kind's pick for one week, with its notes; a null code clears it
-- back to the draw. Notes are {"fr": {"title": "…", "body": "…"}, "en": …};
-- a language with an empty body is removed. Past weeks are not rewritten:
-- dinners have already been laid on them.
create or replace function admin_set_fil_rouge_pick(
  p_week int,
  p_category text,
  p_code text,
  p_notes jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_locale text;
  v_note jsonb;
begin
  if not is_app_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  if p_week < fil_rouge_week(now()) then
    raise exception 'WEEK_IS_PAST';
  end if;

  delete from fil_rouge_note where week = p_week and category = p_category;

  if p_code is null or btrim(p_code) = '' then
    delete from fil_rouge_pick where week = p_week and category = p_category;
    return;
  end if;

  insert into fil_rouge_pick (week, category, code)
  values (p_week, p_category, p_code)
  on conflict (week, category) do update set code = excluded.code;

  for v_locale, v_note in select * from jsonb_each(coalesce(p_notes, '{}'::jsonb)) loop
    if coalesce(btrim(v_note ->> 'body'), '') <> '' then
      insert into fil_rouge_note (week, locale, category, title, body)
      values (p_week, v_locale, p_category, nullif(btrim(v_note ->> 'title'), ''), btrim(v_note ->> 'body'));
    end if;
  end loop;
end;
$$;

grant execute on function admin_set_fil_rouge_pick(int, text, text, jsonb) to authenticated;

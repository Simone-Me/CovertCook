-- Everybody is Crème, for now.
--
-- There is nothing for sale. Rather than tear PRO out — the catalogues, the
-- subscriptions, the hold on lapsed dinners, the redeem codes — it is switched
-- off at the one question every PRO check already goes through: is_pro(). With
-- app_settings.everyone_pro on, that question answers yes for every account,
-- so every theme, every list and every option is open, and no dinner can be
-- put on hold for a cover that ran out.
--
-- Putting a paid tier back is one statement:
--   update app_settings set everyone_pro = false where id;
-- and every function below falls back to exactly what it did before.

alter table app_settings
  add column if not exists everyone_pro boolean not null default true;

comment on column app_settings.everyone_pro is
  'While true, is_pro() is true for every account and no dinner lapses (0104). Set false to bring the paid tier back.';

create or replace function everyone_pro()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select everyone_pro from app_settings where id), false);
$$;

grant execute on function everyone_pro() to anon, authenticated;

-- 0081's definition, behind the switch.
create or replace function is_pro(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when everyone_pro() then true
    when pro_window_open()
      and (select pro_test_override from profiles where id = p_uid) = 'FORCE_ON'
      then true
    else exists (
      select 1 from pro_subscriptions s
      where s.profile_id = p_uid
        and s.cancelled_at is null
        and (s.expires_at is null or s.expires_at > now())
    )
  end;
$$;

-- 0079's definition, behind the switch. Null = cover that never runs out,
-- which is what everybody has while nothing is sold.
create or replace function pro_cover_until(p_uid uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when everyone_pro() then null
    when exists (
      select 1 from pro_subscriptions s
      where s.profile_id = p_uid and s.cancelled_at is null
        and (s.expires_at is null or s.expires_at > now())
    ) then (
      select case when s.expires_at is null then null else s.expires_at + pro_grace() end
      from pro_subscriptions s where s.profile_id = p_uid
    )
    when pro_window_open() then
      (select pro_open_until from app_settings where id) + pro_grace()
    else null
  end;
$$;

-- 0079's definition, behind the switch: no dinner is on hold while
-- everybody is Crème, whatever cover date it was created with.
create or replace function round_pro_lapsed(p_round_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select not everyone_pro() and coalesce((
    select r.is_pro
       and r.pro_until is not null
       and r.pro_until <= now()
       and round_uses_pro(p_round_id)
    from rounds r where r.id = p_round_id
  ), false);
$$;

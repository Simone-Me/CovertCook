-- ---------------------------------------------------------------------------
-- FIVE CLOTHS GO BACK TO THE WORKSHOP.
--
-- The five paid table themes are not finished, and until they are, nobody
-- should be able to lay a dinner on one — not a Crème account, not the author.
-- A dinner is planned days ahead and looked at by eight people; a cloth that
-- is going to change under it is worse than one that was never offered.
--
-- WITHDRAWN, NOT DELETED. Deleting the rows would take the shelf down with
-- them, and the shelf is doing a job: it is how somebody learns these exist at
-- all. A paused row stays on it, says what it is, and cannot be chosen — which
-- is also exactly what it will look like the day one of them is being redrawn
-- again, years from now.
--
-- ONE FLAG, BOTH CATALOGUES. Only cloths are paused today. The column goes on
-- both tables anyway because `theme_available` reads them through a union and
-- a rule that exists on one side of a union is a rule waiting to be forgotten
-- on the other.
-- ---------------------------------------------------------------------------

alter table name_theme_catalogue add column if not exists paused boolean not null default false;
alter table table_theme_catalogue add column if not exists paused boolean not null default false;

comment on column table_theme_catalogue.paused is
  'Withdrawn from the picker while it is being worked on. Still listed, never selectable — by anybody, Crème or not. Un-pausing is an UPDATE.';

update table_theme_catalogue set paused = true
where code in ('SCIFI', 'BAROQUE', 'HALLOWEEN', 'XMAS', 'CARNIVAL');

-- ---------------------------------------------------------------------------
-- The rule, in the one place it is written.
--
-- Ahead of ownership on purpose: somebody who has bought a cloth still cannot
-- lay a table with a half-finished one, and the alternative — honouring the
-- purchase and shipping the unfinished thing — is the wrong way round. Nothing
-- is taken away permanently; a dinner already using one keeps it, because
-- create_round is the only caller and a round is validated once.
-- ---------------------------------------------------------------------------

create or replace function theme_available(p_kind text, p_code text, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select not c.paused
            and (c.tier in ('DEFAULT', 'FREE')
                 or is_pro(p_uid)
                 or exists (
                   select 1 from profile_theme_unlocks u
                   where u.profile_id = p_uid and u.kind = p_kind and u.code = p_code
                 ))
     from (
       select code, tier, paused from name_theme_catalogue where p_kind = 'NAME_THEME'
       union all
       select code, tier, paused from table_theme_catalogue where p_kind = 'TABLE_THEME'
     ) c
     where c.code = p_code),
    false);
$$;

revoke all on function theme_available(text, text, uuid) from public;
grant execute on function theme_available(text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The shelves say so.
--
-- `owned` already meant "can I use this", which is what the picker locks on.
-- `paused` is carried beside it because the two are different sentences to a
-- reader: one is "buy it", the other is "not yet, come back". A row that says
-- the wrong one of those is a support question.
--
-- Dropped and recreated: the return types gain a column.
-- ---------------------------------------------------------------------------

drop function if exists list_name_themes();
drop function if exists list_table_themes();

create or replace function list_name_themes()
returns table (code text, tier text, price_cents int, mark text, owned boolean, paused boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.code, c.tier, c.price_cents, c.mark,
         theme_available('NAME_THEME', c.code, auth.uid()),
         c.paused
  from name_theme_catalogue c
  order by c.sort_order, c.code;
$$;

grant execute on function list_name_themes() to authenticated;

create or replace function list_table_themes()
returns table (code text, tier text, price_cents int, owned boolean, paused boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.code, c.tier, c.price_cents,
         theme_available('TABLE_THEME', c.code, auth.uid()),
         c.paused
  from table_theme_catalogue c
  order by c.sort_order, c.code;
$$;

grant execute on function list_table_themes() to authenticated;

-- ---------------------------------------------------------------------------
-- WHAT A CLIENT MAY READ AND WRITE, COLUMN BY COLUMN.
--
-- Row level security has been on for `rounds` and `profiles` since 0002, and
-- it answers "which rows". It never answered "which columns", and a tester
-- reading the REST API found three things that followed from that.
--
-- 1. THE SEALED THREAD WAS IN THE ROW. 0089 withholds a compass-drawn country
--    from everybody, the host included, until the dinner is dealt — through
--    the function that reads the thread. The value itself sits in
--    rounds.fil_rouge_code, and rounds_select_member hands the whole row to
--    every member: `select fil_rouge_code from rounds` broke the seal. The
--    app never selects that column (it asks the function), so the column is
--    simply no longer selectable by a client.
--
-- 2. A CO-MEMBER'S PROFILE SAID MORE THAN THEIR NAME. profiles_select_co_members
--    exists so a round can resolve display names. It gave out the whole row:
--    has_no_restrictions, which next to the deliberately anonymous dietary
--    panel can tell a table whose allergy it is ("everybody but Alex has
--    none"); notifications_enabled; deletion_requested_at; pro_test_override.
--    Others now get id, name, avatar, locale. Your own full row comes from
--    my_profile() instead of a select.
--
-- 3. DIRECT WRITES WERE WIDER THAN ANY SCREEN. The app writes rounds only
--    through security-definer functions, and profiles directly only for
--    `locale`. But rounds_update_host_only with a table-wide UPDATE grant let a
--    host set is_pro, pro_until, fil_rouge_sealed or status by hand from the
--    console. Rounds lose INSERT and UPDATE; profiles keep UPDATE on locale.
--
-- Security-definer functions run as their owner and are untouched by any of
-- this, which is why nothing in the app changes except the profile load.
--
-- A NEW COLUMN ON `rounds` OR `profiles` IS NOT SELECTABLE UNTIL GRANTED. That
-- is the point; it is also the thing to remember in the next migration that
-- adds one the client needs to read.
-- ---------------------------------------------------------------------------

-- 1. rounds ------------------------------------------------------------------

do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'rounds'
    and column_name not in ('fil_rouge_code');

  revoke select, insert, update, delete on rounds from anon, authenticated;
  execute format('grant select (%s) on rounds to authenticated', v_cols);
end;
$$;

-- 2. and 3. profiles ---------------------------------------------------------

revoke select, insert, update, delete on profiles from anon, authenticated;
grant select (id, display_name, avatar_url, locale, created_at) on profiles to authenticated;
grant update (locale) on profiles to authenticated;

create or replace function my_profile()
returns setof profiles
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select * from profiles where id = auth.uid();
$$;

comment on function my_profile() is
  'Your own profile row, whole. A select on profiles returns only the public columns, for yourself as for anybody (0109).';

revoke all on function my_profile() from public, anon;
grant execute on function my_profile() to authenticated;

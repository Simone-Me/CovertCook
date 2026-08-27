-- Smoke test 12: the album outliving its dinner (0061), and dinners deleting
-- themselves after 21 days (0062). Run after `npx supabase db reset`.
--
-- This is the one test in the set where the *survivors* are the point. The
-- deletion is easy; what has to be proved is the promise attached to it —
-- **everything worth keeping is already in the recipe book and the album** —
-- because if that is false, this feature destroys people's things.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000001201', 'olga@test.local'),
  ('00000000-0000-0000-0000-000000001202', 'piet@test.local'),
  ('00000000-0000-0000-0000-000000001203', 'rosa@test.local');

create or replace function _as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, false);
$$;

create or replace function _refusal(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'NO REFUSAL — this should not have been accepted';
exception when others then
  return sqlerrm;
end;
$$;

set role authenticated;

select _as('00000000-0000-0000-0000-000000001201');
select complete_signup('Olga', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000001202');
select complete_signup('Piet', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000001203');
select complete_signup('Rosa', 'en', true, '[]'::jsonb);

select _as('00000000-0000-0000-0000-000000001201');
select create_round('The Last Supper', 'CODE', 'ANONYMOUS', 'FREE', null, null, 'Europe/Paris', null, false, false, 'LIVE') as round_id \gset
select advance_phase(:'round_id'::uuid, 'OPEN');

reset role;
select join_code from rounds where id = :'round_id'::uuid \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t1 \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t2 \gset
set role authenticated;

select _as('00000000-0000-0000-0000-000000001202');
select join_round(:'join_code', :'t1'::uuid);
select _as('00000000-0000-0000-0000-000000001203');
select join_round(:'join_code', :'t2'::uuid);

select _as('00000000-0000-0000-0000-000000001201');
select advance_phase(:'round_id'::uuid, 'LOCKED');
select generate_assignment(:'round_id'::uuid);
select advance_phase(:'round_id'::uuid, 'ASSIGNED');

-- Three recipes, so there is something worth keeping.
select _as('00000000-0000-0000-0000-000000001201');
select save_brief_draft(:'round_id'::uuid, 'Panzanella', 'STARTER',
  '[{"name":"stale bread","quantity":200,"unit":"g"}]'::jsonb,
  'Soak the bread, tear it, and toss it with tomatoes and oil an hour before.',
  null, null, null, null, null, '{}', true);
select submit_brief(:'round_id'::uuid);
select _as('00000000-0000-0000-0000-000000001202');
select save_brief_draft(:'round_id'::uuid, 'Cacio e pepe', 'MAIN',
  '[{"name":"pecorino","quantity":150,"unit":"g"}]'::jsonb,
  'Toast the pepper, loosen the cheese with pasta water, and never let it boil.',
  null, null, null, null, null, '{}', true);
select submit_brief(:'round_id'::uuid);
select _as('00000000-0000-0000-0000-000000001203');
select save_brief_draft(:'round_id'::uuid, 'Affogato', 'DESSERT',
  '[{"name":"vanilla ice cream","quantity":2,"unit":"scoops"}]'::jsonb,
  'Pull the espresso last and pour it over the ice cream at the table.',
  null, null, null, null, null, '{}', true);
select submit_brief(:'round_id'::uuid);

select _as('00000000-0000-0000-0000-000000001201');
select advance_phase(:'round_id'::uuid, 'BRIEFS_CLOSED');
select advance_phase(:'round_id'::uuid, 'DINNER');

-- Two photographs, and Olga keeps every recipe.
select _as('00000000-0000-0000-0000-000000001201');
select record_photo(:'round_id'::uuid, :'round_id' || '/olga.jpg', 'All of it');
select _as('00000000-0000-0000-0000-000000001202');
select record_photo(:'round_id'::uuid, :'round_id' || '/piet.jpg');

select _as('00000000-0000-0000-0000-000000001201');
select advance_phase(:'round_id'::uuid, 'VOTING');
select advance_phase(:'round_id'::uuid, 'RESULTS');
select publish_results(:'round_id'::uuid);

reset role;
select array_agg(b.id) as all_briefs from briefs b
join pairings p on p.id = b.pairing_id where p.round_id = :'round_id'::uuid \gset
set role authenticated;
select _as('00000000-0000-0000-0000-000000001201');
select save_recipes(:'round_id'::uuid, :'all_briefs'::uuid[]) as olga_kept;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 1. finishing stamps the clock, once ==='
select advance_phase(:'round_id'::uuid, 'ARCHIVED');
reset role;
select finished_at is not null as stamped,
       round_deletes_at(finished_at) > now() + interval '20 days' as three_weeks_out
from rounds where id = :'round_id'::uuid;
set role authenticated;

\echo '--- and the dinner says so while it still exists (expect t) ---'
select _as('00000000-0000-0000-0000-000000001202');
select round_deletes_at(finished_at) is not null as piet_can_see_the_date
from rounds where id = :'round_id'::uuid;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 2. nothing goes before its time ==='
reset role;
\echo '--- run it today: expect 0 ---'
select purge_old_rounds(21);

\echo '--- and the dinner is still there (expect 1) ---'
select count(*) from rounds where id = :'round_id'::uuid;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 3. three weeks later it goes, freeze triggers and all ==='
-- 0054 refuses INSERT, UPDATE and DELETE on every table belonging to a frozen
-- round, so the cascade out of `delete from rounds` is exactly what this has to
-- get through. Backdating rather than waiting is the only difference from a
-- real run.
-- The test has to bend time, and bending time on a frozen dinner needs the same
-- door the purge uses. Said out loud rather than done by disabling a trigger,
-- because the point of the section below is that the door works.
begin;
select set_config('covertcook.purging', 'on', true);
update rounds set finished_at = now() - interval '22 days' where id = :'round_id'::uuid;
commit;

\echo '--- expect 1 purged ---'
select purge_old_rounds(21);

\echo '--- the dinner and its machinery are gone (expect 0, 0, 0, 0) ---'
select
  (select count(*) from rounds where id = :'round_id'::uuid) as rounds,
  (select count(*) from round_members where round_id = :'round_id'::uuid) as members,
  (select count(*) from pairings where round_id = :'round_id'::uuid) as pairings,
  (select count(*) from briefs b join pairings p on p.id = b.pairing_id where p.round_id = :'round_id'::uuid) as briefs;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 4. and the promise holds: the book is untouched ==='
set role authenticated;
select _as('00000000-0000-0000-0000-000000001201');
\echo '--- three recipes, still whole, with their ingredients (expect 3, all t) ---'
select count(*) as recipes,
       bool_and(jsonb_array_length(ingredients) > 0) as kept_ingredients,
       bool_and(procedure <> '') as kept_method
from list_my_recipes();

\echo '--- they know the dinner is gone, and still name it (expect f, and a name) ---'
select bool_or(origin_exists) as any_origin_left, min(round_name) as still_named
from list_my_recipes();

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 5. and the album keeps what it promised ==='
\echo '--- Olga keeps her own photograph, with the evening printed on it ---'
select count(*) as photos, bool_and(is_mine) as all_mine,
       bool_and(round_name <> '') as still_named,
       bool_or(dinner_exists) as any_dinner_left
from my_album();

\echo '--- Piet keeps his, and only his (expect 1, t) ---'
select _as('00000000-0000-0000-0000-000000001202');
select count(*) as photos, bool_and(is_mine) as all_mine from my_album();

\echo '--- Rosa added none and has none (expect 0) ---'
select _as('00000000-0000-0000-0000-000000001203');
select count(*) as photos from my_album();

\echo '--- and the bytes are still owned, so nothing is orphaned in the bucket ---'
reset role;
select count(*) as photo_rows, count(taken_by_profile_id) as still_owned,
       count(round_id) as still_attached
from dinner_photos;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 6. the door closes behind the purge ==='
-- The escape hatch is transaction-local. After the purge returns, a frozen
-- dinner must be as immovable as it was before.
set role authenticated;
select _as('00000000-0000-0000-0000-000000001201');
select create_round('Still Standing', 'CODE', 'ANONYMOUS', 'FREE', null, null, 'Europe/Paris', null, false, false, 'LIVE') as other \gset
reset role;
update rounds set status = 'ARCHIVED' where id = :'other'::uuid;
reset role;
\echo '--- a frozen dinner still refuses its own tables: expect the freeze message ---'
-- As the superuser on purpose: a refusal from RLS or a missing grant would
-- prove nothing about the freeze, and that is exactly what a client-role
-- attempt would have produced.
select _refusal(format(
  'insert into host_alerts (round_id, kind) values (%L::uuid, ''OTHER'')', :'other'));

\echo '--- and no client role may run the purge (expect f, f) ---'
reset role;
select
  has_function_privilege('anon', 'purge_old_rounds(int)', 'execute'),
  has_function_privilege('authenticated', 'purge_old_rounds(int)', 'execute');

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 7. joining without a captcha, and with one (0063) ==='
-- The default: no captcha configured, so no ticket and no Edge Function
-- anywhere in the path. This is the case that used to answer 503 and stop
-- anybody taking a seat.
set role authenticated;
select _as('00000000-0000-0000-0000-000000001201');
select create_round('Open Door', 'CODE', 'ANONYMOUS', 'FREE', null, null, 'Europe/Paris', null, false, false, 'LIVE') as door \gset
select advance_phase(:'door'::uuid, 'OPEN');
reset role;
select join_code as door_code from rounds where id = :'door'::uuid \gset
set role authenticated;

\echo '--- captcha_required is false out of the box (expect f) ---'
select captcha_required();

\echo '--- so a null ticket is accepted, and a seat is taken ---'
select _as('00000000-0000-0000-0000-000000001202');
select join_round(:'door_code', null) is not null as took_a_seat;

\echo '--- turn it on, and the same call is refused: expect CAPTCHA_REQUIRED ---'
reset role;
update app_settings set captcha_required = true where id;
set role authenticated;
select _as('00000000-0000-0000-0000-000000001203');
select _refusal(format('select join_round(%L, null)', :'door_code'));

\echo '--- with a real ticket it works again, and the ticket is burned ---'
reset role;
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'door_code') returning id as tk \gset
set role authenticated;
select _as('00000000-0000-0000-0000-000000001203');
select join_round(:'door_code', :'tk'::uuid) is not null as took_a_seat_with_a_ticket;

\echo '--- and a used ticket is not a second seat: expect a refusal ---'
select _refusal(format('select join_round(%L, %L::uuid)', :'door_code', :'tk'));

\echo '--- nobody may write the setting, only read it (expect f, f) ---'
reset role;
select
  has_table_privilege('anon', 'app_settings', 'update'),
  has_table_privilege('authenticated', 'app_settings', 'update');

\echo ''
\echo '=== smoke test 12 complete ==='

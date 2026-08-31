-- Smoke test 16: PRO, and the second idea.
-- Run after `npx supabase db reset`; self-contained.
--
-- WHAT THIS EXISTS TO CATCH.
--
--   * PRO is four different things wearing one name (a per-item unlock, a
--     subscription, a redeemed code, an open test window). The bug that would
--     hurt is any of them being asked the wrong question, so `is_pro` is
--     exercised from all four directions — including the one that must NOT
--     work: a test override that outlives the window that justified it.
--   * Codes are credentials. Every wrong code has to fail the same way, or the
--     refusal becomes an oracle for guessing the format of the right ones.
--   * The second recipe rests on a single load-bearing claim: exactly one
--     brief per pairing is SUBMITTED, so the eight downstream functions that
--     enumerate a round's dishes stay correct without being touched. That is
--     asserted here directly, against the menu, because a test of the flag
--     would only prove the flag.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000001601', 'dee@test.local'),
  ('00000000-0000-0000-0000-000000001602', 'eli@test.local'),
  ('00000000-0000-0000-0000-000000001603', 'fay@test.local');

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
select _as('00000000-0000-0000-0000-000000001601');
select complete_signup('Dee', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000001602');
select complete_signup('Eli', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000001603');
select complete_signup('Fay', 'en', true, '[]'::jsonb);

-- ---------------------------------------------------------------------------
-- 1. The open window, and the switch that lets you see past it.
-- ---------------------------------------------------------------------------

\echo '--- while the window is open, everybody is PRO (expect t)'
select _as('00000000-0000-0000-0000-000000001601');
select pro from my_pro_status();

\echo '--- and the switch shows what a free account sees (expect f)'
select set_pro_test_override('FORCE_OFF');
select pro from my_pro_status();

\echo '--- a paid theme is refused while pretending to be free (expect THEME_LOCKED)'
select _refusal($$select create_round('Pretending', 'CODE', 'ANONYMOUS', 'FREE', null, null,
  'Europe/Paris', null, false, false, 'LIVE', 'PASTA')$$);

\echo '--- and so is a second recipe (expect PRO_REQUIRED)'
select _refusal($$select create_round('Pretending', 'CODE', 'ANONYMOUS', 'FREE', null, null,
  'Europe/Paris', null, false, false, 'LIVE', 'FOOD', 'CHECKS', 2)$$);

select set_pro_test_override(null);

-- ---------------------------------------------------------------------------
-- 2. Codes.
-- ---------------------------------------------------------------------------

reset role;
-- Minted from the SQL editor, which is the only place it can be: the function
-- is granted to nobody, on purpose (see 0075).
select create_redeem_code('TESTER-01', 90, null, null, interval '24 hours', 1, 'a tester');
select create_redeem_code('STALE-01', 90, null, null, interval '-1 hour', 1, 'already dead');
set role authenticated;

\echo '--- every wrong code fails the same way (expect INVALID_CODE three times)'
select _as('00000000-0000-0000-0000-000000001602');
select _refusal($$select redeem_code('NO-SUCH-CODE')$$);
select _refusal($$select redeem_code('STALE-01')$$);
select _refusal($$select redeem_code('')$$);

\echo '--- a good one, in the wrong case and with stray spaces, works (expect PRO)'
select redeem_code('  tester-01  ');

-- Named rather than swallowed into INVALID_CODE, and it is the one exception
-- to the uniform-refusal rule: a person who already spent this code needs to
-- be told so, or they retype it and conclude the feature is broken.
\echo '--- and cannot be spent twice by the same person (expect ALREADY_REDEEMED)'
select _refusal($$select redeem_code('TESTER-01')$$);

\echo '--- nor by anybody else, because it was single use (expect INVALID_CODE)'
select _as('00000000-0000-0000-0000-000000001603');
select _refusal($$select redeem_code('TESTER-01')$$);

-- ---------------------------------------------------------------------------
-- 3. The window shuts. The subscription survives it; the override does not.
--
-- This is the assertion the whole test exists for: FORCE_ON must not be a way
-- to be PRO for free once the free-for-all is over.
-- ---------------------------------------------------------------------------

reset role;
update app_settings set pro_open_until = now() - interval '1 day' where id;
set role authenticated;

\echo '--- Eli redeemed 90 days, so Eli is still PRO (expect t, source CODE)'
select _as('00000000-0000-0000-0000-000000001602');
select pro, source from my_pro_status();

\echo '--- Fay redeemed nothing (expect f)'
select _as('00000000-0000-0000-0000-000000001603');
select pro from my_pro_status();

\echo '--- and cannot switch themselves on (expect TEST_WINDOW_CLOSED)'
select _refusal($$select set_pro_test_override('FORCE_ON')$$);

\echo '--- even with the flag already set from before, it grants nothing (expect f)'
reset role;
update profiles set pro_test_override = 'FORCE_ON' where id = '00000000-0000-0000-0000-000000001603';
set role authenticated;
select _as('00000000-0000-0000-0000-000000001603');
select pro from my_pro_status();

reset role;
update app_settings set pro_open_until = now() + interval '90 days' where id;
update profiles set pro_test_override = null;
set role authenticated;

-- ---------------------------------------------------------------------------
-- 4. A dinner carries its host's PRO to everybody at it.
-- ---------------------------------------------------------------------------

select _as('00000000-0000-0000-0000-000000001601');
select create_round('Three Ideas', 'CODE', 'ANONYMOUS', 'FREE', null, null,
                    'Europe/Paris', null, false, false, 'LIVE', 'FOOD', 'CHECKS', 3) as r \gset
select advance_phase(:'r'::uuid, 'OPEN');
select join_code from rounds where id = :'r'::uuid \gset

select _as('00000000-0000-0000-0000-000000001602');
select join_round(:'join_code', null);
select _as('00000000-0000-0000-0000-000000001603');
select join_round(:'join_code', null);

select _as('00000000-0000-0000-0000-000000001601');
select advance_phase(:'r'::uuid, 'LOCKED');
select generate_assignment(:'r'::uuid);
select advance_phase(:'r'::uuid, 'ASSIGNED');

\echo '--- the dinner is stamped PRO and asks for three (expect t, 3)'
reset role;
select is_pro, recipes_per_brief from rounds where id = :'r'::uuid;
set role authenticated;

-- ---------------------------------------------------------------------------
-- 5. Writing two, sending once.
-- ---------------------------------------------------------------------------

\echo '--- a fourth slot does not exist (expect RECIPE_SLOT_UNAVAILABLE)'
select _as('00000000-0000-0000-0000-000000001601');
select _refusal(format($$select save_brief_draft(%L::uuid, 'Nope', 'MAIN', '[]'::jsonb,
  null, null, null, null, null, null, '{}'::text[], true, 4)$$, :'r'));

\echo '--- two ideas for the same cook'
select save_brief_draft(:'r'::uuid, 'Pasta alla Norma', 'MAIN',
  '[{"name":"aubergine","quantity":2,"unit":""}]'::jsonb,
  'Fry the aubergine until it gives up, then fold it through the sauce and the pasta.',
  null, null, null, null, null, '{}'::text[], true, 1);
select save_brief_draft(:'r'::uuid, 'Ribollita', 'MAIN',
  '[{"name":"cavolo nero","quantity":1,"unit":"bunch"}]'::jsonb,
  'Yesterday''s bread, beans and cavolo nero, cooked twice and eaten with oil.',
  null, null, null, null, null, '{}'::text[], true, 2);

\echo '--- a half-written third is dropped rather than refused'
select save_brief_draft(:'r'::uuid, '', 'MAIN', '[]'::jsonb, '', null, null, null, null, null, '{}'::text[], true, 3);
select submit_brief(:'r'::uuid);

\echo '--- one press sent both, and exactly one of them is the dish (expect 1 SUBMITTED, 1 OFFERED)'
select status, count(*) from get_my_brief_draft(:'r'::uuid) group by status order by status::text;

-- ---------------------------------------------------------------------------
-- 6. The cook reads both and picks.
-- ---------------------------------------------------------------------------

reset role;
select cm.profile_id from pairings p join round_members cm on cm.id = p.cook_id
where p.round_id = :'r'::uuid and p.sender_id = (
  select id from round_members where round_id = :'r'::uuid
    and profile_id = '00000000-0000-0000-0000-000000001601') \gset cook_
set role authenticated;
select _as(:'cook_profile_id'::uuid);

\echo '--- the cook is offered both, with one marked as the dish (expect 2 rows, 1 chosen)'
select count(*) as offered, count(*) filter (where chosen) as chosen from get_my_brief(:'r'::uuid);

\echo '--- the menu shows one dish for that seat, not two (expect 1)'
reset role;
select count(*) as dishes_for_that_seat from briefs b
join pairings p on p.id = b.pairing_id
where p.round_id = :'r'::uuid and b.status = 'SUBMITTED'
  and p.sender_id = (select id from round_members where round_id = :'r'::uuid
                     and profile_id = '00000000-0000-0000-0000-000000001601');
set role authenticated;
select _as(:'cook_profile_id'::uuid);

\echo '--- the cook picks the other one'
select brief_id from get_my_brief(:'r'::uuid) where not chosen \gset other_
select choose_brief(:'other_brief_id'::uuid);

\echo '--- the swap happened and it is still exactly one dish (expect Ribollita, 1)'
reset role;
select b.dish_name, count(*) over () as dishes from briefs b
join pairings p on p.id = b.pairing_id
where p.round_id = :'r'::uuid and b.status = 'SUBMITTED'
  and p.sender_id = (select id from round_members where round_id = :'r'::uuid
                     and profile_id = '00000000-0000-0000-0000-000000001601');
set role authenticated;

\echo '--- the sender cannot choose for their cook'
select _as('00000000-0000-0000-0000-000000001601');
select brief_id from get_my_brief_draft(:'r'::uuid) where status = 'OFFERED' \gset back_
select _refusal(format($$select choose_brief(%L::uuid)$$, :'back_brief_id'));

\echo '--- and the choice shuts once the dinner is over (expect CHOICE_CLOSED)'
select _as('00000000-0000-0000-0000-000000001601');
select advance_phase(:'r'::uuid, 'DINNER');
select advance_phase(:'r'::uuid, 'VOTING');
select _as(:'cook_profile_id'::uuid);
select _refusal(format($$select choose_brief(%L::uuid)$$, :'back_brief_id'));

reset role;

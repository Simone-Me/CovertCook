-- Smoke test 8: what a recipe must contain (0055), and the push self-test
-- (0056). Run after `npx supabase db reset`; self-contained.
--
-- The bug this exists to keep dead: 0028 relaxed the submission rules in
-- `submit_brief` and left the old rule behind as an inline table check named
-- `briefs_check1`. Every recipe with a link and a short procedure passed the
-- function and was then refused by the table, and what the sender read was the
-- constraint's name. The first section below is that exact recipe.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000801', 'wanda@test.local'),
  ('00000000-0000-0000-0000-000000000802', 'xavier@test.local'),
  ('00000000-0000-0000-0000-000000000803', 'yannick@test.local');

create or replace function _as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, false);
$$;

-- Runs a call that is expected to fail and prints the code it failed with, so
-- the expected output of this file is a list of names rather than a stack of
-- Postgres errors that stop the script.
create or replace function _refusal(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'NO REFUSAL — this should not have been accepted';
exception when others then
  return sqlerrm;
end;
$$;

set role authenticated;

select _as('00000000-0000-0000-0000-000000000801');
select complete_signup('Wanda', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000000802');
select complete_signup('Xavier', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000000803');
select complete_signup('Yannick', 'en', false, '[{"kind":"ALLERGY_SEVERE","label":"shellfish"}]'::jsonb);

select _as('00000000-0000-0000-0000-000000000801');
select create_round('Recipe Rules', 'CODE', 'ANONYMOUS', 'FREE', null, null, 'Europe/Paris', null, false, false, 'LIVE') as round_id \gset
select advance_phase(:'round_id'::uuid, 'OPEN');

reset role;
select join_code from rounds where id = :'round_id'::uuid \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t1 \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t2 \gset
set role authenticated;

select _as('00000000-0000-0000-0000-000000000802');
select join_round(:'join_code', :'t1'::uuid);
select _as('00000000-0000-0000-0000-000000000803');
select join_round(:'join_code', :'t2'::uuid);

select _as('00000000-0000-0000-0000-000000000801');
select advance_phase(:'round_id'::uuid, 'LOCKED');
select generate_assignment(:'round_id'::uuid);
select advance_phase(:'round_id'::uuid, 'ASSIGNED');

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 1. a link and a short procedure: the recipe briefs_check1 refused ==='
select _as('00000000-0000-0000-0000-000000000801');
select save_brief_draft(:'round_id'::uuid, 'Tarte tatin', 'MAIN',
  '[]'::jsonb,
  'Follow the link.',
  'https://example.com/tarte-tatin',
  null, null, null, null, '{}', true);

\echo '--- expect: no output at all, i.e. accepted ---'
select submit_brief(:'round_id'::uuid);

reset role;
\echo '--- expect: SUBMITTED ---'
select b.status from briefs b
join pairings p on p.id = b.pairing_id
where p.round_id = :'round_id'::uuid and b.dish_name = 'Tarte tatin';
set role authenticated;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 2. every refusal names the field, never a constraint ==='
select _as('00000000-0000-0000-0000-000000000802');

\echo '--- no name: expect DISH_NAME_MISSING ---'
select save_brief_draft(:'round_id'::uuid, '', 'MAIN', '[]'::jsonb, '', null,
  null, null, null, null, '{}', true);
select _refusal(format('select submit_brief(%L::uuid)', :'round_id'));

\echo '--- a two-letter name: expect DISH_NAME_LENGTH ---'
select save_brief_draft(:'round_id'::uuid, 'Ah', 'MAIN', '[]'::jsonb, '', null,
  null, null, null, null, '{}', true);
select _refusal(format('select submit_brief(%L::uuid)', :'round_id'));

\echo '--- a name and nothing else: expect RECIPE_TOO_EMPTY ---'
select save_brief_draft(:'round_id'::uuid, 'Risotto', 'MAIN', '[]'::jsonb, '', null,
  null, null, null, null, '{}', true);
select _refusal(format('select submit_brief(%L::uuid)', :'round_id'));

\echo '--- ingredients but no method: expect PROCEDURE_MISSING ---'
select save_brief_draft(:'round_id'::uuid, 'Risotto', 'MAIN',
  '[{"name":"rice","quantity":300,"unit":"g"}]'::jsonb, '', null,
  null, null, null, null, '{}', true);
select _refusal(format('select submit_brief(%L::uuid)', :'round_id'));

\echo '--- a one-word method: expect PROCEDURE_TOO_SHORT ---'
select save_brief_draft(:'round_id'::uuid, 'Risotto', 'MAIN',
  '[{"name":"rice","quantity":300,"unit":"g"}]'::jsonb, 'Cook it.', null,
  null, null, null, null, '{}', true);
select _refusal(format('select submit_brief(%L::uuid)', :'round_id'));

\echo '--- a method but no list: expect INGREDIENTS_MISSING ---'
select save_brief_draft(:'round_id'::uuid, 'Risotto', 'MAIN', '[]'::jsonb,
  'Toast the rice, add the stock a ladle at a time, and stir until it is done.', null,
  null, null, null, null, '{}', true);
select _refusal(format('select submit_brief(%L::uuid)', :'round_id'));

\echo '--- a link with no scheme: expect LINK_MALFORMED, at draft time ---'
select _refusal(format(
  'select save_brief_draft(%L::uuid, %L, %L, %L::jsonb, %L, %L, null, null, null, null, ''{}'', true)',
  :'round_id', 'Risotto', 'MAIN', '[]', '', 'example.com/risotto'));

\echo '--- both halves written: expect no output, i.e. accepted ---'
select save_brief_draft(:'round_id'::uuid, 'Risotto', 'MAIN',
  '[{"name":"rice","quantity":300,"unit":"g"},{"name":"","quantity":null,"unit":null}]'::jsonb,
  'Toast the rice, add the stock a ladle at a time, and stir until it is done.', null,
  null, null, null, null, '{}', true);
select submit_brief(:'round_id'::uuid);

\echo '--- the blank ingredient line was dropped, not stored (expect 1) ---'
reset role;
select count(*) from brief_ingredients bi
join briefs b on b.id = bi.brief_id
join pairings p on p.id = b.pairing_id
where p.round_id = :'round_id'::uuid and b.dish_name = 'Risotto';
set role authenticated;

\echo '--- and it cannot be sent twice: expect ALREADY_SUBMITTED ---'
select _refusal(format('select submit_brief(%L::uuid)', :'round_id'));

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 3. the dietary block still blocks, and now says what it hit ==='
select _as('00000000-0000-0000-0000-000000000803');
select save_brief_draft(:'round_id'::uuid, 'Bouillabaisse', 'MAIN',
  '[{"name":"mussels","quantity":500,"unit":"g"}]'::jsonb,
  'Simmer the shellfish in the broth with saffron until every shell has opened.', null,
  null, null, null, null, '{shellfish}', true);
\echo '--- expect DIETARY_CONFLICT|shellfish ---'
select _refusal(format('select submit_brief(%L::uuid)', :'round_id'));

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 4. the push self-test: my own devices, and nobody else''s (0056) ==='
reset role;
insert into push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent) values
  ('00000000-0000-0000-0000-000000000801', 'https://push.example/wanda-phone', 'k1', 'a1', 'phone'),
  ('00000000-0000-0000-0000-000000000801', 'https://push.example/wanda-laptop', 'k2', 'a2', 'laptop'),
  ('00000000-0000-0000-0000-000000000802', 'https://push.example/xavier-phone', 'k3', 'a3', 'phone');

\echo '--- expect exactly 2 rows, both Wanda''s ---'
select count(*) from push_audience_for_me('00000000-0000-0000-0000-000000000801');

\echo '--- the switch being off does not hide them: it is reported (expect f) ---'
set role authenticated;
select _as('00000000-0000-0000-0000-000000000801');
select set_notifications_enabled(false);
reset role;
select distinct notifications_enabled from push_audience_for_me('00000000-0000-0000-0000-000000000801');

\echo '--- neither client role may read it at all (expect f, f) ---'
select
  has_function_privilege('anon', 'push_audience_for_me(uuid)', 'execute'),
  has_function_privilege('authenticated', 'push_audience_for_me(uuid)', 'execute');

\echo '--- and the browser''s own question, which carries no keys (expect t, 1) ---'
set role authenticated;
select _as('00000000-0000-0000-0000-000000000801');
select this_device, devices - 1 as other_devices
from my_push_devices('https://push.example/wanda-phone');

\echo '--- an endpoint belonging to somebody else is not mine (expect f) ---'
select this_device from my_push_devices('https://push.example/xavier-phone');

reset role;
\echo ''
\echo '=== smoke test 8 complete ==='

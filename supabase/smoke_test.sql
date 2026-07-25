-- Functional smoke test for the full round lifecycle, run against the local
-- Supabase stack. Not part of the migrations; not applied in prod.
\set ON_ERROR_STOP on

-- four fake auth.users rows
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'alice@test.local'),
  ('00000000-0000-0000-0000-000000000002', 'bob@test.local'),
  ('00000000-0000-0000-0000-000000000003', 'carol@test.local'),
  ('00000000-0000-0000-0000-000000000004', 'dave@test.local');

create or replace function _as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, false);
$$;

set role authenticated;

select _as('00000000-0000-0000-0000-000000000001');
select complete_signup('Alice', 'fr', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000000002');
select complete_signup('Bob', 'fr', false, '[{"kind":"ALLERGY_SEVERE","label":"nuts"}]'::jsonb);
select _as('00000000-0000-0000-0000-000000000003');
select complete_signup('Carol', 'fr', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000000004');
select complete_signup('Dave', 'fr', true, '[]'::jsonb);

\echo '--- profiles ---'
table profiles;

-- Alice creates a round
select _as('00000000-0000-0000-0000-000000000001');
select create_round('Test Dinner', 'PRIVATE_CODE', 'ANONYMOUS', 'FREE', null, null, 'Europe/Paris', null, false, false) as round_id \gset

\echo '--- round ---'
select id, name, status, join_code, accent_color, accent_emoji from rounds;

-- host opens the round so others can join
select advance_phase(:'round_id'::uuid, 'OPEN');

select join_code from rounds where id = :'round_id'::uuid \gset

-- need a turnstile ticket per join (edge function would normally insert this)
reset role;
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t1 \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t2 \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t3 \gset
set role authenticated;

select _as('00000000-0000-0000-0000-000000000002');
select join_round(:'join_code', :'t1'::uuid);
select _as('00000000-0000-0000-0000-000000000003');
select join_round(:'join_code', :'t2'::uuid);
select _as('00000000-0000-0000-0000-000000000004');
select join_round(:'join_code', :'t3'::uuid);

\echo '--- round_members ---'
table round_members;

-- lock and assign
select _as('00000000-0000-0000-0000-000000000001');
select advance_phase(:'round_id'::uuid, 'LOCKED');
select generate_assignment(:'round_id'::uuid);
select advance_phase(:'round_id'::uuid, 'ASSIGNED');

\echo '--- pairings (peeking directly as postgres for the test only; app never does this) ---'
reset role;
select sender_id, cook_id, slot_id, lap from pairings where round_id = :'round_id'::uuid;
set role authenticated;

\echo '--- each sender writes and submits a brief ---'
select _as('00000000-0000-0000-0000-000000000001');
select save_brief_draft(:'round_id'::uuid, 'Soupe a loignon', 'STARTER', '[{"name":"onion","quantity":4,"unit":"pcs"}]'::jsonb, repeat('Chop and simmer the onions slowly until deeply caramelised, then finish with stock and cheese toast. ', 1), null, 2, '10€', 45, null, '{}', true);
select submit_brief(:'round_id'::uuid);

select _as('00000000-0000-0000-0000-000000000002');
select save_brief_draft(:'round_id'::uuid, 'Tarte aux pommes', 'DESSERT', '[{"name":"apples","quantity":6,"unit":"pcs"}]'::jsonb, repeat('Roll out the pastry, layer thin apple slices in a fan, brush with butter and sugar, bake until golden. ', 1), null, 1, '8€', 60, null, '{}', true);
select submit_brief(:'round_id'::uuid);

select _as('00000000-0000-0000-0000-000000000003');
select save_brief_draft(:'round_id'::uuid, 'Poulet roti', 'MAIN', '[{"name":"chicken","quantity":1,"unit":"whole"}]'::jsonb, repeat('Season the chicken generously, roast at high heat with root vegetables until the skin is crisp. ', 1), null, 2, '15€', 90, null, '{"nuts"}', true);

-- this one SHOULD fail: contains a tag that conflicts with Bob's severe allergy
\echo '--- expecting a hard-dietary-conflict error next ---'
select submit_brief(:'round_id'::uuid);

-- Smoke test 7: the board (0030/0031) and allergens informing rather than
-- blocking (0029). Run after `npx supabase db reset`; self-contained.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000501', 'tara@test.local'),
  ('00000000-0000-0000-0000-000000000502', 'umar@test.local'),
  ('00000000-0000-0000-0000-000000000503', 'vera@test.local');

create or replace function _as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, false);
$$;

set role authenticated;

select _as('00000000-0000-0000-0000-000000000501');
select complete_signup('Tara', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000000502');
select complete_signup('Umar', 'en', true, '[]'::jsonb);
-- Vera has a severe nut allergy: the dish below will contain nuts, and the
-- point of 0029 is that it gets served anyway, with everyone told.
select _as('00000000-0000-0000-0000-000000000503');
select complete_signup('Vera', 'en', false, '[{"kind":"ALLERGY_SEVERE","label":"nuts"}]'::jsonb);

select _as('00000000-0000-0000-0000-000000000501');
select create_round('Board Dinner', 'CODE', 'ANONYMOUS', 'FREE', null, null, 'Europe/Paris', null, false, false, 'LIVE') as round_id \gset
select advance_phase(:'round_id'::uuid, 'OPEN');

reset role;
select join_code from rounds where id = :'round_id'::uuid \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t1 \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t2 \gset
set role authenticated;

select _as('00000000-0000-0000-0000-000000000502');
select join_round(:'join_code', :'t1'::uuid);
select _as('00000000-0000-0000-0000-000000000503');
select join_round(:'join_code', :'t2'::uuid);

select _as('00000000-0000-0000-0000-000000000501');
select advance_phase(:'round_id'::uuid, 'LOCKED');
select generate_assignment(:'round_id'::uuid);
select advance_phase(:'round_id'::uuid, 'ASSIGNED');

-- ---------------------------------------------------------------------------
\echo '=== an allergen no longer blocks: it informs ==='
select _as('00000000-0000-0000-0000-000000000501');
select save_brief_draft(:'round_id'::uuid, 'Pesto genovese', 'MAIN',
  '[{"name":"pine nuts","quantity":50,"unit":"g"}]'::jsonb,
  'Blend the basil with the nuts and oil until smooth, then fold through the pasta.',
  null, null, null, null, null, '{nuts}', true);

\echo '--- this used to raise; expect it to succeed now ---'
select submit_brief(:'round_id'::uuid);

reset role;
\echo '--- the dish exists and is served (expect SUBMITTED, delivered t) ---'
select b.status, b.delivered from briefs b
join pairings p on p.id = b.pairing_id
where p.round_id = :'round_id'::uuid and b.dish_name = 'Pesto genovese';

\echo '--- and the Executive Chef was told, by dish and by allergen ---'
select payload->>'type' as alert_type, payload->>'dish_name' as dish, payload->'labels' as labels
from host_alerts where round_id = :'round_id'::uuid
  and payload->>'type' = 'ALLERGEN_ON_TABLE';
set role authenticated;

\echo '--- every diner can look it up, not only the host ---'
select _as('00000000-0000-0000-0000-000000000503');
select dish_name, labels from get_allergen_dishes(:'round_id'::uuid);

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== the board ==='
reset role;
select id as phrase from message_templates where category = 'BOARD' and locale = 'en' limit 1 \gset
select id as phrase2 from message_templates where category = 'BOARD' and locale = 'en' offset 1 limit 1 \gset
set role authenticated;

\echo '--- two chefs say the same thing; it collapses to one line with a count ---'
select _as('00000000-0000-0000-0000-000000000502');
select post_to_board(:'round_id'::uuid, :'phrase'::uuid);
select _as('00000000-0000-0000-0000-000000000503');
select post_to_board(:'round_id'::uuid, :'phrase'::uuid);
select post_to_board(:'round_id'::uuid, :'phrase2'::uuid);

select author_name, body from get_board(:'round_id'::uuid) order by author_name, body;

\echo '--- nothing in the result can say who wrote what ---'
\echo '--- (a pseudonym and a seat, never a name — and the seat is what lets a ---'
\echo '--- reported phrase be acted on without one: 0033 + 0059) ---'
-- pg_get_function_result, not information_schema.columns: a function is not a
-- table, so that query matched nothing and counted zero however the board was
-- shaped. An assertion that passes when the answer is right and passes when it
-- is wrong is not an assertion.
select pg_get_function_result('get_board(uuid)'::regprocedure) as what_it_returns;

\echo '--- but the author is on the row, so a report can be acted on ---'
reset role;
select count(*) as rows_with_author from round_messages
where round_id = :'round_id'::uuid and author_member_id is not null;
set role authenticated;

\echo '--- a thread phrase cannot be posted to the board ---'
reset role;
select id as thread_phrase from message_templates where category = 'THANKS' and locale = 'en' limit 1 \gset
set role authenticated;
do $$
declare v_id uuid := (select id from rounds where name = 'Board Dinner');
        v_tpl uuid := (select id from message_templates where category = 'THANKS' and locale = 'en' limit 1);
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000502', false);
  perform post_to_board(v_id, v_tpl);
  raise exception 'SMOKE FAIL: a private-thread phrase reached the board';
exception
  when others then
    if sqlerrm like 'SMOKE FAIL%' then raise; end if;
    raise notice 'correctly rejected: %', sqlerrm;
end $$;

\echo '--- reporting hides the phrase and tells the Executive Chef ---'
select _as('00000000-0000-0000-0000-000000000503');
select report_board_phrase(:'round_id'::uuid, (select body from message_templates where id = :'phrase2'::uuid));
select count(*) as board_lines_after_report from get_board(:'round_id'::uuid);

reset role;
select payload->>'type' as reported_type from host_alerts
where round_id = :'round_id'::uuid and kind = 'REPORTED_MESSAGE';

\echo 'SMOKE TEST 7 COMPLETE'

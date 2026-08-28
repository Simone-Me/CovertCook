-- Smoke test 10: moderation by seat (0059).
-- Run after `npx supabase db reset`; self-contained.
--
-- What this exists to prove, in one line each:
--
--   * the host is handed enough to act on and never a name;
--   * the one thing that does hand over a name refuses without a reason and
--     writes itself down when it does;
--   * a block actually blocks — the board and the door, in both directions;
--   * and the host, alone among everybody, gets told there is something
--     waiting.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000001001', 'hera@test.local'),
  ('00000000-0000-0000-0000-000000001002', 'iris@test.local'),
  ('00000000-0000-0000-0000-000000001003', 'jonas@test.local');

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

select _as('00000000-0000-0000-0000-000000001001');
select complete_signup('Hera', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000001002');
select complete_signup('Iris', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000001003');
select complete_signup('Jonas', 'en', true, '[]'::jsonb);

-- Hera hosts.
select _as('00000000-0000-0000-0000-000000001001');
select create_round('The Pass', 'CODE', 'ANONYMOUS', 'FREE', null, null, 'Europe/Paris', null, false, false, 'LIVE') as round_id \gset
select advance_phase(:'round_id'::uuid, 'OPEN');

reset role;
select join_code from rounds where id = :'round_id'::uuid \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t1 \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t2 \gset
set role authenticated;

select _as('00000000-0000-0000-0000-000000001002');
select join_round(:'join_code', :'t1'::uuid);
select _as('00000000-0000-0000-0000-000000001003');
select join_round(:'join_code', :'t2'::uuid);

select _as('00000000-0000-0000-0000-000000001001');
select advance_phase(:'round_id'::uuid, 'LOCKED');
select generate_assignment(:'round_id'::uuid);
select advance_phase(:'round_id'::uuid, 'ASSIGNED');

-- Iris writes to whoever she is cooking for, and Jonas reports it. Which
-- template does not matter; that it came from a seat does.
reset role;
select p.id as iris_pairing,
       p.sender_id as iris_seat
from pairings p
join round_members rm on rm.id = p.sender_id
where p.round_id = :'round_id'::uuid
  and rm.profile_id = '00000000-0000-0000-0000-000000001002' \gset
select id as tpl from message_templates where active limit 1 \gset
insert into messages (pairing_id, direction, template_id)
values (:'iris_pairing'::uuid, 'SENDER_TO_COOK', :'tpl'::uuid)
returning id as msg \gset
update messages set reported = true where id = :'msg'::uuid;
insert into host_alerts (round_id, kind, pairing_id, payload)
values (:'round_id'::uuid, 'REPORTED_MESSAGE', :'iris_pairing'::uuid, jsonb_build_object('message_id', :'msg'));
set role authenticated;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 1. the host reads the phrase and the seat, never the name ==='
select _as('00000000-0000-0000-0000-000000001001');
select author_secret_name is not null as has_pseudonym,
       author_member_id = :'iris_seat'::uuid as points_at_the_right_seat,
       already_warned
from get_reported_messages(:'round_id'::uuid);

\echo '--- and the whole function is the host''s alone ---'
select _as('00000000-0000-0000-0000-000000001003');
select _refusal(format('select * from get_reported_messages(%L::uuid)', :'round_id'));

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 2. a warning, delivered to a seat and read by a person ==='
select _as('00000000-0000-0000-0000-000000001001');
select warn_member(:'round_id'::uuid, :'iris_seat'::uuid, :'msg'::uuid, 'Keep it civil, chef.');

\echo '--- the host sees it has been sent (expect t) ---'
select already_warned from get_reported_messages(:'round_id'::uuid);

\echo '--- Iris reads it, and nobody else can (expect 1 then 0) ---'
select _as('00000000-0000-0000-0000-000000001002');
select count(*) as iris_sees from my_warnings(:'round_id'::uuid);
select _as('00000000-0000-0000-0000-000000001003');
select count(*) as jonas_sees from my_warnings(:'round_id'::uuid);

\echo '--- and once read it stops asking (expect 0) ---'
select _as('00000000-0000-0000-0000-000000001002');
select id as warning from my_warnings(:'round_id'::uuid) limit 1 \gset
select acknowledge_warning(:'warning'::uuid);
select count(*) as still_waiting from my_warnings(:'round_id'::uuid);

\echo '--- only the host may warn: expect a refusal ---'
select _as('00000000-0000-0000-0000-000000001003');
select _refusal(format('select warn_member(%L::uuid, %L::uuid, null, null)', :'round_id', :'iris_seat'));

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 3. the reveal: refused without a reason, recorded with one ==='
select _as('00000000-0000-0000-0000-000000001001');
\echo '--- no reason: expect REVEAL_NEEDS_A_REASON ---'
select _refusal(format('select reveal_message_author(%L::uuid, %L)', :'msg', '   '));

\echo '--- with one: expect the name ---'
select reveal_message_author(:'msg'::uuid, 'She has been asked twice and it continued.');

\echo '--- and it wrote itself down (expect 1) ---'
reset role;
select count(*) as reveals_logged from audit_log
where round_id = :'round_id'::uuid and action = 'AUTHOR_REVEALED';
set role authenticated;

\echo '--- a message nobody reported cannot be revealed ---'
reset role;
insert into messages (pairing_id, direction, template_id)
values (:'iris_pairing'::uuid, 'SENDER_TO_COOK', :'tpl'::uuid) returning id as quiet_msg \gset
set role authenticated;
select _as('00000000-0000-0000-0000-000000001001');
select _refusal(format('select reveal_message_author(%L::uuid, %L)', :'quiet_msg', 'curiosity'));

\echo '--- and a player cannot reveal at all ---'
select _as('00000000-0000-0000-0000-000000001003');
select _refusal(format('select reveal_message_author(%L::uuid, %L)', :'msg', 'curiosity'));

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 4. blocking, at the board and at the door ==='
reset role;
select id as iris_board_seat from round_members
where round_id = :'round_id'::uuid and profile_id = '00000000-0000-0000-0000-000000001002' \gset
insert into round_messages (round_id, author_member_id, template_id)
values (:'round_id'::uuid, :'iris_board_seat'::uuid, :'tpl'::uuid);
set role authenticated;

select _as('00000000-0000-0000-0000-000000001003');
\echo '--- Jonas sees Iris on the board (expect 1) ---'
select count(*) as before_block from get_board(:'round_id'::uuid);

select block_member(:'iris_board_seat'::uuid);
\echo '--- and after blocking her, does not (expect 0) ---'
select count(*) as after_block from get_board(:'round_id'::uuid);

\echo '--- the block is his to read, and lists a name (expect Iris) ---'
select display_name from list_my_blocks();

\echo '--- Iris is told nothing: her own list is empty (expect 0) ---'
select _as('00000000-0000-0000-0000-000000001002');
select count(*) as iris_blocks from list_my_blocks();

\echo '--- and the dinner under way is untouched: she is still seated (expect ACTIVE) ---'
reset role;
select status from round_members
where round_id = :'round_id'::uuid and profile_id = '00000000-0000-0000-0000-000000001002';
set role authenticated;

\echo '--- the door, in the direction Iris did not choose: expect BLOCKED_AT_THIS_TABLE ---'
select _as('00000000-0000-0000-0000-000000001003');
select create_round('Jonas Dinner', 'CODE', 'ANONYMOUS', 'FREE', null, null, 'Europe/Paris', null, false, false, 'LIVE') as jonas_round \gset
select advance_phase(:'jonas_round'::uuid, 'OPEN');
reset role;
select join_code as jonas_code from rounds where id = :'jonas_round'::uuid \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'jonas_code') returning id as t3 \gset
set role authenticated;
select _as('00000000-0000-0000-0000-000000001002');
select _refusal(format('select join_round(%L, %L::uuid)', :'jonas_code', :'t3'));

\echo '--- blocking yourself is not a thing: expect CANNOT_BLOCK_YOURSELF ---'
reset role;
select id as own_seat from round_members
where round_id = :'round_id'::uuid and profile_id = '00000000-0000-0000-0000-000000001002' \gset
set role authenticated;
select _as('00000000-0000-0000-0000-000000001002');
select _refusal(format('select block_member(%L::uuid)', :'own_seat'));

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 5. the host is told, and nobody else is ==='
select _as('00000000-0000-0000-0000-000000001001');
\echo '--- Hera has alerts waiting on her dinner (expect 1 row) ---'
select round_name, open_alerts > 0 as something_waiting from my_open_alerts();

\echo '--- Jonas hosts a dinner with nothing waiting (expect 0 rows) ---'
select _as('00000000-0000-0000-0000-000000001003');
select count(*) as jonas_alerts from my_open_alerts();

\echo '--- the push audience is the host and only the host ---'
reset role;
insert into push_subscriptions (profile_id, endpoint, p256dh, auth) values
  ('00000000-0000-0000-0000-000000001001', 'https://push.example/hera', 'k1', 'a1'),
  ('00000000-0000-0000-0000-000000001003', 'https://push.example/jonas', 'k3', 'a3');
\echo '--- a member reporting reaches the host: expect 1 ---'
select count(*) from push_audience_for_round_host(:'round_id'::uuid, '00000000-0000-0000-0000-000000001003');
\echo '--- the host''s own doing reaches nobody: expect 0 ---'
select count(*) from push_audience_for_round_host(:'round_id'::uuid, '00000000-0000-0000-0000-000000001001');
\echo '--- and a stranger cannot make the phone ring: expect 0 ---'
select count(*) from push_audience_for_round_host(:'jonas_round'::uuid, '00000000-0000-0000-0000-000000001002');
\echo '--- neither client role may read it at all (expect f, f) ---'
select
  has_function_privilege('anon', 'push_audience_for_round_host(uuid,uuid)', 'execute'),
  has_function_privilege('authenticated', 'push_audience_for_round_host(uuid,uuid)', 'execute');

\echo ''
\echo '=== smoke test 10 complete ==='

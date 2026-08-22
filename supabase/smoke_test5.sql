-- Smoke test 5: remove_member's two modes (0016_removal_mode.sql).
--
-- Deliberately deterministic where smoke_test3 was not. smoke_test3 only
-- reached the crashing branch when a random Sattolo assignment happened to
-- put a submitted brief opposite an unsubmitted one, which is why it failed
-- roughly one run in three. Here the chain is read back after assignment
-- and the submitting member is chosen from it, so the branch is exercised
-- every time.
--
-- Run after `npx supabase db reset`; self-contained.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000301', 'mona@test.local'),
  ('00000000-0000-0000-0000-000000000302', 'nils@test.local'),
  ('00000000-0000-0000-0000-000000000303', 'olga@test.local'),
  ('00000000-0000-0000-0000-000000000304', 'pavel@test.local');

create or replace function _as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, false);
$$;

set role authenticated;

select _as('00000000-0000-0000-0000-000000000301');
select complete_signup('Mona', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000000302');
select complete_signup('Nils', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000000303');
select complete_signup('Olga', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000000304');
select complete_signup('Pavel', 'en', true, '[]'::jsonb);

select _as('00000000-0000-0000-0000-000000000301');
select create_round('Removal Dinner', 'CODE', 'ANONYMOUS', 'FREE', null, null, 'Europe/Paris', null, false, false, 'LIVE') as round_id \gset
select advance_phase(:'round_id'::uuid, 'OPEN');

reset role;
select join_code from rounds where id = :'round_id'::uuid \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t1 \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t2 \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t3 \gset
set role authenticated;

select _as('00000000-0000-0000-0000-000000000302');
select join_round(:'join_code', :'t1'::uuid);
select _as('00000000-0000-0000-0000-000000000303');
select join_round(:'join_code', :'t2'::uuid);
select _as('00000000-0000-0000-0000-000000000304');
select join_round(:'join_code', :'t3'::uuid);

select _as('00000000-0000-0000-0000-000000000301');
select advance_phase(:'round_id'::uuid, 'LOCKED');
select generate_assignment(:'round_id'::uuid);
select advance_phase(:'round_id'::uuid, 'ASSIGNED');

\echo '=== read the chain back, so the test does not depend on the random shuffle ==='
reset role;
-- X = a non-host member who will submit and then leave.
-- A = X's sender, who will deliberately NOT submit. That combination is the
-- branch that used to abort with a duplicate-key error.
select m.id as x_id, m.profile_id as x_profile
from round_members m
join rounds r on r.id = m.round_id
join pairings p on p.round_id = r.id and p.assignment_version = r.assignment_version and p.sender_id = m.id
where m.round_id = :'round_id'::uuid and m.role = 'PLAYER' and m.status = 'ACTIVE'
limit 1 \gset

select p.sender_id as a_id, p.cook_id as b_id
from pairings p join rounds r on r.id = p.round_id
where p.round_id = :'round_id'::uuid and p.assignment_version = r.assignment_version
  and p.cook_id = :'x_id'::uuid \gset

select p.cook_id as x_cooks_for
from pairings p join rounds r on r.id = p.round_id
where p.round_id = :'round_id'::uuid and p.assignment_version = r.assignment_version
  and p.sender_id = :'x_id'::uuid \gset
set role authenticated;

\echo '=== X submits a brief; A deliberately does not ==='
select _as(:'x_profile'::uuid);
select save_brief_draft(:'round_id'::uuid, 'Gratin dauphinois', 'MAIN', '[{"name":"potato","quantity":8,"unit":"pcs"}]'::jsonb, repeat('Slice the potatoes thin, layer with cream and garlic, bake slowly until the top browns. ', 1), null, 2, '9EUR', 70, null, '{}', true);
select submit_brief(:'round_id'::uuid);

\echo '=== COLLAPSE: this is the branch that used to crash ==='
select _as('00000000-0000-0000-0000-000000000301');
select remove_member(:'round_id'::uuid, :'x_id'::uuid, false, 'COLLAPSE');

reset role;
\echo '--- X is gone from the roster (expect REMOVED) ---'
select status as x_status_expect_removed from round_members where id = :'x_id'::uuid;

\echo '--- the chain is one link shorter and still a valid permutation ---'
\echo '--- (expect: every sender appears once, every cook appears once) ---'
select count(*) as pairings_expect_3,
       count(distinct sender_id) as distinct_senders_expect_3,
       count(distinct cook_id) as distinct_cooks_expect_3
from pairings p join rounds r on r.id = p.round_id
where p.round_id = :'round_id'::uuid and p.assignment_version = r.assignment_version;

\echo '--- X departed but their finished brief survived, credited to X ---'
select (original_sender_id = :'x_id'::uuid) as brief_still_credited_to_x_expect_t
from pairings p join rounds r on r.id = p.round_id
where p.round_id = :'round_id'::uuid and p.assignment_version = r.assignment_version
  and p.sender_id = :'a_id'::uuid;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== LEAVE mode: a second round, nothing is rewired ==='
set role authenticated;
select _as('00000000-0000-0000-0000-000000000301');
select create_round('Leave Dinner', 'CODE', 'ANONYMOUS', 'FREE', null, null, 'Europe/Paris', null, false, false, 'LIVE') as r2 \gset
select advance_phase(:'r2'::uuid, 'OPEN');

reset role;
select join_code as c2 from rounds where id = :'r2'::uuid \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'c2') returning id as u1 \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'c2') returning id as u2 \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'c2') returning id as u3 \gset
set role authenticated;

select _as('00000000-0000-0000-0000-000000000302');
select join_round(:'c2', :'u1'::uuid);
select _as('00000000-0000-0000-0000-000000000303');
select join_round(:'c2', :'u2'::uuid);
select _as('00000000-0000-0000-0000-000000000304');
select join_round(:'c2', :'u3'::uuid);

select _as('00000000-0000-0000-0000-000000000301');
select advance_phase(:'r2'::uuid, 'LOCKED');
select generate_assignment(:'r2'::uuid);
select advance_phase(:'r2'::uuid, 'ASSIGNED');

reset role;
select m.id as y_id, m.profile_id as y_profile
from round_members m
where m.round_id = :'r2'::uuid and m.role = 'PLAYER' and m.status = 'ACTIVE'
limit 1 \gset

select p.sender_id as c_id
from pairings p join rounds r on r.id = p.round_id
where p.round_id = :'r2'::uuid and p.assignment_version = r.assignment_version
  and p.cook_id = :'y_id'::uuid \gset

select p.profile_id as c_profile from round_members p where p.id = :'c_id'::uuid \gset
set role authenticated;

\echo '=== C writes a brief for Y; then Y drops out and the host chooses LEAVE ==='
select _as(:'c_profile'::uuid);
select save_brief_draft(:'r2'::uuid, 'Ratatouille', 'MAIN', '[{"name":"aubergine","quantity":2,"unit":"pcs"}]'::jsonb, repeat('Dice everything evenly, stew the vegetables separately, then bring them together at the end. ', 1), null, 2, '7EUR', 55, null, '{}', true);
select submit_brief(:'r2'::uuid);

select _as('00000000-0000-0000-0000-000000000301');
select remove_member(:'r2'::uuid, :'y_id'::uuid, false, 'LEAVE');

reset role;
\echo '--- Y is off the roster ---'
select status as y_status_expect_removed from round_members where id = :'y_id'::uuid;

\echo '--- but the chain is untouched: still 4 links, nothing rewired ---'
select count(*) as pairings_expect_4 from pairings p join rounds r on r.id = p.round_id
where p.round_id = :'r2'::uuid and p.assignment_version = r.assignment_version;

\echo '--- and C''s orphaned dish is excluded from voting, not silently listed ---'
select delivered as orphaned_brief_delivered_expect_f
from briefs b join pairings p on p.id = b.pairing_id
where p.round_id = :'r2'::uuid and p.cook_id = :'y_id'::uuid;

\echo '--- the host was told, rather than left to notice ---'
select payload->>'type' as alert_expect_dish_orphaned
from host_alerts where round_id = :'r2'::uuid order by created_at desc limit 1;

\echo 'SMOKE TEST 5 COMPLETE'

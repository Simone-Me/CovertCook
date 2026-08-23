-- Smoke test 4: get_pending_members (0015_pending_member_identity.sql).
-- Covers the three things that make it worth existing at all — the host
-- can read a waiting member's real name, a non-host cannot call it, and
-- approving a member drops them from the result (from then on they are
-- their secret name to everyone). Run after `npx supabase db reset`;
-- self-contained, does not depend on the other smoke tests having run.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000201', 'judy@test.local'),
  ('00000000-0000-0000-0000-000000000202', 'karl@test.local'),
  ('00000000-0000-0000-0000-000000000203', 'lena@test.local');

create or replace function _as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, false);
$$;

set role authenticated;

select _as('00000000-0000-0000-0000-000000000201');
select complete_signup('Judy Hostface', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000000202');
select complete_signup('Karl Waiting', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000000203');
select complete_signup('Lena Waiting', 'en', true, '[]'::jsonb);

\echo '=== host creates an approval-required round and opens it ==='
select _as('00000000-0000-0000-0000-000000000201');
select create_round('Approval Dinner', 'CODE', 'ANONYMOUS', 'FREE', null, null, 'Europe/Paris', null, false, true, 'LIVE') as round_id \gset
select advance_phase(:'round_id'::uuid, 'OPEN');

reset role;
select join_code from rounds where id = :'round_id'::uuid \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t1 \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t2 \gset
set role authenticated;

\echo '=== two players request a seat; neither is approved yet ==='
select _as('00000000-0000-0000-0000-000000000202');
select join_round(:'join_code', :'t1'::uuid) as karl_member_id \gset
select _as('00000000-0000-0000-0000-000000000203');
select join_round(:'join_code', :'t2'::uuid) as lena_member_id \gset

\echo '=== the point of the fix: pending profiles are unreadable as a plain read ==='
\echo '--- expect 0: profiles_select_co_members needs BOTH sides approved ---'
select _as('00000000-0000-0000-0000-000000000201');
select count(*) as readable_pending_profiles_expect_0
from profiles p
join round_members m on m.profile_id = p.id
where m.round_id = :'round_id'::uuid and not m.approved;

\echo '--- but the host-only RPC returns them, real names and all (expect Karl + Lena) ---'
select real_name, joined_day from get_pending_members(:'round_id'::uuid) order by real_name;

\echo '=== a non-host member cannot call it ==='
select _as('00000000-0000-0000-0000-000000000202');
do $$
declare
  v_round_id uuid := (select id from rounds where name = 'Approval Dinner');
begin
  perform 1 from get_pending_members(v_round_id);
  raise exception 'SMOKE FAIL: a non-host was allowed to read pending members';
exception
  when others then
    if sqlerrm like 'SMOKE FAIL%' then raise; end if;
    raise notice 'correctly rejected: %', sqlerrm;
end $$;

\echo '=== approving Karl drops him from the list; Lena still waiting ==='
select _as('00000000-0000-0000-0000-000000000201');
select approve_member(:'round_id'::uuid, :'karl_member_id'::uuid);
select real_name as still_pending_expect_lena_only from get_pending_members(:'round_id'::uuid);

\echo '--- and Karl is now addressed by secret name, like everyone else ---'
select secret_name like 'Chef %' as karl_has_secret_name_expect_t
from round_members where id = :'karl_member_id'::uuid;

\echo '=== rejecting Lena empties the list ==='
select reject_member(:'round_id'::uuid, :'lena_member_id'::uuid);
select count(*) as pending_after_reject_expect_0 from get_pending_members(:'round_id'::uuid);

\echo 'SMOKE TEST 4 COMPLETE'

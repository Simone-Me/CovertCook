-- Smoke test 6: round setup — phase 1 of the redesign.
-- Covers the new access/voting_mode configuration (0018), SPY anonymity
-- (0017 + 0018's get_member_identities) and in-app invitations (0019).
-- Run after `npx supabase db reset`; self-contained.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000401', 'quinn@test.local'),
  ('00000000-0000-0000-0000-000000000402', 'rosa@test.local'),
  ('00000000-0000-0000-0000-000000000403', 'sami@test.local');

create or replace function _as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, false);
$$;

set role authenticated;

select _as('00000000-0000-0000-0000-000000000401');
select complete_signup('Quinn Host', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000000402');
select complete_signup('Rosa Guest', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000000403');
select complete_signup('Sami Guest', 'en', true, '[]'::jsonb);

-- ---------------------------------------------------------------------------
\echo '=== voting_mode drives the phase machine through a generated column ==='
select _as('00000000-0000-0000-0000-000000000401');
select create_round('Timed Dinner', 'CODE', 'ANONYMOUS', 'FREE', null, null, 'Europe/Paris', null, false, false, 'TIMED') as timed_id \gset
select create_round('Quiet Dinner', 'CODE', 'ANONYMOUS', 'FREE', null, null, 'Europe/Paris', null, false, false, 'DISABLED') as quiet_id \gset

reset role;
\echo '--- TIMED still counts as voting-on for advance_phase (expect t) ---'
select voting_mode, voting_enabled as expect_t from rounds where id = :'timed_id'::uuid;
\echo '--- DISABLED is the only mode that turns it off (expect f) ---'
select voting_mode, voting_enabled as expect_f from rounds where id = :'quiet_id'::uuid;

\echo '--- voting_enabled is derived, not stored: it cannot drift ---'
do $$
begin
  update rounds set voting_enabled = true where name = 'Quiet Dinner';
  raise exception 'SMOKE FAIL: a generated column accepted a direct write';
exception
  when others then
    if sqlerrm like 'SMOKE FAIL%' then raise; end if;
    raise notice 'correctly rejected: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== SPY: the host sees real names, and only in a SPY round ==='
set role authenticated;
select _as('00000000-0000-0000-0000-000000000401');
select create_round('Spy Dinner', 'CODE', 'SPY', 'FREE', null, null, 'Europe/Paris', null, false, false, 'LIVE') as spy_id \gset
select advance_phase(:'spy_id'::uuid, 'OPEN');

reset role;
select join_code as spy_code from rounds where id = :'spy_id'::uuid \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'spy_code') returning id as st1 \gset
set role authenticated;

select _as('00000000-0000-0000-0000-000000000402');
select join_round(:'spy_code', :'st1'::uuid);

\echo '--- host sees both members by real name (expect Quinn + Rosa) ---'
select _as('00000000-0000-0000-0000-000000000401');
select real_name from get_member_identities(:'spy_id'::uuid) order by real_name;

\echo '--- a player cannot call it, even in a SPY round ---'
select _as('00000000-0000-0000-0000-000000000402');
do $$
declare v_id uuid := (select id from rounds where name = 'Spy Dinner');
begin
  perform 1 from get_member_identities(v_id);
  raise exception 'SMOKE FAIL: a non-host read the identity map';
exception
  when others then
    if sqlerrm like 'SMOKE FAIL%' then raise; end if;
    raise notice 'correctly rejected: %', sqlerrm;
end $$;

\echo '--- and the host of a non-SPY round cannot reach it at all ---'
select _as('00000000-0000-0000-0000-000000000401');
do $$
declare v_id uuid := (select id from rounds where name = 'Timed Dinner');
begin
  perform 1 from get_member_identities(v_id);
  raise exception 'SMOKE FAIL: identity map readable on a non-SPY round';
exception
  when others then
    if sqlerrm like 'SMOKE FAIL%' then raise; end if;
    raise notice 'correctly rejected: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== invitations: no code, no email, just a row the invitee sees ==='
select _as('00000000-0000-0000-0000-000000000401');
select create_round('Invite Dinner', 'INVITE', 'ANONYMOUS', 'FREE', null, null, 'Europe/Paris', null, false, false, 'LIVE') as inv_id \gset
select advance_phase(:'inv_id'::uuid, 'OPEN');

\echo '--- a typo is reported, not silently swallowed ---'
do $$
declare v_id uuid := (select id from rounds where name = 'Invite Dinner');
begin
  perform invite_member(v_id, 'rosaa@test.local');
  raise exception 'SMOKE FAIL: an unknown address was accepted';
exception
  when others then
    if sqlerrm like 'SMOKE FAIL%' then raise; end if;
    raise notice 'correctly rejected: %', sqlerrm;
end $$;

\echo '--- address matching ignores case and stray spaces ---'
select invite_member(:'inv_id'::uuid, '  ROSA@Test.Local  ') as rosa_inv \gset
select invite_member(:'inv_id'::uuid, 'sami@test.local') as sami_inv \gset

\echo '--- Rosa sees it, with the round name she could not otherwise read ---'
select _as('00000000-0000-0000-0000-000000000402');
select round_name, accent_emoji is not null as has_accent from get_my_invitations();

\echo '--- someone uninvolved sees nothing ---'
select _as('00000000-0000-0000-0000-000000000401');
select count(*) as host_inbox_expect_0 from get_my_invitations();

\echo '--- Rosa accepts: she is a seated member immediately, no approval ---'
select _as('00000000-0000-0000-0000-000000000402');
select respond_to_invitation(:'rosa_inv'::uuid, true) as rosa_member \gset

reset role;
select approved as rosa_approved_expect_t, secret_name like 'Chef %' as rosa_named_expect_t
from round_members where id = :'rosa_member'::uuid;

\echo '--- Sami declines: no member row, and the invitation is spent ---'
set role authenticated;
select _as('00000000-0000-0000-0000-000000000403');
select respond_to_invitation(:'sami_inv'::uuid, false);
select count(*) as sami_inbox_expect_0 from get_my_invitations();

reset role;
select count(*) as sami_member_rows_expect_0 from round_members m
join rounds r on r.id = m.round_id
where r.name = 'Invite Dinner' and m.profile_id = '00000000-0000-0000-0000-000000000403';

\echo '--- an answered invitation cannot be answered twice ---'
set role authenticated;
do $$
declare v_inv uuid := (select i.id from round_invitations i join rounds r on r.id = i.round_id
                       where r.name = 'Invite Dinner' and i.responded_at is not null limit 1);
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000403', false);
  perform respond_to_invitation(v_inv, true);
  raise exception 'SMOKE FAIL: an invitation was answered twice';
exception
  when others then
    if sqlerrm like 'SMOKE FAIL%' then raise; end if;
    raise notice 'correctly rejected: %', sqlerrm;
end $$;

\echo '--- and inviting someone already at the table is refused ---'
select _as('00000000-0000-0000-0000-000000000401');
do $$
declare v_id uuid := (select id from rounds where name = 'Invite Dinner');
begin
  perform invite_member(v_id, 'rosa@test.local');
  raise exception 'SMOKE FAIL: an existing member was invited again';
exception
  when others then
    if sqlerrm like 'SMOKE FAIL%' then raise; end if;
    raise notice 'correctly rejected: %', sqlerrm;
end $$;

\echo 'SMOKE TEST 6 COMPLETE'

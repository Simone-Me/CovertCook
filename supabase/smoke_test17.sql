-- Smoke test 17: no vote is a choice, and PRO cover runs out with a grace.
-- Run after `npx supabase db reset`; self-contained.
--
-- WHAT THIS EXISTS TO CATCH.
--
--   * "No voting" was a one-way door for no reason anybody had written down
--     (0043, 0045). Taking a refusal OUT is the change most likely to be
--     quietly undone by somebody re-adding a guard that looks protective, so
--     the reversal is asserted here in both directions — and so are the two
--     guards that were always doing the real work and must survive: a vote
--     cannot be reshaped once ballots exist, nor once the results are in.
--   * The PRO hold has one way to be badly wrong and it is not "it failed to
--     block": it is blocking a dinner that has nothing to do with PRO. On the
--     day the free-for-all ends, every dinner ever created during it is
--     stamped is_pro — and a rule keyed only on the host's subscription would
--     stop all of them at once. So the test that matters most here is the
--     ordinary dinner that keeps working.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000001701', 'gil@test.local'),
  ('00000000-0000-0000-0000-000000001702', 'hana@test.local'),
  ('00000000-0000-0000-0000-000000001703', 'ivo@test.local');

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
select _as('00000000-0000-0000-0000-000000001701');
select complete_signup('Gil', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000001702');
select complete_signup('Hana', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000001703');
select complete_signup('Ivo', 'en', true, '[]'::jsonb);

-- ---------------------------------------------------------------------------
-- 1. A dinner that said no to voting can say yes.
-- ---------------------------------------------------------------------------

select _as('00000000-0000-0000-0000-000000001701');
select create_round('No Vote At All', 'CODE', 'ANONYMOUS', 'FREE', null, null,
                    'Europe/Paris', null, false, false, 'DISABLED') as r \gset
select advance_phase(:'r'::uuid, 'OPEN');
select join_code from rounds where id = :'r'::uuid \gset

select _as('00000000-0000-0000-0000-000000001702');
select join_round(:'join_code', null);
select _as('00000000-0000-0000-0000-000000001703');
select join_round(:'join_code', null);

select _as('00000000-0000-0000-0000-000000001701');
select advance_phase(:'r'::uuid, 'LOCKED');
select generate_assignment(:'r'::uuid);
select advance_phase(:'r'::uuid, 'ASSIGNED');

-- All three write, so there is something to vote on later. A ballot needs
-- dishes, and a dish somebody else cooks.
do $$
declare
  v_round uuid := (select id from rounds where name = 'No Vote At All');
  v_uid uuid;
begin
  foreach v_uid in array array[
    '00000000-0000-0000-0000-000000001701'::uuid,
    '00000000-0000-0000-0000-000000001702'::uuid,
    '00000000-0000-0000-0000-000000001703'::uuid
  ]
  loop
    perform set_config('request.jwt.claim.sub', v_uid::text, false);
    perform save_brief_draft(v_round, 'Ribollita', 'MAIN',
      '[{"name":"cavolo nero","quantity":1,"unit":"bunch"}]'::jsonb,
      'Yesterday''s bread, beans and cavolo nero, cooked twice and eaten with oil.',
      null, null, null, null, null, '{}'::text[], true, 1);
    perform submit_brief(v_round);
  end loop;
end $$;

select _as('00000000-0000-0000-0000-000000001701');
select advance_phase(:'r'::uuid, 'DINNER');

\echo '--- voteless to begin with (expect DISABLED, voting_enabled f)'
reset role;
select voting_mode, voting_enabled from rounds where id = :'r'::uuid;
set role authenticated;

\echo '--- the table changed its mind, and the door opens'
select _as('00000000-0000-0000-0000-000000001701');
select set_voting_mode(:'r'::uuid, 'LIVE');

\echo '--- voting_enabled followed by itself — it is generated (expect LIVE, t)'
reset role;
select voting_mode, voting_enabled from rounds where id = :'r'::uuid;
set role authenticated;

\echo '--- and the phase machine now lets the round into VOTING'
select _as('00000000-0000-0000-0000-000000001701');
select advance_phase(:'r'::uuid, 'VOTING');
reset role;
select status from rounds where id = :'r'::uuid;
set role authenticated;

\echo '--- back the other way too: voting off again, mid-dinner'
select _as('00000000-0000-0000-0000-000000001701');
select advance_phase(:'r'::uuid, 'DINNER');
select set_voting_mode(:'r'::uuid, 'DISABLED');
reset role;
select voting_mode from rounds where id = :'r'::uuid;
set role authenticated;

-- ---------------------------------------------------------------------------
-- 2. The guards that were always doing the real work still do it.
-- ---------------------------------------------------------------------------

select _as('00000000-0000-0000-0000-000000001701');
select set_voting_mode(:'r'::uuid, 'LIVE');
select advance_phase(:'r'::uuid, 'VOTING');

-- Hana ranks every dish she is eligible for — a ballot has to be complete
-- (0009), which is the rule that makes a Borda count mean anything.
select _as('00000000-0000-0000-0000-000000001702');
select submit_ballot(
  :'r'::uuid,
  (select jsonb_agg(jsonb_build_object('brief_id', o.brief_id, 'rank', o.rn))
   from (select brief_id, row_number() over (order by brief_id) as rn
         from get_ballot_options(:'r'::uuid)) o)
);

\echo '--- a ballot exists, so the method is settled (expect VOTES_ALREADY_CAST)'
select _as('00000000-0000-0000-0000-000000001701');
select _refusal(format('select set_voting_mode(%L::uuid, %L)', :'r', 'DISABLED'));

\echo '--- and once the results are in, likewise (expect VOTE_ALREADY_CLOSED)'
select skip_voting(:'r'::uuid);
select _refusal(format('select set_voting_mode(%L::uuid, %L)', :'r', 'TIMED'));

-- ---------------------------------------------------------------------------
-- 3. PRO cover: an ordinary dinner is never held.
--
-- THE MOST IMPORTANT ASSERTION IN THIS FILE. Everything below it is about a
-- dinner that deserves to stop; this one is about the thousands that do not.
-- ---------------------------------------------------------------------------

select _as('00000000-0000-0000-0000-000000001701');
select create_round('Just A Dinner', 'CODE', 'ANONYMOUS', 'FREE', null, null,
                    'Europe/Paris', null, false, false, 'LIVE') as plain \gset

\echo '--- stamped PRO by the open window, but using nothing PRO (expect t, f)'
reset role;
select is_pro, round_uses_pro(:'plain'::uuid) from rounds where id = :'plain'::uuid;

\echo '--- so when the cover runs out it is NOT held (expect f)'
update rounds set pro_until = now() - interval '10 days' where id = :'plain'::uuid;
select round_pro_lapsed(:'plain'::uuid);

\echo '--- and it still moves'
set role authenticated;
select _as('00000000-0000-0000-0000-000000001701');
select advance_phase(:'plain'::uuid, 'OPEN');
reset role;
select status from rounds where id = :'plain'::uuid;
set role authenticated;

-- ---------------------------------------------------------------------------
-- 4. A dinner built on PRO, past its grace, stops.
-- ---------------------------------------------------------------------------

select _as('00000000-0000-0000-0000-000000001701');
select create_round('Three Ideas', 'CODE', 'ANONYMOUS', 'FREE', null, null,
                    'Europe/Paris', null, false, false, 'LIVE', 'FOOD', 'CHECKS', 3) as pr \gset

\echo '--- it uses PRO, and its cover has an end (expect t, t)'
reset role;
select round_uses_pro(:'pr'::uuid), pro_until is not null from rounds where id = :'pr'::uuid;

\echo '--- inside the grace it is not held (expect f)'
update rounds set pro_until = now() + interval '1 hour' where id = :'pr'::uuid;
select round_pro_lapsed(:'pr'::uuid);

\echo '--- past it, it is (expect t)'
update rounds set pro_until = now() - interval '1 minute' where id = :'pr'::uuid;
select round_pro_lapsed(:'pr'::uuid);

\echo '--- and the dinner will not move (expect PRO_LAPSED)'
set role authenticated;
select _as('00000000-0000-0000-0000-000000001701');
select _refusal(format('select advance_phase(%L::uuid, %L)', :'pr', 'OPEN'));

\echo '--- but calling it off is always allowed — nobody is trapped'
select create_round('Doomed', 'CODE', 'ANONYMOUS', 'FREE', null, null,
                    'Europe/Paris', null, false, false, 'LIVE', 'FOOD', 'CHECKS', 2) as doomed \gset
reset role;
update rounds set pro_until = now() - interval '1 minute' where id = :'doomed'::uuid;
set role authenticated;
select _as('00000000-0000-0000-0000-000000001701');
select advance_phase(:'doomed'::uuid, 'CANCELLED');
reset role;
select status from rounds where id = :'doomed'::uuid;
set role authenticated;

-- ---------------------------------------------------------------------------
-- 5. Renewing releases it, in the same breath.
-- ---------------------------------------------------------------------------

reset role;
select create_redeem_code('RENEW-01', 365, null, null, interval '24 hours', 1, 'a year');
set role authenticated;

\echo '--- the code puts the cover back and the hold lifts (expect PRO, then f)'
select _as('00000000-0000-0000-0000-000000001701');
select redeem_code('RENEW-01');
reset role;
select round_pro_lapsed(:'pr'::uuid);

\echo '--- and the dinner moves again'
set role authenticated;
select _as('00000000-0000-0000-0000-000000001701');
select advance_phase(:'pr'::uuid, 'OPEN');
reset role;
select status from rounds where id = :'pr'::uuid;
set role authenticated;

\echo '--- the cover is the subscription plus the grace, to the hour (expect 72)'
reset role;
select round(extract(epoch from (r.pro_until - s.expires_at)) / 3600)::int as grace_hours
from rounds r join pro_subscriptions s on s.profile_id = r.host_id
where r.id = :'pr'::uuid;

reset role;

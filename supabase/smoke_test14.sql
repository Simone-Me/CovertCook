-- Smoke test 14: the results reach the table, not only the Executive Chef.
-- Run after `npx supabase db reset`; self-contained.
--
-- WHAT THIS EXISTS TO CATCH, because it went to production and nobody saw it:
-- `get_results` lets the host through unconditionally and everybody else only
-- once `results_are_public` says so (0025). That is right. What was wrong lived
-- in the interface: the control that publishes was rendered for `LIVE` rounds
-- only, so a hand-counted dinner had no way to answer the question the server
-- was asking. The host counted the hands, opened the results, saw them — hosts
-- bypass the gate — and had no reason to think anything was missing. Everybody
-- else got a refusal, on the last screen of the evening.
--
-- The bug was in React and the proof has to be in SQL, because SQL is where the
-- rule lives: the gate is real, the host does bypass it, and `publish_results`
-- is the only thing that opens it for a MANUAL round short of archiving. A test
-- that asserts those three facts is one somebody has to read before deciding
-- again which modes get a publish button.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000001401', 'wren@test.local'),
  ('00000000-0000-0000-0000-000000001402', 'yusuf@test.local'),
  ('00000000-0000-0000-0000-000000001403', 'zoe@test.local');

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

select _as('00000000-0000-0000-0000-000000001401');
select complete_signup('Wren', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000001402');
select complete_signup('Yusuf', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000001403');
select complete_signup('Zoe', 'en', true, '[]'::jsonb);

-- A dinner that counts its votes by hand: no ballots, no deadline, nothing that
-- opens the results by itself.
select _as('00000000-0000-0000-0000-000000001401');
select create_round('Hands In The Air', 'CODE', 'ANONYMOUS', 'FREE', null, null, 'Europe/Paris', null, false, false, 'MANUAL') as round_id \gset
select advance_phase(:'round_id'::uuid, 'OPEN');

reset role;
select join_code from rounds where id = :'round_id'::uuid \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t1 \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t2 \gset
set role authenticated;

select _as('00000000-0000-0000-0000-000000001402');
select join_round(:'join_code', :'t1'::uuid);
select _as('00000000-0000-0000-0000-000000001403');
select join_round(:'join_code', :'t2'::uuid);

select _as('00000000-0000-0000-0000-000000001401');
select advance_phase(:'round_id'::uuid, 'LOCKED');
select generate_assignment(:'round_id'::uuid);
select advance_phase(:'round_id'::uuid, 'ASSIGNED');

select _as('00000000-0000-0000-0000-000000001401');
select save_brief_draft(:'round_id'::uuid, 'Bagna cauda', 'STARTER',
  '[{"name":"anchovies","quantity":100,"unit":"g"}]'::jsonb,
  'Melt the anchovies into the garlic and oil over the lowest heat you have.',
  null, null, null, null, null, '{}', true);
select submit_brief(:'round_id'::uuid);
select _as('00000000-0000-0000-0000-000000001402');
select save_brief_draft(:'round_id'::uuid, 'Vitello tonnato', 'MAIN',
  '[{"name":"veal","quantity":600,"unit":"g"}]'::jsonb,
  'Poach the veal, cool it whole, slice it thin and blanket it in the sauce.',
  null, null, null, null, null, '{}', true);
select submit_brief(:'round_id'::uuid);
select _as('00000000-0000-0000-0000-000000001403');
select save_brief_draft(:'round_id'::uuid, 'Bonet', 'DESSERT',
  '[{"name":"amaretti","quantity":12,"unit":"pcs"}]'::jsonb,
  'Blend the amaretti into the custard and bake it in a bain-marie until set.',
  null, null, null, null, null, '{}', true);
select submit_brief(:'round_id'::uuid);

select _as('00000000-0000-0000-0000-000000001401');
select advance_phase(:'round_id'::uuid, 'BRIEFS_CLOSED');
select advance_phase(:'round_id'::uuid, 'DINNER');
select advance_phase(:'round_id'::uuid, 'VOTING');
select advance_phase(:'round_id'::uuid, 'RESULTS');

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 1. a hand-counted dinner does not open its results by itself ==='
reset role;
\echo '--- nothing has published them (expect f, and a null date) ---'
select results_are_public(r.*) as public_yet, results_published_at
from rounds r where r.id = :'round_id'::uuid;
set role authenticated;

\echo '--- the host sees them, because the host bypasses the gate (expect 3) ---'
select _as('00000000-0000-0000-0000-000000001401');
select count(*) as dishes_the_host_sees from get_results(:'round_id'::uuid);

-- THE WHOLE BUG, IN ONE PAIR OF LINES. The host's screen looked finished and
-- everybody else's was a refusal, and nothing on the host's screen said so.
\echo '--- and nobody else does: expect RESULTS_NOT_PUBLISHED ---'
select _as('00000000-0000-0000-0000-000000001402');
select _refusal(format('select * from get_results(%L::uuid)', :'round_id'));
select _as('00000000-0000-0000-0000-000000001403');
select _refusal(format('select * from get_results(%L::uuid)', :'round_id'));

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 2. publishing is what opens them, and it is the host''s alone ==='
\echo '--- a guest cannot publish: expect a refusal ---'
select _refusal(format('select publish_results(%L::uuid)', :'round_id'));

select _as('00000000-0000-0000-0000-000000001401');
select publish_results(:'round_id'::uuid);

reset role;
\echo '--- now they are public (expect t, and a date) ---'
select results_are_public(r.*) as public_yet, results_published_at is not null as stamped
from rounds r where r.id = :'round_id'::uuid;
set role authenticated;

\echo '--- and the table can read the evening (expect 3 each) ---'
select _as('00000000-0000-0000-0000-000000001402');
select count(*) as yusuf_sees from get_results(:'round_id'::uuid);
select _as('00000000-0000-0000-0000-000000001403');
select count(*) as zoe_sees from get_results(:'round_id'::uuid);

\echo '--- publishing twice keeps the first date, so a second press is harmless ---'
select _as('00000000-0000-0000-0000-000000001401');
reset role;
select results_published_at as first_stamp from rounds where id = :'round_id'::uuid \gset
set role authenticated;
select _as('00000000-0000-0000-0000-000000001401');
select publish_results(:'round_id'::uuid);
reset role;
select results_published_at = :'first_stamp'::timestamptz as unchanged
from rounds where id = :'round_id'::uuid;
set role authenticated;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 3. the recipe book is behind the same gate, and follows it ==='
-- 0058 asks `results_are_public` twice, and it has to: the one call in this app
-- that reads somebody else's brief cannot open before the evening does.
\echo '--- Zoe can now see the dishes worth keeping (expect 3) ---'
select _as('00000000-0000-0000-0000-000000001403');
select count(*) as savable from list_round_recipes(:'round_id'::uuid);

reset role;
\echo ''
\echo '=== smoke test 14 complete ==='

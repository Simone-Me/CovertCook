-- Smoke test 3: the backend pieces that only just got a frontend in this
-- pass (0014's get_my_brief_draft/pairing_id/host_alerts, plus
-- exclusion_pairs/slots direct CRUD, splice_member, set_pairing,
-- remove_member post-assignment) — previously validated only by code
-- review, now exercised end to end. Run after `npx supabase db reset`;
-- self-contained, does not depend on smoke_test.sql/smoke_test2.sql having
-- run first.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000101', 'erin@test.local'),
  ('00000000-0000-0000-0000-000000000102', 'frank@test.local'),
  ('00000000-0000-0000-0000-000000000103', 'grace@test.local'),
  ('00000000-0000-0000-0000-000000000104', 'heidi@test.local'),
  ('00000000-0000-0000-0000-000000000105', 'ivan@test.local');

create or replace function _as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, false);
$$;

set role authenticated;

select _as('00000000-0000-0000-0000-000000000101');
select complete_signup('Erin', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000000102');
select complete_signup('Frank', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000000103');
select complete_signup('Grace', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000000104');
select complete_signup('Heidi', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000000105');
select complete_signup('Ivan', 'en', true, '[]'::jsonb);

\echo '=== CATEGORIES slot mode: host configures courses before assignment ==='
select _as('00000000-0000-0000-0000-000000000101');
select create_round('Categories Dinner', 'PRIVATE_CODE', 'ANONYMOUS', 'CATEGORIES', null, null, 'Europe/Paris', null, false, true, true) as round_id \gset
select advance_phase(:'round_id'::uuid, 'OPEN');

reset role;
select join_code from rounds where id = :'round_id'::uuid \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t1 \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t2 \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t3 \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t4 \gset
set role authenticated;

select _as('00000000-0000-0000-0000-000000000102');
select join_round(:'join_code', :'t1'::uuid) as frank_member_id \gset
select _as('00000000-0000-0000-0000-000000000103');
select join_round(:'join_code', :'t2'::uuid) as grace_member_id \gset

-- Heidi and Ivan join now, during OPEN (join_round only works then), but
-- the host will only approve+splice them in later, one at a time, to set
-- up legitimate splice_member scenarios after assignment already exists.
select _as('00000000-0000-0000-0000-000000000104');
select join_round(:'join_code', :'t3'::uuid) as heidi_member_id \gset
select _as('00000000-0000-0000-0000-000000000105');
select join_round(:'join_code', :'t4'::uuid) as ivan_member_id \gset

select _as('00000000-0000-0000-0000-000000000101');
select approve_member(:'round_id'::uuid, :'frank_member_id'::uuid);
select approve_member(:'round_id'::uuid, :'grace_member_id'::uuid);

\echo '--- exclusion_pairs: host can configure, direct table access, canonical ordering ---'
select id as erin_member_id from round_members where round_id = :'round_id'::uuid and profile_id = '00000000-0000-0000-0000-000000000101' \gset
insert into exclusion_pairs (round_id, member_a, member_b)
select :'round_id'::uuid, least(:'erin_member_id'::uuid, :'frank_member_id'::uuid), greatest(:'erin_member_id'::uuid, :'frank_member_id'::uuid);
select count(*) as exclusion_count from exclusion_pairs where round_id = :'round_id'::uuid;
delete from exclusion_pairs where round_id = :'round_id'::uuid; -- don't actually constrain the 3-person assignment below

\echo '--- exclusion_pairs: a non-host cannot insert (RLS with-check violation) ---'
select _as('00000000-0000-0000-0000-000000000102');
do $$
declare
  v_round_id uuid := (select id from rounds where name = 'Categories Dinner');
begin
  begin
    insert into exclusion_pairs (round_id, member_a, member_b)
    select v_round_id, least(sm.id, cm.id), greatest(sm.id, cm.id)
    from round_members sm, round_members cm
    where sm.round_id = v_round_id and sm.profile_id = '00000000-0000-0000-0000-000000000101'::uuid
      and cm.round_id = v_round_id and cm.profile_id = '00000000-0000-0000-0000-000000000102'::uuid;
    raise exception 'SHOULD HAVE FAILED: non-host inserted an exclusion pair';
  exception when insufficient_privilege then
    raise notice 'OK non-host exclusion insert correctly rejected: %', sqlerrm;
  end;
end $$;

\echo '--- CATEGORIES slots: host adds exactly 3 courses (matching 3 active approved players) ---'
select _as('00000000-0000-0000-0000-000000000101');
insert into slots (round_id, course) values (:'round_id'::uuid, 'STARTER');
insert into slots (round_id, course) values (:'round_id'::uuid, 'MAIN');
insert into slots (round_id, course) values (:'round_id'::uuid, 'DESSERT');
select count(*) as slot_count from slots where round_id = :'round_id'::uuid;

select advance_phase(:'round_id'::uuid, 'LOCKED');
select generate_assignment(:'round_id'::uuid);
select advance_phase(:'round_id'::uuid, 'ASSIGNED');

\echo '=== get_my_brief_draft: sender can read back their own draft ==='
select _as('00000000-0000-0000-0000-000000000101');
select save_brief_draft(:'round_id'::uuid, 'Tomato soup', 'STARTER', '[{"name":"tomato","quantity":4,"unit":"pcs"}]'::jsonb, repeat('Simmer tomatoes with garlic and basil until soft, then blend until smooth and season to taste. ', 1), null, 1, '5€', 30, null, '{}', true);
select brief_id, status, dish_name from get_my_brief_draft(:'round_id'::uuid);
select submit_brief(:'round_id'::uuid);
select status from get_my_brief_draft(:'round_id'::uuid);

\echo '=== get_my_brief now returns pairing_id (needed for the Cook''s chat thread) ==='
-- whoever Erin is sending to must be BRIEFS_CLOSED+ to read it via get_my_brief;
-- fast-forward the round to check the column shape once briefs close.
select _as('00000000-0000-0000-0000-000000000102');
select save_brief_draft(:'round_id'::uuid, 'Pasta', 'MAIN', '[{"name":"pasta","quantity":500,"unit":"g"}]'::jsonb, repeat('Boil pasta, toss with olive oil, garlic and chilli flakes until glossy and fragrant. ', 1), null, 1, '5€', 20, null, '{}', true);
select submit_brief(:'round_id'::uuid);
select _as('00000000-0000-0000-0000-000000000103');
select save_brief_draft(:'round_id'::uuid, 'Chocolate cake', 'DESSERT', '[{"name":"chocolate","quantity":200,"unit":"g"}]'::jsonb, repeat('Melt chocolate and butter, fold in eggs and sugar, bake until just set in the centre. ', 1), null, 1, '6€', 40, null, '{}', true);
select submit_brief(:'round_id'::uuid);

select _as('00000000-0000-0000-0000-000000000101');
select advance_phase(:'round_id'::uuid, 'BRIEFS_CLOSED');
select pairing_id, dish_name from get_my_brief(:'round_id'::uuid);

\echo '=== host_alerts: CANNOT_COOK message creates an alert; host can resolve it, others cannot ==='
select _as('00000000-0000-0000-0000-000000000102');
select pairing_id from get_my_brief(:'round_id'::uuid) \gset
select id as tpl_id from message_templates where category = 'CANNOT_COOK' and locale = 'en' limit 1 \gset
select send_message(:'pairing_id'::uuid, :'tpl_id'::uuid, null);

select _as('00000000-0000-0000-0000-000000000101');
select count(*) as open_alerts from host_alerts where round_id = :'round_id'::uuid and resolved_at is null;
select id as alert_id from host_alerts where round_id = :'round_id'::uuid and resolved_at is null limit 1 \gset

-- Frank has no SELECT visibility into host_alerts at all (host-only RLS),
-- so his update matches zero rows silently -- confirmed by "UPDATE 0"
-- below, not by re-querying as Frank (he'd just get zero rows back, which
-- proves nothing on its own).
select _as('00000000-0000-0000-0000-000000000102');
update host_alerts set resolved_at = now() where id = :'alert_id'::uuid;

select _as('00000000-0000-0000-0000-000000000101');
select resolved_at is null as still_unresolved_after_non_host_attempt from host_alerts where id = :'alert_id'::uuid;
update host_alerts set resolved_at = now() where id = :'alert_id'::uuid;
select resolved_at is not null as resolved_by_host from host_alerts where id = :'alert_id'::uuid;

\echo '=== splice_member: Heidi approved after assignment, spliced into the chain ==='
select approve_member(:'round_id'::uuid, :'heidi_member_id'::uuid);

-- every brief in this round is already SUBMITTED (checked above), so
-- splice must refuse without explicit confirmation first -- this is
-- exactly the SPLICE_REQUIRES_CONFIRMATION path ChainPage.tsx catches and
-- re-prompts for.
do $$
declare
  v_round_id uuid := (select id from rounds where name = 'Categories Dinner');
  v_heidi_member_id uuid := (
    select id from round_members
    where round_id = (select id from rounds where name = 'Categories Dinner')
      and profile_id = '00000000-0000-0000-0000-000000000104'::uuid
  );
begin
  begin
    perform splice_member(v_round_id, v_heidi_member_id, false);
    raise exception 'SHOULD HAVE FAILED: splice without confirmation went through';
  exception when others then
    if sqlerrm <> 'SPLICE_REQUIRES_CONFIRMATION' then
      raise exception 'wrong error for unconfirmed splice: %', sqlerrm;
    end if;
    raise notice 'OK splice correctly required confirmation: %', sqlerrm;
  end;
end $$;

select splice_member(:'round_id'::uuid, :'heidi_member_id'::uuid, true);

-- peeking directly at pairings as postgres for the test only (same pattern
-- as smoke_test.sql) -- it's REVOKEd from authenticated entirely, RPC-only.
reset role;
select count(*) as pairings_after_splice from pairings p
  join rounds r on r.id = p.round_id
  where p.round_id = :'round_id'::uuid and p.assignment_version = r.assignment_version;
set role authenticated;

\echo '=== remove_member: removing Frank mid-assignment collapses the chain by one link ==='
-- Splicing always preserves a single cycle, so this 4-member cycle is
-- guaranteed intact here -- safe to remove any one member (collapsing
-- A->Frank->B into A->B can never self-loop when >=3 *other* members
-- remain on the same untouched cycle).
reset role;
select count(*) as pairings_before_remove from pairings p join rounds r on r.id = p.round_id
  where p.round_id = :'round_id'::uuid and p.assignment_version = r.assignment_version;
set role authenticated;
select _as('00000000-0000-0000-0000-000000000101');
select remove_member(:'round_id'::uuid, :'frank_member_id'::uuid, true);
reset role;
select count(*) as pairings_after_remove from pairings p join rounds r on r.id = p.round_id
  where p.round_id = :'round_id'::uuid and p.assignment_version = r.assignment_version;
set role authenticated;

\echo '=== set_pairing: manually redirect who Heidi cooks for ==='
-- Removing Frank left a 3-member cycle (Erin/Grace/Heidi) -- too small for
-- set_pairing to have any non-degenerate move at all (with exactly 3
-- members, redirecting sender's cook either reconstructs the existing
-- edge or creates a direct self-loop; there's no fourth node for the
-- redirected edge to land on safely). Splice in the fifth member (Ivan,
-- who already joined during OPEN above but was never approved) first so
-- set_pairing has room to make a real edit without landing on either
-- degenerate case.
select _as('00000000-0000-0000-0000-000000000101');
select approve_member(:'round_id'::uuid, :'ivan_member_id'::uuid);
select splice_member(:'round_id'::uuid, :'ivan_member_id'::uuid, true);

-- Same degenerate-avoidance logic as before: exclude Ivan himself, his
-- current cook, and whoever is two steps ahead of him, leaving exactly one
-- safe candidate among these four members.
reset role;
select cook_id as ivan_current_cook_id from pairings p join rounds r on r.id = p.round_id
  where p.round_id = :'round_id'::uuid and p.assignment_version = r.assignment_version and p.sender_id = :'ivan_member_id'::uuid \gset
select cook_id as two_steps_ahead_id from pairings p join rounds r on r.id = p.round_id
  where p.round_id = :'round_id'::uuid and p.assignment_version = r.assignment_version and p.sender_id = :'ivan_current_cook_id'::uuid \gset
set role authenticated;

select id as new_cook_id from round_members
  where round_id = :'round_id'::uuid and status = 'ACTIVE' and approved
    and id <> :'ivan_member_id'::uuid
    and id <> :'ivan_current_cook_id'::uuid
    and id <> :'two_steps_ahead_id'::uuid
  limit 1 \gset

select set_pairing(:'round_id'::uuid, :'ivan_member_id'::uuid, :'new_cook_id'::uuid);
select sender_secret_name, cook_secret_name from get_chain(:'round_id'::uuid) where sender_member_id = :'ivan_member_id'::uuid;

\echo 'SMOKE TEST 3 COMPLETE'

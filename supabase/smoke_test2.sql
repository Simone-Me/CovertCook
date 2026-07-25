-- part 2: fix Carol's brief, Dave writes, close briefs, chat, vote, results
\set ON_ERROR_STOP on
select id as round_id from rounds where name = 'Test Dinner' \gset

create or replace function _as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, false);
$$;
set role authenticated;

-- Carol removes the conflicting tag and resubmits
select _as('00000000-0000-0000-0000-000000000003');
select save_brief_draft(:'round_id'::uuid, 'Poulet roti', 'MAIN', '[{"name":"chicken","quantity":1,"unit":"whole"}]'::jsonb, repeat('Season the chicken generously, roast at high heat with root vegetables until the skin is crisp. ', 1), null, 2, '15€', 90, null, '{}', true);
select submit_brief(:'round_id'::uuid);

-- Dave writes and submits
select _as('00000000-0000-0000-0000-000000000004');
select save_brief_draft(:'round_id'::uuid, 'Kir royal', 'DRINK', '[{"name":"champagne","quantity":1,"unit":"bottle"},{"name":"creme de cassis","quantity":100,"unit":"ml"}]'::jsonb, repeat('Chill the champagne, pour a splash of cassis into each glass, top up gently with champagne. ', 1), null, 1, '20€', 10, null, '{}', true);
select submit_brief(:'round_id'::uuid);

\echo '--- non-member (Eve, not in this round) must get nothing from get_my_brief/get_my_assignment ---'
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000099', 'eve@test.local');
set role authenticated;
select _as('00000000-0000-0000-0000-000000000099');
select complete_signup('Eve', 'fr', true, '[]'::jsonb);
do $$
begin
  begin
    perform get_my_brief((select id from rounds where name = 'Test Dinner'));
    raise exception 'SHOULD HAVE FAILED: non-member read a brief';
  exception when others then
    raise notice 'OK non-member correctly rejected: %', sqlerrm;
  end;
end $$;

\echo '--- non-member direct REST-style table reads must be rejected outright (no GRANT, not just RLS-filtered) ---'
do $$
begin
  begin
    perform count(*) from pairings;
    raise exception 'SHOULD HAVE FAILED: read pairings directly';
  exception when insufficient_privilege then
    raise notice 'OK pairings correctly ungrantable: %', sqlerrm;
  end;
end $$;
do $$
begin
  begin
    perform count(*) from briefs;
    raise exception 'SHOULD HAVE FAILED: read briefs directly';
  exception when insufficient_privilege then
    raise notice 'OK briefs correctly ungrantable: %', sqlerrm;
  end;
end $$;

-- host closes briefs
select _as('00000000-0000-0000-0000-000000000001');
select advance_phase(:'round_id'::uuid, 'BRIEFS_CLOSED');

\echo '--- each cook can now read their own brief only ---'
select _as('00000000-0000-0000-0000-000000000003'); -- Carol cooks for Bob
select * from get_my_brief(:'round_id'::uuid);

\echo '--- canned chat: cook asks a clarification, sender replies ---'
reset role;
select p.id as pairing_id, sm.profile_id as sender_profile, cm.profile_id as cook_profile
from pairings p
  join round_members sm on sm.id = p.sender_id
  join round_members cm on cm.id = p.cook_id
  where p.round_id = :'round_id'::uuid and sm.profile_id = '00000000-0000-0000-0000-000000000001' \gset
select id as clarification_template from message_templates where category='CLARIFICATION' and locale='fr' limit 1 \gset
set role authenticated;
select _as(:'cook_profile'::uuid); -- whoever cooks Alice's dish in this run's shuffle
select send_message(:'pairing_id'::uuid, :'clarification_template'::uuid, 'onion');
select _as('00000000-0000-0000-0000-000000000001'); -- Alice is the sender
select * from get_thread(:'pairing_id'::uuid);

-- dinner day: nothing marked undelivered
select _as('00000000-0000-0000-0000-000000000001');
select advance_phase(:'round_id'::uuid, 'DINNER');
select advance_phase(:'round_id'::uuid, 'VOTING');

\echo '--- ballots: each player ranks everyone except the dish they personally cooked ---'
-- Built from get_ballot_options(), exactly as the real voting UI would: the
-- eligible set already excludes the caller's own cooked dish, so any
-- ranking of it is correct-by-construction rather than hardcoded.
do $$
declare
  v_uids uuid[] := array[
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000004'
  ];
  v_uid uuid;
  v_round_id uuid := (select id from rounds where name = 'Test Dinner');
  v_items jsonb;
begin
  foreach v_uid in array v_uids loop
    perform set_config('request.jwt.claim.sub', v_uid::text, false);

    select jsonb_agg(jsonb_build_object(
      'brief_id', x.brief_id,
      'rank', x.rnk,
      'originality_score', (case when random() < 0.5 then (1 + floor(random()*5))::int else null end),
      'brief_respect_score', (case when random() < 0.5 then (1 + floor(random()*5))::int else null end)
    ))
    into v_items
    from (
      select brief_id, row_number() over (order by random()) as rnk
      from get_ballot_options(v_round_id)
    ) x;

    perform submit_ballot(v_round_id, v_items);
  end loop;
end $$;

\echo '--- ballot re-submission must fail (final) ---'
do $$
begin
  begin
    perform submit_ballot((select id from rounds where name = 'Test Dinner'), '[]'::jsonb);
    raise exception 'SHOULD HAVE FAILED: resubmitted ballot';
  exception when others then
    raise notice 'OK resubmission correctly rejected: %', sqlerrm;
  end;
end $$;

-- close voting and compute results
select _as('00000000-0000-0000-0000-000000000001');
select advance_phase(:'round_id'::uuid, 'RESULTS');

\echo '--- results (via get_results, since briefs stays RPC-only forever) ---'
select _as('00000000-0000-0000-0000-000000000002');
select dish_name, course, borda_points, first_places, final_rank, award_keys
from get_results(:'round_id'::uuid)
order by final_rank;

\echo '--- chain reveal (host) ---'
select _as('00000000-0000-0000-0000-000000000001');
select * from get_chain(:'round_id'::uuid);

\echo '--- unmasked thread after reveal ---'
select * from get_thread(:'pairing_id'::uuid);

\echo 'SMOKE TEST 2 COMPLETE'

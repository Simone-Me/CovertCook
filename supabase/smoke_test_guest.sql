-- A guest at the table (0100). Run against a freshly reset local stack:
--   docker exec -i "$CID" psql -U postgres -d postgres < supabase/smoke_test_guest.sql
-- Five people: Alice hosts, Bob/Carol/Dave play the chain, Eve is a guest.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'alice@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'bob@test.local'),
  ('00000000-0000-0000-0000-0000000000a3', 'carol@test.local'),
  ('00000000-0000-0000-0000-0000000000a4', 'dave@test.local'),
  ('00000000-0000-0000-0000-0000000000a5', 'eve@test.local');

create or replace function _as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, false);
$$;

set role authenticated;

select _as('00000000-0000-0000-0000-0000000000a1'); select complete_signup('Alice', 'fr', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-0000000000a2'); select complete_signup('Bob', 'fr', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-0000000000a3'); select complete_signup('Carol', 'fr', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-0000000000a4'); select complete_signup('Dave', 'fr', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-0000000000a5'); select complete_signup('Eve', 'fr', true, '[]'::jsonb);

select _as('00000000-0000-0000-0000-0000000000a1');
select create_round('Guest Dinner', 'CODE', 'ANONYMOUS', 'FREE', null, null, 'Europe/Paris', null, false, false) as round_id \gset
select advance_phase(:'round_id'::uuid, 'OPEN');
select join_code from rounds where id = :'round_id'::uuid \gset

reset role;
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t1 \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t2 \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t3 \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t4 \gset
set role authenticated;

select _as('00000000-0000-0000-0000-0000000000a2'); select join_round(:'join_code', :'t1'::uuid);
select _as('00000000-0000-0000-0000-0000000000a3'); select join_round(:'join_code', :'t2'::uuid);
select _as('00000000-0000-0000-0000-0000000000a4'); select join_round(:'join_code', :'t3'::uuid);
select _as('00000000-0000-0000-0000-0000000000a5'); select join_round(:'join_code', :'t4'::uuid);

\echo '--- the host cannot be a guest (expect GUEST_NOT_HOST) ---'
select _as('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  begin
    perform set_my_guest((select id from rounds where name = 'Guest Dinner'), true);
    raise exception 'host became a guest';
  exception when others then
    if sqlerrm <> 'GUEST_NOT_HOST' then raise; end if;
  end;
end $$;

\echo '--- Eve declares herself a guest ---'
select _as('00000000-0000-0000-0000-0000000000a5');
select set_my_guest(:'round_id'::uuid, true);

select _as('00000000-0000-0000-0000-0000000000a1');
select advance_phase(:'round_id'::uuid, 'LOCKED');
select generate_assignment(:'round_id'::uuid);

\echo '--- chain has 4 links, none of them Eve (expect 4, 0) ---'
select count(*) as links,
       count(*) filter (where sender_display_name = 'Eve' or cook_display_name = 'Eve') as eve_links
from get_chain(:'round_id'::uuid);

\echo '--- Eve has a self pairing on one of 5 slots (expect 1, 5) ---'
reset role;
select count(*) filter (where is_self) as self_pairings,
       (select count(*) from slots where round_id = :'round_id'::uuid) as slots
from pairings where round_id = :'round_id'::uuid;
set role authenticated;

\echo '--- guard: a guest cannot be spliced into the chain (expect GUEST_NOT_IN_CHAIN) ---'
reset role;
do $$ declare v_eve uuid; v_p uuid; begin
  select id into v_eve from round_members where profile_id = '00000000-0000-0000-0000-0000000000a5';
  select id into v_p from pairings where not is_self limit 1;
  begin
    update pairings set cook_id = v_eve where id = v_p;
    raise exception 'guard did not fire';
  exception when others then
    if sqlerrm <> 'GUEST_NOT_IN_CHAIN' then raise; end if;
  end;
end $$;
set role authenticated;

select _as('00000000-0000-0000-0000-0000000000a1');
select advance_phase(:'round_id'::uuid, 'ASSIGNED');

\echo '--- Eve receives nothing, and writes her own dish (expect 0 rows, then a uuid) ---'
select _as('00000000-0000-0000-0000-0000000000a5');
select count(*) as received from get_my_assignment(:'round_id'::uuid);
select save_brief_draft(:'round_id'::uuid, 'Tiramisu', 'DESSERT', '[{"name":"mascarpone","quantity":250,"unit":"g"}]'::jsonb,
  repeat('Whip the cream, layer with coffee-soaked biscuits and chill overnight before serving. ', 1), null, 2, '8', 30, null, '{}', true);

\echo '--- the role is fixed once the roulette has dealt (expect GUEST_LOCKED) ---'
do $$ begin
  begin
    perform set_my_guest((select id from rounds where name = 'Guest Dinner'), false);
    raise exception 'role changed after attribution';
  exception when others then
    if sqlerrm <> 'GUEST_LOCKED' then raise; end if;
  end;
end $$;

rollback;
\echo 'guest smoke test: OK (rolled back)'

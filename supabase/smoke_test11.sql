-- Smoke test 11: the album (0060).
-- Run after `npx supabase db reset`; self-contained.
--
-- The storage bucket and its policies are skipped by 0060 when the `storage`
-- schema is absent, which is the case in a bare Postgres — so what this proves
-- is everything on the database side of the album: when it opens, who may add
-- to it, that one person cannot fill it, that a path cannot claim somebody
-- else's dinner, and that report and remove behave the way they do for a
-- phrase. The bucket policies themselves need a running local stack.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000001101', 'kai@test.local'),
  ('00000000-0000-0000-0000-000000001102', 'lena@test.local'),
  ('00000000-0000-0000-0000-000000001103', 'milo@test.local'),
  -- Never joins anything: the control for every "was she at this dinner" check.
  ('00000000-0000-0000-0000-000000001104', 'nadia@test.local');

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

select _as('00000000-0000-0000-0000-000000001101');
select complete_signup('Kai', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000001102');
select complete_signup('Lena', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000001103');
select complete_signup('Milo', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000001104');
select complete_signup('Nadia', 'en', true, '[]'::jsonb);

select _as('00000000-0000-0000-0000-000000001101');
select create_round('The Long Table', 'CODE', 'ANONYMOUS', 'FREE', null, null, 'Europe/Paris', null, false, false, 'LIVE') as round_id \gset
select advance_phase(:'round_id'::uuid, 'OPEN');

reset role;
select join_code from rounds where id = :'round_id'::uuid \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t1 \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t2 \gset
set role authenticated;

select _as('00000000-0000-0000-0000-000000001102');
select join_round(:'join_code', :'t1'::uuid);
select _as('00000000-0000-0000-0000-000000001103');
select join_round(:'join_code', :'t2'::uuid);

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 1. the album opens with the dinner, not before ==='
select _as('00000000-0000-0000-0000-000000001102');
\echo '--- while sign-ups are open: expect ALBUM_NOT_OPEN_YET ---'
select _refusal(format('select record_photo(%L::uuid, %L)', :'round_id', :'round_id' || '/a.jpg'));

select _as('00000000-0000-0000-0000-000000001101');
select advance_phase(:'round_id'::uuid, 'LOCKED');
select generate_assignment(:'round_id'::uuid);
select advance_phase(:'round_id'::uuid, 'ASSIGNED');
select advance_phase(:'round_id'::uuid, 'BRIEFS_CLOSED');
select advance_phase(:'round_id'::uuid, 'DINNER');

\echo '--- and once the food is on the table it works ---'
select _as('00000000-0000-0000-0000-000000001102');
select record_photo(:'round_id'::uuid, :'round_id' || '/lena-1.jpg', 'The whole table') is not null as recorded;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 2. one each, and adding again replaces rather than accumulates ==='
select record_photo(:'round_id'::uuid, :'round_id' || '/lena-2.jpg');
\echo '--- Lena still has exactly one (expect 1) ---'
reset role;
select count(*) as lenas_photos from dinner_photos p
join round_members m on m.id = p.member_id
where p.round_id = :'round_id'::uuid and m.profile_id = '00000000-0000-0000-0000-000000001102';
\echo '--- and it is the newer one (expect t) ---'
select storage_path like '%lena-2.jpg' as replaced from dinner_photos p
join round_members m on m.id = p.member_id
where p.round_id = :'round_id'::uuid and m.profile_id = '00000000-0000-0000-0000-000000001102';
set role authenticated;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 3. a path cannot claim another dinner, and a stranger cannot add ==='
select _as('00000000-0000-0000-0000-000000001102');
\echo '--- a path outside this round: expect PHOTO_PATH_MISMATCH ---'
select _refusal(format('select record_photo(%L::uuid, %L)', :'round_id', '00000000-0000-0000-0000-0000000000ff/sneaky.jpg'));

\echo '--- somebody who was never at this dinner: expect a refusal ---'
select _as('00000000-0000-0000-0000-000000001104');
select _refusal(format('select record_photo(%L::uuid, %L)', :'round_id', :'round_id' || '/nadia.jpg'));

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 4. the album is the table''s, and nobody else''s ==='
select _as('00000000-0000-0000-0000-000000001103');
select record_photo(:'round_id'::uuid, :'round_id' || '/milo.jpg');

\echo '--- Milo sees two, one of them his (expect 2, and one is_mine) ---'
select count(*) as visible, count(*) filter (where is_mine) as mine from list_round_photos(:'round_id'::uuid);

\echo '--- and it carries pseudonyms, never names (expect t) ---'
select bool_and(taken_by is not null) as all_have_pseudonyms from list_round_photos(:'round_id'::uuid);

\echo '--- Nadia cannot look at it: expect a refusal ---'
select _as('00000000-0000-0000-0000-000000001104');
select _refusal(format('select * from list_round_photos(%L::uuid)', :'round_id'));

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 5. report and remove, the same two acts a phrase gets ==='
select _as('00000000-0000-0000-0000-000000001103');
reset role;
select p.id as lena_photo from dinner_photos p
join round_members m on m.id = p.member_id
where p.round_id = :'round_id'::uuid and m.profile_id = '00000000-0000-0000-0000-000000001102' \gset
set role authenticated;
select _as('00000000-0000-0000-0000-000000001103');
select report_photo(:'lena_photo'::uuid);

\echo '--- it reaches the host''s inbox on the existing pipeline (expect 1) ---'
reset role;
select count(*) as alerts from host_alerts
where round_id = :'round_id'::uuid and payload->>'type' = 'REPORTED_PHOTO' and resolved_at is null;
set role authenticated;

\echo '--- Milo cannot take down somebody else''s photograph: expect a refusal ---'
select _refusal(format('select hide_photo(%L::uuid)', :'lena_photo'));

\echo '--- the host can, and it is recorded ---'
select _as('00000000-0000-0000-0000-000000001101');
select hide_photo(:'lena_photo'::uuid);
reset role;
select count(*) as removals_logged from audit_log
where round_id = :'round_id'::uuid and action = 'PHOTO_REMOVED';
set role authenticated;

\echo '--- it is gone for the table (expect 1 left) ---'
select _as('00000000-0000-0000-0000-000000001103');
select count(*) as visible_now from list_round_photos(:'round_id'::uuid);

\echo '--- and Lena is told rather than left wondering (expect 1, hidden = t) ---'
select _as('00000000-0000-0000-0000-000000001102');
select count(*) as she_sees, bool_or(hidden) as marked_removed
from list_round_photos(:'round_id'::uuid) where is_mine;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 6. a blocked person is out of your album too ==='
reset role;
select id as milo_seat from round_members
where round_id = :'round_id'::uuid and profile_id = '00000000-0000-0000-0000-000000001103' \gset
set role authenticated;
select _as('00000000-0000-0000-0000-000000001102');
\echo '--- before blocking Milo, Lena sees his (expect 1 not-mine) ---'
select count(*) filter (where not is_mine) as his from list_round_photos(:'round_id'::uuid);
select block_member(:'milo_seat'::uuid);
\echo '--- after, she does not (expect 0) ---'
select count(*) filter (where not is_mine) as his from list_round_photos(:'round_id'::uuid);

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 7. the album outlives the dinner (0054 does not freeze it) ==='
select _as('00000000-0000-0000-0000-000000001101');
select advance_phase(:'round_id'::uuid, 'VOTING');
select advance_phase(:'round_id'::uuid, 'RESULTS');
select advance_phase(:'round_id'::uuid, 'ARCHIVED');
\echo '--- Kai adds his after the dinner is a record: expect a row ---'
select record_photo(:'round_id'::uuid, :'round_id' || '/kai.jpg') is not null as recorded_after_archive;

\echo '--- and the profile album finds it (expect at least 1) ---'
select count(*) > 0 as album_has_something from my_album();

reset role;
\echo ''
\echo '=== smoke test 11 complete ==='

-- Smoke test 11: the album (0060, rewritten for 0068).
-- Run after `npx supabase db reset`; self-contained.
--
-- The storage bucket and its policies are skipped by 0060 when the `storage`
-- schema is absent, which is the case in a bare Postgres — so what this proves
-- is everything on the database side of the album: when it opens, **who** may
-- add to it now that it is one photograph per dinner, that handing the camera
-- over works and cannot be used to read the roster, that a path cannot claim
-- somebody else's dinner, and that report and remove behave the way they do for
-- a phrase. The bucket policies themselves need a running local stack.
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

-- Kai hosts, so Kai is the Executive Chef and the photographer by default.
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
select _as('00000000-0000-0000-0000-000000001101');
\echo '--- while sign-ups are open, even for the host: expect ALBUM_NOT_OPEN_YET ---'
select _refusal(format('select record_photo(%L::uuid, %L)', :'round_id', :'round_id' || '/a.jpg'));

select advance_phase(:'round_id'::uuid, 'LOCKED');
select generate_assignment(:'round_id'::uuid);
select advance_phase(:'round_id'::uuid, 'ASSIGNED');
select advance_phase(:'round_id'::uuid, 'BRIEFS_CLOSED');
select advance_phase(:'round_id'::uuid, 'DINNER');

\echo '--- and once the food is on the table the Executive Chef can add it ---'
select record_photo(:'round_id'::uuid, :'round_id' || '/kai-1.jpg', 'The whole table') is not null as recorded;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 2. one per dinner, and adding again replaces rather than accumulates ==='
select record_photo(:'round_id'::uuid, :'round_id' || '/kai-2.jpg');
\echo '--- the dinner still has exactly one (expect 1) ---'
reset role;
select count(*) as photos_for_this_dinner from dinner_photos
where round_id = :'round_id'::uuid and hidden_at is null;
\echo '--- and it is the newer one (expect t) ---'
select storage_path like '%kai-2.jpg' as replaced from dinner_photos
where round_id = :'round_id'::uuid and hidden_at is null;
set role authenticated;

\echo '--- and it is in nobody''s album, because nobody has kept it (expect 0) ---'
select count(*) as albums_touched from my_album();

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 3. everybody else is refused, and each for its own reason ==='
select _as('00000000-0000-0000-0000-000000001101');
\echo '--- a path outside this round: expect PHOTO_PATH_MISMATCH ---'
select _refusal(format('select record_photo(%L::uuid, %L)', :'round_id', '00000000-0000-0000-0000-0000000000ff/sneaky.jpg'));

\echo '--- somebody who was never at this dinner: expect a membership refusal ---'
select _as('00000000-0000-0000-0000-000000001104');
select _refusal(format('select record_photo(%L::uuid, %L)', :'round_id', :'round_id' || '/nadia.jpg'));

\echo '--- a chef at the table who was not given the camera: expect NOT_THE_PHOTOGRAPHER ---'
select _as('00000000-0000-0000-0000-000000001102');
select _refusal(format('select record_photo(%L::uuid, %L)', :'round_id', :'round_id' || '/lena.jpg'));

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 4. handing the camera over ==='
\echo '--- the picker is the host''s alone: expect a refusal for Lena ---'
select _refusal(format('select * from list_table_chefs(%L::uuid)', :'round_id'));

select _as('00000000-0000-0000-0000-000000001101');
\echo '--- and it lists the table by real name, without the host (expect 2: Lena, Milo) ---'
select count(*) as candidates, string_agg(real_name, ', ' order by real_name) as names
from list_table_chefs(:'round_id'::uuid);

\echo '--- and it hands out no seat and no pseudonym, which is what keeps it from ---'
\echo '--- being the map from a pseudonym to a person (expect profile_id + real_name only) ---'
select pg_get_function_result('list_table_chefs(uuid)'::regprocedure) as what_it_returns;

\echo '--- somebody who is not at the table cannot be handed it: expect NOT_AT_THIS_TABLE ---'
select _refusal(format('select set_photographer(%L::uuid, %L::uuid)',
  :'round_id', '00000000-0000-0000-0000-000000001104'));

\echo '--- a guest cannot hand it to themselves: expect a refusal ---'
select _as('00000000-0000-0000-0000-000000001102');
select _refusal(format('select set_photographer(%L::uuid, %L::uuid)',
  :'round_id', '00000000-0000-0000-0000-000000001102'));

\echo '--- the host hands it to Lena, and now she can add it from her own phone ---'
select _as('00000000-0000-0000-0000-000000001101');
select set_photographer(:'round_id'::uuid, '00000000-0000-0000-0000-000000001102'::uuid);
select _as('00000000-0000-0000-0000-000000001102');
select record_photo(:'round_id'::uuid, :'round_id' || '/lena.jpg') is not null as lena_can_now;

\echo '--- and it is still one photograph, now hers (expect 1, t) ---'
reset role;
select count(*) as photos,
       bool_and(taken_by_profile_id = '00000000-0000-0000-0000-000000001102') as hers
from dinner_photos where round_id = :'round_id'::uuid and hidden_at is null;
set role authenticated;

\echo '--- Milo is still refused: it is one chef, not everyone ---'
select _as('00000000-0000-0000-0000-000000001103');
select _refusal(format('select record_photo(%L::uuid, %L)', :'round_id', :'round_id' || '/milo.jpg'));

-- HANDING IT OVER MEANS GIVING IT UP, and this is the assertion that says so.
-- A right two people hold at once is a suggestion, not a handover: the table
-- would have no way of knowing whose job it actually was.
\echo '--- and so is the Executive Chef, who gave it away: expect NOT_THE_PHOTOGRAPHER ---'
select _as('00000000-0000-0000-0000-000000001101');
select _refusal(format('select record_photo(%L::uuid, %L)', :'round_id', :'round_id' || '/kai-again.jpg'));

\echo '--- everybody at the table is told whose job it is, by name (expect Lena) ---'
select _as('00000000-0000-0000-0000-000000001103');
select real_name as who_holds_the_camera from get_photographer(:'round_id'::uuid);

\echo '--- and with nothing handed over it names the host, because that is who may ---'
\echo '--- actually do it — it answers the right, not the column (expect Kai) ---'
select _as('00000000-0000-0000-0000-000000001101');
select create_round('Nobody Delegated', 'CODE', 'ANONYMOUS', 'FREE', null, null, 'Europe/Paris', null, false, false, 'LIVE') as other_round \gset
select real_name as who_holds_the_camera from get_photographer(:'other_round'::uuid);

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 5. the album is the table''s, and nobody else''s ==='
select _as('00000000-0000-0000-0000-000000001103');
\echo '--- Milo sees the dinner''s photograph, and it is not his (expect 1, 0) ---'
select count(*) as visible, count(*) filter (where is_mine) as mine from list_round_photos(:'round_id'::uuid);

-- The credit is a REAL NAME now, and that is a correction rather than a
-- loosening. The table is told in words who holds the camera, so a pseudonym on
-- the picture that person took would sit one line from their real name and hand
-- over the mapping the whole design exists to protect. One public fact, said
-- once.
\echo '--- and the credit is the photographer''s real name, the same fact said once (expect Lena) ---'
select taken_by as credited from list_round_photos(:'round_id'::uuid);

\echo '--- Nadia cannot look at it: expect a refusal ---'
select _as('00000000-0000-0000-0000-000000001104');
select _refusal(format('select * from list_round_photos(%L::uuid)', :'round_id'));

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 6. keeping it is a decision, and pressing add is the only way in ==='
reset role;
select p.id as lenas_photo from dinner_photos p
where p.round_id = :'round_id'::uuid and p.hidden_at is null \gset
set role authenticated;

\echo '--- Milo was at the dinner and his album is empty until he says so (expect 0) ---'
select _as('00000000-0000-0000-0000-000000001103');
select count(*) as before_keeping from my_album();

\echo '--- he keeps it, and now it is there, with the evening on it (expect 1, t, t) ---'
select save_photo(:'lenas_photo'::uuid) is not null as kept;
select count(*) as photos, bool_and(round_name <> '') as named,
       bool_and(taken_by_name is not null) as credited
from my_album();

\echo '--- pressing add twice keeps one, because the control is a switch (expect 1) ---'
select save_photo(:'lenas_photo'::uuid);
select count(*) as still_one from my_album();

\echo '--- Nadia was never there and cannot keep it: expect a refusal ---'
select _as('00000000-0000-0000-0000-000000001104');
select _refusal(format('select save_photo(%L::uuid)', :'lenas_photo'));

\echo '--- and Lena''s own album is still empty: taking it is not keeping it (expect 0) ---'
select _as('00000000-0000-0000-0000-000000001102');
select count(*) as hers from my_album();

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 7. report and remove, the same two acts a phrase gets ==='
reset role;
select p.id as the_photo from dinner_photos p
where p.round_id = :'round_id'::uuid and p.hidden_at is null \gset
set role authenticated;
select _as('00000000-0000-0000-0000-000000001103');
select report_photo(:'the_photo'::uuid);

\echo '--- it reaches the host''s inbox on the existing pipeline (expect 1) ---'
reset role;
select count(*) as alerts from host_alerts
where round_id = :'round_id'::uuid and payload->>'type' = 'REPORTED_PHOTO' and resolved_at is null;
set role authenticated;

\echo '--- Milo cannot take down somebody else''s photograph: expect a refusal ---'
select _refusal(format('select hide_photo(%L::uuid)', :'the_photo'));

\echo '--- the host can, and it is recorded ---'
select _as('00000000-0000-0000-0000-000000001101');
select hide_photo(:'the_photo'::uuid);
reset role;
select count(*) as removals_logged from audit_log
where round_id = :'round_id'::uuid and action = 'PHOTO_REMOVED';
set role authenticated;

\echo '--- it is gone for the table (expect 0 left) ---'
select _as('00000000-0000-0000-0000-000000001103');
select count(*) as visible_now from list_round_photos(:'round_id'::uuid);

-- THE ONE PLACE IN THIS APP WHERE A COPY IS NOT SOVEREIGN. Everywhere else,
-- what you kept is yours and nobody can reach into it — a recipe stays in your
-- book after its author erases their account. A photograph taken down for
-- moderation is the exception, and it has to be: removal that leaves the
-- picture in nine albums has removed nothing.
\echo '--- and it is out of the album of everybody who kept it (expect 0) ---'
select count(*) as milos_album from my_album();

\echo '--- Lena is told rather than left wondering (expect 1, hidden = t) ---'
select _as('00000000-0000-0000-0000-000000001102');
select count(*) as she_sees, bool_or(hidden) as marked_removed
from list_round_photos(:'round_id'::uuid) where is_mine;

\echo '--- a removed photograph does not hold the dinner''s one place: she adds another ---'
select record_photo(:'round_id'::uuid, :'round_id' || '/lena-2.jpg') is not null as room_for_another;

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 8. a blocked person is out of your album too ==='
reset role;
select id as lena_seat from round_members
where round_id = :'round_id'::uuid and profile_id = '00000000-0000-0000-0000-000000001102' \gset
set role authenticated;
select _as('00000000-0000-0000-0000-000000001103');
\echo '--- before blocking Lena, Milo sees the dinner''s photograph (expect 1) ---'
select count(*) as visible from list_round_photos(:'round_id'::uuid);
select block_member(:'lena_seat'::uuid);
\echo '--- after, he does not (expect 0) ---'
select count(*) as visible from list_round_photos(:'round_id'::uuid);

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 9. the album outlives the dinner (0054 does not freeze it) ==='
select _as('00000000-0000-0000-0000-000000001101');
select advance_phase(:'round_id'::uuid, 'VOTING');
select advance_phase(:'round_id'::uuid, 'RESULTS');
select advance_phase(:'round_id'::uuid, 'ARCHIVED');
\echo '--- the chef holding the camera replaces it after the dinner is a record ---'
select _as('00000000-0000-0000-0000-000000001102');
select record_photo(:'round_id'::uuid, :'round_id' || '/lena-3.jpg') is not null as recorded_after_archive;

\echo '--- and keeping it still works on a frozen dinner, which is the only ---'
\echo '--- moment anybody ever does it (expect 1) ---'
reset role;
select p.id as final_photo from dinner_photos p
where p.round_id = :'round_id'::uuid and p.hidden_at is null \gset
set role authenticated;
select save_photo(:'final_photo'::uuid) is not null as kept_after_archive;
select count(*) as album_has_something from my_album();

\echo '--- and forgetting it is hers alone (expect 0, then a refusal for Milo) ---'
select forget_photo((select id from my_album() limit 1));
select count(*) as after_forgetting from my_album();
select _as('00000000-0000-0000-0000-000000001103');
select _refusal('select forget_photo(''00000000-0000-0000-0000-0000000009ff''::uuid)');

reset role;
\echo ''
\echo '=== smoke test 11 complete ==='

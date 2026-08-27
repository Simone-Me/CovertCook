-- Smoke test 9: the menu (0057) and the recipe book (0058).
-- Run after `npx supabase db reset`; self-contained.
--
-- The two things worth proving here are the ones that are easy to get wrong and
-- invisible when they are:
--
--   * a dish nobody cooked still reaches the menu, struck through, instead of
--     leaving a hole where a course used to be;
--   * saving the same recipe twice writes one row, not two — which is what
--     makes the save control a switch rather than a counter.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000901', 'aline@test.local'),
  ('00000000-0000-0000-0000-000000000902', 'bruno@test.local'),
  ('00000000-0000-0000-0000-000000000903', 'chiara@test.local'),
  ('00000000-0000-0000-0000-000000000904', 'dario@test.local');

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

select _as('00000000-0000-0000-0000-000000000901');
select complete_signup('Aline', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000000902');
select complete_signup('Bruno', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000000903');
select complete_signup('Chiara', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000000904');
select complete_signup('Dario', 'en', true, '[]'::jsonb);

select _as('00000000-0000-0000-0000-000000000901');
select create_round('The Carte', 'CODE', 'ANONYMOUS', 'FREE', null, null, 'Europe/Paris', null, false, false, 'LIVE') as round_id \gset
select advance_phase(:'round_id'::uuid, 'OPEN');

reset role;
select join_code from rounds where id = :'round_id'::uuid \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t1 \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t2 \gset
insert into turnstile_tickets (purpose, subject) values ('JOIN_ROUND', :'join_code') returning id as t3 \gset
set role authenticated;

select _as('00000000-0000-0000-0000-000000000902');
select join_round(:'join_code', :'t1'::uuid);
select _as('00000000-0000-0000-0000-000000000903');
select join_round(:'join_code', :'t2'::uuid);
select _as('00000000-0000-0000-0000-000000000904');
select join_round(:'join_code', :'t3'::uuid);

select _as('00000000-0000-0000-0000-000000000901');
select advance_phase(:'round_id'::uuid, 'LOCKED');
select generate_assignment(:'round_id'::uuid);
select advance_phase(:'round_id'::uuid, 'ASSIGNED');

-- Four recipes, one from each seat.
\echo ''
\echo '=== four recipes written and sent ==='
select _as('00000000-0000-0000-0000-000000000901');
select save_brief_draft(:'round_id'::uuid, 'Vitello tonnato', 'STARTER',
  '[{"name":"veal","quantity":600,"unit":"g"},{"name":"tuna","quantity":150,"unit":"g"}]'::jsonb,
  'Poach the veal, blend the tuna with capers and oil, and slice everything cold.',
  null, null, null, null, null, '{}', true);
select submit_brief(:'round_id'::uuid);

select _as('00000000-0000-0000-0000-000000000902');
select save_brief_draft(:'round_id'::uuid, 'Risotto al limone', 'MAIN',
  '[{"name":"carnaroli rice","quantity":320,"unit":"g"}]'::jsonb,
  'Toast the rice, add the stock a ladle at a time, finish with lemon and butter.',
  null, null, null, null, null, '{}', true);
select submit_brief(:'round_id'::uuid);

select _as('00000000-0000-0000-0000-000000000903');
select save_brief_draft(:'round_id'::uuid, 'Tiramisu', 'DESSERT',
  '[{"name":"mascarpone","quantity":500,"unit":"g"}]'::jsonb,
  'Whip the mascarpone with the yolks, soak the biscuits, and layer them twice over.',
  null, null, null, null, null, '{}', true);
select submit_brief(:'round_id'::uuid);

select _as('00000000-0000-0000-0000-000000000904');
select save_brief_draft(:'round_id'::uuid, 'Negroni sbagliato', 'DRINK',
  '[{"name":"campari","quantity":3,"unit":"cl"}]'::jsonb,
  'Campari, vermouth and prosecco in equal parts, over one large piece of ice.',
  null, null, null, null, null, '{}', true);
select submit_brief(:'round_id'::uuid);

select _as('00000000-0000-0000-0000-000000000901');
select advance_phase(:'round_id'::uuid, 'BRIEFS_CLOSED');
select advance_phase(:'round_id'::uuid, 'DINNER');

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 1. one dish never arrives ==='
-- Whoever was going to cook the tiramisu is gone. The recipe stays written; the
-- dish is excluded from the ballot (0016 LEAVE), which is the case that used to
-- vanish from the results entirely.
reset role;
select b.id as gone_brief from briefs b
join pairings p on p.id = b.pairing_id
where p.round_id = :'round_id'::uuid and b.dish_name = 'Tiramisu' \gset
set role authenticated;
select _as('00000000-0000-0000-0000-000000000901');
select mark_dish_delivery(:'round_id'::uuid, :'gone_brief'::uuid, false);

select advance_phase(:'round_id'::uuid, 'VOTING');

-- Everyone ranks the dishes they can vote on. get_ballot_options already
-- answers "which dishes may this person rank" — submitted, delivered, and not
-- the one they cooked — so the test asks it rather than re-deriving the rule
-- and risking a test that agrees with itself instead of with the app.
\echo '--- ballots cast ---'
select _as('00000000-0000-0000-0000-000000000902');
select submit_ballot(:'round_id'::uuid, (
  select jsonb_agg(jsonb_build_object('brief_id', x.brief_id, 'rank', x.rn))
  from (select brief_id, row_number() over (order by dish_name) as rn from get_ballot_options(:'round_id'::uuid)) x
));

select _as('00000000-0000-0000-0000-000000000903');
select submit_ballot(:'round_id'::uuid, (
  select jsonb_agg(jsonb_build_object('brief_id', x.brief_id, 'rank', x.rn))
  from (select brief_id, row_number() over (order by dish_name desc) as rn from get_ballot_options(:'round_id'::uuid)) x
));

select _as('00000000-0000-0000-0000-000000000904');
select submit_ballot(:'round_id'::uuid, (
  select jsonb_agg(jsonb_build_object('brief_id', x.brief_id, 'rank', x.rn))
  from (select brief_id, row_number() over (order by dish_name) as rn from get_ballot_options(:'round_id'::uuid)) x
));

select _as('00000000-0000-0000-0000-000000000901');
select advance_phase(:'round_id'::uuid, 'RESULTS');
select compute_results(:'round_id'::uuid);
select publish_results(:'round_id'::uuid);

\echo '--- the menu: four dishes, and Tiramisu carries served = false ---'
select dish_name, course, served, final_rank from get_results(:'round_id'::uuid);

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 2. the recipes open, once, to the people who were there ==='
select _as('00000000-0000-0000-0000-000000000902');
\echo '--- Bruno sees four recipes, and his own two roles are labelled ---'
select dish_name, relation, already_saved, author_secret_name is not null as has_pseudonym
from list_round_recipes(:'round_id'::uuid) order by dish_name;

\echo '--- and somebody who was never at this dinner sees nothing at all ---'
select _as('00000000-0000-0000-0000-000000000901');
select create_round('Another Dinner', 'CODE', 'ANONYMOUS', 'FREE', null, null, 'Europe/Paris', null, false, false, 'LIVE') as other_round \gset
select _as('00000000-0000-0000-0000-000000000902');
select _refusal(format('select * from list_round_recipes(%L::uuid)', :'other_round'));

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 3. the switch is a switch, not a counter ==='
select _as('00000000-0000-0000-0000-000000000902');
reset role;
select array_agg(b.id) as all_briefs from briefs b
join pairings p on p.id = b.pairing_id where p.round_id = :'round_id'::uuid \gset
set role authenticated;
select _as('00000000-0000-0000-0000-000000000902');

\echo '--- first save of all four: expect 4 ---'
select save_recipes(:'round_id'::uuid, :'all_briefs'::uuid[]);

\echo '--- saving the same four again: expect 0, and still four rows ---'
select save_recipes(:'round_id'::uuid, :'all_briefs'::uuid[]);
select count(*) as rows_in_book from list_my_recipes();

\echo '--- the book knows what each one was to him (expect one WROTE, one COOKED) ---'
select relation, count(*) from list_my_recipes() group by relation order by relation;

\echo '--- the ingredients travelled with the recipe (expect > 0) ---'
select dish_name, jsonb_array_length(ingredients) as ingredient_count
from list_my_recipes() where dish_name = 'Vitello tonnato';

\echo '--- and the book is one person''s: Chiara''s is empty ---'
select _as('00000000-0000-0000-0000-000000000903');
select count(*) as chiaras_book from list_my_recipes();

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 4. the brief ids are checked, not trusted ==='
-- Two different doors, and both have to hold. Somebody who was never at the
-- dinner is refused outright (section 2). A member passing an id that does not
-- belong to this round matches nothing and writes nothing — quietly, because
-- there is no honest way for a client to produce that except by hand.
select _as('00000000-0000-0000-0000-000000000902');
\echo '--- an id from nowhere: expect 0, and no error ---'
select save_recipes(:'round_id'::uuid, array['00000000-0000-0000-0000-0000000000ff']::uuid[]);

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 5. removing a copy, and only your own ==='
select _as('00000000-0000-0000-0000-000000000902');
select id as one_entry from list_my_recipes() limit 1 \gset
select forget_recipe(:'one_entry'::uuid);
select count(*) as after_removal from list_my_recipes();

\echo '--- Chiara cannot remove Bruno''s entry: expect RECIPE_NOT_IN_YOUR_BOOK ---'
-- Read as the superuser, because that is the only way to get hold of it: under
-- Chiara's own session the row does not exist at all, which is RLS doing its
-- job and would make this test pass for the wrong reason.
reset role;
select id as brunos from saved_recipes
where profile_id = '00000000-0000-0000-0000-000000000902' limit 1 \gset
set role authenticated;
select _as('00000000-0000-0000-0000-000000000903');
select _refusal(format('select forget_recipe(%L::uuid)', :'brunos'));

\echo '--- and the entry Bruno removed can be saved again, because the dinner is still there ---'
select _as('00000000-0000-0000-0000-000000000902');
select save_recipes(:'round_id'::uuid, :'all_briefs'::uuid[]);

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 6. an archived dinner still accepts a save (0054 does not freeze the book) ==='
select _as('00000000-0000-0000-0000-000000000901');
select advance_phase(:'round_id'::uuid, 'ARCHIVED');
select _as('00000000-0000-0000-0000-000000000904');
\echo '--- Dario saves after the dinner is a record: expect 4 ---'
select save_recipes(:'round_id'::uuid, :'all_briefs'::uuid[]);

reset role;
\echo ''
\echo '=== smoke test 9 complete ==='

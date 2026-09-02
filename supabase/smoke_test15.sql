-- Smoke test 15: the door, the guest list, the two anonymity modes that were
-- never wired up, the theme shelf, and the one cost setting that stopped moving.
-- Run after `npx supabase db reset`; self-contained.
--
-- WHAT THIS EXISTS TO CATCH. Four rules that were written down and then not
-- enforced anywhere, which is the worst kind: the app said one thing, the
-- database did another, and nobody was told.
--
--   * `rounds.access` had existed since 0018 and NOTHING READ IT. An
--     invitation-only dinner accepted its code from anybody holding it. That
--     is not a cosmetic bug — it is the host's one control over who is at
--     their table, silently doing nothing.
--   * SPY meant "the Executive Chef sees everyone". 0053 handed the host the
--     profile ids and no function ever returned a name to go with them, so a
--     SPY host got the ANONYMOUS game with a different label.
--   * OPEN meant "everyone knows everyone" and the roster still printed
--     pseudonyms, so an OPEN dinner ran with two names per person.
--   * A paid theme was a client-side list. Naming one in a raw RPC call got it.
--
-- Every one of those is a rule the interface can only *offer* — the proof has
-- to be here, because here is where it is decided.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000001501', 'ada@test.local'),
  ('00000000-0000-0000-0000-000000001502', 'bo@test.local'),
  ('00000000-0000-0000-0000-000000001503', 'cy@test.local');

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

select _as('00000000-0000-0000-0000-000000001501');
select complete_signup('Ada', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000001502');
select complete_signup('Bo', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000001503');
select complete_signup('Cy', 'en', true, '[]'::jsonb);

-- ---------------------------------------------------------------------------
-- 1. A code-only dinner has no guest list.
-- ---------------------------------------------------------------------------

select _as('00000000-0000-0000-0000-000000001501');
select create_round('By The Code', 'CODE', 'ANONYMOUS', 'FREE', null, null,
                    'Europe/Paris', null, false, false, 'LIVE') as code_round \gset
select advance_phase(:'code_round'::uuid, 'OPEN');
select join_code from rounds where id = :'code_round'::uuid \gset code_

\echo '--- code-only: inviting is refused (expect NOT_BY_INVITATION)'
select _refusal(format('select invite_member(%L::uuid, %L)', :'code_round', 'Bo'));

\echo '--- code-only: the code works'
select _as('00000000-0000-0000-0000-000000001502');
select join_round(:'code_join_code', null) is not null as bo_is_seated;

-- ---------------------------------------------------------------------------
-- 2. An invitation-only dinner has no code.
--
-- INVALID_CODE rather than a truthful refusal, on purpose: confirming that the
-- code is real tells a stranger the dinner exists.
-- ---------------------------------------------------------------------------

select _as('00000000-0000-0000-0000-000000001501');
select create_round('By Name Only', 'INVITE', 'ANONYMOUS', 'FREE', null, null,
                    'Europe/Paris', null, false, false, 'LIVE') as inv_round \gset
select advance_phase(:'inv_round'::uuid, 'OPEN');
select join_code from rounds where id = :'inv_round'::uuid \gset inv_

\echo '--- invitation-only: the code opens nothing (expect INVALID_CODE)'
select _as('00000000-0000-0000-0000-000000001502');
select _refusal(format('select join_round(%L, null)', :'inv_join_code'));

\echo '--- invitation-only: a username nobody has (expect NO_SUCH_CHEF)'
select _as('00000000-0000-0000-0000-000000001501');
select _refusal(format('select invite_member(%L::uuid, %L)', :'inv_round', 'Nobody At All'));

-- Case-insensitively, exactly as profiles_display_name_unique compares them —
-- a host typing a friend's name in lower case must not be told that friend
-- does not exist.
\echo '--- invitation-only: the username, in the wrong case, still finds them'
select invite_member(:'inv_round'::uuid, 'bo') as invitation_id \gset

select _as('00000000-0000-0000-0000-000000001502');
select respond_to_invitation(:'invitation_id'::uuid, true) is not null as bo_accepted;

-- ---------------------------------------------------------------------------
-- 3. Both doors at once — the ordinary case the enum could not express.
-- ---------------------------------------------------------------------------

select _as('00000000-0000-0000-0000-000000001501');
select create_round('Both Doors', 'CODE_AND_INVITE', 'ANONYMOUS', 'FREE', null, null,
                    'Europe/Paris', null, false, false, 'LIVE') as both_round \gset
select advance_phase(:'both_round'::uuid, 'OPEN');
select join_code from rounds where id = :'both_round'::uuid \gset both_

\echo '--- both: the guest list works'
select invite_member(:'both_round'::uuid, 'Bo') is not null as invited_ok;

\echo '--- both: and so does the code'
select _as('00000000-0000-0000-0000-000000001503');
select join_round(:'both_join_code', null) is not null as cy_walked_in;

-- ---------------------------------------------------------------------------
-- 4. SPY: the Executive Chef sees names, the table does not.
--
-- The bug this pins down is not a leak, it is the opposite — a promise the app
-- made and never kept.
-- ---------------------------------------------------------------------------

select _as('00000000-0000-0000-0000-000000001501');
select create_round('The Spy Dinner', 'CODE', 'SPY', 'FREE', null, null,
                    'Europe/Paris', null, false, false, 'LIVE') as spy_round \gset
select advance_phase(:'spy_round'::uuid, 'OPEN');
select join_code from rounds where id = :'spy_round'::uuid \gset spy_

select _as('00000000-0000-0000-0000-000000001502');
select join_round(:'spy_join_code', null);
select _as('00000000-0000-0000-0000-000000001503');
select join_round(:'spy_join_code', null);

select _as('00000000-0000-0000-0000-000000001501');
select advance_phase(:'spy_round'::uuid, 'LOCKED');

\echo '--- SPY, read by the host: every real name is there (expect 3 of 3)'
select count(*) filter (where display_name is not null) as named,
       count(*) as seats
from list_round_members(:'spy_round'::uuid);

\echo '--- SPY, read by a player: only pseudonyms (expect 0 named)'
select _as('00000000-0000-0000-0000-000000001502');
select count(*) filter (where display_name is not null) as named,
       count(*) filter (where secret_name is not null) as pseudonyms
from list_round_members(:'spy_round'::uuid);

-- ---------------------------------------------------------------------------
-- 5. OPEN: nobody is anybody's pseudonym, from the first phase.
--
-- Note the round is still OPEN below — real names are NOT gated on the door
-- being shut here, and deliberately: arrival order can only give something
-- away where there is a mapping to give away, and on this dinner there is not.
-- ---------------------------------------------------------------------------

select _as('00000000-0000-0000-0000-000000001501');
select create_round('Nothing Hidden', 'CODE', 'OPEN', 'FREE', null, null,
                    'Europe/Paris', null, false, false, 'LIVE') as open_round \gset
select advance_phase(:'open_round'::uuid, 'OPEN');
select join_code from rounds where id = :'open_round'::uuid \gset open_

select _as('00000000-0000-0000-0000-000000001502');
select join_round(:'open_join_code', null);

\echo '--- OPEN, read by a player, door still open: everyone is named (expect 2 of 2)'
select count(*) filter (where display_name is not null) as named, count(*) as seats
from list_round_members(:'open_round'::uuid);

-- ---------------------------------------------------------------------------
-- 6. ANONYMOUS keeps every one of its covers.
-- ---------------------------------------------------------------------------

\echo '--- ANONYMOUS, read by a player: nobody is named (expect 0)'
select _as('00000000-0000-0000-0000-000000001502');
select count(*) filter (where display_name is not null) as named
from list_round_members(:'code_round'::uuid);

\echo '--- ANONYMOUS, read by the HOST: still nobody (expect 0) — this is the'
\echo '    line that separates SPY from undercover, and it is the one a future'
\echo '    convenience for hosts would quietly cross'
select _as('00000000-0000-0000-0000-000000001501');
select count(*) filter (where display_name is not null) as named
from list_round_members(:'code_round'::uuid);

-- ---------------------------------------------------------------------------
-- 7. The theme shelf: visible, priced, and refused.
-- ---------------------------------------------------------------------------

\echo '--- the whole shelf is readable, and two of five are usable'
select count(*) as themes, count(*) filter (where owned) as usable from list_name_themes();

\echo '--- a paid word list, named directly in the RPC (expect THEME_LOCKED)'
select _refusal($$select create_round('Bought With Nothing', 'CODE', 'ANONYMOUS', 'FREE',
  null, null, 'Europe/Paris', null, false, false, 'LIVE', 'PASTA')$$);

\echo '--- a paid cloth, likewise (expect THEME_LOCKED)'
select _refusal($$select create_round('Bought With Nothing', 'CODE', 'ANONYMOUS', 'FREE',
  null, null, 'Europe/Paris', null, false, false, 'LIVE', 'FOOD', 'XMAS')$$);

\echo '--- the free ones are genuinely free'
select create_round('Free Shelf', 'CODE', 'ANONYMOUS', 'FREE', null, null,
                    'Europe/Paris', null, false, false, 'LIVE', 'BRIGADE', 'ELEGANT')
       as free_round \gset
select name_theme, table_theme from rounds where id = :'free_round'::uuid;

\echo '--- and an owned one unlocks without a code change'
-- As the owner of the table, not as the player: `profile_theme_unlocks` has
-- SELECT and nothing else for `authenticated`, which is the point — an
-- entitlement is written by whatever takes the money, never by the account
-- claiming it. This line standing in for that is exactly the seam a purchase
-- flow will land on.
reset role;
insert into profile_theme_unlocks (profile_id, kind, code)
values ('00000000-0000-0000-0000-000000001501', 'NAME_THEME', 'PASTA');
set role authenticated;
select _as('00000000-0000-0000-0000-000000001501');
select create_round('Bought', 'CODE', 'ANONYMOUS', 'FREE', null, null,
                    'Europe/Paris', null, false, false, 'LIVE', 'PASTA') as paid_round \gset
select name_theme from rounds where id = :'paid_round'::uuid;

-- Through the roster function, not the table: 0032 revoked the client's grants
-- on round_members precisely so that secret_name could never be read straight
-- out of it, and a test that reaches past that is testing a door nobody uses.
-- The word list is not the client's to read either, so the comparison is made
-- as the owner — the assertion is about the generator, not about who may look.
\echo '--- and the pseudonyms come from the list that was paid for'
select secret_name from list_round_members(:'paid_round'::uuid) \gset pasta_
reset role;
select :'pasta_secret_name' like 'Chef %' as well_formed,
       exists (select 1 from secret_name_words w
               where w.theme = 'PASTA' and 'Chef ' || w.word = :'pasta_secret_name')
         as from_the_pasta_list;
set role authenticated;
select _as('00000000-0000-0000-0000-000000001501');

-- ---------------------------------------------------------------------------
-- 8. Costs: the rule settles at creation, the number moves all evening.
-- ---------------------------------------------------------------------------

select _as('00000000-0000-0000-0000-000000001501');
select create_round('Splitting It', 'CODE', 'ANONYMOUS', 'FREE', null, null,
                    'Europe/Paris', null, false, false, 'LIVE') as cost_round \gset
select set_cost_settings(:'cost_round'::uuid, 'SHARED', 2000, 'EUR');
select advance_phase(:'cost_round'::uuid, 'OPEN');

\echo '--- turning sharing off mid-dinner (expect MODE_SETTLED)'
select _refusal(format('select set_cost_settings(%L::uuid, %L, null, %L)', :'cost_round', 'NONE', 'EUR'));

\echo '--- the budget still moves, and null is a real answer'
select set_budget_per_head(:'cost_round'::uuid, 3000);
select budget_per_head from rounds where id = :'cost_round'::uuid;
select set_budget_per_head(:'cost_round'::uuid, null);
select budget_per_head is null as no_ceiling from rounds where id = :'cost_round'::uuid;

\echo '--- and only the Executive Chef moves it'
select _as('00000000-0000-0000-0000-000000001502');
select _refusal(format('select set_budget_per_head(%L::uuid, 500)', :'cost_round'));

\echo '--- a dinner that never split anything has no budget to set (expect COSTS_NOT_SHARED)'
select _as('00000000-0000-0000-0000-000000001501');
select _refusal(format('select set_budget_per_head(%L::uuid, 500)', :'code_round'));

reset role;

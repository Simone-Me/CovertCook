-- Smoke test 13: canned phrases in the reader's language (0064), and shared
-- costs (0065). Run after `npx supabase db reset`; self-contained.
--
-- The two things worth proving:
--
--   * a French phrase reaches an English reader in English, and the *same*
--     thought — not a neighbouring one, which is what a mis-keyed pairing would
--     silently produce;
--   * the settlement sums to exactly zero, including when the total does not
--     divide evenly, because a split that invents or loses a cent is a split
--     nobody can be asked to act on.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000001301', 'sasha@test.local'),
  ('00000000-0000-0000-0000-000000001302', 'tomas@test.local'),
  ('00000000-0000-0000-0000-000000001303', 'ursula@test.local'),
  -- Never joins anything: the control for every "was she at this dinner" check.
  ('00000000-0000-0000-0000-000000001304', 'vero@test.local');

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

-- Sasha reads French, the other two read English.
select _as('00000000-0000-0000-0000-000000001301');
select complete_signup('Sasha', 'fr', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000001302');
select complete_signup('Tomas', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000001303');
select complete_signup('Ursula', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000001304');
select complete_signup('Vero', 'en', true, '[]'::jsonb);

select _as('00000000-0000-0000-0000-000000001301');
select create_round('Split the Bill', 'CODE', 'ANONYMOUS', 'FREE', null, null, 'Europe/Paris', null, false, false, 'LIVE') as round_id \gset

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 1. the budget is agreed before the roulette, not after ==='
\echo '--- twelve euros a head ---'
select set_cost_settings(:'round_id'::uuid, 'SHARED', 1200, 'EUR');
reset role;
select cost_mode, budget_per_head, currency from rounds where id = :'round_id'::uuid;
set role authenticated;

\echo '--- and a player cannot set it: expect a refusal ---'
select _as('00000000-0000-0000-0000-000000001302');
select _refusal(format('select set_cost_settings(%L::uuid, ''SHARED'', 500)', :'round_id'));

select _as('00000000-0000-0000-0000-000000001301');
select advance_phase(:'round_id'::uuid, 'OPEN');

reset role;
select join_code from rounds where id = :'round_id'::uuid \gset
set role authenticated;
select _as('00000000-0000-0000-0000-000000001302');
select join_round(:'join_code', null);
select _as('00000000-0000-0000-0000-000000001303');
select join_round(:'join_code', null);

select _as('00000000-0000-0000-0000-000000001301');
select advance_phase(:'round_id'::uuid, 'LOCKED');
select generate_assignment(:'round_id'::uuid);
select advance_phase(:'round_id'::uuid, 'ASSIGNED');

\echo '--- once the chain exists the budget is fixed: expect BUDGET_TOO_LATE ---'
select _refusal(format('select set_cost_settings(%L::uuid, ''SHARED'', 9900)', :'round_id'));

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 2. a French phrase reaches an English reader in English ==='
-- Sasha, who reads French, sends the canned "can you clarify the quantity"
-- to the cook she is writing for.
reset role;
select p.id as sasha_pairing from pairings p
join round_members m on m.id = p.sender_id
where p.round_id = :'round_id'::uuid
  and m.profile_id = '00000000-0000-0000-0000-000000001301' \gset
select p.cook_id as sashas_cook from pairings p where p.id = :'sasha_pairing'::uuid \gset
select pr.id as cook_profile from round_members m join profiles pr on pr.id = m.profile_id
where m.id = :'sashas_cook'::uuid \gset
select id as fr_template from message_templates
where locale = 'fr' and template_key = 'CLARIFICATION_INGREDIENT_01' \gset
insert into messages (pairing_id, direction, template_id, slot_value)
values (:'sasha_pairing'::uuid, 'SENDER_TO_COOK', :'fr_template'::uuid, 'safran');
set role authenticated;

\echo '--- Sasha wrote it and reads it in French ---'
select _as('00000000-0000-0000-0000-000000001301');
select body from get_thread(:'sasha_pairing'::uuid);

\echo '--- her cook reads English, and gets the SAME thought in English ---'
select _as(:'cook_profile'::uuid);
select body from get_thread(:'sasha_pairing'::uuid);

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 3. and so does the fridge ==='
reset role;
select id as sasha_seat from round_members
where round_id = :'round_id'::uuid and profile_id = '00000000-0000-0000-0000-000000001301' \gset
select id as fr_board from message_templates
where locale = 'fr' and template_key = 'BOARD_NONE_03' \gset
insert into round_messages (round_id, author_member_id, template_id)
values (:'round_id'::uuid, :'sasha_seat'::uuid, :'fr_board'::uuid);
set role authenticated;

\echo '--- posted in French ---'
select _as('00000000-0000-0000-0000-000000001301');
select body from get_board(:'round_id'::uuid);
\echo '--- read in English, and it is the same phrase, not a neighbouring one ---'
select _as('00000000-0000-0000-0000-000000001302');
select body from get_board(:'round_id'::uuid);

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 4. what everybody may see while the dinner is running ==='
select _as('00000000-0000-0000-0000-000000001301');
select record_expense(:'round_id'::uuid, 3500, 'saffron and the beef');
select _as('00000000-0000-0000-0000-000000001302');
select record_expense(:'round_id'::uuid, 800);

\echo '--- Tomas sees his own, the total and the average — and no per-person list ---'
select my_spend_cents, total_cents, average_cents, people, reported, budget_per_head
from costs_so_far(:'round_id'::uuid);

\echo '--- Ursula has said nothing, so her own is zero and the rest is the same ---'
select _as('00000000-0000-0000-0000-000000001303');
select my_spend_cents, total_cents, average_cents, reported from costs_so_far(:'round_id'::uuid);

\echo '--- and a bill mid-dinner is refused: expect SETTLEMENT_TOO_EARLY ---'
select _refusal(format('select * from settle_costs(%L::uuid)', :'round_id'));

\echo '--- recording again replaces rather than adds: 4000 + 800, not 3500 + 4000 + 800 ---'
select _as('00000000-0000-0000-0000-000000001301');
select record_expense(:'round_id'::uuid, 4000, 'saffron, the beef and the wine');
select total_cents from costs_so_far(:'round_id'::uuid);

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 5. the settlement, and the cent that does not divide ==='
select _as('00000000-0000-0000-0000-000000001303');
select record_expense(:'round_id'::uuid, 1000);
-- 4000 + 800 + 1000 = 5800 over three people = 1933.33: the case that has to
-- come out even anyway.
select _as('00000000-0000-0000-0000-000000001301');
select advance_phase(:'round_id'::uuid, 'BRIEFS_CLOSED');
select advance_phase(:'round_id'::uuid, 'DINNER');
select advance_phase(:'round_id'::uuid, 'VOTING');

\echo '--- who spent what, and who owes whom ---'
select who, spent_cents, share_cents, balance_cents from settle_costs(:'round_id'::uuid);

\echo '--- the balances sum to EXACTLY zero (expect 0) ---'
select sum(balance_cents) as must_be_zero from settle_costs(:'round_id'::uuid);

\echo '--- and the shares sum to exactly what was spent (expect t) ---'
select sum(share_cents) = sum(spent_cents) as accounted_for from settle_costs(:'round_id'::uuid);

\echo '--- asked twice, the same answer (expect t) ---'
select bool_and(same) as stable from (
  select a.member_id, a.balance_cents = b.balance_cents as same
  from settle_costs(:'round_id'::uuid) a
  join settle_costs(:'round_id'::uuid) b on b.member_id = a.member_id
) x;

\echo '--- everybody sees the same settlement, and knows which line is theirs ---'
select _as('00000000-0000-0000-0000-000000001302');
select count(*) as lines, count(*) filter (where is_me) as mine from settle_costs(:'round_id'::uuid);

\echo '--- somebody who was never at this dinner sees none of it ---'
select _as('00000000-0000-0000-0000-000000001304');
select _refusal(format('select * from costs_so_far(%L::uuid)', :'round_id'));
select _refusal(format('select record_expense(%L::uuid, 100)', :'round_id'));

-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 6. a dinner that never shared costs has none of this ==='
select _as('00000000-0000-0000-0000-000000001301');
select create_round('Just Dinner', 'CODE', 'ANONYMOUS', 'FREE', null, null, 'Europe/Paris', null, false, false, 'LIVE') as plain \gset
\echo '--- expect COSTS_NOT_SHARED, twice ---'
select _refusal(format('select record_expense(%L::uuid, 500)', :'plain'));
select _refusal(format('select * from settle_costs(%L::uuid)', :'plain'));

reset role;
\echo ''
\echo '=== smoke test 13 complete ==='

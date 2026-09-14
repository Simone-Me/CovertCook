-- Smoke test 18: the author's week, the sealed compass, and the saved table.
-- Run after `npx supabase db reset`; self-contained.
--
-- WHAT THIS EXISTS TO CATCH.
--
--   * THE FREE LINE MOVED (0091, 0093). Two kinds are free in full and the
--     other four open through one hand-picked value a week. That is three
--     rules interacting — `free`, the week's pick, and Crème — and the failure
--     that would hurt is the quiet one: a shut kind that turns out to be
--     choosable, or a free kind that refuses. Both directions are asserted.
--   * THE SHUFFLE IS GONE (0093). It used to mark six or seven rows a week as
--     "this week's pick" beside the one a person chose. Exactly one mark per
--     kind is the whole of the fix, and it is asserted as a count rather than
--     by reading a row.
--   * THE SEAL (0089) is a promise about who knows what and when. A seal that
--     leaks is worse than no seal, so what is asserted is not that the draw
--     happened but that the HOST — the one account with every reason to be
--     told — is not told until the dinner is dealt.
--   * A SAVED TABLE (0090) is the first thing in this schema protected by a
--     policy alone rather than by a SECURITY DEFINER function. So the test is
--     the one a policy can fail: somebody else's rows.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000001801', 'jo@test.local'),
  ('00000000-0000-0000-0000-000000001802', 'kim@test.local');

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
select _as('00000000-0000-0000-0000-000000001801');
select complete_signup('Jo', 'en', true, '[]'::jsonb);
select _as('00000000-0000-0000-0000-000000001802');
select complete_signup('Kim', 'en', true, '[]'::jsonb);

-- ---------------------------------------------------------------------------
-- 1. The shelf: two free kinds, one pick per kind, and nothing else open.
-- ---------------------------------------------------------------------------

select _as('00000000-0000-0000-0000-000000001801');

\echo '--- exactly one thread marked per kind, and never more (expect 0 rows)'
select category, count(*) as marked
from list_fil_rouge() where drawn group by category having count(*) <> 1;

\echo '--- every ingredient and every way of cooking is offered (expect t)'
select bool_and(offered) from list_fil_rouge() where category in ('STAPLE', 'TECHNIQUE');

\echo '--- in the four paid kinds, only the week is offered (expect t)'
select bool_and(offered = drawn) from list_fil_rouge()
where category in ('COUNTRY', 'COLOUR', 'LETTER', 'ERA') and not premium;

\echo '--- and every letter is free of the old K/Q/W/X/Y/Z tax (expect 0)'
select count(*) from fil_rouge_catalogue where category = 'LETTER' and premium;

-- ---------------------------------------------------------------------------
-- 2. What a free host may actually set, and what they may not.
-- ---------------------------------------------------------------------------

select create_round('Free Table', 'CODE', 'ANONYMOUS', 'FREE', null, null,
                    'Europe/Paris', null, false, false, 'LIVE') as free_round \gset

\echo '--- an ingredient nobody picked this week: allowed (expect no error)'
select set_fil_rouge(:'free_round'::uuid, 'STAPLE', 'CHOCOLATE', 'SHARED');

\echo '--- this week''s country: allowed, because a person chose it (expect no error)'
select code from fil_rouge_pick where week = fil_rouge_week(now()) and category = 'COUNTRY' \gset
select set_fil_rouge(:'free_round'::uuid, 'COUNTRY', :'code', 'SHARED');

\echo '--- any other country: refused (expect FIL_ROUGE_LOCKED)'
select _refusal(format(
  'select set_fil_rouge(%L::uuid, ''COUNTRY'', %L, ''SHARED'')',
  :'free_round', (select c.code from fil_rouge_catalogue c
                  where c.category = 'COUNTRY' and c.code <> :'code' limit 1)));

-- ---------------------------------------------------------------------------
-- 3. The compass: drawn on the server, and withheld from the host.
-- ---------------------------------------------------------------------------

select set_fil_rouge(:'free_round'::uuid, 'COUNTRY', '?', 'SHARED');

\echo '--- the dinner has a thread and the host cannot read it (expect t, f, t)'
select
  (select fil_rouge_code is not null from rounds where id = :'free_round'::uuid) as stored,
  (select code is not null from get_fil_rouge(:'free_round'::uuid)) as host_can_read,
  (select sealed from get_fil_rouge(:'free_round'::uuid)) as sealed;

\echo '--- nor does the audit log hand it over (expect t)'
reset role;
select coalesce(payload->>'code', 'withheld') = 'withheld'
from audit_log where round_id = :'free_round'::uuid and action = 'FIL_ROUGE_SET'
order by id desc limit 1;

\echo '--- once the dinner is dealt, the seal opens by itself (expect t, f)'
update rounds set status = 'ASSIGNED' where id = :'free_round'::uuid;
set role authenticated;
select _as('00000000-0000-0000-0000-000000001801');
select code is not null as readable, sealed from get_fil_rouge(:'free_round'::uuid);

-- ---------------------------------------------------------------------------
-- 4. A ready-made table: the three calls the grid makes, in the order it makes
--    them (create_round, then the cost setting, then the menu).
-- ---------------------------------------------------------------------------

select create_round('Party Table', 'CODE', 'ANONYMOUS', 'CATEGORIES', null, null,
                    'Europe/Paris', null, false, false, 'LIVE') as party \gset
select set_cost_settings(:'party'::uuid, 'SHARED', null, 'EUR');
select set_menu_visibility(:'party'::uuid, 'NAMES');

\echo '--- the party table is as the card describes it (expect SHARED, null, NAMES, CATEGORIES)'
select cost_mode, budget_per_head, menu_visibility, slot_mode
from rounds where id = :'party'::uuid;

-- ---------------------------------------------------------------------------
-- 5. A table saved under a name, and the policy that keeps it.
-- ---------------------------------------------------------------------------

insert into round_presets (profile_id, name, setup)
values ('00000000-0000-0000-0000-000000001801', '  Sunday at ours  ',
        '{"access":"CODE","anonymity":"ANONYMOUS"}'::jsonb);

\echo '--- the name is trimmed on the way in (expect "Sunday at ours")'
select name from round_presets where profile_id = '00000000-0000-0000-0000-000000001801';

\echo '--- saving the same name again replaces it rather than doubling it (expect 1 row, INVITE)'
insert into round_presets (profile_id, name, setup)
values ('00000000-0000-0000-0000-000000001801', 'Sunday at ours', '{"access":"INVITE"}'::jsonb)
on conflict (profile_id, name) do update set setup = excluded.setup;
select count(*), max(setup->>'access') from round_presets;

\echo '--- Kim cannot see Jo''s table (expect 0)'
select _as('00000000-0000-0000-0000-000000001802');
select count(*) from round_presets;

\echo '--- nor delete it (expect 1 still there)'
delete from round_presets where name = 'Sunday at ours';
select _as('00000000-0000-0000-0000-000000001801');
select count(*) from round_presets;

reset role;

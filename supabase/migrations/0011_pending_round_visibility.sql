-- A player who joined a round but hasn't been approved yet must still see
-- that the round exists in "my rounds" (with a pending badge) — otherwise
-- a join that actually succeeded looks identical to a failed one. Everything
-- else (roster, dietary panel, briefs, chat...) stays gated behind
-- is_round_member()'s approved check, unchanged.

create or replace function is_round_participant(p_round_id uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from round_members m
    where m.round_id = p_round_id
      and m.profile_id = p_uid
      and m.status = 'ACTIVE'
  )
$$;

drop policy rounds_select_member on rounds;
create policy rounds_select_member on rounds
  for select using (
    host_id = auth.uid() or is_round_participant(id, auth.uid())
  );

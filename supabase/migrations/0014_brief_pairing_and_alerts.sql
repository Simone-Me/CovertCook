-- Three small gaps found while building the brief editor / Cook view /
-- host-alerts-inbox screens (the RPCs behind almost everything else in the
-- game loop already existed and needed no backend change):
--
-- 1. get_my_brief never returned pairing_id, so the Cook had no way to open
--    get_thread(pairing_id) for their conversation with the Sender. Not a
--    spoiler risk — pairing_id is an opaque key the Cook is already
--    entitled to (it's their own thread) — just an oversight from before
--    Cook view existed to expose the gap.
-- 2. save_brief_draft is write-only (upsert) — there was no way for the
--    Sender to re-fetch their own in-progress draft (e.g. after closing and
--    reopening the tab). get_my_brief is the wrong function for this: it's
--    Cook-side only (matches on cook_id, gated to BRIEFS_CLOSED+).
--    get_my_brief_draft below mirrors get_my_assignment's sender-side
--    lookup instead, and is readable from ASSIGNED onward (including after
--    submission, so a Sender can review what they wrote).
-- 3. host_alerts only ever had a select grant; there was no way for a host
--    to resolve/dismiss an alert. Same shape as rounds_update_host_only:
--    host-scoped RLS update policy + grant, not a dedicated RPC, since this
--    table carries no identity-leak risk the way pairings/briefs do.
-- 4. host_alerts.pairing_id -> pairings(id) had no ON DELETE action
--    (defaults to NO ACTION/RESTRICT), so remove_member — which can
--    delete a pairings row outright (0005_assignment.sql) — would fail
--    with a raw foreign-key violation the instant that pairing already had
--    an alert against it. That's not a contrived case: "Cook sends
--    CANNOT_COOK" -> host_alerts row -> "host removes that Cook" is the
--    single most natural sequence the CANNOT_COOK alert exists to prompt,
--    and it's now got a real frontend entry point (RoundHomePage's Remove
--    button). SET NULL rather than CASCADE: the alert is a record that
--    something happened and stays meaningful on its own even once the
--    pairing it originally pointed at is gone.

alter table host_alerts drop constraint host_alerts_pairing_id_fkey;
alter table host_alerts add constraint host_alerts_pairing_id_fkey
  foreign key (pairing_id) references pairings (id) on delete set null;

drop function if exists get_my_brief(uuid);

create or replace function get_my_brief(p_round_id uuid)
returns table (
  pairing_id uuid,
  brief_id uuid,
  dish_name text,
  course course,
  procedure text,
  external_url text,
  difficulty int,
  est_cost text,
  prep_minutes int,
  note_to_cook text,
  contains_tags text[],
  ingredients jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_my_member_id uuid;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  select id into v_my_member_id from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE' and approved;
  if not found then raise exception 'not an active member of this round'; end if;

  if v_round.status not in ('BRIEFS_CLOSED', 'DINNER', 'VOTING', 'RESULTS', 'ARCHIVED') then
    raise exception 'briefs are not visible to cooks yet';
  end if;

  return query
    select
      p.id, b.id, b.dish_name, b.course, b.procedure, b.external_url, b.difficulty,
      b.est_cost, b.prep_minutes, b.note_to_cook, b.contains_tags,
      coalesce(
        (select jsonb_agg(jsonb_build_object('name', bi.name, 'quantity', bi.quantity, 'unit', bi.unit) order by bi.position)
         from brief_ingredients bi where bi.brief_id = b.id),
        '[]'::jsonb
      )
    from briefs b
    join pairings p on p.id = b.pairing_id
    where p.round_id = p_round_id
      and p.assignment_version = v_round.assignment_version
      and p.cook_id = v_my_member_id;
end;
$$;

grant execute on function get_my_brief(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_my_brief_draft — the Sender's own view of what they've written so
-- far, DRAFT or SUBMITTED. Sibling of get_my_assignment (same sender-side
-- lookup, same status gate) rather than of get_my_brief (which is the
-- Cook's view of the finished dish).
-- ---------------------------------------------------------------------------

create or replace function get_my_brief_draft(p_round_id uuid)
returns table (
  brief_id uuid,
  status brief_status,
  dish_name text,
  course course,
  procedure text,
  external_url text,
  difficulty int,
  est_cost text,
  prep_minutes int,
  note_to_cook text,
  contains_tags text[],
  contains_tags_confirmed boolean,
  ingredients jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_my_member_id uuid;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  -- round_members.status is qualified below because this function's own
  -- OUT parameter list (RETURNS TABLE) declares a column also named
  -- `status` (the brief's DRAFT/SUBMITTED state) -- PL/pgSQL exposes OUT
  -- parameters as implicitly-declared variables in scope for the whole
  -- function body, so a bare `status` here would be ambiguous between the
  -- two and fail to compile.
  select id into v_my_member_id from round_members
  where round_id = p_round_id and profile_id = v_uid and round_members.status = 'ACTIVE' and approved;
  if not found then raise exception 'not an active member of this round'; end if;

  if v_round.status not in ('ASSIGNED', 'BRIEFS_CLOSED', 'DINNER', 'VOTING', 'RESULTS', 'ARCHIVED') then
    raise exception 'no assignment yet';
  end if;

  return query
    select
      b.id, b.status, b.dish_name, b.course, b.procedure, b.external_url, b.difficulty,
      b.est_cost, b.prep_minutes, b.note_to_cook, b.contains_tags, b.contains_tags_confirmed,
      coalesce(
        (select jsonb_agg(jsonb_build_object('name', bi.name, 'quantity', bi.quantity, 'unit', bi.unit) order by bi.position)
         from brief_ingredients bi where bi.brief_id = b.id),
        '[]'::jsonb
      )
    from briefs b
    join pairings p on p.id = b.pairing_id
    where p.round_id = p_round_id
      and p.assignment_version = v_round.assignment_version
      and p.sender_id = v_my_member_id;
end;
$$;

grant execute on function get_my_brief_draft(uuid) to authenticated;

create policy host_alerts_update_host on host_alerts
  for update using (is_round_host(round_id, auth.uid()))
  with check (is_round_host(round_id, auth.uid()));

grant update on host_alerts to authenticated;

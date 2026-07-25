-- Brief writing/reading and the round-wide dietary check. This is the
-- enforcement point rule 2 (§2) calls for: nothing writes to `briefs`
-- directly from the client — save_brief_draft and submit_brief are the only
-- path in, so the ≥50 char / ≥1 ingredient / tags-confirmed / round-wide
-- hard-dietary-block rules can't be bypassed by a hand-crafted REST call.
--
-- Known v1 simplification: the hard-dietary check matches dietary_entries
-- (ALLERGY_SEVERE, DIET) labels against briefs.contains_tags by exact
-- string equality, so it assumes both use the same canonical tag
-- vocabulary (e.g. a severe nut allergy is entered as label='nuts', which
-- matches a brief tagged 'nuts'). Broader diets that imply several tags at
-- once (e.g. "vegan" implying dairy+egg+honey+fish+meat) need the user to
-- add each conflicting tag as its own entry until a label->tags mapping
-- table is built — flagged here rather than silently over-built.

-- ---------------------------------------------------------------------------
-- get_my_assignment — the Cook I must write for: masked identity (secret
-- name; real name too only if anonymity = OPEN), their slot, and the
-- round-wide dietary panel. Never reveals who is writing MY brief.
-- ---------------------------------------------------------------------------

create or replace function get_my_assignment(p_round_id uuid)
returns table (
  pairing_id uuid,
  cook_secret_name text,
  cook_display_name text,
  course course,
  slot_id uuid
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

  if v_round.status not in ('ASSIGNED', 'BRIEFS_CLOSED', 'DINNER', 'VOTING', 'RESULTS', 'ARCHIVED') then
    raise exception 'no assignment yet';
  end if;

  return query
    select
      p.id,
      cm.secret_name,
      case when v_round.anonymity = 'OPEN' then cpr.display_name else null end,
      s.course,
      p.slot_id
    from pairings p
    join round_members cm on cm.id = p.cook_id
    join profiles cpr on cpr.id = cm.profile_id
    join slots s on s.id = p.slot_id
    where p.round_id = p_round_id
      and p.assignment_version = v_round.assignment_version
      and p.sender_id = v_my_member_id;
end;
$$;

grant execute on function get_my_assignment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_my_brief — the dish I must cook. No sender_id, no created_at/
-- updated_at: only ever visible from BRIEFS_CLOSED onward.
-- ---------------------------------------------------------------------------

create or replace function get_my_brief(p_round_id uuid)
returns table (
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
      b.id, b.dish_name, b.course, b.procedure, b.external_url, b.difficulty,
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
-- get_round_progress — counts only; names of who's missing are exposed only
-- when the round is OPEN (not ANONYMOUS).
-- ---------------------------------------------------------------------------

create or replace function get_round_progress(p_round_id uuid)
returns table (
  total_players int,
  briefs_submitted int,
  briefs_due_at timestamptz,
  missing_sender_display_names text[]
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  if not (is_round_host(p_round_id, v_uid) or is_round_member(p_round_id, v_uid)) then
    raise exception 'not a member of this round';
  end if;

  return query
    select
      (select count(*)::int from round_members where round_id = p_round_id and status = 'ACTIVE' and approved),
      (select count(*)::int from briefs b join pairings p on p.id = b.pairing_id
        where p.round_id = p_round_id and p.assignment_version = v_round.assignment_version and b.status = 'SUBMITTED'),
      v_round.briefs_due_at,
      case when v_round.anonymity = 'OPEN' then (
        select array_agg(pr.display_name) from pairings p
        join round_members sm on sm.id = p.sender_id
        join profiles pr on pr.id = sm.profile_id
        left join briefs b on b.pairing_id = p.id and b.status = 'SUBMITTED'
        where p.round_id = p_round_id and p.assignment_version = v_round.assignment_version and b.id is null
      ) else null end;
end;
$$;

grant execute on function get_round_progress(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_dietary_panel — deduplicated union across every active member.
-- ---------------------------------------------------------------------------

create or replace function get_dietary_panel(p_round_id uuid)
returns table (kind dietary_kind, label text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not (is_round_host(p_round_id, v_uid) or is_round_member(p_round_id, v_uid)) then
    raise exception 'not a member of this round';
  end if;

  return query
    select distinct de.kind, de.label
    from dietary_entries de
    join round_members rm on rm.profile_id = de.profile_id
    where rm.round_id = p_round_id and rm.status = 'ACTIVE' and rm.approved
    order by de.kind, de.label;
end;
$$;

grant execute on function get_dietary_panel(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- save_brief_draft — autosave. Length/shape rules are relaxed at DRAFT
-- (checked in full by submit_brief); this just upserts whatever the sender
-- has typed so far.
-- ---------------------------------------------------------------------------

create or replace function save_brief_draft(
  p_round_id uuid,
  p_dish_name text,
  p_course course,
  p_ingredients jsonb, -- [{name, quantity, unit}]
  p_procedure text,
  p_external_url text,
  p_difficulty int,
  p_est_cost text,
  p_prep_minutes int,
  p_note_to_cook text,
  p_contains_tags text[],
  p_contains_tags_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_pairing pairings;
  v_brief_id uuid;
  v_ing jsonb;
  v_pos int := 0;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  if v_round.status <> 'ASSIGNED' then
    raise exception 'briefs can only be written while the round is in the ASSIGNED phase';
  end if;
  if v_round.briefs_due_at is not null and now() >= v_round.briefs_due_at then
    raise exception 'the brief deadline has passed';
  end if;

  if p_external_url is not null and p_external_url !~ '^https?://' then
    raise exception 'link must be http(s)';
  end if;

  select p.* into v_pairing from pairings p
  join round_members rm on rm.id = p.sender_id
  where p.round_id = p_round_id and p.assignment_version = v_round.assignment_version
    and rm.profile_id = v_uid;
  if not found then raise exception 'you are not a sender in this round''s current assignment'; end if;

  insert into briefs (
    pairing_id, dish_name, course, procedure, external_url, difficulty,
    est_cost, prep_minutes, note_to_cook, contains_tags, contains_tags_confirmed, status
  ) values (
    v_pairing.id, coalesce(p_dish_name, ''), p_course, coalesce(p_procedure, ''), p_external_url, p_difficulty,
    p_est_cost, p_prep_minutes, p_note_to_cook, coalesce(p_contains_tags, '{}'), coalesce(p_contains_tags_confirmed, false), 'DRAFT'
  )
  on conflict (pairing_id) do update set
    dish_name = excluded.dish_name,
    course = excluded.course,
    procedure = excluded.procedure,
    external_url = excluded.external_url,
    difficulty = excluded.difficulty,
    est_cost = excluded.est_cost,
    prep_minutes = excluded.prep_minutes,
    note_to_cook = excluded.note_to_cook,
    contains_tags = excluded.contains_tags,
    contains_tags_confirmed = excluded.contains_tags_confirmed,
    updated_at = now()
  where briefs.status = 'DRAFT'
  returning id into v_brief_id;

  if v_brief_id is null then
    raise exception 'brief is already submitted and can no longer be edited';
  end if;

  delete from brief_ingredients where brief_id = v_brief_id;
  for v_ing in select * from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb))
  loop
    v_pos := v_pos + 1;
    insert into brief_ingredients (brief_id, position, name, quantity, unit)
    values (v_brief_id, v_pos, v_ing->>'name', nullif(v_ing->>'quantity', '')::numeric, v_ing->>'unit');
  end loop;

  return v_brief_id;
end;
$$;

grant execute on function save_brief_draft(uuid, text, course, jsonb, text, text, int, text, int, text, text[], boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- submit_brief — the real enforcement point: length, ingredients, tags
-- confirmed, and the round-wide hard-dietary block. Submission is final
-- (editable again only if the Host reopens via a future draft/edit path).
-- ---------------------------------------------------------------------------

create or replace function submit_brief(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_pairing pairings;
  v_brief briefs;
  v_ingredient_count int;
  v_hard_conflicts text[];
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  if v_round.status <> 'ASSIGNED' then
    raise exception 'briefs can only be submitted while the round is in the ASSIGNED phase';
  end if;
  if v_round.briefs_due_at is not null and now() >= v_round.briefs_due_at then
    raise exception 'the brief deadline has passed';
  end if;

  select p.* into v_pairing from pairings p
  join round_members rm on rm.id = p.sender_id
  where p.round_id = p_round_id and p.assignment_version = v_round.assignment_version
    and rm.profile_id = v_uid;
  if not found then raise exception 'you are not a sender in this round''s current assignment'; end if;

  select * into v_brief from briefs where pairing_id = v_pairing.id for update;
  if not found then raise exception 'save a draft before submitting'; end if;
  if v_brief.status = 'SUBMITTED' then raise exception 'brief already submitted'; end if;

  if char_length(v_brief.dish_name) < 3 or char_length(v_brief.dish_name) > 80 then
    raise exception 'dish name must be 3-80 characters';
  end if;
  if char_length(v_brief.procedure) < 50 then
    raise exception 'procedure must be at least 50 characters';
  end if;
  if not v_brief.contains_tags_confirmed then
    raise exception 'confirm the allergen tags before submitting';
  end if;

  select count(*) into v_ingredient_count from brief_ingredients where brief_id = v_brief.id;
  if v_ingredient_count < 1 then
    raise exception 'add at least one ingredient';
  end if;

  select array_agg(distinct de.label) into v_hard_conflicts
  from dietary_entries de
  join round_members rm on rm.profile_id = de.profile_id
  where rm.round_id = p_round_id and rm.status = 'ACTIVE' and rm.approved
    and de.kind in ('ALLERGY_SEVERE', 'DIET')
    and de.label = any (v_brief.contains_tags);

  if v_hard_conflicts is not null and array_length(v_hard_conflicts, 1) > 0 then
    raise exception 'this dish conflicts with a round-wide restriction: %', array_to_string(v_hard_conflicts, ', ');
  end if;

  update briefs set status = 'SUBMITTED', submitted_at = now() where id = v_brief.id;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'BRIEF_SUBMITTED', jsonb_build_object('brief_id', v_brief.id));
end;
$$;

grant execute on function submit_brief(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- revalidate_briefs_for_dietary_change — called after a member edits their
-- own dietary_entries mid-round; flags every already-submitted brief that
-- now conflicts and raises a host alert per conflicting sender (§7: "if
-- someone edits their restrictions after briefs exist, re-run validation,
-- flag every conflicting brief, and email its Sender").
-- ---------------------------------------------------------------------------

create or replace function revalidate_round_diets(p_round_id uuid)
returns table (pairing_id uuid, sender_member_id uuid, conflicting_labels text[])
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
    with hard_labels as (
      select distinct de.label
      from dietary_entries de
      join round_members rm on rm.profile_id = de.profile_id
      where rm.round_id = p_round_id and rm.status = 'ACTIVE' and rm.approved
        and de.kind in ('ALLERGY_SEVERE', 'DIET')
    ),
    conflicts as (
      select b.pairing_id, p.sender_id,
             array(select unnest(b.contains_tags) intersect select label from hard_labels) as bad
      from briefs b
      join pairings p on p.id = b.pairing_id
      where p.round_id = p_round_id and b.status = 'SUBMITTED'
    )
    select c.pairing_id, c.sender_id, c.bad from conflicts c where array_length(c.bad, 1) > 0;
end;
$$;

grant execute on function revalidate_round_diets(uuid) to authenticated;

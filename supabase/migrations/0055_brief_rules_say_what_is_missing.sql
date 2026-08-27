-- A recipe that was refused by a constraint name.
--
-- 0028 relaxed what a submittable recipe has to contain — a link, or something
-- written out — and it relaxed it in `submit_brief`. It did not touch the
-- table, and the table still carried the rule 0028 was replacing:
--
--   check (status = 'DRAFT' or char_length(procedure) >= 50)
--
-- Inline table checks are named by position, so that one is `briefs_check1`.
-- The two rules disagreed on every recipe with a link and a short procedure,
-- and the disagreement surfaced at the worst possible moment: `submit_brief`
-- said yes, ran its UPDATE to status = 'SUBMITTED', and the row was refused by
-- the table on the way out. What the sender read was
--
--   new row for relation "briefs" violates check constraint "briefs_check1"
--
-- which names a constraint they cannot see, in a table they do not know about,
-- and says nothing at all about which of the four fields in front of them is
-- the problem. This migration is in two halves, and they are the same fix from
-- two directions: the table stops holding a rule the function has replaced,
-- and the function stops raising anything a person cannot act on.
--
-- THE RULE, once, in words. A recipe may be submitted when it has a name, and
-- then either a link to follow or the recipe written out — and "written out"
-- means both halves of it, the procedure AND the ingredients, because a cook
-- handed a method with no list has to reverse-engineer their shopping from the
-- prose. That last part is a tightening, not a relaxation: it was previously
-- an OR, which let a bare list of ingredients through as a complete recipe.

-- ---------------------------------------------------------------------------
-- The table drops the rule it no longer owns.
--
-- Dropped by what it says rather than by what it is called: `briefs_check1` is
-- a name Postgres handed out by counting, and counting is not a promise. A
-- database restored from a dump that happened to declare the checks in another
-- order would have the same rule under another number, and this would silently
-- drop nothing at all.
--
-- What replaces it is the same shape as the function's rule but weaker on
-- purpose: a CHECK sees one row and cannot count that row's ingredients, so
-- the ingredient half lives in `submit_brief` alone. The table keeps only what
-- it can actually see — a submitted recipe is never completely empty — and
-- gets a name that says which rule it is, so if it ever does fire, the message
-- carries something to read.
-- ---------------------------------------------------------------------------

do $$
declare
  v_name text;
begin
  for v_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'briefs'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%procedure%'
      -- The minimum, and only the minimum. A LIKE on '50' would also have
      -- matched `char_length(procedure) <= 5000`, which is the cap on how long
      -- a recipe may be — a rule nothing here is replacing, and one that would
      -- have been silently deleted by a migration about the opposite end.
      and pg_get_constraintdef(con.oid) ~ '>=\s*50\s*\)'
  loop
    execute format('alter table briefs drop constraint %I', v_name);
  end loop;
end $$;

alter table briefs drop constraint if exists briefs_submitted_recipe_not_empty;

alter table briefs add constraint briefs_submitted_recipe_not_empty check (
  status = 'DRAFT'
  or coalesce(btrim(external_url), '') <> ''
  or char_length(btrim(coalesce(procedure, ''))) >= 30
);

comment on constraint briefs_submitted_recipe_not_empty on briefs is
  'A submitted recipe has a link or a written procedure. The ingredient half of '
  'the same rule lives in submit_brief, which can count rows in another table.';

-- ---------------------------------------------------------------------------
-- submit_brief — one named refusal per field, and the field is the name.
--
-- Every `raise` below is a code the interface translates and points at the
-- input it belongs to. That is the difference between "something is wrong with
-- this dinner" and "the ingredients are empty": the second one can be acted on
-- without guessing, which is the whole reason the codes exist rather than
-- sentences. They are matched in the frontend against briefs.errors.* — adding
-- one here without adding it there produces the raw code on screen, so the two
-- lists move together.
--
-- The order is the order the form reads in. Someone who has left three things
-- out is told about the first one, fixes it, and is told about the next: a
-- refusal that lists every fault at once is read as a wall and re-read as an
-- accusation. The frontend does check all of them at once, before the call —
-- but the frontend is a convenience and this is the rule, so this has to hold
-- on its own for a hand-made REST call too.
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
  v_my_member_id uuid;
  v_brief briefs;
  v_ingredient_count int;
  v_conflict text;
  v_link text;
  v_procedure text;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  if v_round.status <> 'ASSIGNED' then
    raise exception 'ROUND_NOT_ACCEPTING';
  end if;
  if v_round.briefs_due_at is not null and now() >= v_round.briefs_due_at then
    raise exception 'DEADLINE_PASSED';
  end if;

  select id into v_my_member_id from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE' and approved;
  if not found then raise exception 'not an active member of this round'; end if;

  select b.* into v_brief from briefs b
  join pairings p on p.id = b.pairing_id
  where p.round_id = p_round_id
    and p.assignment_version = v_round.assignment_version
    and p.sender_id = v_my_member_id;
  if not found then raise exception 'NOTHING_WRITTEN'; end if;

  -- Said as its own refusal because it is the one that is not a mistake: the
  -- recipe is fine, it has already gone, and it is not coming back to be
  -- edited. The interface says so on the button, before the press.
  if v_brief.status = 'SUBMITTED' then
    raise exception 'ALREADY_SUBMITTED';
  end if;

  v_link := btrim(coalesce(v_brief.external_url, ''));
  v_procedure := btrim(coalesce(v_brief.procedure, ''));

  if btrim(coalesce(v_brief.dish_name, '')) = '' then
    raise exception 'DISH_NAME_MISSING';
  end if;
  if char_length(v_brief.dish_name) < 3 or char_length(v_brief.dish_name) > 80 then
    raise exception 'DISH_NAME_LENGTH';
  end if;

  if v_link <> '' and v_link !~ '^https?://' then
    raise exception 'LINK_MALFORMED';
  end if;

  select count(*) into v_ingredient_count
  from brief_ingredients
  where brief_id = v_brief.id and btrim(coalesce(name, '')) <> '';

  -- A link is a whole recipe on its own: it carries the method and the list,
  -- and asking somebody to retype both alongside it is asking twice.
  if v_link = '' then
    if v_procedure = '' and v_ingredient_count < 1 then
      raise exception 'RECIPE_TOO_EMPTY';
    end if;
    if v_procedure = '' then
      raise exception 'PROCEDURE_MISSING';
    end if;
    -- 30 characters is not a quality bar, it is the difference between a
    -- method and a word typed to get past the form.
    if char_length(v_procedure) < 30 then
      raise exception 'PROCEDURE_TOO_SHORT';
    end if;
    if v_ingredient_count < 1 then
      raise exception 'INGREDIENTS_MISSING';
    end if;
  end if;

  -- Unchanged and deliberately so: the dish goes on a shared table, so it is
  -- checked against everyone's restrictions, not just its cook's. The label
  -- travels with the code because the refusal is useless without it — which
  -- of eleven declared allergens this dish hit is the entire message.
  select label into v_conflict
  from dietary_entries de
  join round_members m on m.profile_id = de.profile_id
  where m.round_id = p_round_id and m.status = 'ACTIVE' and m.approved
    and de.kind in ('ALLERGY_SEVERE', 'DIET')
    and de.label = any(v_brief.contains_tags)
  limit 1;

  if v_conflict is not null then
    raise exception 'DIETARY_CONFLICT|%', v_conflict;
  end if;

  update briefs set status = 'SUBMITTED', submitted_at = now(), delivered = true
  where id = v_brief.id;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'BRIEF_SUBMITTED', jsonb_build_object('brief_id', v_brief.id));
end;
$$;

grant execute on function submit_brief(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- save_brief_draft — the same treatment for the one thing a draft can get
-- wrong. A draft is allowed to be half-written, empty, or nonsense; the single
-- exception is the link, because the column itself refuses anything that is
-- not http(s) and would otherwise refuse it as `briefs_external_url_check`
-- while the person was still typing.
--
-- The sentence it used to raise — 'link must be http(s)' — was already
-- readable, and that was the problem: it was readable English on a French
-- screen, and it went out through the generic error box because nothing
-- matched it. Now it is a code, in the same list as the rest, and empty
-- becomes NULL rather than an empty string so clearing the field is not
-- itself a malformed link.
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
  v_name text;
  v_pos int := 0;
  v_link text;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  if v_round.status <> 'ASSIGNED' then
    raise exception 'ROUND_NOT_ACCEPTING';
  end if;
  if v_round.briefs_due_at is not null and now() >= v_round.briefs_due_at then
    raise exception 'DEADLINE_PASSED';
  end if;

  v_link := nullif(btrim(coalesce(p_external_url, '')), '');
  if v_link is not null and v_link !~ '^https?://' then
    raise exception 'LINK_MALFORMED';
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
    v_pairing.id, coalesce(p_dish_name, ''), p_course, coalesce(p_procedure, ''), v_link, p_difficulty,
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
    raise exception 'ALREADY_SUBMITTED';
  end if;

  delete from brief_ingredients where brief_id = v_brief_id;
  for v_ing in select * from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb))
  loop
    -- A blank line in the ingredients box is a blank line, not an ingredient
    -- called nothing: brief_ingredients.name refuses an empty string, and the
    -- refusal used to arrive as a constraint name during an autosave nobody
    -- had asked for.
    v_name := btrim(coalesce(v_ing->>'name', ''));
    continue when v_name = '';
    v_pos := v_pos + 1;
    insert into brief_ingredients (brief_id, position, name, quantity, unit)
    values (v_brief_id, v_pos, left(v_name, 80), nullif(v_ing->>'quantity', '')::numeric, nullif(btrim(coalesce(v_ing->>'unit', '')), ''));
  end loop;

  return v_brief_id;
end;
$$;

grant execute on function save_brief_draft(uuid, text, course, jsonb, text, text, int, text, int, text, text[], boolean) to authenticated;

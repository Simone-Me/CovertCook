-- Allergens stop blocking and start informing.
--
-- Until now a dish whose tags matched anyone's severe allergy or diet
-- could not be submitted at all. The intent was safety; the effect was a
-- refusal at the last moment, addressed to the one person who could do
-- nothing about it — the sender had already written the recipe, and the
-- allergic guest never learned a thing.
--
-- The new rule matches how a real dinner handles this: the dish is allowed,
-- everyone who needs to know is told, and the person with the allergy
-- decides for themselves.
--
--   - the sender is asked to put a card by the dish (frontend, where the
--     tags are found in what they wrote)
--   - the Executive Chef is told an allergen is on the table, by name, so
--     they can say it out loud when the food goes down
--   - the dish is served
--
-- This is a deliberate product decision, not a loosened check: a card is
-- what a host would do, and an adult with an allergy at a shared buffet is
-- better served by knowing than by one dish silently never existing. The
-- detection itself is unchanged and still runs against the whole table's
-- restrictions rather than one cook's.

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
  v_flagged text[];
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  if v_round.status <> 'ASSIGNED' then
    raise exception 'briefs can only be submitted while the round is assigned';
  end if;
  if v_round.briefs_due_at is not null and now() >= v_round.briefs_due_at then
    raise exception 'the brief deadline has passed';
  end if;

  select id into v_my_member_id from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE' and approved;
  if not found then raise exception 'not an active member of this round'; end if;

  select b.* into v_brief from briefs b
  join pairings p on p.id = b.pairing_id
  where p.round_id = p_round_id
    and p.assignment_version = v_round.assignment_version
    and p.sender_id = v_my_member_id;
  if not found then raise exception 'nothing written yet'; end if;
  if v_brief.status = 'SUBMITTED' then
    raise exception 'brief is already submitted and can no longer be edited';
  end if;

  if char_length(coalesce(v_brief.dish_name, '')) < 3 or char_length(v_brief.dish_name) > 80 then
    raise exception 'DISH_NAME_LENGTH';
  end if;

  select count(*) into v_ingredient_count from brief_ingredients where brief_id = v_brief.id;

  if coalesce(v_brief.external_url, '') = '' then
    if char_length(coalesce(v_brief.procedure, '')) < 30 and v_ingredient_count < 1 then
      raise exception 'RECIPE_TOO_EMPTY';
    end if;
  end if;

  -- Same detection as before, different consequence. Severe allergies and
  -- diets are gathered rather than used to refuse.
  select coalesce(array_agg(distinct de.label), '{}') into v_flagged
  from dietary_entries de
  join round_members m on m.profile_id = de.profile_id
  where m.round_id = p_round_id and m.status = 'ACTIVE' and m.approved
    and de.kind in ('ALLERGY_SEVERE', 'DIET')
    and de.label = any(v_brief.contains_tags);

  update briefs set status = 'SUBMITTED', submitted_at = now(), delivered = true
  where id = v_brief.id;

  if array_length(v_flagged, 1) > 0 then
    -- The Executive Chef is the one who can say it out loud when the food
    -- goes on the table, so they are told which dish and which allergen.
    -- Not a warning about a mistake: a note about the evening.
    insert into host_alerts (round_id, kind, pairing_id, payload)
    values (p_round_id, 'OTHER', v_brief.pairing_id, jsonb_build_object(
      'type', 'ALLERGEN_ON_TABLE',
      'dish_name', v_brief.dish_name,
      'labels', v_flagged
    ));
  end if;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'BRIEF_SUBMITTED', jsonb_build_object(
    'brief_id', v_brief.id, 'flagged', v_flagged
  ));
end;
$$;

grant execute on function submit_brief(uuid) to authenticated;

-- What the Executive Chef needs at the table: which dishes carry something
-- somebody flagged, so it can be announced rather than discovered.
create or replace function get_allergen_dishes(p_round_id uuid)
returns table (dish_name text, labels text[])
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

  -- Every diner needs this, not only the host — the whole point is that the
  -- person with the allergy can decide for themselves. Dish names only; who
  -- cooked what stays secret until the reveal.
  if not (is_round_host(p_round_id, v_uid) or is_round_member(p_round_id, v_uid)) then
    raise exception 'not a member of this round';
  end if;

  return query
  select b.dish_name, array_agg(distinct de.label)
  from briefs b
  join pairings p on p.id = b.pairing_id
  join round_members m on m.round_id = p.round_id
  join dietary_entries de on de.profile_id = m.profile_id
  where p.round_id = p_round_id
    and p.assignment_version = v_round.assignment_version
    and b.status = 'SUBMITTED'
    and m.status = 'ACTIVE' and m.approved
    and de.kind in ('ALLERGY_SEVERE', 'ALLERGY_MILD', 'DIET')
    and de.label = any(b.contains_tags)
  group by b.dish_name;
end;
$$;

grant execute on function get_allergen_dishes(uuid) to authenticated;

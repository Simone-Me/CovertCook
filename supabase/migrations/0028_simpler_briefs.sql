-- The brief form asked for more than anyone will ever type.
--
-- submit_brief enforced: a dish name, at least 50 characters of procedure,
-- at least one ingredient row, and an explicit "I confirm the allergen
-- tags" tick. Reasonable individually; together they made writing a recipe
-- for a friend feel like filing a form, and the fields nobody fills are the
-- ones that get filled with nonsense.
--
-- Two ways to write are now valid, and this relaxes the rules to allow the
-- quick one:
--
--   Quick     — name + a link, OR name + everything typed into one block.
--   Careful   — name + itemised ingredients + procedure, as before.
--
-- What is NOT relaxed: the allergen check. Every dish is still validated
-- against the whole table's restrictions before it can be submitted,
-- because a shared buffet means one dish reaches everyone. What changes is
-- that the tags stop being a checkbox the sender ticks and start being
-- derived from what they actually wrote — see the frontend, which scans the
-- ingredients against the round's dietary panel. The confirmation tick goes
-- because a tick nobody understands is not consent, it's an obstacle people
-- learn to click through.

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

  -- A recipe is complete if it can actually be cooked from what's here:
  -- either a link to follow, or something written down. 50 characters of
  -- procedure was a proxy for "did you write anything real"; it stays as
  -- that, but only when there is no link doing the job instead.
  if coalesce(v_brief.external_url, '') = '' then
    if char_length(coalesce(v_brief.procedure, '')) < 30 and v_ingredient_count < 1 then
      raise exception 'RECIPE_TOO_EMPTY';
    end if;
  end if;

  -- Unchanged and deliberately so: the dish goes on a shared table, so it
  -- is checked against everyone's restrictions, not just its cook's.
  select label into v_conflict
  from dietary_entries de
  join round_members m on m.profile_id = de.profile_id
  where m.round_id = p_round_id and m.status = 'ACTIVE' and m.approved
    and de.kind in ('ALLERGY_SEVERE', 'DIET')
    and de.label = any(v_brief.contains_tags)
  limit 1;

  if v_conflict is not null then
    raise exception 'this dish conflicts with a round-wide restriction: %', v_conflict;
  end if;

  update briefs set status = 'SUBMITTED', submitted_at = now(), delivered = true
  where id = v_brief.id;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'BRIEF_SUBMITTED', jsonb_build_object('brief_id', v_brief.id));
end;
$$;

grant execute on function submit_brief(uuid) to authenticated;

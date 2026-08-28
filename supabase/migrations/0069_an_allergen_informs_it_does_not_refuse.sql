-- An allergen informs. It does not refuse. (Again — 0029 already said so.)
--
-- THIS IS A REVERT, AND WHAT MAKES IT WORTH A FILE OF ITS OWN IS HOW THE
-- REVERSAL HAPPENED. 0029 removed the hard block on purpose and argued the
-- case at length: a refusal arrives at the last moment, addressed to the one
-- person who can do nothing about it — the sender has already written the
-- recipe — and the guest with the allergy learns nothing at all. The dish is
-- allowed, the Executive Chef is told which allergen is on the table so it can
-- be said out loud, a card goes by the dish, and the person it concerns decides
-- for themselves. That is what a host does.
--
-- 0055 then rewrote `submit_brief` from top to bottom for an unrelated and good
-- reason — so that a refusal names the field that is missing rather than saying
-- "invalid" — and in retyping the function it carried the pre-0029 check back
-- in. Above it, this comment:
--
--     -- Unchanged and deliberately so: the dish goes on a shared table, so it
--     -- is checked against everyone's restrictions, not just its cook's.
--
-- The first half is true and the word "unchanged" is not. That sentence is why
-- nobody caught it: a line claiming to preserve a decision, sitting on top of
-- one reversing it, reads as a reason to move on. **A rewrite is not a safe
-- refactor when the thing being rewritten is where a product decision lives.**
--
-- IT HAS BEEN BROKEN SINCE 0055 SHIPPED, and the app has been contradicting
-- itself on one screen the whole time. The brief editor finds the allergens in
-- what somebody wrote and tells them, in these words: "It contains nuts, and
-- somebody at this table has said that matters to them. A card by the dish is
-- what lets them decide for themselves." Then the send button refused the
-- recipe. The interface was running 0029 and the database was running 0028.
--
-- `smoke_test7` has been failing this whole time and says so in as many words —
-- "this used to raise; expect it to succeed now". One ERROR line in four
-- hundred lines of psql output, in a suite that is read by eye.
--
-- Everything else 0055 did is kept exactly: every named refusal, the link rule,
-- the thirty-character floor, all of it. The only removal is the raise.
--
-- Safe as `create or replace` — the signature and the `void` return are
-- identical to 0055's, so this is not the trap 0068 fell into two migrations
-- ago (a new OUT column needs a DROP first, or the whole file is refused).

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

  -- THE SAME DETECTION, THE OTHER CONSEQUENCE. Still checked against the whole
  -- table rather than one cook, because the food goes on a shared buffet — that
  -- half of 0055's comment was always right. What changes is what happens next:
  -- the labels are gathered instead of thrown.
  select coalesce(array_agg(distinct de.label), '{}') into v_flagged
  from dietary_entries de
  join round_members m on m.profile_id = de.profile_id
  where m.round_id = p_round_id and m.status = 'ACTIVE' and m.approved
    and de.kind in ('ALLERGY_SEVERE', 'DIET')
    and de.label = any(v_brief.contains_tags);

  update briefs set status = 'SUBMITTED', submitted_at = now(), delivered = true
  where id = v_brief.id;

  if array_length(v_flagged, 1) > 0 then
    -- The Executive Chef is the one who can say it out loud when the food goes
    -- on the table, so they are told which dish and which allergen. Not a
    -- warning about a mistake: a note about the evening.
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

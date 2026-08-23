-- Two changes to what happens when a cook drops out after the assignment
-- exists. Both concern remove_member; nothing else in the chain machinery
-- moves.
--
-- 1. A real crash, fixed. The branch that preserves a departing member's
--    finished brief did:
--
--        update pairings set sender_id = v_edge_in.sender_id
--        where id = v_edge_out.id;
--        delete from pairings where id = v_edge_in.id;
--
--    which briefly puts two rows on the same sender_id — and
--    `unique (round_id, assignment_version, lap, sender_id)` (0001) is not
--    deferrable, so the UPDATE aborts with a raw duplicate-key error before
--    the DELETE can clear the conflict. It fires whenever the departing
--    member had submitted and their own sender had not: precisely the case
--    that branch exists to handle. Fixed by deleting first — v_edge_in is
--    already held in a record variable, so nothing is lost by the reorder.
--    This is what made supabase/smoke_test3.sql fail about one run in three,
--    depending on which random Sattolo assignment came out.
--
-- 2. The host now chooses what a departure costs, instead of the function
--    deciding. Removing a link from the chain always loses one dish; which
--    one, and who gets disturbed, is a judgement call the Executive Chef is
--    better placed to make than the database:
--
--      COLLAPSE (default, previous behaviour) — reconnect the neighbours,
--        A -> B. Every remaining cook still has something to make, but B is
--        handed a different recipe than the one they were already given,
--        which is disruptive if they have already shopped for it.
--
--      LEAVE — change nothing but the roster. B keeps cooking exactly the
--        brief X wrote for them; the brief A wrote for X simply goes
--        uncooked. Nobody is disturbed, and the buffet is one dish shorter.
--        Better late in the round, when people have already started.
--
-- LEAVE is the first thing in this schema that can leave a pairing pointing
-- at a cook who is no longer active, and a dish nobody will cook must not
-- appear on the ballot — submit_ballot demands every eligible dish be
-- ranked, so a phantom entry would be unrankable and unskippable. Rather
-- than add a "cook still active" test to the three places that filter
-- briefs (get_ballot_options, submit_ballot, compute_results), this reuses
-- `briefs.delivered`, which exists for exactly this purpose ("mark a dish
-- not delivered to exclude it from voting", 0009). Setting it false on the
-- orphaned brief removes it from all three at once, with no change to the
-- voting code.

create type removal_mode as enum ('COLLAPSE', 'LEAVE');

create or replace function remove_member(
  p_round_id uuid,
  p_member_id uuid,
  p_confirm_dish_change boolean default false,
  p_mode removal_mode default 'COLLAPSE'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_member round_members;
  v_edge_in pairings;  -- A -> X (X = p_member_id, as cook)
  v_edge_out pairings; -- X -> B (X = p_member_id, as sender)
  v_a_submitted boolean;
  v_x_submitted boolean;
  v_discarded_slot_id uuid;
begin
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the host can remove a member';
  end if;

  select * into v_round from rounds where id = p_round_id for update;

  select * into v_member from round_members where id = p_member_id and round_id = p_round_id;
  if not found or v_member.status <> 'ACTIVE' then
    raise exception 'member is not an active member of this round';
  end if;

  if v_member.role = 'HOST' then
    raise exception 'transfer_host before removing the host';
  end if;

  if v_round.status in ('DRAFT', 'OPEN', 'LOCKED') then
    update round_members set status = 'REMOVED', removed_at = now() where id = p_member_id;
    insert into audit_log (round_id, actor_id, action, payload)
    values (p_round_id, v_uid, 'MEMBER_REMOVED', jsonb_build_object('member_id', p_member_id));
    return;
  end if;

  select * into v_edge_in from pairings
  where round_id = p_round_id and assignment_version = v_round.assignment_version and cook_id = p_member_id;
  select * into v_edge_out from pairings
  where round_id = p_round_id and assignment_version = v_round.assignment_version and sender_id = p_member_id;

  if v_edge_in.id is null or v_edge_out.id is null then
    raise exception 'member is not part of the current assignment';
  end if;

  -- LEAVE: the chain keeps its shape, one link just stops being cooked.
  if p_mode = 'LEAVE' then
    update briefs set delivered = false where pairing_id = v_edge_in.id;

    update round_members set status = 'REMOVED', removed_at = now() where id = p_member_id;

    insert into audit_log (round_id, actor_id, action, payload)
    values (p_round_id, v_uid, 'MEMBER_REMOVED', jsonb_build_object(
      'member_id', p_member_id, 'mode', 'LEAVE'
    ));

    insert into host_alerts (round_id, kind, pairing_id, payload)
    values (p_round_id, 'OTHER', v_edge_in.id, jsonb_build_object(
      'type', 'DISH_ORPHANED_BY_REMOVAL',
      'sender_id', v_edge_in.sender_id, 'departed_cook_id', p_member_id
    ));
    return;
  end if;

  v_a_submitted := exists (select 1 from briefs where pairing_id = v_edge_in.id and status = 'SUBMITTED');
  v_x_submitted := exists (select 1 from briefs where pairing_id = v_edge_out.id and status = 'SUBMITTED');

  if v_a_submitted and v_x_submitted and not p_confirm_dish_change then
    raise exception using
      errcode = 'P0001',
      message = 'REMOVE_REQUIRES_CONFIRMATION',
      detail = 'Both the incoming and outgoing dish are already submitted; removing this member discards one (the departing member''s). Re-call with p_confirm_dish_change = true to proceed.';
  end if;

  if v_x_submitted and not v_a_submitted then
    -- keep the departing member's finished brief; reattribute the surviving
    -- pairing row to the active sender A, crediting X honestly via
    -- original_sender_id so the reveal doesn't lie about authorship.
    --
    -- Order matters: v_edge_in must go before v_edge_out takes its
    -- sender_id, or the unique constraint sees two rows with that sender
    -- and aborts. Both records are already in memory, so deleting first
    -- costs nothing.
    v_discarded_slot_id := v_edge_in.slot_id;
    delete from pairings where id = v_edge_in.id;
    update pairings
    set sender_id = v_edge_in.sender_id,
        original_sender_id = coalesce(original_sender_id, v_edge_out.sender_id)
    where id = v_edge_out.id;
  else
    -- keep A's brief (submitted, draft, or not started — irrelevant):
    -- redirect it to cook for B instead of the departing member.
    update pairings set cook_id = v_edge_out.cook_id where id = v_edge_in.id;
    delete from pairings where id = v_edge_out.id;
    v_discarded_slot_id := v_edge_out.slot_id;
  end if;

  delete from slots where id = v_discarded_slot_id;

  update round_members set status = 'REMOVED', removed_at = now() where id = p_member_id;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'MEMBER_REMOVED', jsonb_build_object(
    'member_id', p_member_id,
    'mode', 'COLLAPSE',
    'kept_departing_members_brief', (v_x_submitted and not v_a_submitted)
  ));

  insert into host_alerts (round_id, kind, payload)
  values (p_round_id, 'OTHER', jsonb_build_object(
    'type', 'CHAIN_CLOSED_BY_REMOVAL',
    'sender_id', v_edge_in.sender_id, 'cook_id', v_edge_out.cook_id
  ));
end;
$$;

-- The 3-argument signature from 0005 still exists and would now be
-- ambiguous against the 4-argument one for callers passing three args.
drop function if exists remove_member(uuid, uuid, boolean);

grant execute on function remove_member(uuid, uuid, boolean, removal_mode) to authenticated;

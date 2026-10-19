-- ---------------------------------------------------------------------------
-- TEN MESSAGES IN HALF AN HOUR, AND A REFUSAL WITH A NAME.
--
-- Both ceilings — the fridge and the two private threads — were ten an hour.
-- An hour is a long time to be told to wait at a dinner that lasts an evening,
-- so the window is now thirty minutes, still ten messages.
--
-- send_message used to refuse with a sentence ('rate limit: at most 10
-- messages per hour'), which the client printed as it was, in English. It
-- now raises RATE_LIMIT like post_to_board, so both can be turned into the
-- same pop-up in the reader's language.
--
-- Both functions are 0008's and 0088's bodies unchanged apart from that.
-- ---------------------------------------------------------------------------

create or replace function send_message(
  p_pairing_id uuid,
  p_template_id uuid,
  p_slot_value text
)
returns table (message_id uuid, created_day date)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_pairing pairings;
  v_my_member_id uuid;
  v_direction message_direction;
  v_template message_templates;
  v_hour_count int;
  v_nudge_thread_count int;
  v_nudge_hour_count int;
  v_new_id uuid;
  v_day date;
  v_slot_value text := p_slot_value;
begin
  select * into v_pairing from pairings where id = p_pairing_id;
  if not found then raise exception 'pairing not found'; end if;

  select id into v_my_member_id from round_members
  where round_id = v_pairing.round_id and profile_id = v_uid and status = 'ACTIVE' and approved;
  if not found then raise exception 'not an active member of this round'; end if;

  if v_my_member_id = v_pairing.sender_id then
    v_direction := 'SENDER_TO_COOK';
  elsif v_my_member_id = v_pairing.cook_id then
    v_direction := 'COOK_TO_SENDER';
  else
    raise exception 'not a party to this pairing';
  end if;

  select * into v_template from message_templates where id = p_template_id and active;
  if not found then raise exception 'unknown or inactive template'; end if;

  if v_template.slot_type <> 'NONE' and (v_slot_value is null or char_length(trim(v_slot_value)) = 0) then
    raise exception 'this template requires a value';
  end if;
  if v_template.slot_type = 'NONE' then
    v_slot_value := null;
  end if;

  -- all messages: <=10 per 30 minutes per user, counted across every thread
  -- they're party to (0110; it was an hour)
  select count(*) into v_hour_count from messages m
  join pairings p2 on p2.id = m.pairing_id
  where p2.round_id = v_pairing.round_id
    and ((v_my_member_id = p2.sender_id and m.direction = 'SENDER_TO_COOK')
      or (v_my_member_id = p2.cook_id and m.direction = 'COOK_TO_SENDER'))
    and m.created_at > now() - interval '30 minutes';
  if v_hour_count >= 10 then
    raise exception 'RATE_LIMIT';
  end if;

  if v_template.category = 'NUDGE' then
    select count(*) into v_nudge_thread_count from messages m
    join message_templates t on t.id = m.template_id
    where m.pairing_id = p_pairing_id and t.category = 'NUDGE';
    if v_nudge_thread_count >= 5 then
      raise exception 'rate limit: at most 5 nudges per thread';
    end if;

    select count(*) into v_nudge_hour_count from messages m
    join message_templates t on t.id = m.template_id
    where m.pairing_id = p_pairing_id and t.category = 'NUDGE'
      and m.created_at > now() - interval '1 hour';
    if v_nudge_hour_count >= 1 then
      raise exception 'rate limit: at most 1 nudge per hour';
    end if;
  end if;

  insert into messages (pairing_id, direction, template_id, slot_value)
  values (p_pairing_id, v_direction, p_template_id, v_slot_value)
  returning messages.id, messages.created_day into v_new_id, v_day;

  if v_template.category in ('CANNOT_COOK', 'NO_BRIEF') then
    insert into host_alerts (round_id, kind, pairing_id, payload)
    values (
      v_pairing.round_id,
      v_template.category::text::host_alert_kind,
      p_pairing_id,
      jsonb_build_object('message_id', v_new_id)
    );
  end if;

  return query select v_new_id, v_day;
end;
$$;

grant execute on function send_message(uuid, uuid, text) to authenticated;

create or replace function post_to_board(
  p_round_id uuid,
  p_template_id uuid,
  p_slot_value text default null,
  p_parent_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_member_id uuid;
  v_category message_category;
  v_recent int;
  v_tpl message_templates;
begin
  select id into v_member_id from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE' and approved;
  if not found then raise exception 'not an active member of this round'; end if;

  select * into v_tpl from message_templates
  where id = p_template_id and active;
  if not found then raise exception 'unknown phrase'; end if;
  v_category := v_tpl.category;
  if v_category <> 'BOARD' then
    raise exception 'that phrase is not for the board';
  end if;

  -- A reply needs something to reply to, and an opener must not have one.
  -- Checked here rather than left to a constraint so the refusal can be named:
  -- the client turns these into sentences.
  if v_tpl.board_role = 'REPLY' then
    if p_parent_id is null then raise exception 'REPLY_NEEDS_PARENT'; end if;
    if not exists (
      select 1 from round_messages rm
      where rm.id = p_parent_id and rm.round_id = p_round_id
        and rm.parent_message_id is null
    ) then
      -- Replying to a reply would grow a tree, and a fridge door is not a
      -- forum: one level, always.
      raise exception 'REPLY_PARENT_NOT_FOUND';
    end if;
  elsif p_parent_id is not null then
    raise exception 'OPENER_HAS_NO_PARENT';
  end if;

  -- The blank. A phrase that has one must be given one, and a phrase that has
  -- none must not carry text nobody can see.
  if v_tpl.slot_type = 'NONE' then
    if p_slot_value is not null then raise exception 'PHRASE_TAKES_NO_VALUE'; end if;
  else
    if coalesce(trim(p_slot_value), '') = '' then raise exception 'PHRASE_NEEDS_VALUE'; end if;
    if char_length(p_slot_value) > 40 then raise exception 'VALUE_TOO_LONG'; end if;

    -- THE ONE THAT MATTERS. A chef-shaped blank is filled from the roster, not
    -- typed — so the fridge gains directed phrases without gaining free text,
    -- and with it the moderation and the writing-style leak free text brings.
    -- The client offers a list; this is what makes the list binding.
    if v_tpl.slot_source = 'MEMBER' then
      if not exists (
        select 1 from round_members m
        join profiles pr on pr.id = m.profile_id
        where m.round_id = p_round_id and m.status = 'ACTIVE' and m.approved
          and (m.secret_name = p_slot_value or pr.display_name = p_slot_value)
      ) then
        raise exception 'NOT_A_CHEF_HERE';
      end if;
    end if;
  end if;

  -- Same ceiling as the pairing threads, per person per round: 10 in 30
  -- minutes (0110; it was an hour).
  select count(*) into v_recent from round_messages
  where round_id = p_round_id and author_member_id = v_member_id
    and created_at > now() - interval '30 minutes';
  if v_recent >= 10 then
    raise exception 'RATE_LIMIT';
  end if;

  -- Swept on write rather than by a job, as before — only the window moved.
  -- Replies go with their opener because the delete cascades on the
  -- self-reference below.
  delete from round_messages
  where round_id = p_round_id and created_at <= now() - interval '48 hours';

  insert into round_messages (round_id, author_member_id, template_id, slot_value, parent_message_id)
  values (p_round_id, v_member_id, p_template_id, nullif(trim(p_slot_value), ''), p_parent_id);
end;
$$;

grant execute on function post_to_board(uuid, uuid, text, uuid) to authenticated;

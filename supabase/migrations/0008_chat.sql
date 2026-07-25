-- Canned, anonymous per-pairing chat. Messages are template + optional slot
-- value only — no free text — so writing style/language level/personal
-- details can't leak identity. created_at is used to order the thread
-- correctly INSIDE these functions (SECURITY DEFINER bypasses RLS/grants
-- for its own reads) but is never included in a RETURNS TABLE / returned
-- row: only created_day ever crosses back to the client.

-- ---------------------------------------------------------------------------
-- send_message
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

  -- all messages: <=10/hour per user, counted across every thread they're party to
  select count(*) into v_hour_count from messages m
  join pairings p2 on p2.id = m.pairing_id
  where p2.round_id = v_pairing.round_id
    and ((v_my_member_id = p2.sender_id and m.direction = 'SENDER_TO_COOK')
      or (v_my_member_id = p2.cook_id and m.direction = 'COOK_TO_SENDER'))
    and m.created_at > now() - interval '1 hour';
  if v_hour_count >= 10 then
    raise exception 'rate limit: at most 10 messages per hour';
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

-- ---------------------------------------------------------------------------
-- get_thread — never returns created_at. Marks incoming messages read.
-- Identities stay masked (is_mine only) until RESULTS/ARCHIVED, when the
-- thread is unmasked per §10.
-- ---------------------------------------------------------------------------

create or replace function get_thread(p_pairing_id uuid)
returns table (
  message_id uuid,
  direction message_direction,
  category message_category,
  body text,
  slot_value text,
  created_day date,
  read_at timestamptz,
  reported boolean,
  is_mine boolean,
  other_party_secret_name text,
  other_party_display_name text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_pairing pairings;
  v_round rounds;
  v_my_member_id uuid;
  v_other_secret text;
  v_other_display text;
begin
  select * into v_pairing from pairings where id = p_pairing_id;
  if not found then raise exception 'pairing not found'; end if;

  select * into v_round from rounds where id = v_pairing.round_id;

  select id into v_my_member_id from round_members
  where round_id = v_pairing.round_id and profile_id = v_uid and status = 'ACTIVE' and approved;
  if not found then raise exception 'not an active member of this round'; end if;

  if v_my_member_id <> v_pairing.sender_id and v_my_member_id <> v_pairing.cook_id then
    raise exception 'not a party to this pairing';
  end if;

  if v_round.status in ('RESULTS', 'ARCHIVED') then
    select rm.secret_name, pr.display_name into v_other_secret, v_other_display
    from round_members rm join profiles pr on pr.id = rm.profile_id
    where rm.id = case when v_my_member_id = v_pairing.sender_id then v_pairing.cook_id else v_pairing.sender_id end;
  end if;

  update messages m set read_at = now()
  where m.pairing_id = p_pairing_id and m.read_at is null
    and ((v_my_member_id = v_pairing.sender_id and m.direction = 'COOK_TO_SENDER')
      or (v_my_member_id = v_pairing.cook_id and m.direction = 'SENDER_TO_COOK'));

  return query
    select
      m.id, m.direction, t.category, t.body, m.slot_value, m.created_day, m.read_at, m.reported,
      (v_my_member_id = v_pairing.sender_id and m.direction = 'SENDER_TO_COOK')
        or (v_my_member_id = v_pairing.cook_id and m.direction = 'COOK_TO_SENDER'),
      v_other_secret, v_other_display
    from messages m
    join message_templates t on t.id = m.template_id
    where m.pairing_id = p_pairing_id
    order by m.created_at; -- real timestamp used only for ordering, never returned
end;
$$;

grant execute on function get_thread(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- report_message / get_reported_messages — the Host cannot read threads,
-- but can read ones a party has flagged.
-- ---------------------------------------------------------------------------

create or replace function report_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_pairing pairings;
  v_message messages;
begin
  select * into v_message from messages where id = p_message_id;
  if not found then raise exception 'message not found'; end if;

  select * into v_pairing from pairings where id = v_message.pairing_id;

  if not exists (
    select 1 from round_members
    where round_id = v_pairing.round_id and profile_id = v_uid and status = 'ACTIVE' and approved
      and (id = v_pairing.sender_id or id = v_pairing.cook_id)
  ) then
    raise exception 'not a party to this thread';
  end if;

  update messages set reported = true where id = p_message_id;

  insert into host_alerts (round_id, kind, pairing_id, payload)
  values (v_pairing.round_id, 'REPORTED_MESSAGE', v_pairing.id, jsonb_build_object('message_id', p_message_id));
end;
$$;

grant execute on function report_message(uuid) to authenticated;

create or replace function get_reported_messages(p_round_id uuid)
returns table (
  message_id uuid, pairing_id uuid, direction message_direction,
  category message_category, body text, slot_value text, created_day date
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_round_host(p_round_id, auth.uid()) then
    raise exception 'only the host can view reported messages';
  end if;

  return query
    select m.id, m.pairing_id, m.direction, t.category, t.body, m.slot_value, m.created_day
    from messages m
    join pairings p on p.id = m.pairing_id
    join message_templates t on t.id = m.template_id
    where p.round_id = p_round_id and m.reported
    order by m.created_at;
end;
$$;

grant execute on function get_reported_messages(uuid) to authenticated;

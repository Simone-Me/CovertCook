-- The board becomes a conversation.
--
-- 0031 collapsed identical phrases into one line with a count, which made
-- the board unattributable by construction: three people saying "everything's
-- ready" arrived as one fact with no seam to pull. That is given up here, and
-- it should be said plainly rather than buried — a chat needs its messages
-- one per row, and rows in order.
--
-- What is NOT given up, and must not be later:
--   * no author. `author_member_id` never leaves Postgres. The only person a
--     reader can place is themselves, via is_mine, and they already knew.
--   * no clock. created_day, never created_at — "today" is not a timestamp
--     you can line up against who picked up their phone when.
--
-- So what a reader gains over 0031 is the count and the order of messages,
-- not who wrote any of them. The food icon each bubble carries is drawn
-- client-side from message_id, which is random per row: it decorates a
-- message, and deliberately does not track a person across messages.

drop function if exists get_board(uuid);

create or replace function get_board(p_round_id uuid)
returns table (
  message_id uuid,
  body text,
  is_mine boolean,
  reported boolean,
  created_day date
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_member_id uuid;
begin
  if not (is_round_host(p_round_id, v_uid) or is_round_member(p_round_id, v_uid)) then
    raise exception 'not a member of this round';
  end if;

  select id into v_member_id from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE';

  return query
  select
    rm.id,
    t.body,
    rm.author_member_id = v_member_id,
    rm.reported,
    rm.created_day
  from round_messages rm
  join message_templates t on t.id = rm.template_id
  where rm.round_id = p_round_id
  -- Reported rows stay in the list for their own author only, so a phrase
  -- vanishing is not a signal to everyone else that somebody flagged it.
    and (not rm.reported or rm.author_member_id = v_member_id)
  order by rm.created_at;
end;
$$;

grant execute on function get_board(uuid) to authenticated;

-- Reporting one bubble rather than every copy of its wording. 0031 could only
-- report by body because body was all a reader had been given; now that each
-- message has an id, flagging one stops taking the others down with it.
create or replace function report_board_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round_id uuid;
  v_body text;
begin
  select rm.round_id, t.body into v_round_id, v_body
  from round_messages rm
  join message_templates t on t.id = rm.template_id
  where rm.id = p_message_id;

  if v_round_id is null then
    raise exception 'no such message';
  end if;

  if not (is_round_host(v_round_id, v_uid) or is_round_member(v_round_id, v_uid)) then
    raise exception 'not a member of this round';
  end if;

  update round_messages set reported = true where id = p_message_id;

  -- The alert carries the wording, not the reader: the Executive Chef needs
  -- to know what was said, and the author is on the row in Postgres if it
  -- ever has to go further than that.
  insert into host_alerts (round_id, kind, payload)
  values (v_round_id, 'REPORTED_MESSAGE', jsonb_build_object('type', 'BOARD', 'body', v_body));
end;
$$;

grant execute on function report_board_message(uuid) to authenticated;

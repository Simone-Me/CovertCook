-- ---------------------------------------------------------------------------
-- A PHRASE CAN ANSWER ANOTHER ONE.
--
-- The fridge has been a chat since 0033 and signed since 0037 — you can see
-- who said what — and it was still a column of unrelated lines. Somebody says
-- "I'm running 30 minutes late" and somebody else says "no rush, the oven is
-- still cold", and the second phrase lands eleven lines lower with nothing
-- tying it to the first. Reading the fridge was reading a list and guessing
-- which pairs went together.
--
-- SO A MESSAGE MAY POINT AT ONE OTHER MESSAGE, and that is the whole of it:
-- one column, nullable, self-referencing. No thread table, no depth, no
-- subject line. The client draws the wire between the two and orders a reply
-- directly under what it answers; the database only has to remember which one.
--
-- WHAT IT DOES NOT CHANGE. The phrases are still canned (README §"Anonymity is
-- layered"), the author still never leaves Postgres, the rate limit is still
-- ten an hour, and a reply is a phrase like any other — there is nothing a
-- reply can say that a new line could not.
--
-- ON DELETE SET NULL, not cascade: a reported phrase disappearing must not take
-- the answers to it with it. The answer stops pointing anywhere and becomes an
-- ordinary line, which is exactly what it looks like to a reader who never saw
-- what it was answering.
-- ---------------------------------------------------------------------------

alter table round_messages
  add column if not exists reply_to uuid references round_messages (id) on delete set null;

comment on column round_messages.reply_to is
  'The phrase in the same fridge this one answers. Null for a line that starts something.';

create index if not exists round_messages_reply_to_idx on round_messages (reply_to);

-- ---------------------------------------------------------------------------
-- Posting, now with somewhere to point.
--
-- DROPPED AND RECREATED RATHER THAN REPLACED: a third argument with a default
-- would leave the two-argument function standing beside it, and every existing
-- call would become ambiguous rather than wrong — the worst kind of break,
-- because it only shows up at run time.
--
-- The target is checked, not trusted: it must be a phrase in this same round.
-- Without that, a client could point a line in one dinner at a line in another
-- and the fridge would render a wire to something its readers cannot see.
-- ---------------------------------------------------------------------------

drop function if exists post_to_board(uuid, uuid);

create or replace function post_to_board(
  p_round_id uuid,
  p_template_id uuid,
  p_reply_to uuid default null
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
begin
  select id into v_member_id from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE' and approved;
  if not found then raise exception 'not an active member of this round'; end if;

  select category into v_category from message_templates
  where id = p_template_id and active;
  if not found then raise exception 'unknown phrase'; end if;
  if v_category <> 'BOARD' then
    raise exception 'that phrase is not for the board';
  end if;

  if p_reply_to is not null then
    perform 1 from round_messages
    where id = p_reply_to and round_id = p_round_id;
    if not found then raise exception 'NO_SUCH_PHRASE'; end if;
  end if;

  select count(*) into v_recent from round_messages
  where round_id = p_round_id and author_member_id = v_member_id
    and created_at > now() - interval '1 hour';
  if v_recent >= 10 then
    raise exception 'RATE_LIMIT';
  end if;

  insert into round_messages (round_id, author_member_id, template_id, reply_to)
  values (p_round_id, v_member_id, p_template_id, p_reply_to);
end;
$$;

grant execute on function post_to_board(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Reading, now saying what a line answers.
--
-- Three columns rather than one, because the wire has to survive the window:
-- the fridge only shows the last 24 hours (0034), so a reply can outlive what
-- it answered. With the phrase and the name travelling alongside the id, such
-- a line still reads — it quotes what it is answering instead of pointing at
-- nothing.
--
-- The parent is read WITHOUT the reader's block list applied on purpose: it is
-- quoted, not shown, and a quote of one line inside somebody else's answer is
-- not the blocked person turning up in the fridge again. What is filtered here
-- is the same as it has always been — a blocked author's own lines, reported
-- lines that are not yours.
-- ---------------------------------------------------------------------------

drop function if exists get_board(uuid);

create or replace function get_board(p_round_id uuid)
returns table (
  message_id uuid,
  body text,
  author_name text,
  is_mine boolean,
  reported boolean,
  author_member_id uuid,
  from_host boolean,
  reply_to uuid,
  reply_to_body text,
  reply_to_author text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_member_id uuid;
  v_locale text := my_locale();
begin
  if not (is_round_host(p_round_id, v_uid) or is_round_member(p_round_id, v_uid)) then
    raise exception 'not a member of this round';
  end if;

  select id into v_member_id from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE';

  return query
  select rm.id, phrase_in(rm.template_id, v_locale), am.secret_name,
         coalesce(rm.author_member_id = v_member_id, false), rm.reported,
         am.id, rm.from_host,
         rm.reply_to,
         case when rm.reply_to is null then null
              else phrase_in(pm.template_id, v_locale) end,
         pam.secret_name
  from round_messages rm
  left join round_members am on am.id = rm.author_member_id
  left join round_messages pm on pm.id = rm.reply_to
  left join round_members pam on pam.id = pm.author_member_id
  where rm.round_id = p_round_id
    and (rm.from_host or rm.created_at > now() - interval '24 hours')
    and (not rm.reported or rm.author_member_id = v_member_id)
    and not exists (
      select 1 from blocked_users b
      where b.profile_id = v_uid and b.blocked_profile_id = am.profile_id
    )
  order by rm.created_at;
end;
$$;

grant execute on function get_board(uuid) to authenticated;

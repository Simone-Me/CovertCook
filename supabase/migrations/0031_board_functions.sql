-- Reading and posting to the board, plus the phrases themselves.
--
-- Separate from 0030 because Postgres will not let a value added by
-- ALTER TYPE ... ADD VALUE be used in the same transaction, and Supabase
-- runs each migration file as one — the 'BOARD' category added there is
-- referenced here.

-- ---------------------------------------------------------------------------
-- The phrases. Deliberately cheerful and slightly absurd: the board exists
-- to make people smile at each other across a dinner they are nervous
-- about, not to carry information.
--
-- House rule for anything added later: no jokes about health conditions.
-- This app hard-flags allergens two screens away; a punchline about diets
-- reads badly next to that, however affectionately meant.
-- ---------------------------------------------------------------------------

insert into message_templates (category, locale, body, slot_type) values
  ('BOARD', 'en', 'What a lovely day!', 'NONE'),
  ('BOARD', 'en', 'Try not to burn a finger at the stove!', 'NONE'),
  ('BOARD', 'en', 'Remember to salt. Taste again. Salt again.', 'NONE'),
  ('BOARD', 'en', 'Dropped it? Five-second rule. Nobody saw anything.', 'NONE'),
  ('BOARD', 'en', 'The smoke coming out of the oven is part of the recipe.', 'NONE'),
  ('BOARD', 'en', 'Taste it before serving. Please.', 'NONE'),
  ('BOARD', 'en', 'If you can''t tell what''s missing, it''s butter.', 'NONE'),
  ('BOARD', 'en', 'I like people who say good morning.', 'NONE'),
  ('BOARD', 'en', 'Great outfit, honestly.', 'NONE'),
  ('BOARD', 'en', 'Everything''s ready on my end. Good luck to you!', 'NONE'),

  ('BOARD', 'fr', 'Quelle belle journée !', 'NONE'),
  ('BOARD', 'fr', 'Ne vous brûlez pas les doigts aux fourneaux !', 'NONE'),
  ('BOARD', 'fr', 'N''oublie pas de saler. Regoûte. Resale.', 'NONE'),
  ('BOARD', 'fr', 'Tombé par terre ? Tu as cinq secondes. Personne n''a rien vu.', 'NONE'),
  ('BOARD', 'fr', 'La fumée qui sort du four fait partie de la recette.', 'NONE'),
  ('BOARD', 'fr', 'Goûte avant de servir. S''il te plaît.', 'NONE'),
  ('BOARD', 'fr', 'Si tu ne sais pas ce qui manque, c''est le beurre.', 'NONE'),
  ('BOARD', 'fr', 'J''aime les gens qui disent bonjour.', 'NONE'),
  ('BOARD', 'fr', 'Quelle belle tenue, sincèrement.', 'NONE'),
  ('BOARD', 'fr', 'J''ai tout de prêt. Courage à vous !', 'NONE');

-- ---------------------------------------------------------------------------
-- Reading. Identical phrases are collapsed with a count — three people
-- saying "everything's ready" is one cheerful fact, not three lines — which
-- also happens to make the board unattributable by construction rather than
-- only by omission.
-- ---------------------------------------------------------------------------

create or replace function get_board(p_round_id uuid)
returns table (
  body text,
  said_by int,
  last_day date
)
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

  -- No author, no message id, no timestamp finer than a day. Everything
  -- that could tie a phrase to a person is left in Postgres.
  return query
  select t.body, count(*)::int, max(rm.created_day)
  from round_messages rm
  join message_templates t on t.id = rm.template_id
  where rm.round_id = p_round_id
    and not rm.reported
  group by t.body
  order by max(rm.created_at) desc;
end;
$$;

grant execute on function get_board(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Posting. Same 10/hour ceiling as the pairing threads, per person per
-- round — one rule to remember rather than two, and enough to stop the
-- board becoming one person's wall.
-- ---------------------------------------------------------------------------

create or replace function post_to_board(p_round_id uuid, p_template_id uuid)
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

  select count(*) into v_recent from round_messages
  where round_id = p_round_id and author_member_id = v_member_id
    and created_at > now() - interval '1 hour';
  if v_recent >= 10 then
    raise exception 'RATE_LIMIT';
  end if;

  insert into round_messages (round_id, author_member_id, template_id)
  values (p_round_id, v_member_id, p_template_id);
end;
$$;

grant execute on function post_to_board(uuid, uuid) to authenticated;

-- Reporting works the same as it does for pairing messages, and for the
-- same reason: unattributed in public does not mean unaccountable. The
-- Executive Chef sees it in the alerts inbox; the author is on the row.
create or replace function report_board_phrase(p_round_id uuid, p_body text)
returns void
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

  -- Reported by phrase, because that is all a reader was ever given.
  update round_messages rm
  set reported = true
  from message_templates t
  where t.id = rm.template_id
    and rm.round_id = p_round_id
    and t.body = p_body;

  insert into host_alerts (round_id, kind, payload)
  values (p_round_id, 'REPORTED_MESSAGE', jsonb_build_object('type', 'BOARD', 'body', p_body));
end;
$$;

grant execute on function report_board_phrase(uuid, text) to authenticated;

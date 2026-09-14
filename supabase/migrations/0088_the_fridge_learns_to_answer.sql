-- THE FRIDGE LEARNS TO ANSWER.
--
-- The board has been a wall of notices since 0030: you pick a ready-made
-- phrase, it goes up signed (0037), and nothing it says can be replied to.
-- Four people produce four unrelated cards. What was missing was never more
-- phrases — it was that a phrase could not be AIMED at anybody and could not
-- be ANSWERED, which between them are most of what makes something a
-- conversation rather than a noticeboard.
--
-- THREE PIECES, AND NO FREE TEXT ANYWHERE.
--
-- 1. THE BLANK. `message_slot_type` has carried INGREDIENT and SHORT_TEXT
--    since 0001 and the pairing threads have always used them; the board
--    never passed one. `round_messages` now keeps the filled-in value and
--    `post_to_board` takes it.
--
-- 2. THE CHEF-SHAPED BLANK, which is the piece that actually changes the
--    feel. "Chef Persil, tell me the truth: have you tasted it yet?" is a
--    question addressed to somebody, and it is still not free text: the value
--    is chosen from the roster and the server REFUSES anything that is not a
--    chef at this table. The phrase carries no title of its own: a pseudonym
--    is already "Chef Basilic" (0004, 0038) and an open table shows a plain
--    display name (0073), so a "Chef" in the body would read as "Chef Chef
--    Basilic" on one and be wrong on the other. So the fridge gains directed phrases without gaining
--    the moderation burden and the writing-style leak that free text brings.
--    A column rather than a fourth enum value, for the reason 0080 recorded.
--
-- 3. THE REPLY. `parent_message_id`, one level deep and never two — a fridge
--    door is not a forum. A reply set exists separately from the openers
--    ("Absolutely not", "You can count on it", "I saw them taste it") and is
--    only ever offered under something already said.
--
-- WHY THE WINDOW MOVED FROM 24 HOURS TO 48. Not storage: a dinner produces a
-- few dozen rows and a thousand dinners a few megabytes. The window is
-- editorial — the fridge is today's door, not an archive — and 24 hours cut
-- the eve of the dinner off from the day of it, which is exactly the
-- conversation worth having. 48 covers both with ONE rule, so a reply never
-- needs a special case to keep its opener alive.

-- ---------------------------------------------------------------------------
-- 1. The columns.
-- ---------------------------------------------------------------------------

alter table message_templates add column if not exists board_role text;
alter table message_templates add column if not exists slot_source text;

alter table message_templates drop constraint if exists message_templates_board_role_values;
alter table message_templates add constraint message_templates_board_role_values
  check (board_role is null or board_role in ('OPEN', 'REPLY'));

alter table message_templates drop constraint if exists message_templates_slot_source_values;
alter table message_templates add constraint message_templates_slot_source_values
  check (slot_source is null or slot_source = 'MEMBER');

comment on column message_templates.board_role is
  'BOARD phrases only. OPEN starts something, REPLY answers one. Null for every phrase that is not for the fridge.';
comment on column message_templates.slot_source is
  'MEMBER: the blank is filled from this dinner''s roster and the server refuses anything else. Null: an ordinary typed blank, as the pairing threads use.';

-- Everything that existed before this migration is an opener, which is what it
-- has always been in practice.
update message_templates set board_role = 'OPEN'
where category = 'BOARD' and board_role is null;

alter table round_messages add column if not exists slot_value text;
alter table round_messages add column if not exists parent_message_id uuid
  references round_messages (id) on delete cascade;

comment on column round_messages.parent_message_id is
  'The phrase this one answers. One level only — post_to_board refuses a reply to a reply. ON DELETE CASCADE so the 48-hour sweep takes a thread whole rather than orphaning its answers.';

create index if not exists round_messages_parent_idx
  on round_messages (parent_message_id);

-- ---------------------------------------------------------------------------
-- 2. The phrases.
--
-- HOUSE RULE, inherited from 0031 and still binding: no joke about a health
-- condition, and nothing that reads as an accusation rather than a tease. A
-- fridge full of people needling each other about the food is the point; one
-- where somebody can be made to feel got at is not.
--
-- The suspicion phrases are the ones that make this fridge different from any
-- other chat: they feed the one tension the whole product is built on, and
-- they are safe precisely because nobody can answer them with anything but
-- another ready-made line.
-- ---------------------------------------------------------------------------

insert into message_templates
  (category, locale, body, slot_type, day_of, template_key, host_only, board_role, slot_source)
values
  ('BOARD', 'en', '{chef}, your kitchen smells wonderful from here.', 'SHORT_TEXT', false, 'BOARD_AIMED_01', false, 'OPEN', 'MEMBER'),
  ('BOARD', 'fr', '{chef}, ça sent merveilleusement bon jusqu''ici.', 'SHORT_TEXT', false, 'BOARD_AIMED_01', false, 'OPEN', 'MEMBER'),
  ('BOARD', 'en', '{chef}, tell me the truth: have you tasted it yet?', 'SHORT_TEXT', false, 'BOARD_AIMED_02', false, 'OPEN', 'MEMBER'),
  ('BOARD', 'fr', '{chef}, dites-moi la vérité : vous avez déjà goûté ?', 'SHORT_TEXT', false, 'BOARD_AIMED_02', false, 'OPEN', 'MEMBER'),
  ('BOARD', 'en', '{chef}, how much longer?', 'SHORT_TEXT', false, 'BOARD_AIMED_03', false, 'OPEN', 'MEMBER'),
  ('BOARD', 'fr', '{chef}, il reste combien de temps ?', 'SHORT_TEXT', false, 'BOARD_AIMED_03', false, 'OPEN', 'MEMBER'),
  ('BOARD', 'en', 'I saw what {chef} bought. No comment.', 'SHORT_TEXT', false, 'BOARD_AIMED_04', false, 'OPEN', 'MEMBER'),
  ('BOARD', 'fr', 'J''ai vu ce que {chef} a acheté. Sans commentaire.', 'SHORT_TEXT', false, 'BOARD_AIMED_04', false, 'OPEN', 'MEMBER'),
  ('BOARD', 'en', 'I bet it was {chef} who wrote my recipe.', 'SHORT_TEXT', false, 'BOARD_AIMED_05', false, 'OPEN', 'MEMBER'),
  ('BOARD', 'fr', 'Je parie que c''est {chef} qui a écrit ma recette.', 'SHORT_TEXT', false, 'BOARD_AIMED_05', false, 'OPEN', 'MEMBER'),
  ('BOARD', 'en', 'Something is burning and it is not mine.', 'NONE', false, 'BOARD_OPEN_11', false, 'OPEN', null),
  ('BOARD', 'fr', 'Ça brûle quelque part, et ce n''est pas chez moi.', 'NONE', false, 'BOARD_OPEN_11', false, 'OPEN', null),
  ('BOARD', 'en', 'I have read my recipe four times. I still have questions.', 'NONE', false, 'BOARD_OPEN_12', false, 'OPEN', null),
  ('BOARD', 'fr', 'J''ai relu ma recette quatre fois. J''ai toujours des questions.', 'NONE', false, 'BOARD_OPEN_12', false, 'OPEN', null),
  ('BOARD', 'en', 'Whoever wrote mine: I see what you did.', 'NONE', false, 'BOARD_OPEN_13', false, 'OPEN', null),
  ('BOARD', 'fr', 'À celui qui a écrit la mienne : j''ai bien compris.', 'NONE', false, 'BOARD_OPEN_13', false, 'OPEN', null),
  ('BOARD', 'en', 'Absolutely not.', 'NONE', false, 'BOARD_REPLY_01', false, 'REPLY', null),
  ('BOARD', 'fr', 'Absolument pas.', 'NONE', false, 'BOARD_REPLY_01', false, 'REPLY', null),
  ('BOARD', 'en', 'You can count on it.', 'NONE', false, 'BOARD_REPLY_02', false, 'REPLY', null),
  ('BOARD', 'fr', 'Vous pouvez compter dessus.', 'NONE', false, 'BOARD_REPLY_02', false, 'REPLY', null),
  ('BOARD', 'en', 'Do not ask.', 'NONE', false, 'BOARD_REPLY_03', false, 'REPLY', null),
  ('BOARD', 'fr', 'Ne demandez pas.', 'NONE', false, 'BOARD_REPLY_03', false, 'REPLY', null),
  ('BOARD', 'en', 'I saw them taste it.', 'NONE', false, 'BOARD_REPLY_04', false, 'REPLY', null),
  ('BOARD', 'fr', 'Je l''ai vu goûter.', 'NONE', false, 'BOARD_REPLY_04', false, 'REPLY', null),
  ('BOARD', 'en', 'Interesting theory.', 'NONE', false, 'BOARD_REPLY_05', false, 'REPLY', null),
  ('BOARD', 'fr', 'Théorie intéressante.', 'NONE', false, 'BOARD_REPLY_05', false, 'REPLY', null),
  ('BOARD', 'en', 'I will say no more.', 'NONE', false, 'BOARD_REPLY_06', false, 'REPLY', null),
  ('BOARD', 'fr', 'Je n''en dirai pas plus.', 'NONE', false, 'BOARD_REPLY_06', false, 'REPLY', null),
  ('BOARD', 'en', 'Same here.', 'NONE', false, 'BOARD_REPLY_07', false, 'REPLY', null),
  ('BOARD', 'fr', 'Pareil ici.', 'NONE', false, 'BOARD_REPLY_07', false, 'REPLY', null),
  ('BOARD', 'en', 'It was on purpose.', 'NONE', false, 'BOARD_REPLY_08', false, 'REPLY', null),
  ('BOARD', 'fr', 'C''était voulu.', 'NONE', false, 'BOARD_REPLY_08', false, 'REPLY', null)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. Posting, with a blank and a parent.
-- ---------------------------------------------------------------------------

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

  -- Same 10/hour ceiling as the pairing threads, per person per round.
  select count(*) into v_recent from round_messages
  where round_id = p_round_id and author_member_id = v_member_id
    and created_at > now() - interval '1 hour';
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

-- The two-argument form is gone: leaving it would let a client post an
-- unvalidated opener past every check added above.
drop function if exists post_to_board(uuid, uuid);

-- ---------------------------------------------------------------------------
-- 4. Reading it back as threads.
--
-- Dropped and recreated: this adds a column to the row type, which
-- `create or replace` refuses (see 0057, 0086).
-- ---------------------------------------------------------------------------

drop function if exists get_board(uuid);

create function get_board(p_round_id uuid)
returns table (
  message_id uuid,
  -- The phrase this one answers, or null when it starts something (0088).
  parent_id uuid,
  body text,
  author_name text,
  is_mine boolean,
  reported boolean,
  author_member_id uuid,
  from_host boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_member_id uuid;
  v_locale text := my_locale();
  v_open boolean;
begin
  if not (is_round_host(p_round_id, v_uid) or is_round_member(p_round_id, v_uid)) then
    raise exception 'not a member of this round';
  end if;

  select id into v_member_id from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE';

  -- RESTORED FROM 0073, WHICH 0080 DROPPED WITHOUT SAYING SO. "An open table
  -- has no pseudonyms" is the rule 0073 built and wired to five readers; the
  -- rewrite in 0080 selected `am.secret_name` flat, so an OPEN dinner — one
  -- where every other screen already prints real names — went back to showing
  -- Chef Basilic in the fridge alone. Nothing in 0080 argues for that, and its
  -- subject was host notices.
  v_open := names_are_open(p_round_id, v_uid);

  return query
  select rm.id,
         rm.parent_message_id,
         -- The blank filled in. The phrase is translated for whoever is
         -- reading (0064); the value inside it is not, because it is a name.
         case
           when rm.slot_value is null then phrase_in(rm.template_id, v_locale)
           else regexp_replace(phrase_in(rm.template_id, v_locale), '\{[^}]+\}', rm.slot_value)
         end,
         case when v_open then ap.display_name else am.secret_name end,
         coalesce(rm.author_member_id = v_member_id, false), rm.reported,
         am.id, rm.from_host
  from round_messages rm
  left join round_members am on am.id = rm.author_member_id
  left join profiles ap on ap.id = am.profile_id
  where rm.round_id = p_round_id
    -- A notice from the Executive Chef outlives the window (0080); everything
    -- else lives 48 hours, which covers the eve of the dinner and the day of
    -- it under one rule, so a reply never needs a special case to keep its
    -- opener alive.
    and (rm.from_host or rm.created_at > now() - interval '48 hours')
    and (not rm.reported or rm.author_member_id = v_member_id)
    and not exists (
      select 1 from blocked_users b
      where b.profile_id = v_uid and b.blocked_profile_id = am.profile_id
    )
  order by
    -- Threads hold together: a reply sits under its opener rather than at
    -- whatever time it happened to be sent.
    coalesce((select o.created_at from round_messages o where o.id = rm.parent_message_id), rm.created_at),
    rm.parent_message_id nulls first,
    rm.created_at;
end;
$$;

grant execute on function get_board(uuid) to authenticated;

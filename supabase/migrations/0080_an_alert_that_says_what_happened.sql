-- ---------------------------------------------------------------------------
-- AN ALERT THAT SAYS WHAT HAPPENED, AND A VOICE FOR THE EXECUTIVE CHEF.
--
-- The bell told a host that "Other" had happened. Seven genuinely different
-- events shared that word — somebody knocking at the door, a photograph
-- reported, a chain closed by a removal — because `host_alerts.kind` is an
-- enum and the honest way to add to an enum is not to (0060 says so where it
-- files a reported photograph under OTHER with a typed payload). That was the
-- right call for the writing side and a disaster for the reading side: the
-- payload holding the difference was never read by anything.
--
-- So this migration adds no enum values and no columns to host_alerts. It adds
-- the function that reads the payload — one call that turns a row of ids into
-- the six things a person needs to decide anything: what happened, when, to
-- whom, where, what was actually said, and whether it has already sorted
-- itself out.
--
-- The second half gives the Executive Chef a voice in the fridge. Every
-- reaction to an alert used to be private — a warning, a removal, a reveal —
-- and the most useful one is not: two chefs stuck on a recipe need telling,
-- together, that the recipe is meant to be possible. The fridge already
-- reaches everybody and already speaks both languages; what it did not have
-- was a way for the host to say something in it.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Phrases only the Executive Chef can post.
--
-- A column rather than a category. `message_category` is an enum, adding to it
-- is a one-way door, and the thing being said here is not a new kind of phrase
-- — it is a BOARD phrase with one restriction on who may send it. The pickers
-- filter on it, which is the whole of the enforcement on the client, and
-- post_host_notice below is the enforcement that matters.
-- ---------------------------------------------------------------------------

alter table message_templates
  add column if not exists host_only boolean not null default false;

insert into message_templates (category, locale, body, slot_type, template_key, host_only)
select * from (values
  ('BOARD'::message_category, 'en',
   'The Executive Chef: someone at this table cannot cook what they were sent. Look at it together first — an ingredient swapped, a step left out, a version of it found online. Every recipe here is meant to be possible, and adapting one is part of the game. If truly nothing works, say so to each other in your own thread.',
   'NONE'::message_slot_type, 'HOST_RECIPE_REVIEW', true),
  ('BOARD'::message_category, 'fr',
   'Le Executive Chef : quelqu''un à cette table n''arrive pas à cuisiner ce qu''il a reçu. Regardez-y ensemble d''abord — un ingrédient remplacé, une étape sautée, une version trouvée en ligne. Chaque recette ici est censée être faisable, et l''adapter fait partie du jeu. Si vraiment rien ne marche, dites-le-vous dans votre fil.',
   'NONE'::message_slot_type, 'HOST_RECIPE_REVIEW', true),
  ('BOARD'::message_category, 'en',
   'The Executive Chef: there is an allergy at this table. Whatever you are cooking, say plainly what is in it — every ingredient, and anything it shared a board or a pan with. Nobody has to change their dish. Everybody has to be able to know what they are eating.',
   'NONE'::message_slot_type, 'HOST_ALLERGEN_CARE', true),
  ('BOARD'::message_category, 'fr',
   'Le Executive Chef : il y a une allergie à cette table. Quoi que vous cuisiniez, dites clairement ce qu''il y a dedans — chaque ingrédient, et tout ce avec quoi il a partagé une planche ou une poêle. Personne n''a à changer son plat. Tout le monde doit pouvoir savoir ce qu''il mange.',
   'NONE'::message_slot_type, 'HOST_ALLERGEN_CARE', true)
) as new_phrases (category, locale, body, slot_type, template_key, host_only)
where not exists (
  select 1 from message_templates t
  where t.template_key = new_phrases.template_key and t.locale = new_phrases.locale
);

-- ---------------------------------------------------------------------------
-- 2. A fridge row with no seat behind it.
--
-- `author_member_id` was not null because until now every phrase in the fridge
-- came from somebody sitting at the table, and a host who is running the
-- dinner without playing in it has no seat. Nullable plus `from_host` rather
-- than a fake membership: the row is honest about where it came from, and
-- every reader of the table can tell the two apart without a join.
-- ---------------------------------------------------------------------------

alter table round_messages alter column author_member_id drop not null;
alter table round_messages add column if not exists from_host boolean not null default false;

-- Every row is one or the other, never both and never neither.
alter table round_messages drop constraint if exists round_messages_author_or_host;
alter table round_messages add constraint round_messages_author_or_host
  check ((author_member_id is not null) <> from_host);

-- ---------------------------------------------------------------------------
-- 3. The fridge, now that a notice can be in it.
--
-- Two changes and a reason for each. The join to the author becomes a LEFT
-- join, or a host notice would vanish through the inner one. And a notice is
-- exempt from the twenty-four hours: the window exists so chatter does not
-- pile up, and an announcement about an allergy sent four days before the
-- dinner is worth exactly nothing if it expires the next morning.
--
-- Blocking still applies to seats and cannot apply to the host: you cannot
-- block the person running the dinner, and the notice is addressed to the
-- table rather than written by somebody in it.
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
begin
  if not (is_round_host(p_round_id, v_uid) or is_round_member(p_round_id, v_uid)) then
    raise exception 'not a member of this round';
  end if;

  select id into v_member_id from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE';

  return query
  select rm.id, phrase_in(rm.template_id, v_locale), am.secret_name,
         coalesce(rm.author_member_id = v_member_id, false), rm.reported,
         am.id, rm.from_host
  from round_messages rm
  left join round_members am on am.id = rm.author_member_id
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

-- The badge under the same two rules. `<>` against a null author is null, not
-- true, so an Executive Chef's notice used to raise no badge at all — which is
-- the one message in the fridge that should never be missed.
create or replace function get_board_unread(p_round_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_member_id uuid;
  v_seen timestamptz;
  v_count int;
begin
  select id, board_seen_at into v_member_id, v_seen from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE';
  if not found then return 0; end if;

  select count(*) into v_count from round_messages
  where round_id = p_round_id
    and author_member_id is distinct from v_member_id
    and not reported
    and (from_host or created_at > now() - interval '24 hours')
    and (v_seen is null or created_at > v_seen);

  return v_count;
end;
$$;
grant execute on function get_board_unread(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Saying it.
--
-- By key, not by template id: the caller is a button on an alert, and what
-- that button means ("tell the table a recipe is meant to be possible") is a
-- fixed thing. Passing an id would let a client post any phrase it liked as
-- the Executive Chef, including one written for a private thread.
--
-- The same notice twice in an hour is refused rather than errored over: a
-- double press should not read as the host shouting.
-- ---------------------------------------------------------------------------

create or replace function post_host_notice(p_round_id uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_template_id uuid;
begin
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the host can post a notice';
  end if;

  if p_key not in ('HOST_RECIPE_REVIEW', 'HOST_ALLERGEN_CARE') then
    raise exception 'NO_SUCH_NOTICE';
  end if;

  -- Any locale will do: the row stores one template and phrase_in gives every
  -- reader the sentence in their own language.
  select id into v_template_id from message_templates
  where template_key = p_key and host_only and active
  order by locale
  limit 1;

  if v_template_id is null then
    raise exception 'NO_SUCH_NOTICE';
  end if;

  if exists (
    select 1 from round_messages rm
    join message_templates t on t.id = rm.template_id
    where rm.round_id = p_round_id and rm.from_host
      and t.template_key = p_key
      and rm.created_at > now() - interval '1 hour'
  ) then
    raise exception 'NOTICE_ALREADY_POSTED';
  end if;

  insert into round_messages (round_id, author_member_id, template_id, from_host)
  values (p_round_id, null, v_template_id, true);

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'HOST_NOTICE_POSTED', jsonb_build_object('key', p_key));
end;
$$;

grant execute on function post_host_notice(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. A reported fridge phrase now says which one.
--
-- 0033 recorded the wording and nothing else, on the reasoning that the host
-- needs to know what was said. True, and not enough: without the id there is
-- no author to warn and no way to show the phrase in the host's own language.
-- The body stays in the payload for the alerts already written.
-- ---------------------------------------------------------------------------

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

  insert into host_alerts (round_id, kind, payload)
  values (v_round_id, 'REPORTED_MESSAGE', jsonb_build_object(
    'type', 'BOARD', 'message_id', p_message_id, 'body', v_body
  ));
end;
$$;

grant execute on function report_board_message(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. What is actually waiting.
--
-- One call, because the alternative is a screen that fires a query per row and
-- most of those queries would be refused: `messages` has no grant at all and
-- never will (0030 explains why), so an Executive Chef cannot read the phrase
-- that was reported to them except through a function like this one.
--
-- The OUT names are all prefixed or renamed. A RETURNS TABLE column shadows
-- the table column of the same name inside the body, and `id`, `created_at`
-- and `member_id` would each shadow something this function reads.
--
-- `answered` is the question a host actually has: has this already sorted
-- itself out? For a pair it means somebody has spoken since; for somebody at
-- the door it means they are already in or already turned away.
-- ---------------------------------------------------------------------------

create or replace function get_host_alerts_detailed(p_round_id uuid)
returns table (
  alert_id uuid,
  alert_type text,
  happened_at timestamptz,
  who text,
  counterpart text,
  seat_id uuid,
  seat_message_id uuid,
  seat_pairing_id uuid,
  seat_photo_id uuid,
  photo_path text,
  phrase text,
  dish text,
  recipe text,
  labels text[],
  already_warned boolean,
  answered boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_locale text := my_locale();
  v_alert host_alerts%rowtype;
  v_message_id uuid;
  v_pairing_id uuid;
  v_sender_id uuid;
  v_cook_id uuid;
  v_author_id uuid;
  v_other_id uuid;
begin
  if not is_round_host(p_round_id, auth.uid()) then
    raise exception 'only the host can read these alerts';
  end if;

  for v_alert in
    select * from host_alerts
    where round_id = p_round_id and resolved_at is null
    order by created_at desc
  loop
    alert_id := v_alert.id;
    happened_at := v_alert.created_at;
    seat_pairing_id := v_alert.pairing_id;
    who := null; counterpart := null; seat_id := null; seat_message_id := null;
    seat_photo_id := null; photo_path := null; phrase := null;
    dish := null; recipe := null; labels := null;
    already_warned := false; answered := false;

    alert_type := case
      when v_alert.kind = 'REPORTED_MESSAGE' and v_alert.payload->>'type' = 'BOARD' then 'REPORTED_FRIDGE'
      when v_alert.kind = 'REPORTED_MESSAGE' then 'REPORTED_PRIVATE'
      when v_alert.kind = 'DROPOUT' and v_alert.payload->>'reason' = 'ACCOUNT_DELETED' then 'ACCOUNT_CLOSED'
      when v_alert.kind <> 'OTHER' then v_alert.kind::text
      when v_alert.payload->>'type' = 'JOIN_REQUEST' then 'ENTER_REQUEST'
      when v_alert.payload->>'type' = 'SPLICE_NOTIFY' then 'LATE_ENTRY_CHAIN'
      when v_alert.payload->>'type' = 'CHAIN_CLOSED_BY_REMOVAL' then 'CLOSED_CHAIN'
      when v_alert.payload->>'type' = 'DISH_ORPHANED_BY_REMOVAL' then 'ORFAN_MEAL'
      when v_alert.payload->>'type' = 'ALLERGEN_ON_TABLE' then 'ALLERGY_ALERT'
      when v_alert.payload->>'type' = 'REPORTED_PHOTO' then 'REPORTED_PHOTO'
      else 'UNKNOWN'
    end;

    -- A phrase in a private thread: the two who can't cook, and the reported one.
    if alert_type in ('CANNOT_COOK', 'NO_BRIEF', 'REPORTED_PRIVATE') then
      v_message_id := (v_alert.payload->>'message_id')::uuid;

      select m.pairing_id, p.sender_id, p.cook_id,
             case
               when m.slot_value is null then phrase_in(m.template_id, v_locale)
               else regexp_replace(phrase_in(m.template_id, v_locale), '\{[^}]+\}',
                                   replace(m.slot_value, '\', '\\'))
             end
        into v_pairing_id, v_sender_id, v_cook_id, phrase
      from messages m
      join pairings p on p.id = m.pairing_id
      where m.id = v_message_id;

      -- Both of these alerts are raised by the cook, and a reported phrase can
      -- come from either side, so the direction decides rather than the kind.
      select case when m.direction = 'COOK_TO_SENDER' then v_cook_id else v_sender_id end,
             case when m.direction = 'COOK_TO_SENDER' then v_sender_id else v_cook_id end
        into v_author_id, v_other_id
      from messages m where m.id = v_message_id;

      seat_pairing_id := coalesce(seat_pairing_id, v_pairing_id);
      seat_id := v_author_id;
      -- Carried out so a warning can be tied to the phrase it was about, and
      -- so the one action that hands over a name has something to name.
      seat_message_id := v_message_id;
      select secret_name into who from round_members where id = v_author_id;
      select secret_name into counterpart from round_members where id = v_other_id;

      already_warned := exists (
        select 1 from member_warnings w where w.message_id = v_message_id
      );
      answered := exists (
        select 1 from messages m2
        where m2.pairing_id = v_pairing_id and m2.created_at > v_alert.created_at
      );

      -- The dish the cook is refusing, so the Executive Chef can judge whether
      -- the refusal is fair before doing anything about it. The one being
      -- cooked first, and the first idea otherwise.
      if alert_type = 'CANNOT_COOK' then
        select b.dish_name, b.procedure into dish, recipe
        from briefs b
        where b.pairing_id = v_pairing_id
        order by (b.status = 'SUBMITTED') desc, b.position
        limit 1;
      end if;

    -- A phrase in the fridge, where everybody could read it.
    elsif alert_type = 'REPORTED_FRIDGE' then
      if v_alert.payload ? 'message_id' then
        select phrase_in(rm.template_id, v_locale), am.secret_name, am.id
          into phrase, who, seat_id
        from round_messages rm
        left join round_members am on am.id = rm.author_member_id
        where rm.id = (v_alert.payload->>'message_id')::uuid;
      end if;
      -- Alerts written before the id was recorded, and any row since deleted.
      phrase := coalesce(phrase, v_alert.payload->>'body');

    elsif alert_type = 'REPORTED_PHOTO' then
      select dp.id, dp.storage_path, dp.member_id, am.secret_name, dp.hidden_at is not null
        into seat_photo_id, photo_path, seat_id, who, answered
      from dinner_photos dp
      join round_members am on am.id = dp.member_id
      where dp.id = (v_alert.payload->>'photo_id')::uuid;

    -- At the door, and entitled to a real name: nobody has taken a seat yet.
    elsif alert_type = 'ENTER_REQUEST' then
      select rm.id, pr.display_name, rm.approved or rm.status <> 'ACTIVE'
        into seat_id, who, answered
      from round_members rm
      join profiles pr on pr.id = rm.profile_id
      where rm.id = (v_alert.payload->>'member_id')::uuid;

    elsif alert_type in ('DROPOUT', 'ACCOUNT_CLOSED') then
      seat_id := (v_alert.payload->>'member_id')::uuid;
      who := coalesce(
        v_alert.payload->>'secret_name',
        (select secret_name from round_members where id = seat_id)
      );

    elsif alert_type = 'LATE_ENTRY_CHAIN' then
      select secret_name into who from round_members
      where id = (v_alert.payload->>'new_member_id')::uuid;
      select secret_name into counterpart from round_members
      where id = (v_alert.payload->>'affected_sender_member_id')::uuid;

    elsif alert_type = 'CLOSED_CHAIN' then
      select secret_name into who from round_members
      where id = (v_alert.payload->>'sender_id')::uuid;
      select secret_name into counterpart from round_members
      where id = (v_alert.payload->>'cook_id')::uuid;

    elsif alert_type = 'ORFAN_MEAL' then
      seat_id := (v_alert.payload->>'departed_cook_id')::uuid;
      select secret_name into who from round_members where id = seat_id;
      select secret_name into counterpart from round_members
      where id = (v_alert.payload->>'sender_id')::uuid;
      select b.dish_name into dish from briefs b
      where b.pairing_id = v_alert.pairing_id
      order by (b.status = 'SUBMITTED') desc, b.position
      limit 1;

    elsif alert_type = 'ALLERGY_ALERT' then
      dish := v_alert.payload->>'dish_name';
      labels := array(select jsonb_array_elements_text(v_alert.payload->'labels'));
      select am.secret_name, sm.secret_name into who, counterpart
      from pairings p
      join round_members am on am.id = p.cook_id
      join round_members sm on sm.id = p.sender_id
      where p.id = v_alert.pairing_id;
    end if;

    return next;
  end loop;
end;
$$;

grant execute on function get_host_alerts_detailed(uuid) to authenticated;

comment on function get_host_alerts_detailed(uuid) is
  'Every unresolved alert for one dinner, with the ids in its payload resolved '
  'to what a person needs to act: the seat, the phrase in the host''s own '
  'language, the dish, and whether it has already sorted itself out.';

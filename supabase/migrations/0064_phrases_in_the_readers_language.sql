-- A canned phrase is a thought, not a string. It was being stored as a string.
--
-- `message_templates` holds one row per locale — the French sentence and the
-- English sentence are two rows with two ids — and `messages.template_id` points
-- at whichever one the *writer* was shown. So a French cook picks "Goûte avant
-- de servir", an English diner opens the fridge, and the join lands on that same
-- French row and prints it in French.
--
-- Which defeats the entire point of a canned vocabulary. The templates exist so
-- that two people who share no language can still talk at a dinner: the writer
-- picks from a list, and the reader should get the same thought in their own
-- words. Free text could not do that; this could, and did not.
--
-- THE FIX IS THE ONE THAT WAS ASKED FOR: the message references the thought, and
-- the reader's own locale chooses the sentence. `template_key` is that thought —
-- shared by the French row and the English row — and every reader lands on the
-- row that matches them. The stored `template_id` stays exactly as it is: it is
-- still a true record of what the writer chose and what they were shown, and
-- with the key derived from it nothing has to be rewritten.
--
-- It applies to the private threads between chefs for the same reason and by
-- the same route: the same `message_templates` table serves both.

-- ---------------------------------------------------------------------------
-- 1. The key.
--
-- Derived by position rather than typed out fifty-six times, because every seed
-- in this repo (0010, 0031, 0037) inserts the two locales in the same order
-- within its block — the nth French phrase is the nth English one. That is a
-- real property of the data and it is also an assumption, so the block below
-- REFUSES to guess when it does not hold: if any group ever has three phrases
-- in one language and two in another, position-pairing would silently key the
-- wrong sentences together and an English reader would get somebody else's
-- thought. Better to fail the migration.
-- ---------------------------------------------------------------------------

alter table message_templates add column if not exists template_key text;

do $$
declare
  v_bad int;
begin
  -- Every (category, slot_type, day_of) group must hold the same number of
  -- phrases in each locale. This is what makes "the nth of each" meaningful.
  select count(*) into v_bad from (
    select category, slot_type, day_of, count(distinct locale) as locales,
           count(*) filter (where locale = 'fr') as fr,
           count(*) filter (where locale = 'en') as en
    from message_templates
    group by category, slot_type, day_of
    having count(*) filter (where locale = 'fr') <> count(*) filter (where locale = 'en')
  ) uneven;

  if v_bad > 0 then
    raise exception
      'message_templates: % group(s) have different phrase counts per locale — '
      'position pairing would key the wrong sentences together. Add the missing '
      'translations, or key those rows by hand, before running this.', v_bad;
  end if;
end $$;

-- ctid is physical insert order, which for a table only ever appended to by
-- seed migrations is the order the phrases were written in. Nothing in this
-- app updates these rows, which is what makes that safe here — and it is why
-- the key is materialised into a column now rather than recomputed later.
with keyed as (
  select
    id,
    category || '_' || slot_type || case when day_of then '_DAYOF' else '' end || '_'
      || lpad(row_number() over (
           partition by category, slot_type, day_of, locale order by ctid
         )::text, 2, '0') as k
  from message_templates
)
update message_templates t set template_key = keyed.k
from keyed where keyed.id = t.id and t.template_key is null;

alter table message_templates alter column template_key set not null;

create index if not exists message_templates_key_locale_idx
  on message_templates (template_key, locale);

comment on column message_templates.template_key is
  'The thought, shared across locales. messages.template_id records what the '
  'writer chose; readers resolve this key against their own locale (0064).';

-- ---------------------------------------------------------------------------
-- 2. One resolver, used by every reader.
--
-- Falls back to the phrase as written when the reader''s locale has no row for
-- that thought — a language added later, a phrase translated later. Showing the
-- original is right: it is what somebody actually said, and an empty bubble
-- would be a worse answer than a foreign one.
-- ---------------------------------------------------------------------------

create or replace function phrase_in(p_template_id uuid, p_locale text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select mine.body
     from message_templates written
     join message_templates mine
       on mine.template_key = written.template_key and mine.locale = p_locale
     where written.id = p_template_id
     limit 1),
    (select body from message_templates where id = p_template_id)
  );
$$;

grant execute on function phrase_in(uuid, text) to authenticated;

-- Whoever is asking, in whatever they chose. Read from the profile rather than
-- passed in by the client: the language the account is set to is the one the
-- rest of the app is already speaking, and a client that could name its own
-- locale here could ask for a phrase in a language it is not showing.
create or replace function my_locale()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select locale from profiles where id = auth.uid()), 'en');
$$;

grant execute on function my_locale() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The three readers.
--
-- Same bodies as before with `t.body` replaced by the resolver. get_board
-- (0059), get_thread (0008) and get_reported_messages (0059) — the host reads a
-- reported phrase in their own language too, which matters more than the other
-- two: they are deciding what to do about it.
-- ---------------------------------------------------------------------------

create or replace function get_board(p_round_id uuid)
returns table (
  message_id uuid,
  body text,
  author_name text,
  is_mine boolean,
  reported boolean,
  author_member_id uuid
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
         rm.author_member_id = v_member_id, rm.reported, am.id
  from round_messages rm
  join round_members am on am.id = rm.author_member_id
  where rm.round_id = p_round_id
    and rm.created_at > now() - interval '24 hours'
    and (not rm.reported or rm.author_member_id = v_member_id)
    and not exists (
      select 1 from blocked_users b
      where b.profile_id = v_uid and b.blocked_profile_id = am.profile_id
    )
  order by rm.created_at;
end;
$$;

grant execute on function get_board(uuid) to authenticated;

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
  v_locale text := my_locale();
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
      m.id, m.direction, t.category, phrase_in(m.template_id, v_locale),
      m.slot_value, m.created_day, m.read_at, m.reported,
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

create or replace function get_reported_messages(p_round_id uuid)
returns table (
  message_id uuid, pairing_id uuid, direction message_direction,
  category message_category, body text, slot_value text, created_day date,
  author_member_id uuid,
  author_secret_name text,
  already_warned boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_locale text := my_locale();
begin
  if not is_round_host(p_round_id, auth.uid()) then
    raise exception 'only the host can view reported messages';
  end if;

  return query
    select
      m.id, m.pairing_id, m.direction, t.category,
      -- In the host's language. They are deciding what to do about this
      -- phrase; reading it in a language they do not speak is not a decision.
      phrase_in(m.template_id, v_locale),
      m.slot_value, m.created_day,
      am.id,
      am.secret_name,
      exists (select 1 from member_warnings w where w.message_id = m.id)
    from messages m
    join pairings p on p.id = m.pairing_id
    join message_templates t on t.id = m.template_id
    join round_members am
      on am.id = case when m.direction = 'SENDER_TO_COOK' then p.sender_id else p.cook_id end
    where p.round_id = p_round_id and m.reported
    order by m.created_at;
end;
$$;

grant execute on function get_reported_messages(uuid) to authenticated;

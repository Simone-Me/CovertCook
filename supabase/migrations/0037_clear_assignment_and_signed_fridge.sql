-- Three things: a way to undo the roulette, names on the fridge, and phrases
-- that only make sense on the day.

-- ---------------------------------------------------------------------------
-- 1. Clearing the assignment.
--
-- There was only re-roll, and re-roll refuses outright once anyone has
-- written — which is correct, but it left the host with no way back at all.
-- The specific trap: the menu can only be edited while no pairing uses a
-- course (COURSE_IN_USE), so a host who spun the roulette and then wanted a
-- different set of courses was stuck, with a button that said no and no button
-- that said undo.
--
-- Same guard as re-roll, and for the same reason: a brief is somebody's work,
-- and no button in this app throws that away silently. With no briefs there is
-- nothing to lose — the pairings are a shuffle, and a shuffle can be redone.
-- ---------------------------------------------------------------------------

create or replace function clear_assignment(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
begin
  select * into v_round from rounds where id = p_round_id for update;
  if not found then raise exception 'round not found'; end if;

  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the Executive Chef can clear the assignment';
  end if;

  if v_round.status <> 'LOCKED' then
    raise exception 'the assignment can only be cleared while the round is LOCKED';
  end if;

  if exists (
    select 1 from briefs b join pairings p on p.id = b.pairing_id where p.round_id = p_round_id
  ) then
    raise exception 'BRIEFS_EXIST';
  end if;

  delete from pairings where round_id = p_round_id;

  insert into audit_log (round_id, actor_id, action)
  values (p_round_id, v_uid, 'ASSIGNMENT_CLEARED');
end;
$$;

grant execute on function clear_assignment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The fridge is signed now.
--
-- A deliberate reversal, asked for knowingly: board lines carry the author's
-- secret name, so you can see who said what and pick the conversation back up
-- later. That is the point of a board people talk on.
--
-- What this gives up, stated plainly so nobody has to rediscover it: the board
-- was unattributable, first by collapsing identical phrases (0031) and then by
-- withholding the author entirely (0033). It no longer is. Real identities are
-- still protected — a secret name is a pseudonym, and who is behind it is the
-- game — but a pseudonym can now be followed across an evening's messages.
--
-- Still withheld: the clock. created_day never had finer resolution than a day
-- and the payload has carried no timestamp at all since 0034.
-- ---------------------------------------------------------------------------

drop function if exists get_board(uuid);

create or replace function get_board(p_round_id uuid)
returns table (
  message_id uuid,
  body text,
  author_name text,
  is_mine boolean,
  reported boolean
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
  select rm.id, t.body, am.secret_name, rm.author_member_id = v_member_id, rm.reported
  from round_messages rm
  join message_templates t on t.id = rm.template_id
  join round_members am on am.id = rm.author_member_id
  where rm.round_id = p_round_id
    and rm.created_at > now() - interval '24 hours'
    and (not rm.reported or rm.author_member_id = v_member_id)
  order by rm.created_at;
end;
$$;

grant execute on function get_board(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Phrases for the day itself.
--
-- Until the dinner actually happens the board is small talk. On the day it has
-- a job: saying you are running late, or that something has gone wrong, to
-- eight people at once without breaking cover. Those lines are useless before
-- and would only clutter the roller, so they are marked and shown only then.
--
-- A column rather than a new category value: ALTER TYPE ... ADD VALUE cannot
-- be used in the same transaction that adds it, and Supabase runs each file as
-- one — which is why 0030 and 0031 had to be split. A boolean avoids the
-- whole problem.
-- ---------------------------------------------------------------------------

alter table message_templates add column if not exists day_of boolean not null default false;

comment on column message_templates.day_of is
  'Only offered on the day of the dinner (round status DINNER). Board phrases only.';

insert into message_templates (category, locale, body, slot_type, day_of) values
  ('BOARD', 'en', 'Running about 30 minutes late — start without me!', 'NONE', true),
  ('BOARD', 'en', 'On my way.', 'NONE', true),
  ('BOARD', 'en', 'Not everything is ready — stopping at the shop on the way.', 'NONE', true),
  ('BOARD', 'en', 'Mine came out better than expected. No further questions.', 'NONE', true),
  ('BOARD', 'en', 'Mine did NOT come out as expected. No further questions.', 'NONE', true),
  ('BOARD', 'en', 'Does anybody have a corkscrew?', 'NONE', true),
  ('BOARD', 'en', 'I need an oven for ten minutes when I arrive.', 'NONE', true),
  ('BOARD', 'en', 'Everything is ready. See you shortly!', 'NONE', true),

  ('BOARD', 'fr', 'J''ai environ 30 minutes de retard — commencez sans moi !', 'NONE', true),
  ('BOARD', 'fr', 'Je suis en route.', 'NONE', true),
  ('BOARD', 'fr', 'Tout n''est pas prêt — je passe au magasin en chemin.', 'NONE', true),
  ('BOARD', 'fr', 'Le mien est meilleur que prévu. Pas d''autres questions.', 'NONE', true),
  ('BOARD', 'fr', 'Le mien n''est PAS comme prévu. Pas d''autres questions.', 'NONE', true),
  ('BOARD', 'fr', 'Quelqu''un a un tire-bouchon ?', 'NONE', true),
  ('BOARD', 'fr', 'J''aurai besoin d''un four dix minutes en arrivant.', 'NONE', true),
  ('BOARD', 'fr', 'Tout est prêt. À tout de suite !', 'NONE', true)
on conflict do nothing;

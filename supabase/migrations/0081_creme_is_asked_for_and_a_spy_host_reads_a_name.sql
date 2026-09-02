-- ---------------------------------------------------------------------------
-- CRÈME IS ASKED FOR, AND A SPY HOST READS A NAME.
--
-- Two things that were true in the code and wrong in the product.
--
-- 1. The free-for-all was granted rather than offered. Everybody was PRO until
--    a date in app_settings, and the only switch was one that took it away for
--    testing. That is a bad shape for a trial: nobody chooses it, so nobody
--    notices what it gave them, and in January five hundred accounts lose
--    features they never knew they had. Turning it into something you switch
--    on makes the same window mean something — the day it shuts, the people
--    who lose Crème are the people who once pressed a button to have it.
--
-- 2. SPY was supposed to mean "the Executive Chef sees everyone". 0073 built
--    the rule and wired five readers to it and this was the sixth: the recipe
--    you have been given still covered its author with a black bar for
--    everybody, including the one host entitled to the name, and including
--    every reader of a dinner that is already over.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The window opens a door; it does not push you through it.
--
-- `pro_test_override` keeps its name and its column. It was already the right
-- shape — per account, ignored once the window shuts, never a way to have
-- Crème for nothing afterwards — and what changes is which value means what:
--
--   FORCE_ON   the trial, asked for. Crème while the window lasts.
--   null       the free app, which is the whole app.
--   FORCE_OFF  the same as null. Kept because rows carry it: it used to be
--              how somebody looked at the free version, and that is now
--              simply what not asking looks like.
--
-- A subscription still answers on its own and is unaffected by any of this: a
-- code redeemed during the window is Crème after it too, which is the whole
-- point of a code.
-- ---------------------------------------------------------------------------

create or replace function is_pro(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    -- Asked for, and only while the window that gives it away is open.
    when pro_window_open()
      and (select pro_test_override from profiles where id = p_uid) = 'FORCE_ON'
      then true
    else exists (
      select 1 from pro_subscriptions s
      where s.profile_id = p_uid
        and s.cancelled_at is null
        and (s.expires_at is null or s.expires_at > now())
    )
  end;
$$;

comment on function is_pro(uuid) is
  'Whether this account has everything Crème opens: a live subscription, or the free trial switched on while the open window lasts. Per-item unlocks are a separate and narrower question — see theme_available (0072).';

comment on column profiles.pro_test_override is
  'FORCE_ON while app_settings.pro_open_until is in the future = the free trial, switched on by the account itself. Null (and FORCE_OFF, which rows still carry) = the free app. Ignored entirely once the window has passed — see 0081.';

-- Nobody is on the trial yet, because until this migration nobody had to ask.
-- The rows that say FORCE_OFF said "show me the free version", which is now
-- what every account gets by default, so they are cleared rather than left to
-- mean something that no longer exists.
update profiles set pro_test_override = null where pro_test_override = 'FORCE_OFF';

-- ---------------------------------------------------------------------------
-- 2. Who wrote for you, where the round says you may know.
--
-- The rule is `names_are_open` (0073) and it is not re-derived here: OPEN for
-- everybody, SPY for the host, and any dinner that has finished. Null in every
-- other case, and the black bar in the client is then covering a placeholder
-- rather than a name it was handed and chose not to print — which is the only
-- way a redaction in a browser is ever honest.
--
-- Dropped and recreated: the return type gains a column.
-- ---------------------------------------------------------------------------

drop function if exists get_my_brief(uuid);

create or replace function get_my_brief(p_round_id uuid)
returns table (
  pairing_id uuid,
  brief_id uuid,
  recipe_no int,
  chosen boolean,
  dish_name text, course course, procedure text,
  external_url text, difficulty integer, est_cost text, prep_minutes integer,
  note_to_cook text, contains_tags text[], ingredients jsonb, acknowledged boolean,
  sender_display_name text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_my_member_id uuid;
  v_named boolean;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  select id into v_my_member_id from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE' and approved;
  if not found then raise exception 'not an active member of this round'; end if;

  if v_round.status in ('DRAFT', 'OPEN', 'LOCKED') then
    raise exception 'briefs are not visible to cooks yet';
  end if;

  v_named := names_are_open(p_round_id, v_uid);

  return query
    select
      p.id,
      b.id,
      coalesce(b.position, 1),
      coalesce(b.status = 'SUBMITTED', false),
      b.dish_name,
      -- The slot when there is no recipe, because the slot is what the cook
      -- was actually dealt and it is true from the moment the roulette runs.
      coalesce(b.course, s.course),
      b.procedure, b.external_url, b.difficulty,
      b.est_cost, b.prep_minutes, b.note_to_cook,
      coalesce(b.contains_tags, '{}'::text[]),
      coalesce(
        (select jsonb_agg(jsonb_build_object('name', bi.name, 'quantity', bi.quantity, 'unit', bi.unit) order by bi.position)
         from brief_ingredients bi where bi.brief_id = b.id),
        '[]'::jsonb
      ),
      coalesce(b.acknowledged_at is not null, false),
      case when v_named then
        (select pr.display_name from round_members sm
         join profiles pr on pr.id = sm.profile_id
         where sm.id = p.sender_id)
      end
    from pairings p
    join slots s on s.id = p.slot_id
    left join briefs b on b.pairing_id = p.id and b.status in ('SUBMITTED', 'OFFERED')
    where p.round_id = p_round_id
      and p.assignment_version = v_round.assignment_version
      and p.cook_id = v_my_member_id
    order by b.position;
end;
$$;

grant execute on function get_my_brief(uuid) to authenticated;

comment on function get_my_brief(uuid) is
  'Every recipe offered to this cook, and — where names_are_open says this reader is entitled to it — who wrote them.';

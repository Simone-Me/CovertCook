-- A dinner's PRO cover has an end, and three days of grace after it.
--
-- 0075 stamped `is_pro` on a round at creation and left it there forever. That
-- solved the thing it set out to solve — a subscription lapsing on the Tuesday
-- must not strip a Friday dinner of the feature it was built around, in front
-- of eight people — and it solved it too generously: a dinner created on the
-- last day of a subscription kept three recipes per cook and a paid cloth for
-- as long as it existed. Every lapsed subscriber could keep one dinner alive.
--
-- THE RULE NOW: cover ends 72 hours after the subscription does. Three days is
-- chosen against a specific abuse — a dinner created at the last minute to
-- outlive the payment — and 72 hours is too short to be worth planning around
-- while being long enough that an evening already on the calendar is not lost
-- to a card that failed on the Tuesday.
--
-- WHAT "BLOCKED" MEANS, and it is deliberately narrow. The dinner does not
-- disappear and nothing is deleted: it stops moving. The Executive Chef cannot
-- advance it, nobody can write or send a recipe, and that is all. Everything
-- already there stays readable, and renewing releases it. Cancelling is always
-- allowed — a host who has decided not to renew must be able to call the
-- evening off rather than be trapped in it.
--
-- WHAT IS DELIBERATELY NOT BLOCKED, and this is the important half: a dinner
-- that is PRO but is not USING anything PRO. During the free-for-all every
-- account is PRO, so every dinner is stamped — and on the day the window
-- shuts, a rule keyed only on "the host is not PRO any more" would put every
-- one of them on hold at once, including the ordinary free-shaped ones. So the
-- hold asks a second question: is this dinner actually built on something PRO
-- (more than one recipe per cook, a paid word list, a paid cloth)? A default
-- dinner has nothing to lose and is never held.

-- ---------------------------------------------------------------------------
-- 1. When the cover ends.
-- ---------------------------------------------------------------------------

alter table rounds add column if not exists pro_until timestamptz;

comment on column rounds.pro_until is
  'When this dinner''s PRO cover runs out, grace included (0079). Null means it never does — a perpetual unlock, or a dinner that was never PRO. Stamped at creation and pushed out again when the host renews.';

-- The grace, in one place and named, so the number is a decision somebody made
-- rather than an interval typed in three functions.
create or replace function pro_grace()
returns interval
language sql
immutable
as $$ select interval '72 hours' $$;

/**
 * The cover an account can currently give a dinner it creates.
 *
 * Null has two meanings and they are not the same: for a perpetual
 * subscription it means "never runs out", and for an account with no PRO at
 * all it means "nothing to run out". The caller knows which, because it has
 * already asked is_pro().
 */
create or replace function pro_cover_until(p_uid uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    -- A real subscription decides it, whether or not the window is also open:
    -- somebody who has paid should not lose cover on 1 January because the
    -- free-for-all happened to be shorter than their year.
    when exists (
      select 1 from pro_subscriptions s
      where s.profile_id = p_uid and s.cancelled_at is null
        and (s.expires_at is null or s.expires_at > now())
    ) then (
      select case when s.expires_at is null then null else s.expires_at + pro_grace() end
      from pro_subscriptions s where s.profile_id = p_uid
    )
    -- Otherwise the window, if it is what is granting PRO.
    when pro_window_open() then
      (select pro_open_until from app_settings where id) + pro_grace()
    else null
  end;
$$;

grant execute on function pro_cover_until(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Whether a dinner is actually built on anything PRO.
--
-- Asked of the dinner rather than of its host, and asked by feature rather
-- than by flag: a host who bought the pâtisserie list and used it has a dinner
-- that depends on PRO; the same host's other dinner with default everything
-- does not, and holding it would be punishing eight people for nothing.
-- ---------------------------------------------------------------------------

create or replace function round_uses_pro(p_round_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select r.recipes_per_brief > 1
        or exists (select 1 from name_theme_catalogue c
                   where c.code = r.name_theme and c.tier = 'PAID')
        or exists (select 1 from table_theme_catalogue c
                   where c.code = r.table_theme and c.tier = 'PAID')
    from rounds r where r.id = p_round_id
  ), false);
$$;

grant execute on function round_uses_pro(uuid) to authenticated;

create or replace function round_pro_lapsed(p_round_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select r.is_pro
       and r.pro_until is not null
       and r.pro_until <= now()
       and round_uses_pro(p_round_id)
    from rounds r where r.id = p_round_id
  ), false);
$$;

comment on function round_pro_lapsed(uuid) is
  'This dinner is on hold: it was built on something PRO and its cover, grace included, has run out (0079). Nothing is deleted — it stops moving until the host renews.';

grant execute on function round_pro_lapsed(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The hold itself, as triggers.
--
-- The same shape 0054 uses to freeze a finished dinner, and for the same
-- reason: putting the check in advance_phase and the three brief functions
-- would be four places to forget it, and the fifth caller added next year
-- would walk straight past. A trigger cannot be walked past.
-- ---------------------------------------------------------------------------

create or replace function refuse_if_round_pro_lapsed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Renewal has to get through, or the hold would be its own prison: pushing
  -- pro_until out is precisely the write that releases the dinner.
  if new.pro_until is distinct from old.pro_until then
    return new;
  end if;

  -- Calling the evening off is always allowed. A host who has decided not to
  -- renew must be able to end the dinner rather than be trapped inside it,
  -- and cancelling takes nothing from anybody that the hold has not already.
  if new.status = 'CANCELLED' then
    return new;
  end if;

  if new.status is distinct from old.status and round_pro_lapsed(old.id) then
    raise exception 'PRO_LAPSED' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists rounds_pro_lapsed on rounds;
create trigger rounds_pro_lapsed
  before update on rounds
  for each row execute function refuse_if_round_pro_lapsed();

create or replace function refuse_if_brief_round_pro_lapsed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round_id uuid;
begin
  select p.round_id into v_round_id
  from pairings p where p.id = coalesce(new.pairing_id, old.pairing_id);

  if v_round_id is not null and round_pro_lapsed(v_round_id) then
    raise exception 'PRO_LAPSED' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists briefs_pro_lapsed on briefs;
create trigger briefs_pro_lapsed
  before insert or update or delete on briefs
  for each row execute function refuse_if_brief_round_pro_lapsed();

-- ---------------------------------------------------------------------------
-- 4. Renewing releases every dinner it covers.
--
-- Called by redeem_code below, and by whatever handles a purchase the day
-- there is one. It pushes the cover out on the host's dinners that are still
-- running — never on a finished one, which 0054's freeze would refuse anyway.
-- ---------------------------------------------------------------------------

create or replace function refresh_round_pro_cover(p_uid uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_until timestamptz := pro_cover_until(p_uid);
  v_count int;
begin
  if not is_pro(p_uid) then
    return 0;
  end if;

  update rounds
  set pro_until = v_until, is_pro = true
  where host_id = p_uid
    and status not in ('ARCHIVED', 'CANCELLED')
    and pro_until is distinct from v_until;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function refresh_round_pro_cover(uuid) from public, anon, authenticated;

-- redeem_code, with the release wired in. Same body as 0075 otherwise.
create or replace function redeem_code(p_code text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_code redeem_codes;
  v_key text := upper(btrim(coalesce(p_code, '')));
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if v_key = '' then raise exception 'INVALID_CODE'; end if;

  select * into v_code from redeem_codes
  where upper(code) = v_key for update;

  if not found then
    raise exception 'INVALID_CODE';
  end if;

  if exists (select 1 from redeem_code_uses u where u.code = v_code.code and u.profile_id = v_uid) then
    raise exception 'ALREADY_REDEEMED';
  end if;

  if v_code.expires_at <= now() or v_code.used_count >= v_code.max_uses then
    raise exception 'INVALID_CODE';
  end if;

  insert into redeem_code_uses (code, profile_id) values (v_code.code, v_uid);
  update redeem_codes set used_count = used_count + 1 where code = v_code.code;

  if v_code.pro_days is not null then
    insert into pro_subscriptions (profile_id, source, expires_at)
    values (v_uid, 'CODE', now() + make_interval(days => v_code.pro_days))
    on conflict (profile_id) do update
      set source = 'CODE',
          cancelled_at = null,
          expires_at = greatest(
            coalesce(pro_subscriptions.expires_at, now()),
            now()
          ) + make_interval(days => v_code.pro_days);

    -- The whole point of renewing, from the host's side: the dinners that were
    -- on hold start moving again in the same breath.
    perform refresh_round_pro_cover(v_uid);
  else
    insert into profile_theme_unlocks (profile_id, kind, code)
    values (v_uid, v_code.item_kind, v_code.item_code)
    on conflict do nothing;
  end if;

  insert into audit_log (round_id, actor_id, action, payload)
  values (null, v_uid, 'CODE_REDEEMED', jsonb_build_object('code', v_code.code));

  return coalesce(
    case when v_code.pro_days is not null then 'PRO' end,
    v_code.item_kind
  );
end;
$$;

grant execute on function redeem_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. create_round stamps the cover with the dinner.
-- ---------------------------------------------------------------------------

drop function if exists create_round(
  text, round_access, round_anonymity, slot_mode, int,
  timestamptz, text, text, boolean, boolean, voting_mode, text, text, int
);

create or replace function create_round(
  p_name text,
  p_access round_access,
  p_anonymity round_anonymity,
  p_slot_mode slot_mode default 'FREE',
  p_max_players int default null,
  p_dinner_at timestamptz default null,
  p_timezone text default 'Europe/Paris',
  p_location text default null,
  p_allow_mutual_pairs boolean default false,
  p_requires_approval boolean default true,
  p_voting_mode voting_mode default 'LIVE',
  p_name_theme text default 'FOOD',
  p_table_theme text default 'CHECKS',
  p_recipes_per_brief int default 1
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round_id uuid;
  v_code text;
  v_accent record;
  v_locale text;
  v_secret_name text;
  v_pro boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  v_pro := is_pro(v_uid);

  if not theme_available('NAME_THEME', p_name_theme, v_uid) then
    raise exception 'THEME_LOCKED';
  end if;

  if not theme_available('TABLE_THEME', p_table_theme, v_uid) then
    raise exception 'THEME_LOCKED';
  end if;

  if p_recipes_per_brief is null or p_recipes_per_brief not between 1 and 3 then
    raise exception 'RECIPES_PER_BRIEF_RANGE';
  end if;
  if p_recipes_per_brief > 1 and not v_pro then
    raise exception 'PRO_REQUIRED';
  end if;

  select locale into v_locale from profiles where id = v_uid;
  if not found then
    raise exception 'complete signup before creating a round';
  end if;

  select * into v_accent from pick_round_accent();

  loop
    v_code := generate_unambiguous_code(8);
    exit when not exists (select 1 from rounds where join_code = v_code);
  end loop;

  insert into rounds (
    name, host_id, access, anonymity, slot_mode, max_players,
    dinner_at, timezone, location, allow_mutual_pairs, requires_approval,
    voting_mode, name_theme, table_theme, recipes_per_brief, is_pro, pro_until,
    join_code, accent_color, accent_emoji
  ) values (
    p_name, v_uid, p_access, p_anonymity, p_slot_mode, p_max_players,
    p_dinner_at, coalesce(p_timezone, 'Europe/Paris'), p_location,
    p_allow_mutual_pairs, p_requires_approval, p_voting_mode, p_name_theme,
    p_table_theme, p_recipes_per_brief, v_pro,
    case when v_pro then pro_cover_until(v_uid) end,
    v_code, v_accent.color, v_accent.emoji
  )
  returning id into v_round_id;

  select assign_secret_name(v_round_id, coalesce(v_locale, 'fr')) into v_secret_name;

  insert into round_members (round_id, profile_id, secret_name, role, approved)
  values (v_round_id, v_uid, v_secret_name, 'HOST', true);

  insert into audit_log (round_id, actor_id, action, payload)
  values (v_round_id, v_uid, 'ROUND_CREATED',
          jsonb_build_object('name', p_name, 'name_theme', p_name_theme,
                             'table_theme', p_table_theme,
                             'recipes_per_brief', p_recipes_per_brief,
                             'is_pro', v_pro));

  return v_round_id;
end;
$$;

grant execute on function create_round(
  text, round_access, round_anonymity, slot_mode, int,
  timestamptz, text, text, boolean, boolean, voting_mode, text, text, int
) to authenticated;

-- Existing rounds get the cover their host can currently give, so the rule
-- starts from a consistent state rather than from a column full of nulls that
-- would read as "perpetual". Finished dinners are skipped: 0054's trigger
-- refuses every write to one, and a record has nothing left to hold.
update rounds r
set pro_until = pro_cover_until(r.host_id)
where r.is_pro
  and r.pro_until is null
  and r.status not in ('ARCHIVED', 'CANCELLED');

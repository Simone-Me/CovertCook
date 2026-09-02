-- PRO, made of rows rather than of intentions.
--
-- Until now "Pro" was a badge printed beside switched-off controls and a
-- paragraph promising the free app is a whole product. 0072 gave the two
-- sellable things a catalogue and a per-item entitlement. This is the rest of
-- it: a subscription, a code, a test window, and one function that every
-- gate in the app asks instead of each deciding for itself.
--
-- FOUR WAYS TO BE PRO, and they are deliberately not four mechanisms:
--   * a per-item unlock (0072) — you own that one theme, forever;
--   * a subscription — you have everything, while it lasts;
--   * a redeemed code — a subscription with a different origin, which is how
--     testers and the author's own account get in without a payment provider;
--   * the open window — everybody, until a date in app_settings.
--
-- NOTHING TAKES MONEY YET. There is no payment provider wired to this app, so
-- `pro_subscriptions` has no insert path for `authenticated` at all: a row gets
-- there by redeeming a code, or by whatever server-side thing eventually
-- handles a purchase. The shelf is honest about that (0072) and this file
-- keeps it honest: the buying is the missing half, and it is missing in one
-- place rather than faked in five.

-- ---------------------------------------------------------------------------
-- 1. The open window.
--
-- Every account is PRO until this date. It is a column rather than a constant
-- because ending the free-for-all should be an UPDATE somebody runs when they
-- are ready, not a deploy — and because the date is a promise made to the
-- people testing, which belongs somewhere they could in principle read.
-- ---------------------------------------------------------------------------

alter table app_settings
  add column if not exists pro_open_until timestamptz;

comment on column app_settings.pro_open_until is
  'Everybody is PRO until this moment. Null closes the window immediately. Set during the test period; an UPDATE ends it.';

update app_settings set pro_open_until = timestamptz '2026-12-31 23:59:59+01' where id;

-- ---------------------------------------------------------------------------
-- 2. Subscriptions.
--
-- One row per account, replaced rather than accumulated: "am I PRO" is a
-- question with one answer, and a history of five overlapping subscriptions is
-- a question with five. What extends a subscription is pushing `expires_at`
-- out, and the audit log is where the history belongs.
-- ---------------------------------------------------------------------------

create table if not exists pro_subscriptions (
  profile_id uuid primary key references profiles (id) on delete cascade,
  -- Where this came from, because a refund, a support question and an expiry
  -- are three different conversations and they start by asking this.
  source text not null check (source in ('PURCHASE', 'CODE', 'GRANT')),
  started_at timestamptz not null default now(),
  -- Null means perpetual — what a lifetime unlock or the author's own account
  -- would carry. Everything else has a date.
  expires_at timestamptz,
  cancelled_at timestamptz
);

alter table pro_subscriptions enable row level security;

-- Yours, readable. Nobody's, writable: see the header — there is no purchase
-- path, and redeeming a code goes through a SECURITY DEFINER function.
drop policy if exists pro_subscriptions_select_own on pro_subscriptions;
create policy pro_subscriptions_select_own on pro_subscriptions
  for select using (profile_id = auth.uid());

grant select on pro_subscriptions to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The test switch.
--
-- While the window is open every account is PRO, which makes it impossible to
-- see what a free account sees — and "what does this look like without PRO"
-- is the single most useful thing to be able to check during a test period.
--
-- So: a per-account override, and it is deliberately powerless in both
-- directions once the window shuts. FORCE_ON cannot grant PRO to a free
-- account after the free-for-all ends (it would be a bypass with a friendly
-- name); FORCE_OFF is harmless at any time but has nothing to hide once
-- everybody is not PRO by default anyway. A test affordance that outlives the
-- test is a hole.
-- ---------------------------------------------------------------------------

alter table profiles
  add column if not exists pro_test_override text
    check (pro_test_override is null or pro_test_override in ('FORCE_ON', 'FORCE_OFF'));

comment on column profiles.pro_test_override is
  'Test-period only: pretend this account is / is not PRO. Ignored entirely once app_settings.pro_open_until has passed — see 0075.';

-- ---------------------------------------------------------------------------
-- 4. The one question.
-- ---------------------------------------------------------------------------

create or replace function pro_window_open()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select pro_open_until > now() from app_settings where id), false);
$$;

grant execute on function pro_window_open() to anon, authenticated;

create or replace function is_pro(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    -- The override, and only while the window that justifies it is open.
    when pro_window_open()
      and (select pro_test_override from profiles where id = p_uid) = 'FORCE_OFF'
      then false
    when pro_window_open() then true
    else exists (
      select 1 from pro_subscriptions s
      where s.profile_id = p_uid
        and s.cancelled_at is null
        and (s.expires_at is null or s.expires_at > now())
    )
  end;
$$;

comment on function is_pro(uuid) is
  'Whether this account has everything PRO opens. Per-item unlocks are a separate and narrower question — see theme_available (0072).';

grant execute on function is_pro(uuid) to authenticated;

-- What the client needs to draw the PRO screens, in one call: am I PRO, why,
-- until when, and is the free-for-all what is doing it.
create or replace function my_pro_status()
returns table (
  pro boolean,
  window_open boolean,
  window_until timestamptz,
  source text,
  expires_at timestamptz,
  test_override text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    is_pro(auth.uid()),
    pro_window_open(),
    (select pro_open_until from app_settings where id),
    (select s.source from pro_subscriptions s
      where s.profile_id = auth.uid() and s.cancelled_at is null
        and (s.expires_at is null or s.expires_at > now())),
    (select s.expires_at from pro_subscriptions s
      where s.profile_id = auth.uid() and s.cancelled_at is null
        and (s.expires_at is null or s.expires_at > now())),
    (select p.pro_test_override from profiles p where p.id = auth.uid());
$$;

grant execute on function my_pro_status() to authenticated;

create or replace function set_pro_test_override(p_mode text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_mode is not null and p_mode not in ('FORCE_ON', 'FORCE_OFF') then
    raise exception 'unknown override';
  end if;
  -- Refused rather than silently ignored, so a switch that would do nothing
  -- says so instead of appearing to work.
  if not pro_window_open() then
    raise exception 'TEST_WINDOW_CLOSED';
  end if;
  update profiles set pro_test_override = p_mode where id = v_uid;
end;
$$;

grant execute on function set_pro_test_override(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Codes.
--
-- What they are for, in order of how often they will be used: giving testers
-- PRO without a payment provider, giving the author's own account PRO, and
-- one day making good on a support problem. Not a marketing mechanism — there
-- is no campaign, and a code that can be used a thousand times is a coupon,
-- which is a different feature with a different set of things that can go
-- wrong.
--
-- SO: single use by default, and an expiry that is required rather than
-- optional. A code with no expiry is a credential somebody pasted into a chat
-- in 2026 and forgot about.
-- ---------------------------------------------------------------------------

create table if not exists redeem_codes (
  -- Stored as typed, compared case-insensitively (see redeem_code below):
  -- these get read aloud and retyped on a phone.
  code text primary key,
  -- Days of PRO this hands over. Null with a theme code means "this item,
  -- forever"; a number means a subscription that long.
  pro_days int check (pro_days is null or pro_days between 1 and 3650),
  -- Or one item from a catalogue, kept as the same shape 0072 uses.
  item_kind text check (item_kind is null or item_kind in ('NAME_THEME', 'TABLE_THEME')),
  item_code text,
  expires_at timestamptz not null,
  max_uses int not null default 1 check (max_uses between 1 and 1000),
  used_count int not null default 0 check (used_count >= 0),
  note text,
  created_at timestamptz not null default now(),

  -- A code that hands over nothing is a typo, not a code.
  check ((pro_days is not null) or (item_kind is not null and item_code is not null)),
  check (used_count <= max_uses)
);

create table if not exists redeem_code_uses (
  code text not null references redeem_codes (code) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  used_at timestamptz not null default now(),
  -- The same person cannot spend one code twice, whatever max_uses says.
  primary key (code, profile_id)
);

alter table redeem_codes enable row level security;
alter table redeem_code_uses enable row level security;

-- No policies at all, and that is the point: a client that could SELECT this
-- table could enumerate every unspent code. Everything goes through the
-- function below, which is told a code and answers about that one code.
revoke all on redeem_codes from anon, authenticated;
revoke all on redeem_code_uses from anon, authenticated;

/**
 * Spend a code.
 *
 * Every refusal is the same shape on purpose — INVALID_CODE for "no such
 * code", "expired" and "used up" alike. Distinguishing them would turn this
 * into an oracle: type codes until one says "expired" and you have learned the
 * format of the ones that are not.
 *
 * ALREADY_REDEEMED is the one exception, because it is about the caller's own
 * past and telling them is the only way they stop retrying a code that worked.
 */
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

  -- FOR UPDATE, because two phones redeeming the last use of the same code at
  -- the same instant is exactly the race a single-use code exists to lose.
  select * into v_code from redeem_codes
  where upper(code) = v_key for update;

  if not found then
    raise exception 'INVALID_CODE';
  end if;

  -- The caller's own past comes FIRST, before the code's remaining uses.
  -- Otherwise a single-use code the caller themselves spent comes back as
  -- INVALID_CODE — technically uniform, and useless: they retype it, get the
  -- same nothing, and conclude the feature is broken rather than that it
  -- already worked. Telling somebody what they did leaks nothing they were not
  -- there for.
  if exists (select 1 from redeem_code_uses u where u.code = v_code.code and u.profile_id = v_uid) then
    raise exception 'ALREADY_REDEEMED';
  end if;

  if v_code.expires_at <= now() or v_code.used_count >= v_code.max_uses then
    raise exception 'INVALID_CODE';
  end if;

  insert into redeem_code_uses (code, profile_id) values (v_code.code, v_uid);
  update redeem_codes set used_count = used_count + 1 where code = v_code.code;

  if v_code.pro_days is not null then
    -- Extends rather than replaces: redeeming a second code while the first is
    -- still running should add to it, not shorten it to the new one's length.
    insert into pro_subscriptions (profile_id, source, expires_at)
    values (v_uid, 'CODE', now() + make_interval(days => v_code.pro_days))
    on conflict (profile_id) do update
      set source = 'CODE',
          cancelled_at = null,
          expires_at = greatest(
            coalesce(pro_subscriptions.expires_at, now()),
            now()
          ) + make_interval(days => v_code.pro_days);
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

/**
 * Mint one.
 *
 * DELIBERATELY NOT GRANTED TO `authenticated`, and that is the whole security
 * design: there is no in-app admin panel and no is_admin flag, because both
 * would add a privilege level to an app that currently has exactly two (a
 * member, and the Executive Chef of one dinner). Minting a code is something
 * that happens perhaps twenty times ever, from the SQL editor of the Supabase
 * dashboard, by the one person holding those keys:
 *
 *     select create_redeem_code('TESTER-01', 90, null, null, '30 days', 1);
 *
 * If an admin surface is ever wanted, it should arrive as a deliberate
 * decision with its own audit and its own second factor — not as a grant added
 * quietly to this line.
 */
create or replace function create_redeem_code(
  p_code text,
  p_pro_days int default null,
  p_item_kind text default null,
  p_item_code text default null,
  p_valid_for interval default interval '24 hours',
  p_max_uses int default 1,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text := upper(btrim(coalesce(p_code, '')));
begin
  if v_key = '' then raise exception 'a code needs a code'; end if;

  insert into redeem_codes (code, pro_days, item_kind, item_code, expires_at, max_uses, note)
  values (v_key, p_pro_days, p_item_kind, p_item_code, now() + p_valid_for, p_max_uses, p_note);

  return v_key;
end;
$$;

revoke all on function create_redeem_code(text, int, text, text, interval, int, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. PRO opens the whole shelf.
--
-- theme_available (0072) knew about per-item unlocks and nothing else, so a
-- subscriber would have been refused every theme they were paying for.
-- ---------------------------------------------------------------------------

create or replace function theme_available(p_kind text, p_code text, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select c.tier in ('DEFAULT', 'FREE')
            or is_pro(p_uid)
            or exists (
              select 1 from profile_theme_unlocks u
              where u.profile_id = p_uid and u.kind = p_kind and u.code = p_code
            )
     from (
       select code, tier from name_theme_catalogue where p_kind = 'NAME_THEME'
       union all
       select code, tier from table_theme_catalogue where p_kind = 'TABLE_THEME'
     ) c
     where c.code = p_code),
    false);
$$;

revoke all on function theme_available(text, text, uuid) from public;
grant execute on function theme_available(text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. A dinner carries its host's PRO, and carries it for everybody.
--
-- THE RULE THE PRODUCT ACTUALLY WANTS: nobody sits at a table where the person
-- opposite has a feature they do not. So PRO is a property of the *dinner*,
-- granted by whoever organised it, and every guest gets it for that evening
-- whether or not they have ever paid for anything. A table split into paying
-- and non-paying players is the thing README says must never happen.
--
-- Stamped at creation rather than read live, and that matters: a subscription
-- that lapses on the Tuesday must not strip a Friday dinner of the thing it
-- was built around, mid-evening, in front of eight people.
-- ---------------------------------------------------------------------------

alter table rounds add column if not exists is_pro boolean not null default false;

comment on column rounds.is_pro is
  'Whether the Executive Chef was PRO when this dinner was created (0075). Stamped, not read live: a subscription lapsing must not change a dinner already under way. Everybody at the table gets what it opens.';

-- Backfilled while the free-for-all is on, so a dinner created yesterday and
-- one created this afternoon behave the same way.
--
-- ARCHIVED AND CANCELLED ROUNDS ARE EXCLUDED, and not for tidiness: 0054's
-- trigger refuses every UPDATE to a frozen round, and 0062 shipped broken
-- because its backfill forgot that (see the entry for 2026-08-28 (3) in
-- CHANGELOG.md — it passed every test because a freshly reset database has no
-- archived rounds to refuse). The hatch that would let this through exists,
-- and opening it for a cosmetic backfill would be spending a fire exit on
-- convenience: a finished dinner is a record, nothing PRO-gated is offered on
-- one, and the column being false there changes nothing anybody can see.
update rounds set is_pro = true
where is_pro = false
  and status not in ('ARCHIVED', 'CANCELLED')
  and pro_window_open();

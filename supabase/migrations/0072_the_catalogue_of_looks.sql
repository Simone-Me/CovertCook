-- What a dinner is called and what it looks like, as a catalogue.
--
-- Two settings have been hard-coded lists in the client: the pseudonym theme
-- (two values, checked by name inside create_round) and the table theme (a
-- row in the settings overview reading "coming soon"). Both are about to grow,
-- and both are the *look* of an evening rather than how the game is played —
-- which is the line PRESENTATION.md draws around anything that could ever be
-- sold. So they become data, with a tier on each row, and the rule about what
-- is free is written once instead of in every screen that offers a choice.
--
-- THREE TIERS, AND WHY.
--   DEFAULT — what a dinner gets when nobody chooses. Always available; there
--             is exactly one per kind and it can never be taken away, because
--             a host with no entitlements still has to be able to create a
--             dinner.
--   FREE    — a second one, open to everybody, no purchase and nothing to
--             claim. It exists so that "there is more than one" is something
--             a host discovers by using the app rather than by reading a
--             price list.
--   PAID    — locked, with a price on the row. NOTHING SELLS ANYTHING YET:
--             there is no payment provider wired to this app, so a PAID theme
--             is visible, priced and refused. The unlock table below is where
--             a purchase will land the day there is one, and the entitlement
--             check already reads it — so that day is a row insert, not a
--             migration through every screen that renders a lock.
--
-- Prices are in cents and they are data. Changing what a list costs is an
-- UPDATE, not a deploy.

-- ---------------------------------------------------------------------------
-- 1. The two catalogues.
-- ---------------------------------------------------------------------------

create table if not exists name_theme_catalogue (
  code text primary key,
  tier text not null check (tier in ('DEFAULT', 'FREE', 'PAID')),
  price_cents int check (price_cents is null or price_cents > 0),
  -- The list's own mark. Carried here rather than in the client because it is
  -- part of what a theme *is*: it stands in for the dinner wherever the dinner
  -- is small enough to be one character, and it seeds the food faces the
  -- fridge gives each chef.
  mark text not null,
  sort_order int not null default 0,
  -- A tier with no price and a price with no tier are both nonsense.
  constraint name_theme_price_matches_tier
    check ((tier = 'PAID') = (price_cents is not null))
);

comment on table name_theme_catalogue is
  'The pseudonym word lists a dinner can draw from. secret_name_words.theme references these codes by value.';

create table if not exists table_theme_catalogue (
  code text primary key,
  tier text not null check (tier in ('DEFAULT', 'FREE', 'PAID')),
  price_cents int check (price_cents is null or price_cents > 0),
  sort_order int not null default 0,
  constraint table_theme_price_matches_tier
    check ((tier = 'PAID') = (price_cents is not null))
);

comment on table table_theme_catalogue is
  'How the cloth is dressed. Look only — nothing here changes a rule of the game.';

-- Readable by anybody signed in: a locked theme has to be *visible* to be
-- worth unlocking, and there is nothing private on these rows.
alter table name_theme_catalogue enable row level security;
alter table table_theme_catalogue enable row level security;

drop policy if exists name_theme_catalogue_select on name_theme_catalogue;
create policy name_theme_catalogue_select on name_theme_catalogue for select using (true);

drop policy if exists table_theme_catalogue_select on table_theme_catalogue;
create policy table_theme_catalogue_select on table_theme_catalogue for select using (true);

grant select on name_theme_catalogue to authenticated;
grant select on table_theme_catalogue to authenticated;

-- ---------------------------------------------------------------------------
-- 2. What a given account owns.
--
-- Empty on day one and expected to stay that way until there is something to
-- buy. Its shape is the whole point: one row per thing owned, never a flag on
-- the profile, so that a refund is a delete and an account's entitlements can
-- be read without reading the account.
-- ---------------------------------------------------------------------------

create table if not exists profile_theme_unlocks (
  profile_id uuid not null references profiles (id) on delete cascade,
  kind text not null check (kind in ('NAME_THEME', 'TABLE_THEME')),
  code text not null,
  unlocked_at timestamptz not null default now(),
  primary key (profile_id, kind, code)
);

alter table profile_theme_unlocks enable row level security;

drop policy if exists profile_theme_unlocks_select_own on profile_theme_unlocks;
create policy profile_theme_unlocks_select_own on profile_theme_unlocks
  for select using (profile_id = auth.uid());

grant select on profile_theme_unlocks to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The rule, written once.
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

-- One call per picker: the whole catalogue with "can I use this" already
-- answered, so no screen has to re-derive the tier rule and then get it wrong.
create or replace function list_name_themes()
returns table (code text, tier text, price_cents int, mark text, owned boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.code, c.tier, c.price_cents, c.mark,
         theme_available('NAME_THEME', c.code, auth.uid())
  from name_theme_catalogue c
  order by c.sort_order, c.code;
$$;

grant execute on function list_name_themes() to authenticated;

create or replace function list_table_themes()
returns table (code text, tier text, price_cents int, owned boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.code, c.tier, c.price_cents,
         theme_available('TABLE_THEME', c.code, auth.uid())
  from table_theme_catalogue c
  order by c.sort_order, c.code;
$$;

grant execute on function list_table_themes() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The rows.
--
-- FOOD and BRIGADE already exist as word lists (0010, 0038) and keep the
-- standing they already had: herbs are what you get for free by doing nothing,
-- the brigade is the free second one. The three new lists are paid.
-- ---------------------------------------------------------------------------

insert into name_theme_catalogue (code, tier, price_cents, mark, sort_order) values
  ('FOOD',        'DEFAULT', null, '🌿',  10),
  ('BRIGADE',     'FREE',    null, '👨‍🍳', 20),
  ('PASTA',       'PAID',      50, '🍝',  30),
  ('PATISSERIE',  'PAID',      50, '🍰',  40),
  ('BATTERIE',    'PAID',      50, '🍳',  50)
on conflict (code) do update
  set tier = excluded.tier,
      price_cents = excluded.price_cents,
      mark = excluded.mark,
      sort_order = excluded.sort_order;

insert into table_theme_catalogue (code, tier, price_cents, sort_order) values
  ('CHECKS',    'DEFAULT', null,  10),
  ('ELEGANT',   'FREE',    null,  20),
  ('SCIFI',     'PAID',     100,  30),
  ('BAROQUE',   'PAID',     100,  40),
  ('HALLOWEEN', 'PAID',     100,  50),
  ('XMAS',      'PAID',     100,  60),
  ('CARNIVAL',  'PAID',     100,  70)
on conflict (code) do update
  set tier = excluded.tier,
      price_cents = excluded.price_cents,
      sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- 5. The three new word lists, 24 each, the same size as the two that exist —
-- so a table of up to 24 never has to be numbered instead of named, and the
-- MAX_PLAYERS ceiling of 30 keeps its meaning.
--
-- PASTA is one list in both locales on purpose: a rigatone is a rigatone in
-- English and in French, and translating shapes would invent names no kitchen
-- uses. PATISSERIE is the same case — an éclair is an éclair. BATTERIE is not:
-- half of a French kitchen's tools are called something else in English, so
-- that one is genuinely two lists.
-- ---------------------------------------------------------------------------

insert into secret_name_words (theme, locale, word)
select 'PASTA', l.locale, w.word
from (values
  ('Spaghetti'), ('Rigatoni'), ('Farfalle'), ('Fusilli'),
  ('Penne'), ('Linguine'), ('Tagliatelle'), ('Orecchiette'),
  ('Conchiglie'), ('Bucatini'), ('Cavatelli'), ('Trofie'),
  ('Paccheri'), ('Gnocchi'), ('Pappardelle'), ('Ravioli'),
  ('Tortellini'), ('Lasagne'), ('Vermicelli'), ('Ditalini'),
  ('Casarecce'), ('Strozzapreti'), ('Mafaldine'), ('Garganelli')
) as w(word)
cross join (values ('en'), ('fr')) as l(locale)
on conflict do nothing;

insert into secret_name_words (theme, locale, word)
select 'PATISSERIE', l.locale, w.word
from (values
  ('Éclair'), ('Macaron'), ('Madeleine'), ('Millefeuille'),
  ('Profiterole'), ('Canelé'), ('Financier'), ('Palmier'),
  ('Opéra'), ('Baba'), ('Clafoutis'), ('Tatin'),
  ('Paris-Brest'), ('Saint-Honoré'), ('Croquembouche'), ('Religieuse'),
  ('Chausson'), ('Kouign-Amann'), ('Sablé'), ('Praliné'),
  ('Ganache'), ('Nougatine'), ('Brioche'), ('Craquelin')
) as w(word)
cross join (values ('en'), ('fr')) as l(locale)
on conflict do nothing;

insert into secret_name_words (theme, locale, word) values
  ('BATTERIE', 'fr', 'Mandoline'), ('BATTERIE', 'fr', 'Chinois'),
  ('BATTERIE', 'fr', 'Sauteuse'),  ('BATTERIE', 'fr', 'Rondeau'),
  ('BATTERIE', 'fr', 'Cocotte'),   ('BATTERIE', 'fr', 'Écumoire'),
  ('BATTERIE', 'fr', 'Fouet'),     ('BATTERIE', 'fr', 'Maryse'),
  ('BATTERIE', 'fr', 'Poêle'),     ('BATTERIE', 'fr', 'Marmite'),
  ('BATTERIE', 'fr', 'Passoire'),  ('BATTERIE', 'fr', 'Râpe'),
  ('BATTERIE', 'fr', 'Mortier'),   ('BATTERIE', 'fr', 'Pilon'),
  ('BATTERIE', 'fr', 'Tamis'),     ('BATTERIE', 'fr', 'Louche'),
  ('BATTERIE', 'fr', 'Pince'),     ('BATTERIE', 'fr', 'Zesteur'),
  ('BATTERIE', 'fr', 'Économe'),   ('BATTERIE', 'fr', 'Emporte-pièce'),
  ('BATTERIE', 'fr', 'Rouleau'),   ('BATTERIE', 'fr', 'Bain-marie'),
  ('BATTERIE', 'fr', 'Cul-de-poule'), ('BATTERIE', 'fr', 'Chalumeau'),

  ('BATTERIE', 'en', 'Mandoline'), ('BATTERIE', 'en', 'Chinois'),
  ('BATTERIE', 'en', 'Sauté Pan'), ('BATTERIE', 'en', 'Rondeau'),
  ('BATTERIE', 'en', 'Cocotte'),   ('BATTERIE', 'en', 'Skimmer'),
  ('BATTERIE', 'en', 'Whisk'),     ('BATTERIE', 'en', 'Spatula'),
  ('BATTERIE', 'en', 'Skillet'),   ('BATTERIE', 'en', 'Stockpot'),
  ('BATTERIE', 'en', 'Colander'),  ('BATTERIE', 'en', 'Grater'),
  ('BATTERIE', 'en', 'Mortar'),    ('BATTERIE', 'en', 'Pestle'),
  ('BATTERIE', 'en', 'Sieve'),     ('BATTERIE', 'en', 'Ladle'),
  ('BATTERIE', 'en', 'Tongs'),     ('BATTERIE', 'en', 'Zester'),
  ('BATTERIE', 'en', 'Peeler'),    ('BATTERIE', 'en', 'Cutter'),
  ('BATTERIE', 'en', 'Rolling Pin'), ('BATTERIE', 'en', 'Bain-Marie'),
  ('BATTERIE', 'en', 'Mixing Bowl'), ('BATTERIE', 'en', 'Blowtorch')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 6. The cloth the dinner is laid on.
-- ---------------------------------------------------------------------------

alter table rounds add column if not exists table_theme text not null default 'CHECKS';

comment on column rounds.table_theme is
  'How this dinner is dressed (0072). Look only, chosen at creation and fixed: the table is the one thing everybody is looking at, and re-dressing it mid-evening changes the room under people who are mid-sentence.';

-- ---------------------------------------------------------------------------
-- 7. create_round learns the second theme, and stops keeping its own list.
--
-- The hard-coded `p_name_theme not in ('FOOD','BRIGADE')` is replaced by the
-- catalogue plus the entitlement — which also closes a hole nobody had opened
-- yet: without the second check, a host could name a paid theme in a raw RPC
-- call and get it.
-- ---------------------------------------------------------------------------

drop function if exists create_round(
  text, round_access, round_anonymity, slot_mode, int,
  timestamptz, text, text, boolean, boolean, voting_mode, text
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
  p_table_theme text default 'CHECKS'
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
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not theme_available('NAME_THEME', p_name_theme, v_uid) then
    raise exception 'THEME_LOCKED';
  end if;

  if not theme_available('TABLE_THEME', p_table_theme, v_uid) then
    raise exception 'THEME_LOCKED';
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
    voting_mode, name_theme, table_theme, join_code, accent_color, accent_emoji
  ) values (
    p_name, v_uid, p_access, p_anonymity, p_slot_mode, p_max_players,
    p_dinner_at, coalesce(p_timezone, 'Europe/Paris'), p_location,
    p_allow_mutual_pairs, p_requires_approval, p_voting_mode, p_name_theme,
    p_table_theme, v_code, v_accent.color, v_accent.emoji
  )
  returning id into v_round_id;

  -- After the insert, so the theme is already on the row this reads.
  select assign_secret_name(v_round_id, coalesce(v_locale, 'fr')) into v_secret_name;

  insert into round_members (round_id, profile_id, secret_name, role, approved)
  values (v_round_id, v_uid, v_secret_name, 'HOST', true);

  insert into audit_log (round_id, actor_id, action, payload)
  values (v_round_id, v_uid, 'ROUND_CREATED',
          jsonb_build_object('name', p_name, 'name_theme', p_name_theme, 'table_theme', p_table_theme));

  return v_round_id;
end;
$$;

grant execute on function create_round(
  text, round_access, round_anonymity, slot_mode, int,
  timestamptz, text, text, boolean, boolean, voting_mode, text, text
) to authenticated;

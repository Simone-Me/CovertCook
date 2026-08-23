-- A second set of pseudonyms: the kitchen brigade.
--
-- The theme picker existed in the creation form as a disabled control with one
-- option, because there was only one word list. There is now a second, and it
-- needs no artwork and no new mechanic — which is exactly why it can ship free
-- while the *look* of a dinner stays the paid idea.
--
-- Every name below is a documented station in Escoffier's brigade de cuisine
-- or its extended form. Checked rather than recalled, because a list of
-- plausible-sounding French words is not the same thing as a list of real
-- kitchen jobs. Two were considered and dropped:
--   * "Limonadier" — a beverage/bar role, not a kitchen station, despite
--     turning up in the design mockups.
--   * "Chef de garde" — a shift, not a station.

alter table secret_name_words add column if not exists theme text not null default 'FOOD';

comment on column secret_name_words.theme is
  'Which pseudonym set a word belongs to. FOOD = herbs and spices, BRIGADE = kitchen brigade stations.';

-- Dropping the constraint takes its index with it; dropping the index first
-- is refused precisely because the constraint owns it.
alter table secret_name_words drop constraint if exists secret_name_words_locale_word_key;
create unique index if not exists secret_name_words_theme_locale_word_key
  on secret_name_words (theme, locale, word);

alter table rounds add column if not exists name_theme text not null default 'FOOD';

comment on column rounds.name_theme is
  'Which pseudonym set this dinner draws secret names from. Chosen at creation and fixed: renaming people mid-game would break every message already addressed to them.';

-- The stations. The words are French in both locales because that is what a
-- brigade is called in an English kitchen too — a saucier is a saucier.
insert into secret_name_words (theme, locale, word)
select 'BRIGADE', l.locale, w.word
from (values
  ('Saucier'), ('Poissonnier'), ('Rôtisseur'), ('Grillardin'),
  ('Friturier'), ('Entremetier'), ('Potager'), ('Légumier'),
  ('Garde-manger'), ('Tournant'), ('Pâtissier'), ('Confiseur'),
  ('Glacier'), ('Décorateur'), ('Boulanger'), ('Boucher'),
  ('Aboyeur'), ('Communard'), ('Commis'), ('Plongeur'),
  ('Marmiton'), ('Écailler'), ('Chef de partie'), ('Sous-chef')
) as w(word)
cross join (values ('en'), ('fr')) as l(locale)
on conflict do nothing;

-- The generator draws from the round's own set. The fallbacks stay: an empty
-- locale falls back to any locale in the same theme, and an empty theme to a
-- random string, because a member with no name at all cannot be seated.
-- Dropped rather than replaced: the original declared a default for p_locale
-- and Postgres will not let CREATE OR REPLACE take one away. Callers are
-- plpgsql, which resolves the name at run time, so nothing breaks.
drop function if exists assign_secret_name(uuid, text);

create or replace function assign_secret_name(p_round_id uuid, p_locale text default 'en')
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prefix text := 'Chef';
  v_theme text;
  v_word text;
  v_name text;
  v_attempt int := 0;
begin
  select name_theme into v_theme from rounds where id = p_round_id;
  v_theme := coalesce(v_theme, 'FOOD');

  loop
    v_attempt := v_attempt + 1;

    select word into v_word from secret_name_words
    where theme = v_theme and locale = p_locale order by random() limit 1;

    if v_word is null then
      select word into v_word from secret_name_words
      where theme = v_theme order by random() limit 1;
    end if;

    if v_word is null then
      v_word := substr(md5(random()::text), 1, 6);
    end if;

    v_name := v_prefix || ' ' || v_word;

    exit when v_attempt > 50 or not exists (
      select 1 from round_members where round_id = p_round_id and secret_name = v_name
    );
  end loop;

  if exists (select 1 from round_members where round_id = p_round_id and secret_name = v_name) then
    v_name := v_name || ' ' || substr(md5(random()::text), 1, 3);
  end if;

  return v_name;
end;
$$;

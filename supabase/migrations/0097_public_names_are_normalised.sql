-- A public name is stored lowercase with '-' for spaces, and may not pass for
-- the app, its staff, or be an insult. Same rules as src/lib/displayName.ts;
-- this copy is the one that counts. Existing profiles are left as they are —
-- only new sign-ups are held to it.

create or replace function normalize_display_name(p_name text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    regexp_replace(lower(btrim(coalesce(p_name, ''))), '\s+', '-', 'g'),
    '-{2,}', '-', 'g')
$$;

-- null when the name is fine, otherwise 'invalid' | 'reserved' | 'offensive'.
create or replace function display_name_problem(p_name text)
returns text
language plpgsql
immutable
as $$
declare
  v_name text := regexp_replace(normalize_display_name(p_name), '^-+|-+$', '', 'g');
  v_folded text := translate(v_name, '013457@$', 'oieastas');
  v_squashed text := regexp_replace(v_folded, '[-_.]', '', 'g');
  v_words text[] := regexp_split_to_array(v_folded, '[-_.]');
  v_part text;
begin
  if char_length(v_name) < 2 or char_length(v_name) > 60
     or v_name !~ '^[a-z0-9_.-]+$' then
    return 'invalid';
  end if;

  if v_squashed = any (array['admin','administrator','administrateur','amministratore','root','mod',
       'moderator','moderateur','moderatore','support','staff','team','equipe','squadra','system',
       'systeme','sistema','null','undefined','test','tester','testing','anonymous','anonyme',
       'anonimo','official','officiel','ufficiale','owner','help','aide','info'])
     or v_squashed like '%covertcook%' or v_squashed like '%covertcuisine%'
     or v_words && array['official','officiel','ufficiale','staff','admin','moderator','support'] then
    return 'reserved';
  end if;

  foreach v_part in array array['rapist','rapiste','hitler','nigger','nigga','faggot',
      'pedophile','pedofil','paedo','terrorist','terroriste','terrorista','jihad','killall',
      'violeur','stupratore','puttana','salope','connard','encule','bitch','whore','cunt',
      'fuck','shit','cazzo','merde','sex']
  loop
    if v_squashed like '%' || v_part || '%' then
      return 'offensive';
    end if;
  end loop;

  if v_words && array['rape','raper','sex','porn','pedo','negro','nazi','nazis','viol','violer','kill','slut','anal','nsfw'] then
    return 'offensive';
  end if;

  return null;
end;
$$;

create or replace function display_name_available(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := regexp_replace(normalize_display_name(p_name), '-+$', '');
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if display_name_problem(v_name) is not null then
    return false;
  end if;

  return not exists (
    select 1 from profiles
    where anonymised_at is null
      and id <> v_uid
      and lower(display_name) = v_name
  );
end;
$$;

grant execute on function display_name_available(text) to authenticated;

create or replace function complete_signup(
  p_display_name text,
  p_locale text,
  p_has_no_restrictions boolean,
  p_dietary_entries jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_entry jsonb;
  v_count int;
  v_name text := regexp_replace(normalize_display_name(p_display_name), '-+$', '');
  v_problem text := display_name_problem(v_name);
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if exists (select 1 from profiles where id = v_uid) then
    raise exception 'profile already exists';
  end if;

  if v_problem is not null then
    raise exception 'display_name_%', v_problem;
  end if;

  if exists (
    select 1 from profiles
    where anonymised_at is null and lower(display_name) = v_name
  ) then
    raise exception 'display_name_taken';
  end if;

  v_count := coalesce(jsonb_array_length(p_dietary_entries), 0);
  if not p_has_no_restrictions and v_count = 0 then
    raise exception 'declare at least one dietary entry or set has_no_restrictions';
  end if;

  begin
    insert into profiles (id, display_name, locale, has_no_restrictions)
    values (v_uid, v_name, coalesce(p_locale, 'fr'), p_has_no_restrictions);
  exception when unique_violation then
    if exists (
      select 1 from profiles
      where anonymised_at is null and lower(display_name) = v_name
    ) then
      raise exception 'display_name_taken';
    end if;
    raise;
  end;

  if not p_has_no_restrictions then
    for v_entry in select * from jsonb_array_elements(p_dietary_entries)
    loop
      insert into dietary_entries (profile_id, kind, label, note)
      values (v_uid, (v_entry->>'kind')::dietary_kind, v_entry->>'label', v_entry->>'note');
    end loop;
  end if;

  insert into audit_log (actor_id, action, payload)
  values (v_uid, 'SIGNUP_COMPLETED', jsonb_build_object('has_no_restrictions', p_has_no_restrictions));
end;
$$;

grant execute on function complete_signup(text, text, boolean, jsonb) to authenticated;

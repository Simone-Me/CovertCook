-- The public name becomes an identity, not a label.
--
-- `display_name` has been free text since 0001: two people could both be
-- "Simone", and nothing anywhere noticed. That is fine for a label and wrong
-- for a handle — and a handle is what it has become, because it is the name
-- the reveal prints, the name a host reads when approving a request to join,
-- and the name an invitation is addressed to. Two identical ones make every
-- one of those moments ambiguous.
--
-- Three things here, in the order they have to happen: settle the duplicates
-- that already exist, enforce uniqueness, and give the client a way to ask
-- before submitting rather than after.
--
-- WHY THE INDEX IS PARTIAL. Erasure (see DISTRIBUTION.md §10) anonymises a
-- profile rather than deleting it, and every anonymised profile is meant to
-- end up wearing the same neutral token. A total unique index would make the
-- second person to leave impossible to anonymise. Excluding anonymised rows
-- keeps both rules: live names are unique, retired ones are interchangeable.
--
-- WHY lower() AND NOT citext. Comparison is case-insensitive — "Simone" and
-- "simone" are the same person to everybody but Postgres — but the name is
-- STORED exactly as typed, because how you capitalise your own name is
-- yours. An expression index gives that; citext would fold the stored value
-- too and needs an extension for what one index does.
--
-- What this deliberately does NOT do: normalise unicode confusables. "Ѕimone"
-- with a Cyrillic Ѕ is a different string and will be accepted. Real defence
-- there is a skeleton/homograph table, which is a project of its own and only
-- worth it if impersonation ever actually happens.

-- ---------------------------------------------------------------------------
-- 1. Settle existing duplicates before the index refuses to build.
--
-- Oldest account keeps the name — it is the one whose friends already know
-- them by it. Everyone else gains a short suffix, and is told at their next
-- sign-in only by seeing it. Renaming somebody is not nothing, which is why
-- the loop raises a notice for each one: the deploy log is the record of who
-- was moved and to what.
-- ---------------------------------------------------------------------------

do $$
declare
  v_row record;
  v_candidate text;
begin
  loop
    select p.id, p.display_name into v_row
    from profiles p
    where p.anonymised_at is null
      and exists (
        select 1 from profiles q
        where q.id <> p.id
          and q.anonymised_at is null
          and lower(q.display_name) = lower(p.display_name)
          and (q.created_at, q.id) < (p.created_at, p.id)
      )
    limit 1;

    exit when not found;

    loop
      v_candidate := left(v_row.display_name, 55) || ' ' || substr(md5(random()::text), 1, 4);
      exit when not exists (
        select 1 from profiles
        where anonymised_at is null and lower(display_name) = lower(v_candidate)
      );
    end loop;

    update profiles set display_name = v_candidate where id = v_row.id;
    raise notice 'display_name collision: % (%) renamed to %', v_row.display_name, v_row.id, v_candidate;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Enforce it.
-- ---------------------------------------------------------------------------

create unique index if not exists profiles_display_name_unique
  on profiles (lower(display_name))
  where anonymised_at is null;

comment on index profiles_display_name_unique is
  'One live account per name, compared case-insensitively. Anonymised profiles are excluded so they can all share the same retired token (0046).';

-- ---------------------------------------------------------------------------
-- 3. Let the form ask first.
--
-- Authenticated only, and deliberately so: an open availability endpoint is
-- an account-enumeration oracle for anyone who can guess names. Behind sign-in
-- it tells a person who already has an account something they would learn by
-- submitting the form anyway.
--
-- Excluding your own row is not needed today — nobody can change their name
-- yet — but it is what makes this function correct the day the Pro rename
-- lands, and leaving it out would be a bug waiting on a feature.
-- ---------------------------------------------------------------------------

create or replace function display_name_available(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 60 then
    return false;
  end if;

  return not exists (
    select 1 from profiles
    where anonymised_at is null
      and id <> v_uid
      and lower(display_name) = lower(v_name)
  );
end;
$$;

grant execute on function display_name_available(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. complete_signup says why, instead of forwarding a constraint name.
--
-- The pre-check is for the message; the index is for the truth. Two people
-- submitting the same name in the same second both pass the check and one
-- loses at the insert — so that path is caught too and given the same words,
-- rather than reaching the interface as "profiles_display_name_unique".
-- ---------------------------------------------------------------------------

create or replace function complete_signup(
  p_display_name text,
  p_locale text,
  p_has_no_restrictions boolean,
  p_dietary_entries jsonb -- [{kind, label, note}], ignored if p_has_no_restrictions
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
  v_name text := btrim(coalesce(p_display_name, ''));
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if exists (select 1 from profiles where id = v_uid) then
    raise exception 'profile already exists';
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception 'display name must be between 1 and 60 characters';
  end if;

  if exists (
    select 1 from profiles
    where anonymised_at is null and lower(display_name) = lower(v_name)
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
    -- Could be the name or the primary key; only one of them is worth
    -- explaining, and the other should keep its own error.
    if exists (
      select 1 from profiles
      where anonymised_at is null and lower(display_name) = lower(v_name)
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

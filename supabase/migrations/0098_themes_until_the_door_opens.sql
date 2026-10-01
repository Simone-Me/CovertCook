-- The two looks of a dinner — the pseudonym list and the cloth — stay the
-- Executive Chef's to change for as long as the dinner is a draft.
--
-- Until now both were fixed at creation, so a host who picked the wrong cloth
-- had to delete the dinner and start again. In DRAFT nobody else has joined,
-- so nothing is lost by changing them: the only secret name that exists is the
-- host's own, and it is dealt again from the new list.
--
-- Same entitlement rule as create_round (theme_available), so this is not a
-- way round a locked theme.

create or replace function set_round_themes(
  p_round_id uuid,
  p_name_theme text,
  p_table_theme text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_locale text;
  v_secret_name text;
begin
  select * into v_round from rounds where id = p_round_id for update;
  if not found then raise exception 'round not found'; end if;

  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the Executive Chef can change the themes';
  end if;

  if v_round.status <> 'DRAFT' then
    raise exception 'THEMES_LOCKED';
  end if;

  if not theme_available('NAME_THEME', p_name_theme, v_uid) then
    raise exception 'THEME_LOCKED';
  end if;
  if not theme_available('TABLE_THEME', p_table_theme, v_uid) then
    raise exception 'THEME_LOCKED';
  end if;

  update rounds
  set name_theme = p_name_theme, table_theme = p_table_theme
  where id = p_round_id;

  if p_name_theme is distinct from v_round.name_theme then
    select locale into v_locale from profiles where id = v_uid;
    -- Free the old name first so the new draw cannot collide with it.
    update round_members set secret_name = '' where round_id = p_round_id and profile_id = v_uid;
    select assign_secret_name(p_round_id, coalesce(v_locale, 'fr')) into v_secret_name;
    update round_members set secret_name = v_secret_name
    where round_id = p_round_id and profile_id = v_uid;
  end if;
end;
$$;

grant execute on function set_round_themes(uuid, text, text) to authenticated;

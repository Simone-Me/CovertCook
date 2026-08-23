-- create_round learns about the pseudonym theme.
--
-- The theme has to be set before the host's own secret name is drawn, which
-- happens inside this function — so it cannot be an afterwards-update, or the
-- host would end up with a name from the wrong set while everybody who joined
-- later got the right one.
--
-- Adding a parameter means a new signature, so the old one is dropped: PostgREST
-- matches RPCs by argument names, and leaving both would make the call
-- ambiguous rather than compatible.

drop function if exists create_round(
  text, round_access, round_anonymity, slot_mode, int,
  timestamptz, text, text, boolean, boolean, voting_mode
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
  p_name_theme text default 'FOOD'
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

  if p_name_theme not in ('FOOD', 'BRIGADE') then
    raise exception 'unknown pseudonym theme';
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
    voting_mode, name_theme, join_code, accent_color, accent_emoji
  ) values (
    p_name, v_uid, p_access, p_anonymity, p_slot_mode, p_max_players,
    p_dinner_at, coalesce(p_timezone, 'Europe/Paris'), p_location,
    p_allow_mutual_pairs, p_requires_approval, p_voting_mode, p_name_theme,
    v_code, v_accent.color, v_accent.emoji
  )
  returning id into v_round_id;

  -- After the insert, so the theme is already on the row this reads.
  select assign_secret_name(v_round_id, coalesce(v_locale, 'fr')) into v_secret_name;

  insert into round_members (round_id, profile_id, secret_name, role, approved)
  values (v_round_id, v_uid, v_secret_name, 'HOST', true);

  insert into audit_log (round_id, actor_id, action, payload)
  values (v_round_id, v_uid, 'ROUND_CREATED', jsonb_build_object('name', p_name, 'name_theme', p_name_theme));

  return v_round_id;
end;
$$;

grant execute on function create_round(
  text, round_access, round_anonymity, slot_mode, int,
  timestamptz, text, text, boolean, boolean, voting_mode, text
) to authenticated;

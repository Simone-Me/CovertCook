-- The roster was handing out the decoder ring.
--
-- Found while making the exclusion picker show real names, which was the right
-- instinct for a bigger reason than the one it was raised for.
--
-- `list_round_members` returned `profile_id` for every member alongside their
-- `secret_name`, and `profiles_select_co_members` (0002) lets any active member
-- of a round read any co-member's profile. Two calls and a join, from the
-- ordinary client API, and an ANONYMOUS round in progress gives up its entire
-- pseudonym → real name mapping:
--
--     select m.secret_name, p.display_name
--     from list_round_members(:round) m join profiles p on p.id = m.profile_id;
--
-- That is the whole game. Every brief, every message, the entire reveal at the
-- end, all of it rests on nobody being able to do that.
--
-- WHY THE COLUMN WAS THERE. The client needs to know which row is *itself* —
-- to mark "you" in the roster and to find its own seat. It never needed
-- anybody else's: approving, removing and pairing all take a member id.
--
-- So the column stays and its value is masked. You always get your own; you
-- get everybody's when the round is OPEN, when the host is entitled to
-- identities (SPY), or once the reveal has happened and there is nothing left
-- to protect.

drop function if exists list_round_members(uuid);

create or replace function list_round_members(p_round_id uuid)
returns table (
  id uuid,
  round_id uuid,
  profile_id uuid,
  secret_name text,
  role member_role,
  status member_status,
  approved boolean,
  removal_requested_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_revealed boolean;
  v_identities boolean;
  v_is_host boolean;
begin
  if not exists (
    select 1 from round_members m
    where m.round_id = p_round_id
      and m.profile_id = v_uid
      and m.status = 'ACTIVE'
  ) then
    raise exception 'not a member of this round' using errcode = '42501';
  end if;

  select * into v_round from rounds r where r.id = p_round_id;
  v_is_host := is_round_host(p_round_id, v_uid);

  -- Pseudonyms appear once the door has shut (0032): before that, arrival
  -- order would be readable as identity.
  v_revealed := v_round.status is distinct from 'DRAFT' and v_round.status is distinct from 'OPEN';

  -- Real identities, which is a different question and a stricter one.
  v_identities :=
    v_round.anonymity = 'OPEN'
    or (v_round.anonymity = 'SPY' and v_is_host)
    or v_round.status in ('RESULTS', 'ARCHIVED', 'CANCELLED');

  return query
  select
    m.id,
    m.round_id,
    -- Your own, always. Anybody else's only when knowing it reveals nothing
    -- that is not already revealed.
    case when m.profile_id = v_uid or v_identities then m.profile_id end,
    case when v_revealed or m.profile_id = v_uid then m.secret_name end,
    m.role,
    m.status,
    m.approved,
    case
      when m.profile_id = v_uid or v_is_host
      then m.removal_requested_at
    end
  from round_members m
  where m.round_id = p_round_id
  order by
    case when v_revealed or m.profile_id = v_uid then m.secret_name end
      nulls first,
    m.id;
end;
$$;

revoke all on function list_round_members(uuid) from public;
grant execute on function list_round_members(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The host needs people, not pseudonyms.
--
-- Excluding a pair is a statement about two humans — do not make these two
-- cook for each other, they live together. To do that against a list of
-- pseudonyms, a host would first have to learn which pseudonym is which
-- person, which is the exact knowledge the round is keeping from them.
--
-- So this returns real names and **no secret_name at all**, ordered by name
-- rather than by anything the roster is ordered by. A host can pick two people
-- and still cannot say which envelope belongs to either of them.
-- ---------------------------------------------------------------------------

create or replace function list_round_people(p_round_id uuid)
returns table (member_id uuid, display_name text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the host can see who is at this table' using errcode = '42501';
  end if;

  return query
  select m.id, p.display_name
  from round_members m
  join profiles p on p.id = m.profile_id
  where m.round_id = p_round_id
    and m.status = 'ACTIVE'
    and m.approved
  -- By name. Sharing the roster's ordering would rebuild the mapping this
  -- function exists to avoid.
  order by lower(p.display_name), m.id;
end;
$$;

revoke all on function list_round_people(uuid) from public;
grant execute on function list_round_people(uuid) to authenticated;

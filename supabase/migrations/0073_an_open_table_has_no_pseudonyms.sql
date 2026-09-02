-- Two anonymity modes that were never wired up.
--
-- Reported from a real dinner, and both are the same omission seen from
-- different seats.
--
-- SPY was supposed to mean "the Executive Chef sees everyone, the table sees
-- nobody". 0053 does hand the host the profile ids on a SPY round — and then
-- nothing reads them. Every screen prints `secret_name`, so a SPY host got
-- exactly the game an ANONYMOUS host got, with a different label on it.
--
-- OPEN was supposed to mean "everyone knows everyone". It half-works: the
-- brief editor and the finished thread show real names because 0007 and 0064
-- ask for them by hand. Everywhere else — the roster, the fridge, the chain,
-- the moderation queue — still prints pseudonyms, so an OPEN dinner runs with
-- two names per person and the reader has to hold the mapping themselves. On a
-- dinner where nothing is hidden, a pseudonym is not a disguise, it is a
-- second name to learn for no reason. So on OPEN there are no code names at
-- all: `secret_name` is still minted (the chain, the ballot and every message
-- row are keyed to a seat, and re-keying them is a different and much larger
-- change) and simply never shown.
--
-- ONE RULE, ONE FUNCTION, five readers. The thing that kept going wrong is
-- that "may this reader see real names" was being decided separately in every
-- function that returns a name, and most of them never asked it at all.

create or replace function names_are_open(p_round_id uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select r.anonymity = 'OPEN'
            or (r.anonymity = 'SPY' and is_round_host(p_round_id, p_uid))
            -- The reveal. Once the dinner is over the mapping is the point.
            or r.status in ('RESULTS', 'ARCHIVED', 'CANCELLED')
     from rounds r where r.id = p_round_id),
    false);
$$;

comment on function names_are_open(uuid, uuid) is
  'Whether this reader is entitled to real names on this round: OPEN for everybody, SPY for the host, and any round that has finished.';

revoke all on function names_are_open(uuid, uuid) from public;
grant execute on function names_are_open(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. The roster.
--
-- Gains a `display_name` column rather than overloading `secret_name`: the two
-- are different facts and the client decides which to print. Dropped and
-- recreated because the return type changes.
--
-- The visibility of the two columns is deliberately not the same question.
-- `secret_name` stays gated on the door being shut (0032) — on an ANONYMOUS
-- round arrival order is identity. `display_name` is gated on entitlement
-- only: where names are open there is nothing that arrival order could give
-- away, because everybody is already themselves.
-- ---------------------------------------------------------------------------

drop function if exists list_round_members(uuid);

create or replace function list_round_members(p_round_id uuid)
returns table (
  id uuid,
  round_id uuid,
  profile_id uuid,
  secret_name text,
  display_name text,
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

  v_revealed := v_round.status is distinct from 'DRAFT' and v_round.status is distinct from 'OPEN';
  v_identities := names_are_open(p_round_id, v_uid);

  return query
  select
    m.id,
    m.round_id,
    case when m.profile_id = v_uid or v_identities then m.profile_id end,
    case when v_revealed or m.profile_id = v_uid then m.secret_name end,
    case when v_identities then pr.display_name end,
    m.role,
    m.status,
    m.approved,
    case
      when m.profile_id = v_uid or v_is_host
      then m.removal_requested_at
    end
  from round_members m
  join profiles pr on pr.id = m.profile_id
  where m.round_id = p_round_id
  -- Ordered by whichever name is actually printed, so the list reads
  -- alphabetically instead of arbitrarily — and never by anything that
  -- survives the mask, which would leak the order it is hiding.
  order by
    case when v_identities then lower(pr.display_name) end nulls last,
    case when v_revealed or m.profile_id = v_uid then m.secret_name end nulls first,
    m.id;
end;
$$;

revoke all on function list_round_members(uuid) from public;
grant execute on function list_round_members(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The fridge.
--
-- One name column, because the bubble has room for one name. Where names are
-- open it is the real one — including for the SPY host, who is the only person
-- at that table reading the board undisguised.
-- ---------------------------------------------------------------------------

create or replace function get_board(p_round_id uuid)
returns table (
  message_id uuid,
  body text,
  author_name text,
  is_mine boolean,
  reported boolean,
  author_member_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_member_id uuid;
  v_locale text := my_locale();
  v_open boolean;
begin
  if not (is_round_host(p_round_id, v_uid) or is_round_member(p_round_id, v_uid)) then
    raise exception 'not a member of this round';
  end if;

  select id into v_member_id from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE';

  v_open := names_are_open(p_round_id, v_uid);

  return query
  select rm.id, phrase_in(rm.template_id, v_locale),
         case when v_open then ap.display_name else am.secret_name end,
         rm.author_member_id = v_member_id, rm.reported, am.id
  from round_messages rm
  join round_members am on am.id = rm.author_member_id
  join profiles ap on ap.id = am.profile_id
  where rm.round_id = p_round_id
    and rm.created_at > now() - interval '24 hours'
    and (not rm.reported or rm.author_member_id = v_member_id)
    and not exists (
      select 1 from blocked_users b
      where b.profile_id = v_uid and b.blocked_profile_id = ap.id
    )
  order by rm.created_at;
end;
$$;

grant execute on function get_board(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The thread between a sender and their cook.
--
-- The real name was handed over only at RESULTS/ARCHIVED, which is the reveal
-- and not the entitlement. On an OPEN round the two people writing to each
-- other already know exactly who they are.
-- ---------------------------------------------------------------------------

create or replace function get_thread(p_pairing_id uuid)
returns table (
  message_id uuid,
  direction message_direction,
  category message_category,
  body text,
  slot_value text,
  created_day date,
  read_at timestamptz,
  reported boolean,
  is_mine boolean,
  other_party_secret_name text,
  other_party_display_name text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_pairing pairings;
  v_round rounds;
  v_my_member_id uuid;
  v_other_secret text;
  v_other_display text;
  v_locale text := my_locale();
begin
  select * into v_pairing from pairings where id = p_pairing_id;
  if not found then raise exception 'pairing not found'; end if;

  select * into v_round from rounds where id = v_pairing.round_id;

  select id into v_my_member_id from round_members
  where round_id = v_pairing.round_id and profile_id = v_uid and status = 'ACTIVE' and approved;
  if not found then raise exception 'not an active member of this round'; end if;

  if v_my_member_id <> v_pairing.sender_id and v_my_member_id <> v_pairing.cook_id then
    raise exception 'not a party to this pairing';
  end if;

  -- The pseudonym at the reveal, as before; the real name whenever this
  -- reader is entitled to it, which includes the whole of an OPEN dinner.
  if v_round.status in ('RESULTS', 'ARCHIVED') then
    select rm.secret_name into v_other_secret
    from round_members rm
    where rm.id = case when v_my_member_id = v_pairing.sender_id then v_pairing.cook_id else v_pairing.sender_id end;
  end if;

  if names_are_open(v_pairing.round_id, v_uid) then
    select pr.display_name into v_other_display
    from round_members rm join profiles pr on pr.id = rm.profile_id
    where rm.id = case when v_my_member_id = v_pairing.sender_id then v_pairing.cook_id else v_pairing.sender_id end;
  end if;

  update messages m set read_at = now()
  where m.pairing_id = p_pairing_id and m.read_at is null
    and ((v_my_member_id = v_pairing.sender_id and m.direction = 'COOK_TO_SENDER')
      or (v_my_member_id = v_pairing.cook_id and m.direction = 'SENDER_TO_COOK'));

  return query
    select
      m.id, m.direction, t.category, phrase_in(m.template_id, v_locale),
      m.slot_value, m.created_day, m.read_at, m.reported,
      (v_my_member_id = v_pairing.sender_id and m.direction = 'SENDER_TO_COOK')
        or (v_my_member_id = v_pairing.cook_id and m.direction = 'COOK_TO_SENDER'),
      v_other_secret, v_other_display
    from messages m
    join message_templates t on t.id = m.template_id
    where m.pairing_id = p_pairing_id
    order by m.created_at;
end;
$$;

grant execute on function get_thread(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Who I am writing for.
--
-- Was `anonymity = 'OPEN'` spelled out inline, which is the rule for four of
-- the five cases and wrong for the fifth: a SPY host writing their own recipe
-- is entitled to know whose plate it lands on.
-- ---------------------------------------------------------------------------

create or replace function get_my_assignment(p_round_id uuid)
returns table (
  pairing_id uuid,
  cook_secret_name text,
  cook_display_name text,
  course course,
  slot_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_my_member_id uuid;
  v_open boolean;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  select id into v_my_member_id from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE' and approved;
  if not found then raise exception 'not an active member of this round'; end if;

  if v_round.status not in ('ASSIGNED', 'BRIEFS_CLOSED', 'DINNER', 'VOTING', 'RESULTS', 'ARCHIVED') then
    raise exception 'no assignment yet';
  end if;

  v_open := names_are_open(p_round_id, v_uid);

  return query
    select
      p.id,
      cm.secret_name,
      case when v_open then cpr.display_name else null end,
      s.course,
      p.slot_id
    from pairings p
    join round_members cm on cm.id = p.cook_id
    join profiles cpr on cpr.id = cm.profile_id
    join slots s on s.id = p.slot_id
    where p.round_id = p_round_id
      and p.assignment_version = v_round.assignment_version
      and p.sender_id = v_my_member_id;
end;
$$;

grant execute on function get_my_assignment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The moderation queue.
--
-- Host-only already, so this adds no reader — it adds the name the host is
-- entitled to. Deciding what to do about a reported phrase while looking at
-- "Chef Persil" is a decision taken about a pseudonym; on a SPY or OPEN round
-- the host may know, and should, because the next step is talking to a person.
-- ---------------------------------------------------------------------------

drop function if exists get_reported_messages(uuid);

create or replace function get_reported_messages(p_round_id uuid)
returns table (
  message_id uuid, pairing_id uuid, direction message_direction,
  category message_category, body text, slot_value text, created_day date,
  author_member_id uuid,
  author_secret_name text,
  author_display_name text,
  already_warned boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_locale text := my_locale();
  v_open boolean;
begin
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the host can view reported messages';
  end if;

  v_open := names_are_open(p_round_id, v_uid);

  return query
    select
      m.id, m.pairing_id, m.direction, t.category,
      phrase_in(m.template_id, v_locale),
      m.slot_value, m.created_day,
      am.id,
      am.secret_name,
      case when v_open then apr.display_name end,
      exists (select 1 from member_warnings w where w.message_id = m.id)
    from messages m
    join pairings p on p.id = m.pairing_id
    join message_templates t on t.id = m.template_id
    join round_members am
      on am.id = case when m.direction = 'SENDER_TO_COOK' then p.sender_id else p.cook_id end
    join profiles apr on apr.id = am.profile_id
    where p.round_id = p_round_id and m.reported
    order by m.created_at;
end;
$$;

grant execute on function get_reported_messages(uuid) to authenticated;

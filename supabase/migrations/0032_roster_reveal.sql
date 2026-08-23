-- The roster stays covered until sign-ups close.
--
-- Names appearing one by one as people join turns arrival order into an
-- identity leak: whoever shows up right after you passed the code to Marco
-- *is* Marco. No bug required — the timing alone gives it away. So the
-- roster is revealed to everyone at the same instant, when the Executive
-- Chef closes the door (OPEN -> LOCKED), and until then it is blanks.
--
-- This has to be a server rule. `.redact` in table.css is a drawing, and the
-- browser is assumed hostile (README) — a covered name that was still sent
-- over the wire is readable in the network tab. So secret_name is withheld
-- here, and column-level SELECT on it is revoked from the client below.
--
-- Two exceptions, both deliberate:
--   * you always see yourself — without a mark you can't tell which stranger
--     you are (see .chef-you);
--   * the host runs the door with real_name from pending_member_identity
--     (0015), which is untouched: approving a pseudonym is approving nobody.
--
-- Ordering is by secret_name, not joined_at. Ordering by arrival would hand
-- back the very leak this migration closes the moment the list is revealed.

create or replace function list_round_members(p_round_id uuid)
returns table (
  id uuid,
  round_id uuid,
  profile_id uuid,
  secret_name text,
  role member_role,
  status member_status,
  approved boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status round_status;
  v_revealed boolean;
begin
  -- Same gate as the round_members_select_same_round policy (0002): you can
  -- read a roster only from inside the round.
  if not exists (
    select 1 from round_members m
    where m.round_id = p_round_id
      and m.profile_id = v_uid
      and m.status = 'ACTIVE'
  ) then
    raise exception 'not a member of this round' using errcode = '42501';
  end if;

  select r.status into v_status from rounds r where r.id = p_round_id;

  -- DRAFT and OPEN are the two phases where the door is still open. Every
  -- later phase — and CANCELLED, where there is nothing left to protect —
  -- shows the full roster.
  v_revealed := v_status is distinct from 'DRAFT' and v_status is distinct from 'OPEN';

  return query
  select
    m.id,
    m.round_id,
    m.profile_id,
    case when v_revealed or m.profile_id = v_uid then m.secret_name end,
    m.role,
    m.status,
    m.approved
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

-- Enforcement. RLS is row-level and cannot mask one column for one phase, so
-- the client loses SELECT on secret_name entirely and has to come through the
-- function above. SECURITY DEFINER functions run as the owner and are
-- unaffected; no view reads this column.
--
-- A column-level REVOKE is a no-op while a table-level grant is in place
-- (0002 line 259 granted the whole table), so the table grant goes first and
-- the columns are handed back one by one — every column except secret_name.
revoke select on round_members from authenticated;

grant select (
  id, round_id, profile_id, role, status, approved,
  joined_at, left_at, removed_at
) on round_members to authenticated;

-- An invitation says who sent it, and whose dinner it is.
--
-- It used to arrive as a dinner name and a date. A dinner name is something a
-- host types for their friends ("Jeudi chez nous"), which tells somebody who
-- is not yet one of them nothing about whether to say yes. The two people who
-- decide that are the one who invited you and the one who runs the table —
-- usually the same person, not always.
--
-- Display names only: they are public identities (0046), the name people
-- already see on every dinner they share. Dropped and recreated because the
-- return type gains two columns.

drop function if exists get_my_invitations();

create or replace function get_my_invitations()
returns table (
  invitation_id uuid,
  round_id uuid,
  round_name text,
  accent_emoji text,
  invited_day date,
  invited_by_name text,
  host_name text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  return query
  select i.id, r.id, r.name, r.accent_emoji, i.created_at::date,
         inviter.display_name, host.display_name
  from round_invitations i
  join rounds r on r.id = i.round_id
  left join profiles inviter on inviter.id = i.invited_by
  left join profiles host on host.id = r.host_id
  where i.profile_id = v_uid
    and i.responded_at is null
    and r.status in ('DRAFT', 'OPEN')
  order by i.created_at desc;
end;
$$;

grant execute on function get_my_invitations() to authenticated;

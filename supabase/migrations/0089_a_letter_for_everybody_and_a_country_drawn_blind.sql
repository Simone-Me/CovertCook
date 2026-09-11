-- ---------------------------------------------------------------------------
-- EVERY LETTER IS FREE, AND A COUNTRY CAN BE DRAWN BLIND.
--
-- Two small changes to the fil rouge, both of them about what a host is asked
-- to decide and what they are allowed not to know.
--
-- 1. THE SIX HARD LETTERS COME OUT FROM BEHIND CRÈME. 0083 put K, Q, W, X, Y
--    and Z there on the argument that they are not hard but unbuildable, and
--    that the ballot's "how well did it follow the thread" line turns an
--    impossible letter into a scoring penalty the app handed out. The
--    observation stands and the answer was wrong: a paywall is not a warning,
--    and reading "Crème" beside the letter Z tells somebody it is better,
--    which is the opposite of true. So all twenty-six are free and the picker
--    says, in words, which six are a bad evening. A host who picks Z anyway
--    has been told.
--
-- 2. A COUNTRY CAN BE DRAWN WITHOUT BEING SEEN. Choosing the world from a list
--    is choosing a country you already know how to cook; the compass is for
--    the table that wants the evening to surprise its own host. The draw
--    happens HERE, not in the browser, and the value is withheld from
--    everybody — the host included — until the dinner is dealt and the
--    recipes are being written. A seal a client could read is a seal that
--    somebody will read.
--
--    NO NEW ARGUMENT ANYWHERE. '?' is not a code: every code in the catalogue
--    is a letter, an ISO pair or an upper-case word, so a question mark can
--    mean "draw one" without a new parameter, and `create_round` — which calls
--    this function and would otherwise have to grow a fifteenth argument and be
--    dropped and recreated — passes it through untouched.
-- ---------------------------------------------------------------------------

update fil_rouge_catalogue set premium = false where category = 'LETTER';

alter table rounds add column if not exists fil_rouge_sealed boolean not null default false;

comment on column rounds.fil_rouge_sealed is
  'The thread was drawn by the compass rather than chosen, and is withheld from everybody — the host included — until the dinner is dealt (0089).';

-- ---------------------------------------------------------------------------
-- Setting it, now with a sealed draw.
--
-- Same signature, so nothing that calls it changes. The draw reads
-- list_fil_rouge(), which is the same shelf the picker was showing, so a
-- sealed country is never one the host could not have chosen by hand.
-- ---------------------------------------------------------------------------

create or replace function set_fil_rouge(
  p_round_id uuid,
  p_category text default null,
  p_code text default null,
  p_scope text default 'SHARED'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_pool text[];
  v_code text := p_code;
  v_sealed boolean := false;
begin
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the host can set the fil rouge';
  end if;

  select * into v_round from rounds where id = p_round_id for update;
  if not found then raise exception 'round not found'; end if;

  if v_round.status not in ('DRAFT', 'OPEN', 'LOCKED') then
    raise exception 'FIL_ROUGE_FROZEN';
  end if;

  if exists (
    select 1 from pairings p
    where p.round_id = p_round_id and p.assignment_version = v_round.assignment_version
  ) then
    raise exception 'FIL_ROUGE_FROZEN';
  end if;

  -- Clearing it. Allowed for as long as setting it is.
  if p_category is null then
    update rounds set fil_rouge_category = null, fil_rouge_code = null,
                      fil_rouge_scope = null, fil_rouge_pool = null,
                      fil_rouge_sealed = false
    where id = p_round_id;
    insert into audit_log (round_id, actor_id, action, payload)
    values (p_round_id, v_uid, 'FIL_ROUGE_SET', jsonb_build_object('cleared', true));
    return;
  end if;

  if p_scope not in ('SHARED', 'PER_COOK') then
    raise exception 'FIL_ROUGE_SCOPE';
  end if;

  if p_scope = 'SHARED' then
    if v_code is null then raise exception 'FIL_ROUGE_CODE_REQUIRED'; end if;

    -- The compass. Drawn from what this account may actually choose, so a
    -- sealed thread is never a value the host was not entitled to.
    if v_code = '?' then
      select l.code into v_code
      from list_fil_rouge() l
      where l.category = p_category and l.offered
      order by random()
      limit 1;
      if v_code is null then raise exception 'FIL_ROUGE_LOCKED'; end if;
      v_sealed := true;
    end if;

    if not fil_rouge_available(p_category, v_code, v_uid) then
      raise exception 'FIL_ROUGE_LOCKED';
    end if;

    update rounds set fil_rouge_category = p_category, fil_rouge_code = v_code,
                      fil_rouge_scope = 'SHARED', fil_rouge_pool = null,
                      fil_rouge_sealed = v_sealed
    where id = p_round_id;
  else
    -- The shelf as it stands right now, kept: the roulette runs later and must
    -- deal from what the host was shown (0085).
    select coalesce(array_agg(l.code), '{}') into v_pool
    from list_fil_rouge() l
    where l.category = p_category and l.offered;

    if coalesce(array_length(v_pool, 1), 0) = 0 then
      raise exception 'FIL_ROUGE_LOCKED';
    end if;

    update rounds set fil_rouge_category = p_category, fil_rouge_code = null,
                      fil_rouge_scope = 'PER_COOK', fil_rouge_pool = v_pool,
                      fil_rouge_sealed = false
    where id = p_round_id;
  end if;

  -- WHAT WAS DRAWN IS NOT WRITTEN DOWN HERE. The audit log is for the host's
  -- own actions and this one is deliberately not theirs to read yet; logging
  -- the code would put the sealed country in a row the account that sealed it
  -- could go and look at.
  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'FIL_ROUGE_SET', jsonb_build_object(
    'category', p_category,
    'code', case when v_sealed then null else v_code end,
    'sealed', v_sealed,
    'scope', p_scope,
    'pool_size', coalesce(array_length(v_pool, 1), 0)));
end;
$$;

grant execute on function set_fil_rouge(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Reading it, with the seal held until the recipes are being written.
--
-- Dropped and recreated: the row type gains a column, which `create or
-- replace` refuses (see 0057, 0086, 0088).
--
-- WHEN THE SEAL BREAKS: the moment the dinner is dealt. Before that the thread
-- is nobody's business, including the host's; from ASSIGNED on, every sender
-- is writing a recipe against it and it is printed on every screen that has
-- always printed it. There is no separate "reveal" action to forget to press.
-- ---------------------------------------------------------------------------

drop function if exists get_fil_rouge(uuid);

create function get_fil_rouge(p_round_id uuid)
returns table (
  category text,
  scope text,
  code text,
  my_code text,
  my_cook_code text,
  sealed boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_member_id uuid;
  v_hidden boolean;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  if not (is_round_host(p_round_id, v_uid) or is_round_member(p_round_id, v_uid)) then
    raise exception 'not a member of this round';
  end if;

  select id into v_member_id from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE';

  v_hidden := v_round.fil_rouge_sealed
              and v_round.status in ('DRAFT', 'OPEN', 'LOCKED');

  return query
  select
    v_round.fil_rouge_category,
    v_round.fil_rouge_scope,
    case when v_hidden then null else v_round.fil_rouge_code end,
    (select p.fil_rouge_code from pairings p
      where p.round_id = p_round_id
        and p.assignment_version = v_round.assignment_version
        and p.cook_id = v_member_id),
    (select p.fil_rouge_code from pairings p
      where p.round_id = p_round_id
        and p.assignment_version = v_round.assignment_version
        and p.sender_id = v_member_id),
    v_hidden;
end;
$$;

grant execute on function get_fil_rouge(uuid) to authenticated;

comment on function get_fil_rouge(uuid) is
  'The dinner''s thread, and mine, and my cook''s — with a sealed one withheld until the dinner is dealt (0089). Reads pairings, which have no player-facing SELECT policy, which is why it is a function and not a view.';

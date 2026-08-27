-- Shared costs: a budget everyone agrees to, what each of them actually spent,
-- and one even settlement at the end.
--
-- THE SOCIAL PROBLEM THIS SOLVES, because it is not really an arithmetic one.
-- Four people cook four dishes and four people go shopping separately. One buys
-- saffron and a rib of beef, one buys pasta and two eggs, and at the end of the
-- evening nobody says anything because raising it would be worse than eating
-- the difference. The money is not the point; not having to be the person who
-- brings it up is.
--
-- SO THE BUDGET COMES FIRST AND IS AGREED BEFORE ANYBODY SHOPS. `budget_per_head`
-- is set when the dinner is created, before the roulette, before the recipes —
-- which means it is a rule of the evening rather than a judgement passed on
-- somebody's receipt afterwards. A recipe written for a €10 dinner is a
-- different recipe, and that is the actual mechanism: it shapes what people
-- write, not just what they pay.
--
-- WHAT IS DELIBERATELY NOT SHOWN WHILE THE DINNER IS RUNNING: who spent what.
-- The case for a live per-person list is that it would let people steer toward
-- each other. The case against is that it is a leaderboard about money between
-- friends, it invites exactly the comparison the feature exists to avoid, and
-- somebody who has spent more than everyone else finds out in front of everyone
-- else. `costs_so_far` gives the steering signal without the comparison: your
-- own number, the table's average, and the budget. "Everyone is around twelve
-- and I am at thirty-five" is the useful half; "Marta is at thirty-five" is the
-- half that starts an argument.
--
-- The individual numbers do become visible at settlement, and they have to:
-- you cannot be asked to hand somebody eight euros without being told why. But
-- that is at the end, once the dinner is a memory rather than a competition.
--
-- MONEY IS STORED IN CENTS, AS AN INTEGER. `numeric` would also be correct;
-- floats never are, and this is the table where somebody would eventually reach
-- for one. Integer cents cannot drift, cannot round in the wrong direction, and
-- make the settlement below exactly summable to zero.

-- ---------------------------------------------------------------------------
-- 1. The dinner's own rule.
-- ---------------------------------------------------------------------------

do $$ begin
  create type cost_mode as enum ('NONE', 'SHARED');
exception when duplicate_object then null;
end $$;

alter table rounds
  add column if not exists cost_mode cost_mode not null default 'NONE',
  -- What each person agrees to spend, in cents. Null means "shared, but no
  -- ceiling" — the split still works, nobody is held to a number.
  add column if not exists budget_per_head int
    check (budget_per_head is null or budget_per_head between 0 and 100000000),
  add column if not exists currency text not null default 'EUR'
    check (char_length(currency) = 3);

comment on column rounds.budget_per_head is
  'Cents. Agreed before the roulette, so it shapes the recipes people write '
  'rather than judging the receipts afterwards.';

-- ---------------------------------------------------------------------------
-- 2. What somebody spent.
--
-- One row per member per dinner rather than a receipt log: the question at the
-- end is "how much did you put in", and asking for it as a list of line items
-- is asking somebody to do bookkeeping after a dinner party. A note is there
-- for whoever wants to write "plus the wine".
-- ---------------------------------------------------------------------------

create table if not exists dinner_expenses (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds (id) on delete cascade,
  member_id uuid not null references round_members (id) on delete cascade,
  amount_cents int not null check (amount_cents >= 0 and amount_cents <= 100000000),
  note text check (note is null or char_length(note) <= 140),
  updated_at timestamptz not null default now(),

  unique (round_id, member_id)
);

create index dinner_expenses_round_idx on dinner_expenses (round_id);

alter table dinner_expenses enable row level security;

-- No policies and no grants: everything goes through the functions below, which
-- is what keeps "who may see whose number, and when" in one readable place
-- rather than spread across a policy and three call sites.

-- ---------------------------------------------------------------------------
-- 3. Setting the rule. The host, and only before the roulette runs.
--
-- Once the chain exists people are writing recipes against a budget; moving it
-- underneath them would change the brief they are halfway through. The one
-- thing that stays adjustable is turning it off — a rule nobody used should not
-- be enforceable at the end.
-- ---------------------------------------------------------------------------

create or replace function set_cost_settings(
  p_round_id uuid,
  p_mode cost_mode,
  p_budget_per_head int default null,
  p_currency text default 'EUR'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the host can set the budget';
  end if;

  if p_mode = 'SHARED' and v_round.status not in ('DRAFT', 'OPEN', 'LOCKED') then
    raise exception 'BUDGET_TOO_LATE';
  end if;

  update rounds
  set cost_mode = p_mode,
      budget_per_head = case when p_mode = 'SHARED' then p_budget_per_head else null end,
      currency = coalesce(nullif(btrim(p_currency), ''), 'EUR')
  where id = p_round_id;
end;
$$;

grant execute on function set_cost_settings(uuid, cost_mode, int, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Recording what you spent. Yours, replaceable, and nobody else's.
-- ---------------------------------------------------------------------------

create or replace function record_expense(p_round_id uuid, p_amount_cents int, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_member_id uuid;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;
  if v_round.cost_mode <> 'SHARED' then raise exception 'COSTS_NOT_SHARED'; end if;

  select id into v_member_id from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE' and approved;
  if not found then raise exception 'not an active member of this round'; end if;

  if p_amount_cents is null or p_amount_cents < 0 then
    raise exception 'AMOUNT_INVALID';
  end if;

  insert into dinner_expenses (round_id, member_id, amount_cents, note)
  values (p_round_id, v_member_id, p_amount_cents, nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (round_id, member_id) do update
    set amount_cents = excluded.amount_cents,
        note = excluded.note,
        updated_at = now();
end;
$$;

grant execute on function record_expense(uuid, int, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. What everybody may see while the dinner is still running.
--
-- Your own number, the table's total and average, how many have said anything,
-- and the budget. Not a per-person list — see the note at the top of this file.
-- ---------------------------------------------------------------------------

create or replace function costs_so_far(p_round_id uuid)
returns table (
  currency text,
  budget_per_head int,
  my_spend_cents int,
  total_cents int,
  average_cents int,
  people int,
  reported int
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_member_id uuid;
begin
  if not (is_round_host(p_round_id, v_uid) or is_round_member(p_round_id, v_uid)) then
    raise exception 'not a member of this round';
  end if;

  select rm.id into v_member_id from round_members rm
  where rm.round_id = p_round_id and rm.profile_id = v_uid;

  return query
  select
    r.currency,
    r.budget_per_head,
    coalesce((select e.amount_cents from dinner_expenses e
              where e.round_id = p_round_id and e.member_id = v_member_id), 0),
    coalesce((select sum(e.amount_cents)::int from dinner_expenses e where e.round_id = p_round_id), 0),
    -- Averaged over the people at the table, not over the people who have
    -- answered: a table of four where one person has spoken has an average of
    -- their spend divided by four, which is the number that says whether the
    -- evening is on budget.
    case when v_people.n > 0
      then (coalesce((select sum(e.amount_cents) from dinner_expenses e where e.round_id = p_round_id), 0) / v_people.n)::int
      else 0 end,
    v_people.n,
    (select count(*)::int from dinner_expenses e where e.round_id = p_round_id)
  from rounds r,
    lateral (
      select count(*)::int as n from round_members m
      where m.round_id = p_round_id and m.status = 'ACTIVE' and m.approved
    ) v_people
  where r.id = p_round_id;
end;
$$;

grant execute on function costs_so_far(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The settlement.
--
-- Only once the dinner is over, and then in full: who spent what, and what each
-- of them owes or is owed. You cannot ask somebody for eight euros without
-- telling them why, so this is the one place the individual numbers appear.
--
-- THE ARITHMETIC, and why it is integer cents. Everybody's fair share is the
-- total divided by the number of people. That division has a remainder — three
-- people and €10.00 is 333, 333, 333 and one cent unaccounted for — and a
-- settlement whose balances do not sum to exactly zero is a settlement that
-- invents or destroys money. So the remainder is handed out, one cent each, to
-- the people who spent most: they are the ones owed money, and being owed one
-- cent less is the smallest possible unfairness available.
--
-- `balance_cents` is positive for somebody who is owed and negative for
-- somebody who owes. They sum to zero, exactly, always.
-- ---------------------------------------------------------------------------

create or replace function settle_costs(p_round_id uuid)
returns table (
  member_id uuid,
  who text,
  is_me boolean,
  spent_cents int,
  share_cents int,
  balance_cents int
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_me uuid;
  v_total int;
  v_people int;
  v_base int;
  v_remainder int;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;
  if v_round.cost_mode <> 'SHARED' then raise exception 'COSTS_NOT_SHARED'; end if;

  if not (is_round_host(p_round_id, v_uid) or is_round_member(p_round_id, v_uid)) then
    raise exception 'not a member of this round';
  end if;

  -- Not before the food. A running total is one thing; a bill is another, and
  -- presenting one mid-dinner turns the evening into a transaction.
  if v_round.status not in ('VOTING', 'RESULTS', 'ARCHIVED') then
    raise exception 'SETTLEMENT_TOO_EARLY';
  end if;

  select rm.id into v_me from round_members rm
  where rm.round_id = p_round_id and rm.profile_id = v_uid;

  select count(*)::int into v_people from round_members m
  where m.round_id = p_round_id and m.status = 'ACTIVE' and m.approved;
  if v_people = 0 then return; end if;

  select coalesce(sum(e.amount_cents), 0)::int into v_total
  from dinner_expenses e
  join round_members m on m.id = e.member_id and m.status = 'ACTIVE' and m.approved
  where e.round_id = p_round_id;

  v_base := v_total / v_people;
  v_remainder := v_total - (v_base * v_people);

  return query
  with people as (
    select
      m.id,
      m.secret_name,
      coalesce(e.amount_cents, 0) as spent,
      -- Biggest spender first, so the leftover cents land on the people who are
      -- owed money. Ties broken by id so the answer is the same every time it
      -- is asked — a settlement that reshuffles between two readings is one
      -- nobody trusts.
      row_number() over (order by coalesce(e.amount_cents, 0) desc, m.id) as rank
    from round_members m
    left join dinner_expenses e on e.member_id = m.id and e.round_id = p_round_id
    where m.round_id = p_round_id and m.status = 'ACTIVE' and m.approved
  )
  select
    p.id,
    p.secret_name,
    p.id = v_me,
    p.spent,
    (v_base + case when p.rank <= v_remainder then 1 else 0 end)::int,
    (p.spent - (v_base + case when p.rank <= v_remainder then 1 else 0 end))::int
  from people p
  order by p.spent desc, p.id;
end;
$$;

grant execute on function settle_costs(uuid) to authenticated;

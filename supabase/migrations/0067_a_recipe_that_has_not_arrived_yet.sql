-- A recipe that has not arrived yet is still a page.
--
-- `get_my_brief` starts from `briefs` and joins the pairing to it. That is the
-- right shape for reading a recipe and the wrong shape for the hours before one
-- exists: a cook whose sender has not submitted gets an empty set, the drawer
-- opens onto one grey line — "no recipe yet" — and that is the whole screen.
--
-- WHAT THAT LINE COSTS. Everything the cook could do about it is on the other
-- side of it. The conversation with the person writing for them lives on this
-- page, and the page is the only door to it: the thread exists from the moment
-- the roulette runs, it is where a nudge would go, and it is invisible for
-- exactly as long as there is something to nudge about. Somebody who needs to
-- shop tomorrow and has been given nothing has, on screen, no way to say so —
-- and CovertCook already has the sentence for it ("I haven't received a recipe
-- to cook yet", canned, since 0010) with a host alert wired to the back of it.
-- It was unreachable because the page that offers it only rendered once the
-- recipe made it unnecessary.
--
-- SO THE PAIRING BECOMES THE SUBJECT OF THIS FUNCTION, AND THE RECIPE BECOMES
-- OPTIONAL. Every row it returned before, it still returns, unchanged. What is
-- new is the row it returns when there is no submitted brief: the pairing, the
-- course the roulette dealt, and nulls where the dish would be. `brief_id is
-- null` is the whole of the signal, and the client draws the same page with an
-- empty middle rather than a different page with an apology on it.
--
-- The course comes from the slot rather than the brief, which is what makes
-- that empty page worth looking at: "you are cooking a dessert, and nobody has
-- told you which one yet" is a real state of the game. "Nothing here" is not.

drop function if exists get_my_brief(uuid);

create function get_my_brief(p_round_id uuid)
returns table (
  pairing_id uuid,
  -- Null until somebody submits. Everything below it is null with it, and it is
  -- the flag the client reads to know which of the two pages to draw.
  brief_id uuid,
  dish_name text, course course, procedure text,
  external_url text, difficulty integer, est_cost text, prep_minutes integer,
  note_to_cook text, contains_tags text[], ingredients jsonb, acknowledged boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_my_member_id uuid;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  select id into v_my_member_id from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE' and approved;
  if not found then raise exception 'not an active member of this round'; end if;

  -- Before the roulette there is nothing to be a cook of.
  if v_round.status in ('DRAFT', 'OPEN', 'LOCKED') then
    raise exception 'briefs are not visible to cooks yet';
  end if;

  return query
    select
      p.id,
      b.id,
      b.dish_name,
      -- The slot when there is no recipe, because the slot is what the cook was
      -- actually dealt and it is true from the moment the roulette runs.
      coalesce(b.course, s.course),
      b.procedure, b.external_url, b.difficulty,
      b.est_cost, b.prep_minutes, b.note_to_cook,
      -- Empty rather than null: the client counts these, and a page that has
      -- not been written yet has no allergens rather than unknown ones.
      coalesce(b.contains_tags, '{}'::text[]),
      coalesce(
        (select jsonb_agg(jsonb_build_object('name', bi.name, 'quantity', bi.quantity, 'unit', bi.unit) order by bi.position)
         from brief_ingredients bi where bi.brief_id = b.id),
        '[]'::jsonb
      ),
      coalesce(b.acknowledged_at is not null, false)
    from pairings p
    join slots s on s.id = p.slot_id
    -- LEFT, and this is the entire migration. A draft is not a recipe either:
    -- the SUBMITTED test moves into the join so that a sender halfway through
    -- writing shows the cook the same waiting page as a sender who has not
    -- started, rather than half a dish.
    left join briefs b on b.pairing_id = p.id and b.status = 'SUBMITTED'
    where p.round_id = p_round_id
      and p.assignment_version = v_round.assignment_version
      and p.cook_id = v_my_member_id;
end;
$$;

grant execute on function get_my_brief(uuid) to authenticated;

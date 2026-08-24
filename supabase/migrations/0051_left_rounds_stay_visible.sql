-- A dinner you left has to stay visible, or leaving looks like losing.
--
-- 0050 sorted LEFT and REMOVED memberships into the archive, and the archive
-- stayed empty. The reason is one line in 0002: `is_round_member` answers only
-- for an ACTIVE, approved membership, and the rounds SELECT policy is built on
-- it — so the moment somebody's seat is marked LEFT, the round row itself
-- becomes unreadable to them. The client asked for it, RLS returned nothing,
-- and the card had no data to draw.
--
-- The fix is NOT to loosen is_round_member. That function gates the briefs,
-- the chat, the roster, the pass and the ballots; widening it would hand a
-- departed player the inside of a dinner they walked out of, which is the
-- opposite of leaving.
--
-- So this is a second policy, on `rounds` alone. Postgres ORs policies of the
-- same command together, so it adds exactly one thing: a former member can
-- read the round ROW — its name, its date, its status — and nothing else in
-- the schema changes. Everything inside stays shut, and the interface matches
-- that by rendering the card without a link: there is nothing to open, and a
-- door that opens onto an error is worse than no door.
--
-- Deliberately not time-limited. A dinner you were part of is part of your
-- history whether it was last month or last year, and the row is a few hundred
-- bytes of text.

create policy rounds_select_former_member on rounds
  for select using (
    exists (
      select 1 from round_members m
      where m.round_id = rounds.id
        and m.profile_id = auth.uid()
        and m.status in ('LEFT', 'REMOVED')
    )
  );

comment on policy rounds_select_former_member on rounds is
  'A round you left stays readable as a row so it can sit in your archive (0051). Membership-gated content is unaffected: is_round_member still answers only for an ACTIVE seat.';

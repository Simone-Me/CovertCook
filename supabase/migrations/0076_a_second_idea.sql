-- A recipe that was offered and is not the one being cooked.
--
-- Up to now a pairing had exactly one brief, and `brief_status` had exactly
-- two values: it is being written, or it has gone. Writing two or three ideas
-- and letting the cook pick the one that suits them needs a third state — the
-- ones that were sent, are complete, and are not the dish.
--
-- WHY A STATUS AND NOT A FLAG, which is the whole design and the reason this
-- change is small instead of enormous. Eight functions across six migrations
-- enumerate a round's dishes with `b.status = 'SUBMITTED'` — the ballot, the
-- tally, the results, the menu, the carte, the recipe book, the album, the
-- delivery marks. If "chosen" were a separate boolean, every one of them would
-- need a second predicate added by hand, and the first one anybody forgot
-- would put three dishes on the menu for one seat.
--
-- Making SUBMITTED mean *the dish* keeps all eight correct without being
-- touched. Only two functions have to learn the new word: the one the cook
-- reads, and the one that lets them choose.
--
-- Alone in its own file, as 0017 and 0070 were and for the same reason:
-- Postgres will not let a value added by ALTER TYPE ... ADD VALUE be used in
-- the same transaction, and Supabase runs each migration file as one.

alter type brief_status add value if not exists 'OFFERED';

comment on type brief_status is
  'DRAFT: still being written. OFFERED: sent, complete, not the dish being cooked. SUBMITTED: the dish. Exactly one brief per pairing is ever SUBMITTED.';

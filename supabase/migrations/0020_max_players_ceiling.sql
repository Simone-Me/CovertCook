-- A ceiling on the seat limit a host can set. 30 is chosen, not rounded to:
-- secret names are one word drawn from secret_name_words, which holds 24
-- per locale, and assign_secret_name starts appending random characters
-- once it runs out ("Chef Basilic a3f"). Past roughly two dozen the game
-- stops naming people and starts numbering them, which is a worse dinner
-- well before it's a technical problem.
--
-- A constraint rather than a check inside create_round, so it holds on
-- every path into the column — today create_round, tomorrow whatever else
-- sets it — rather than on the one that happens to exist now.
--
-- The floor was already implicit and is now explicit: a Sattolo cycle
-- needs at least three people to be a chain rather than a swap.

alter table rounds
  add constraint rounds_max_players_sane
  check (max_players is null or max_players between 3 and 30);

comment on constraint rounds_max_players_sane on rounds is
  'A dinner where everyone cooks a dish tops out well below this; see 0020.';

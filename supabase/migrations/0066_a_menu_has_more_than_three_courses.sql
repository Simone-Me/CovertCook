-- A menu has more than three courses.
--
-- `course` has held five values since 0001: STARTER, MAIN, DESSERT, DRINK and
-- OTHER. That is a schema written for the shape of a *game* — one dish per
-- chef, three of them make a meal — rather than for the shape of a dinner
-- anybody actually sits down to. The moment a table of six composes a menu it
-- runs out: the two people who brought olives and crisps to hand round before
-- anyone sat down are both "Other", and so is the cheese, and so is the salad
-- that came with the main.
--
-- OTHER IS NOT A COURSE, IT IS A SHRUG. Every dish that lands in it loses its
-- place in the meal: the results page prints the menu in the order a meal is
-- eaten, and a section headed "Other" can only be printed last, whatever it
-- was. Three olives before the aperitif and a cheeseboard after the main end
-- up under the same heading, at the bottom, after the dessert.
--
-- WHAT WAS ADDED, AND WHY THESE. Not everything a restaurant prints — a menu
-- with amuse-bouche, trou normand and mignardises on it is a menu nobody at a
-- friend's flat is composing. These five are the courses that a home dinner
-- for six actually produces, and each one is a dish somebody is asked to
-- *cook*, which is the test this list has to pass:
--
--   * APERITIF — what is drunk and nibbled standing up, before the table.
--   * SNACK    — crisps, olives, something to open a packet of. It is a real
--                assignment and it is the friendliest one to give somebody who
--                cannot cook, which is worth having in a game about cooking.
--   * FIRST    — the pasta, the risotto, the soup. In a French or Italian meal
--                this is a course of its own and it is not the main.
--   * SIDE     — the salad, the vegetables, the potatoes that arrive with it.
--   * CHEESE   — between the main and the dessert, where it belongs, rather
--                than at the end where "Other" was putting it.
--
-- ORDER IS THE POINT, AND IT IS WHY THIS IS A SCHEMA CHANGE AND NOT A FRONTEND
-- ONE. `list_slots` and the album's menu snapshot both `order by course`, and
-- an enum sorts by the order its values were declared in. `ADD VALUE ...
-- BEFORE/AFTER` is what puts each new course in its place in the meal, so the
-- database hands back a menu already in the order it is eaten, and no screen
-- has to carry a second list saying what that order is.
--
-- NOTHING IN THIS FILE MAY USE THE NEW VALUES. Postgres refuses to let a value
-- added by ALTER TYPE be used in the same transaction that added it, and
-- Supabase runs each migration as one transaction — the same rule 0060 ran
-- into when it wanted a new host_alert_kind. So this migration adds and stops.
-- The snapshot and the pickers that read them are in the migrations and the
-- code that follow.

alter type course add value if not exists 'APERITIF' before 'STARTER';
alter type course add value if not exists 'SNACK' after 'APERITIF';
alter type course add value if not exists 'FIRST' after 'STARTER';
alter type course add value if not exists 'SIDE' after 'MAIN';
alter type course add value if not exists 'CHEESE' after 'SIDE';

-- The resulting order, which is the order a meal is eaten in:
--   APERITIF, SNACK, STARTER, FIRST, MAIN, SIDE, CHEESE, DESSERT, DRINK, OTHER
--
-- DRINK and OTHER stay at the end on purpose. A drink is not eaten at a point
-- in the meal — it runs alongside all of it — and OTHER is what is left when
-- none of the nine above fit, which is exactly where a menu prints it.

-- ---------------------------------------------------------------------------
-- ONE FREE CLOTH: THE RED CHECKS.
--
-- Elegant was the second free table and it is withdrawn for good. The house
-- cloth is what CovertCook looks like, and a second free choice that is plain
-- linen made the shelf read as "the app, or the app with the colour taken
-- out". The other five stay exactly as 0082 left them: Crème, and back in the
-- workshop.
--
-- DELETED, NOT PAUSED. A paused row stays on the shelf saying it is coming
-- back (0082); this one is not coming back, so it leaves the shelf. With the
-- row gone:
--   · `list_table_themes` no longer offers it;
--   · `theme_available` finds nothing and says no, so `create_round` refuses
--     it like any unknown code;
--   · dinners already laid on it keep `rounds.table_theme = 'ELEGANT'` — there
--     is no foreign key, the client keeps the `.theme-elegant` class, and the
--     Crème hold in 0079 only looks for PAID rows, which this never was.
-- ---------------------------------------------------------------------------

delete from table_theme_catalogue where code = 'ELEGANT';
delete from profile_theme_unlocks where kind = 'TABLE_THEME' and code = 'ELEGANT';

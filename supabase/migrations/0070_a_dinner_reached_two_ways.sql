-- A dinner can be reached two ways at once.
--
-- `round_access` has been CODE or INVITE since 0018, as though the two were
-- opposites. They are not: the common case is a host who invites the four
-- people they already know by name and hands the code to whoever else turns
-- up. Until now that host had to pick which half of their table to serve.
--
-- Alone in its own file, and it has to be: Postgres will not let a value added
-- by ALTER TYPE ... ADD VALUE be *used* in the same transaction, and Supabase
-- runs each migration file as one. 0071 is where it is used.

alter type round_access add value if not exists 'CODE_AND_INVITE';

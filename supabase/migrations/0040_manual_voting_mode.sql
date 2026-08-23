-- A fourth way to vote: counted by hand, at the table.
--
-- Alone in its own file, and it has to be. ALTER TYPE ... ADD VALUE cannot be
-- used in the same transaction that adds it, and Supabase runs each migration
-- file as one transaction — the same rule that forced 0030 and 0031 apart.
-- Everything that references 'MANUAL' lives in 0041.

alter type voting_mode add value if not exists 'MANUAL';

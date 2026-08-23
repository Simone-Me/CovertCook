-- A third anonymity mode, "spia": the host always sees every member's real
-- name beside their pseudonym; every other player only ever sees
-- pseudonyms. Distinct from the existing chain-reveal gate
-- (host_saw_chain_at), which is about who cooks for whom — this is about
-- the roster's identity mapping, and the two stay independent. A SPY host
-- still has to ask explicitly to see the chain.
--
-- Alone in its own migration on purpose: Postgres will not let a value
-- added by ALTER TYPE ... ADD VALUE be *used* in the same transaction, and
-- Supabase runs each migration file as one. Keeping it separate means the
-- next migration can reference 'SPY' freely.

alter type round_anonymity add value if not exists 'SPY';

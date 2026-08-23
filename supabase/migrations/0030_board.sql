-- The board ("pozzo comune"): one channel the whole table can read and post
-- to, from a short list of ready-made cheerful phrases.
--
-- ITS OWN TABLE, NOT A LOOSENED `messages`. That table is one of the ones
-- with no player-facing SELECT policy ever, enforced by REVOKE at the grant
-- level, precisely because a pairing message would give away who wrote to
-- whom before the reveal. Every row also carries a pairing_id (not null)
-- and a direction, neither of which means anything for a message addressed
-- to everybody. Sharing the table would mean adding an "unless it's a
-- broadcast" branch to each of those guards — the worst possible place to
-- put a special case.
--
-- NOTHING IS ATTRIBUTED. Showing "Chef Potato said X" identifies nobody and
-- adds nothing, and a pseudonym accumulating a voice across many posts is
-- exactly the pattern the canned-phrase rule exists to prevent. So it reads
-- as a noticeboard rather than a group chat.
--
-- The author is still stored, and never sent to a client. That is the house
-- pattern — the data lives in Postgres and the RPC strips it on the way out
-- — and it is what lets the Executive Chef act on a reported post.

create table round_messages (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds (id) on delete cascade,
  author_member_id uuid not null references round_members (id) on delete cascade,
  template_id uuid not null references message_templates (id),
  created_at timestamptz not null default now(),
  created_day date not null default current_date,
  reported boolean not null default false
);

create index round_messages_round_id_idx on round_messages (round_id, created_at desc);

alter table round_messages enable row level security;

-- No policies and no grants: like the pairing threads, this is reachable
-- only through the functions below, so "what gets sent to the client" is
-- decided in one place rather than by whatever columns a query asks for.
revoke all on round_messages from anon, authenticated;

-- ---------------------------------------------------------------------------
-- BOARD as a message category. The phrases live in message_templates like
-- every other canned line, so adding one stays an insert and never a
-- redeploy, and translation works the same way it already does.
-- ---------------------------------------------------------------------------

alter type message_category add value if not exists 'BOARD';

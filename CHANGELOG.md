# Changelog

Dated entries, newest first. `README.md` stays the living status doc (what
exists / what's missing right now); this file is the history of how it got
there.

## 2026-08-01 (3)

**Added: the rest of the player-facing game loop.** Brief editor, Cook
view, canned chat (shared `ChatThread` component), drag-and-drop ballot
voting, and results/awards — the screens listed as "not built yet" that a
round actually needs to be played end to end in the UI. Every RPC these
call already existed and was already smoke-tested (`get_my_assignment`,
`save_brief_draft`/`submit_brief`, `send_message`/`get_thread`,
`get_ballot_options`/`submit_ballot`, `get_results`); this pass was almost
entirely frontend. `RoundHomePage` now shows one phase-appropriate entry
point into this loop instead of requiring players to know the URLs.

**Added: host tools.** Chain view (spoiler-gated behind an explicit
"Reveal" click — matches the existing `host_saw_chain_at` design, never
auto-fetched) as the grid-of-chefs-with-arrows layout discussed earlier in
this project; manual pairing swap and late-joiner splice from that same
page; a "Remove" action on the roster; a host alerts inbox; exclusion-pair
and course-slot configuration on the settings page (both direct
`supabase-js` CRUD — the RLS policies for host-write access already
existed, no RPC needed). `CreateRoundPage` gained a slot-mode choice,
since nothing previously let a round reach `CATEGORIES` mode at all.

**Migration `0014_brief_pairing_and_alerts.sql`** — three small backend
gaps found while wiring up the screens above, all fixed here:
- `get_my_brief` didn't return `pairing_id`, so the Cook had no way to
  open their own chat thread.
- `save_brief_draft` was write-only; new `get_my_brief_draft` lets a
  Sender re-fetch their own in-progress draft.
- `host_alerts` had a select-only grant (no way to resolve an alert) —
  added a host-scoped update policy, same shape as `rounds_update_host_only`.

**Real bugs found by testing, fixed before shipping — not by inspection:**
- A `status`-column naming collision inside `get_my_brief_draft`:
  PL/pgSQL exposes `RETURNS TABLE` columns as implicitly-declared
  variables for the whole function body, and this function's own output
  column `status` (the brief's draft/submitted state) shadowed
  `round_members.status` in the member-lookup query, making the function
  fail to even compile correctly. Fixed by qualifying the column
  reference.
- `host_alerts.pairing_id → pairings(id)` had no `ON DELETE` action
  (implicit `NO ACTION`), so `remove_member` — which can delete a
  `pairings` row outright — would crash with a raw foreign-key violation
  the instant that pairing already had a `CANNOT_COOK` alert against it.
  That's not a contrived case: "Cook says they can't cook this" → alert →
  "host removes that Cook" is the exact sequence the alert exists to
  prompt, and it now has a real frontend entry point. Changed to
  `ON DELETE SET NULL`.
- `ChainPage`'s cycle-walking logic assumed the assignment was always one
  single cycle. It isn't, always: `set_pairing`'s edge swap is a generic
  2-opt move, which — like any 2-opt move on a single cycle — splits it
  into two disjoint cycles unless the host swaps again across the
  resulting pair to re-merge them. The original `walkCycle` only followed
  the cycle reachable from the first link, so a second cycle would have
  silently vanished from the host's own view. Rewritten as `walkCycles`,
  rendering every cycle found. Caught by reasoning through what
  `smoke_test3.sql` needed to set up for a `set_pairing` test, before ever
  running it against a browser.

**Added: simple placeholder icons.** PWA install icons (`public/pwa-*.png`
— `vite.config.ts` referenced these before they existed; installability
was silently broken) and per-`dietary_kind` inline SVG glyphs in the
allergy grid, shape-distinguished for colorblind-safe legibility.
Functional, not final branding.

**Explicitly not in this pass** (flagged, not silently dropped, per
explicit scoping with the user): `send-email`/`send-invite` Edge
Functions (no Brevo key, won't fabricate copy), legal pages (won't draft
real legal text), the manual pen-test, and turning the smoke-test scripts
into an actual CI-run automated suite.

**Verified:** new `supabase/smoke_test3.sql` covers every RPC that only
got a frontend in this pass — `splice_member` (both the
confirmation-required and confirmed paths), `set_pairing`,
`remove_member` (post-assignment branch), `exclusion_pairs`/`slots`
direct CRUD (including RLS rejecting a non-host insert), `host_alerts`
resolve (including RLS blocking a non-host update), and the new
`get_my_brief`/`get_my_brief_draft` columns — plus `smoke_test.sql`/
`smoke_test2.sql` re-run clean against the final migration. Separately,
drove the actual UI in a real (headless) browser via Playwright end to
end — signup → create round (`CATEGORIES` slot mode) → round home →
settings → chain → alerts — with zero console/page errors, against a
temporary local Supabase stack (`.env.local` backed up before the swap
and restored after; production was never pointed at). Migration `0014`
was **not** pushed to production as part of this pass, consistent with
confirming before every deploy so far.

## 2026-08-01 (2)

**Added: round timeline.** The round page now shows every phase as a
bulleted stepper (current phase highlighted) instead of just a single
status badge, so any player can see where the round stands and what's
still ahead — not just the host.

**Added: optional voting.** A host can disable voting at round creation
(new `rounds.voting_enabled` column, `0013_optional_voting.sql`). A
voting-disabled round skips `VOTING` entirely: `advance_phase` now allows
`DINNER → RESULTS` as a direct two-step move for such rounds (and the
matching step-back), computing results from zero ballots (already
supported — `compute_results` lists every submitted dish regardless of
vote count). Set once at creation, no update path — same pattern as
`slot_mode`/`allow_mutual_pairs`/`requires_approval`.

**Fixed during testing, before it ever shipped:** the first version of the
`advance_phase` change left a gap — the pre-existing generic
"one-step-back" branch would still let a voting-disabled round already in
`RESULTS` step back into `VOTING` (RESULTS is genuinely adjacent to VOTING
in the phase array), even though that round was never meant to have a
voting phase. Caught by directly exercising the RPC end-to-end against a
local Postgres instance rather than trusting the frontend to simply never
expose the button; fixed by rejecting `VOTING` as a target outright,
forward or backward, whenever `voting_enabled` is false.

Centralized the phase-order logic (`ROUND_PHASE_ORDER`,
`nextPhaseFor`/`previousPhaseFor` in `src/lib/rpc.ts`) so the frontend has
one voting-aware source of truth instead of three screens each guessing
the next/previous phase independently.

## 2026-08-01

**Fixed: "Next → Assigned" dead-ending with a raw Postgres error.**
`advance_phase` was correctly refusing to move a `LOCKED` round to
`ASSIGNED` until `generate_assignment` had run — but the frontend never
called `generate_assignment` at all, so there was no way to satisfy that
precondition from the UI. Added a host-only "Generate/re-roll assignment"
action on the round page (`generate_assignment` RPC, already existed
server-side) and a new `assignment_exists` RPC so the "Next" button can be
disabled with an explanation instead of failing after the click.

**Added: round settings page** (`/rounds/:roundId/settings`, host-only).
- Editable diner info: location, date/time, timezone
  (`update_round_details` RPC, new migration `0012_round_settings.sql`) —
  previously these could only be set once, at creation.
- "Unlock" / step-back control, generalized to any phase (the backend's
  one-step-back support in `advance_phase` already existed; there was no
  frontend entry point for it).
- Cancel-round action (`advance_phase(..., 'CANCELLED')` already existed
  server-side, unused by the frontend until now).

**Changed: dietary panel** now renders as a grid of placeholder cards
(one per restriction, square image slot above the label) instead of a flat
badge list, so real allergen icons can be dropped in later without a
layout change.

**Fixed: CI.** `keepalive.yml` referenced `secrets.SUPABASE_ANON_KEY`, a
secret that was never set — the anon/publishable key is meant to be
public, so it's read from `vars.VITE_SUPABASE_ANON_KEY` now (same Variable
`deploy.yml` already uses). Root cause of both failing scheduled jobs
(`Nightly backup`, `Keep Supabase project awake`) was that this repo's
GitHub Variables/Secrets were never populated at all — only local
`.env.local` had real values. See README → "CI/CD & required GitHub
configuration" for the exact list to set.

**Verified:** `supabase/smoke_test.sql` + `smoke_test2.sql` re-run clean
against migration `0012` (full signup→assignment→briefs→chat→voting→
results→reveal path), plus targeted checks of `update_round_details`
(host-only, blocked once `DINNER` phase starts) and `assignment_exists`
(member-only, correct true/false).

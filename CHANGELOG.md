# Changelog

Dated entries, newest first. `README.md` stays the living status doc (what
exists / what's missing right now); this file is the history of how it got
there.

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

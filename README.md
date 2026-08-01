# CovertCook

A mobile-first PWA that organises a dinner among friends:
each participant is secretly assigned another participant and writes them a
**recipe brief** that the other must cook. Everyone brings their dish, it's
served as a shared buffet, and afterwards everyone ranks the dishes to crown
a winner.

The core tension the product sells: you choose what someone else has to
cook, you don't know who chose yours, and you all find out at the end.

> **This file is a living status doc**, updated as the build progresses.
> Read it before starting new work — it's the fastest way to know what
> exists, what's validated, and what's still open. For a dated history of
> what changed and why, see [`CHANGELOG.md`](./CHANGELOG.md).

---

## Vocabulary

| Term | Meaning |
|---|---|
| **Round** | One dinner, from creation to results. |
| **Host** | The single organiser of a round. A normal user, not a superuser. |
| **Player** | A participant. The Host is also a Player. |
| **Secret name** | Auto-assigned pseudonym, used when the round is anonymous. |
| **Brief** | The recipe one Player writes *for another*. |
| **Sender** | The Player who writes a Brief. |
| **Cook** | The Player who receives it and must prepare it. |
| **Slot** | A course to fill: starter / main / dessert / drink / other. |
| **Pairing** | The Sender → Cook link. |
| **Chain** | The full cycle of pairings: A→B→C→…→A. |

Direction, do not invert: Sender A is assigned Cook B. A writes, B cooks. B
does not learn A's identity until the final reveal.

---

## Design principle

The website must stay **simple and intuitive** — every screen should be
usable without instructions. When a feature could go either the simple
route or the more powerful/configurable route, default to simple unless
there's a concrete reason (e.g. dietary safety) to do otherwise.

## Key characteristics (the decisions that shape everything else)

- **Game logic lives in Postgres**, not the frontend. Assignment, phase
  transitions, brief validation, messaging, ballots, and scoring are all
  `SECURITY DEFINER` SQL functions. The frontend calls RPCs; it never writes
  game tables directly. The browser is assumed hostile — it can read every
  byte it receives, so nothing sensitive is ever sent that isn't displayed.
- **Assignment is a single Sattolo cycle**, always. Every player is exactly
  one Sender's Cook and exactly one Cook's Sender — that's what makes the
  chain reveal work as "one long chain." `sum(slots)` must equal the active
  player count before locking; a `lap` column exists on `pairings` as a
  documented, currently-unused seam for a possible future "two dishes per
  cook" mode, deliberately not built for v1.
- **`pairings`, `briefs`, `brief_ingredients`, `messages`, and `ballot_items`
  have no player-facing SELECT policy, ever** — not even after the round
  ends. They're reachable only through RPCs that strip whatever shouldn't
  cross to the client (sender identity before reveal, `created_at`/
  `updated_at` timestamps, other players' ballots). This is enforced by
  `REVOKE` at the Postgres grant level, not just RLS — confirmed by testing
  that a direct REST read of these tables returns "permission denied," not
  just zero rows.
- **Dietary restrictions are round-wide, not per-pairing.** Because it's a
  shared buffet, a brief is validated against the union of every active
  member's `ALLERGY_SEVERE`/`DIET` entries, not just its Cook's. Severe
  allergies and diets hard-block submission; mild allergies and dislikes
  only warn.
- **Anonymity is layered**: secret names are assigned randomly (never in
  join order — that would leak identity), canned-template-only chat (no
  free text, so writing style can't out someone), day-granularity timestamps
  only, and the Host can optionally stay "blind" to the chain until they
  explicitly ask to see it (`host_saw_chain_at` records if they looked).
- **Round-membership approval is a real feature**: `rounds.requires_approval`
  + `round_members.approved`, with dedicated `approve_member`/
  `reject_member` RPCs. Unapproved members occupy no seat.
- Scoring is **Borda count**, with two secondary 1–5 scores (originality,
  brief-respect) that exist purely to power awards Borda itself can't
  produce. Awards live in their own table since one dish can win several.

---

## Stack

React 18 + TypeScript + Vite → Netlify (PWA, builds directly from Git —
see below) · Supabase (Postgres + Auth + Edge Functions + pg_cron) · Brevo
(transactional email) · Cloudflare Turnstile (bot protection) · GitHub
Actions (keep-alive, backup only — Netlify owns the frontend build/deploy).

See `.env.example` for the public frontend config and
`supabase/functions/*` for where secrets (service role key, Turnstile
secret, Brevo key) actually live — never in the frontend bundle.

---

## Deploying the frontend (Netlify)

The Netlify site is connected directly to this repo's `main` branch and
builds it itself (`npm run build`, publish directory `dist`) — there is
**no GitHub Actions deploy step**; an earlier `deploy.yml` that built in
Actions and pushed to Netlify via API was removed once the site was
connected through Netlify's own Git integration, to avoid two pipelines
building and deploying on every push.

Because Netlify does the build, its **own** dashboard needs the frontend
env vars — not GitHub's. Site configuration → Environment variables:

| Name | Value | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API | Public |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API | The anon/publishable key — intentionally public, same as it is in the frontend bundle |
| `VITE_APP_BASE_URL` | the real deployed URL (e.g. `https://covertcook.netlify.app`) | **Not** `localhost` — that's the local-dev-only value in `.env.local` |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile dashboard | Until this is set, `Turnstile.tsx` falls back to a dev placeholder token that bypasses bot protection entirely (see "Known simplifications") — do not ship without a real key |

`public/_redirects` (`/*  /index.html  200`) is what makes client-side
routing work on Netlify — without it, refreshing or deep-linking to
anything other than `/` 404s, since Netlify otherwise looks for a literal
file at that path.

---

## CI/CD & required GitHub configuration

The remaining two workflows in `.github/workflows/` (`keepalive.yml`,
`backup.yml`) read from GitHub repo **Settings → Secrets and variables →
Actions**, not from `.env.local` (which is gitignored and never leaves
your machine). If a workflow run shows blank interpolations in its log
(an empty `apikey:` header, a URL missing its host, `pg_dump` falling back
to a local socket), the cause is always a missing entry here, not the
workflow YAML — GitHub silently resolves an unset secret/variable to an
empty string rather than failing the run.

Populate these once per repo (values live in your Supabase dashboard —
nothing here should ever be committed):

| Where | Name | Used by | Source |
|---|---|---|---|
| Variables | `VITE_SUPABASE_URL` | `keepalive.yml` | Supabase → Project Settings → API |
| Variables | `VITE_SUPABASE_ANON_KEY` | `keepalive.yml` | Supabase → Project Settings → API (anon/publishable key — intentionally public, hence a Variable not a Secret) |
| Secrets | `SUPABASE_DB_URL` | `backup.yml` | Supabase → Project Settings → Database → Connection string (pooler host is in `supabase/.temp/pooler-url` after linking; password isn't stored anywhere in the repo) |

These two GitHub Variables are separate from the four Netlify env vars
above — same values, but two different dashboards, since the frontend
build and the keep-alive ping now run in two different places.

---

## Running locally

```bash
npm install
cp .env.example .env.local   # fill in real values once you have a Supabase project

# Backend: spin up a local Postgres + full Supabase stack from the migrations
npx supabase start           # requires Docker Desktop running
npx supabase db reset        # (re)applies every migration + seed data from scratch

# Frontend
npm run dev
```

`supabase/smoke_test.sql` + `supabase/smoke_test2.sql` play a full 4-player
round end to end directly in SQL (signup → dietary block → assignment →
briefs → chat → voting → results → reveal) — useful for re-validating the
backend after any migration change. `supabase/smoke_test3.sql` covers the
host-tools RPCs that only got a frontend later (`splice_member`,
`set_pairing`, `remove_member` post-assignment, `exclusion_pairs`/
`slots` direct CRUD, `host_alerts` resolve) — all three are independent
and self-contained, each starting from its own `db reset`:

```bash
npx supabase db reset
CID=$(docker ps --filter "name=supabase_db" --format "{{.Names}}")
docker exec -i "$CID" psql -U postgres -d postgres < supabase/smoke_test.sql
docker exec -i "$CID" psql -U postgres -d postgres < supabase/smoke_test2.sql
docker exec -i "$CID" psql -U postgres -d postgres < supabase/smoke_test3.sql
```

---

## Status

### Done and validated against real Postgres
- Full schema + RLS + grants (`supabase/migrations/0001`–`0002`).
- Turnstile ticket handshake, signup, round CRUD, join/approve/reject, host
  transfer (`0003`–`0004`).
- Assignment (generate/re-roll/splice/manual-edit/remove), phase state
  machine with on-read deadline checks (`0005`–`0006`).
- Brief drafting/submission with round-wide dietary enforcement (`0007`).
- Canned chat with rate limits, report/reported-message flow (`0008`).
- Voting, Borda scoring, awards, `get_ballot_options`/`get_results` (`0009`).
- Message templates + secret-name word lists, FR + EN (`0010`).
- Frontend: auth (sign in/up with mandatory dietary step, reset), round
  create/join/roster/approval, round-switcher header, i18n scaffold, PWA
  config, `verify-turnstile` Edge Function.
- Netlify deploy (builds directly from Git — see "Deploying the
  frontend" above) + GitHub Actions keep-alive ping and nightly `pg_dump`
  backup (14-day rotation via artifact expiry).
- Host round-settings page (`/rounds/:roundId/settings`): editable diner
  info (location/date-time/timezone via `update_round_details`, blocked
  once `DINNER` phase starts), one-step-back "unlock" control, cancel round
  (`0012_round_settings.sql`).
- Assignment-generation UI on the round page: `LOCKED`-phase host action
  that calls `generate_assignment` (previously backend-only — the frontend
  had no way to trigger it, which is what made "Next → Assigned" dead-end
  with a raw Postgres error; the "Next" button is now disabled with an
  explanation until an assignment exists, using the new
  `assignment_exists` RPC to know on load without spoiling the chain).
- Dietary panel rendered as a placeholder image grid (per-entry square
  placeholder + label), ready to swap in real allergen icons later.
- Round-page timeline: a bulleted progress stepper (every phase, current
  one highlighted) so any player — not just the host — can see at a glance
  where the round stands, since the single phase badge alone doesn't
  convey the sequence.
- Optional voting: a host can disable voting at round creation
  (`rounds.voting_enabled`, `0013_optional_voting.sql`). Such a round skips
  `VOTING` entirely — `advance_phase` moves it `DINNER → RESULTS` directly
  and now explicitly rejects any attempt to enter `VOTING` at all for that
  round. `compute_results` already tolerated zero ballots, so results still
  publish (dishes listed, no meaningful ranking beyond the disclosed random
  tiebreak). Matches how every other round-configuration setting
  (`slot_mode`, `allow_mutual_pairs`, `requires_approval`, …) already
  works: set once at creation, no update RPC.
- The full player-facing game loop: brief editor (`/rounds/:roundId/brief`,
  ingredients list, dietary-panel cross-reference, contains-tags
  confirmation, round-wide dietary-conflict errors surfaced plainly), Cook
  view (`/recipe`, recipe card + "can't cook this" quick action), a shared
  canned-chat `ChatThread` component embedded in both (and in Results,
  where each player's own two threads unmask automatically once
  `RESULTS`/`ARCHIVED` — that's the actual identity reveal moment, per
  `get_thread`), ballot voting (`/ballot`, drag-and-drop ranking via
  `@dnd-kit`, optional originality/brief-respect scores), and
  results/awards (`/results`). `RoundHomePage` now surfaces one
  phase-appropriate entry point at a time into this loop instead of
  requiring players to know the URLs.
- Host tools: chain view (`/chain`, spoiler-gated behind an explicit
  "Reveal" click, never auto-fetched — matches the existing
  `host_saw_chain_at` design) rendered as the grid-of-chefs-with-arrows
  layout, handling the case where a manual swap has split the assignment
  into more than one cycle (see `0014`'s notes below); manual pairing
  swap (`set_pairing`) and late-joiner splice (`splice_member`) from that
  same page; a "Remove" action on the roster (`remove_member`, handling
  its confirmation-required branch); host alerts inbox (`/alerts`,
  `host_alerts` + `get_reported_messages`, resolve action); exclusion
  pairs and (for `CATEGORIES`-mode rounds) course-slot configuration on
  the settings page, both direct-`supabase-js` CRUD against existing
  host-write RLS policies — no RPC needed for either.
- `0014_brief_pairing_and_alerts.sql`: `get_my_brief` now returns
  `pairing_id` (the Cook had no way to open their chat thread without
  it); new `get_my_brief_draft` so a Sender can re-fetch their own
  in-progress brief (`save_brief_draft` was write-only before); a
  host-scoped update policy so alerts can actually be resolved (was
  select-only); and `host_alerts.pairing_id`'s foreign key now
  `ON DELETE SET NULL` instead of the implicit `NO ACTION` — the old
  default made `remove_member` crash with a raw constraint violation the
  instant the pairing being removed already had a `CANNOT_COOK` alert
  against it, which is the single most natural sequence that alert exists
  to prompt. Found and fixed via `supabase/smoke_test3.sql`, not by
  inspection.
- Simple placeholder icons: PWA install icons (`public/pwa-*.png` —
  `vite.config.ts` referenced these before they existed, so installability
  was silently broken) and per-`dietary_kind` inline SVG glyphs in the
  allergy grid (shape-distinguished, not just color, for colorblind-safe
  legibility) — functional, not final branding.
- `CreateRoundPage` gained a slot-mode choice (Free-for-all / Specific
  courses); previously nothing in the UI ever set `CATEGORIES`, so the
  courses-configuration UI above would have been unreachable dead code.

### Not built yet
- Dinner-day screens: shopping list, printable buffet label cards, offline
  cache verification.
- `send-email` and `send-invite` Edge Functions (folders exist, empty) —
  blocked on a real Brevo API key and email copy, neither fabricated here.
- Legal pages (privacy/terms; won't draft real legal text), info & help
  layer, first-run tour.
- Real allergen icons and PWA icons — see "Simple placeholder icons" above;
  current ones are functional stand-ins, not final design.
- Security pass against the full checklist (RLS-missing-policy CI check,
  password-list check, session/re-auth rules) and the manual pen-test pass
  (the pen-test specifically needs a human, not just more automation).
- 1000-run assignment fuzz test, splice/remove property tests, Borda
  tie-break tests as an actual automated suite — `smoke_test.sql`–
  `smoke_test3.sql` currently cover this by manual re-run, not CI.

### Known simplifications (deliberate, not oversights)
- The round-wide dietary check matches `dietary_entries.label` against
  `briefs.contains_tags` by exact string equality — it assumes both use the
  same tag vocabulary. A diet like "vegan" that implies several tags at
  once needs the user to add each conflicting tag as its own entry until a
  label→tags mapping table is built.
- Turnstile has a dev-only bypass (both the frontend widget and the
  `verify-turnstile` edge function recognise a placeholder token) that's
  inert the moment real site/secret keys are configured — remove the
  bypass path entirely once this ships past local dev.

# CovertCook

A mobile-first PWA that organises a dinner among friends like a Secret Santa:
each participant is secretly assigned another participant and writes them a
**recipe brief** that the other must cook. Everyone brings their dish, it's
served as a shared buffet, and afterwards everyone ranks the dishes to crown
a winner.

The core tension the product sells: you choose what someone else has to
cook, you don't know who chose yours, and you all find out at the end.

> **This file is a living status doc**, updated as the build progresses.
> Read it before starting new work — it's the fastest way to know what
> exists, what's validated, and what's still open.

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

React 18 + TypeScript + Vite → Netlify (PWA) · Supabase (Postgres + Auth +
Edge Functions + pg_cron) · Brevo (transactional email) · Cloudflare
Turnstile (bot protection) · GitHub Actions (deploy, keep-alive, backup).

See `.env.example` for the public frontend config and
`supabase/functions/*` for where secrets (service role key, Turnstile
secret, Brevo key) actually live — never in the frontend bundle.

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
backend after any migration change:

```bash
npx supabase db reset
CID=$(docker ps --filter "name=supabase_db" --format "{{.Names}}")
docker exec -i "$CID" psql -U postgres -d postgres < supabase/smoke_test.sql
docker exec -i "$CID" psql -U postgres -d postgres < supabase/smoke_test2.sql
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
- GitHub Actions: deploy (Netlify), keep-alive ping, nightly `pg_dump`
  backup (14-day rotation via artifact expiry).

### Not built yet
- Brief editor screen (ingredients list, dietary panel while writing,
  contains-tags confirmation).
- Cook view (recipe card) + chat thread UI.
- Dinner-day screens: shopping list, printable buffet label cards, offline
  cache verification.
- Ballot UI (drag-and-drop ranking) + results/reveal screens.
- `send-email` and `send-invite` Edge Functions (folders exist, empty).
- Host tools: slot/exclusion configuration UI, chain view (spoiler-gated),
  manual pairing edit UI, host alerts inbox.
- Legal pages (privacy/terms), info & help layer, first-run tour.
- Real PWA icons — `vite.config.ts` references `pwa-192x192.png` /
  `pwa-512x512.png`, which don't exist yet; installability will fail until
  they're added.
- Security pass against the full checklist (RLS-missing-policy CI check,
  password-list check, session/re-auth rules) and the manual pen-test pass.
- 1000-run assignment fuzz test, splice/remove property tests, Borda
  tie-break tests as actual automated tests (currently validated manually
  via the smoke-test SQL scripts, not an automated suite).

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

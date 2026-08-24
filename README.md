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

The round page is a tablecloth with envelopes laid on it, and opening one
takes over the screen rather than expanding a list.
[`DESIGN.md`](./DESIGN.md) is the authority on that — palette, the rules
that keep the table a table, and when the roster is allowed to be seen.
[`PRESENTATION.md`](./PRESENTATION.md) holds the phase-by-phase spec.
Both are kept out of this file so README stays limited to game logic and
architecture, not UI/UX planning.

Two conventions the interface now holds to, both recorded in
[`DESIGN.md`](./DESIGN.md):

- **No browser dialogs.** Confirmations appear on the page, beside the control
  that raised them, and say what will actually change. `window.confirm` cannot
  be formatted, cannot say more than one flat sentence, and gives the
  destructive option a button identical in weight to the safe one.
- **A warning must be true.** Stepping a dinner back deletes nothing —
  `advance_phase` only updates `rounds.status` — so the warnings say what each
  step actually changes (which phase-gated actions open or close), not what it
  feels like it might destroy.

Product and infrastructure questions that aren't about the interface —
notifications, a paid tier, self-hosting, the Play Store — live in
[`ROADMAP.md`](./ROADMAP.md). Nothing there is decided; it exists so each
question gets answered once instead of re-argued.

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
  free text, so writing style can't out someone — planned to change, see
  `PRESENTATION.md` drawer 4; update this bullet once that ships), day-
  granularity timestamps only, and the Host can optionally stay "blind" to
  the chain until they explicitly ask to see it (`host_saw_chain_at`
  records if they looked).
- **Round-membership approval is a real feature**: `rounds.requires_approval`
  + `round_members.approved`, with dedicated `approve_member`/
  `reject_member` RPCs. Unapproved members occupy no seat.
- Scoring is **Borda count**, with two secondary 1–5 scores (originality,
  brief-respect) that exist purely to power awards Borda itself can't
  produce. Awards live in their own table since one dish can win several.

---

## Security posture

Checked, not assumed — the audit that produced this list is in `CHANGELOG.md`
under 2026-08-24 (4).

- **Row Level Security is on every table**, with no exceptions.
- **Every `SECURITY DEFINER` function pins `search_path`**, which is what stops
  a hijacked schema turning a privileged function into someone else's code.
- **The service-role key never reaches the frontend.** It lives only in Edge
  Function secrets; the browser gets the anon key, which is useless without a
  policy that admits it.
- **Secrets are not in the bundle.** `VITE_*` is compiled into the client and
  is treated as public by definition — `.env.example` says so at the top.
- **Security headers** ship in `public/_headers`: CSP without `unsafe-inline`
  or `unsafe-eval` for scripts, `frame-ancestors 'none'`, HSTS, nosniff, a
  referrer policy (join codes travel in query strings), and a Permissions
  Policy denying hardware the app never uses.
- **Captcha before sign-up and before joining**, verified server-side; the
  Turnstile secret never leaves the Edge Function.
- **Sensitive tables are unreachable except through RPCs.** `manual_tally` has
  RLS on and no policies and no grants, so it can only be touched by the
  `SECURITY DEFINER` functions that own it.

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

**Check what `.env.local` points at before debugging anything.** It's the
single most misleading failure mode here: with production values in it,
`npm run dev` runs your local code against the *deployed* database, so
any migration you haven't pushed simply isn't there and the app fails
with `Could not find the function public.…` — which reads like a code
bug and isn't. Look at `VITE_SUPABASE_URL` specifically; `VITE_APP_BASE_URL`
says `localhost` in both setups and will happily fool a quick grep.

For local development it should read `http://127.0.0.1:54321`. Keep the
production values in a second gitignored file (`.env.production-backup.local`)
and swap when you actually mean to talk to the real project.

**`npx supabase db reset` deletes accounts, including yours.** It drops
and rebuilds everything, `auth.users` included — so any account created
by clicking through the local app disappears, while the browser keeps its
token. The app now detects that (`AuthProvider` asks the server who the
token belongs to and signs out cleanly if the answer is "nobody"), so it
appears as a normal sign-out rather than a foreign-key error. Still worth
knowing before resetting while someone is mid-test: they'll have to sign
up again.

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
backend after any migration change. `smoke_test3.sql` covers the
host-tools RPCs that only got a frontend later (`splice_member`,
`set_pairing`, `remove_member` post-assignment, exclusion pairs, the menu
RPCs, `host_alerts` resolve). `smoke_test4.sql` covers pending-member
identity, `smoke_test5.sql` both removal modes, `smoke_test6.sql` round
setup and invitations, and `smoke_test7.sql` the board plus allergens
informing rather than blocking.

**They cover less of the join path than they appear to.** Every one of
them seeds its `turnstile_tickets` row by hand as the postgres superuser
before calling `join_round`, so the `verify-turnstile` Edge Function is
never exercised — which is exactly how a permission bug that made joining
impossible survived six green runs (see `CHANGELOG.md` 2026-08-22 (5)).
Anything that only works through an Edge Function needs driving in a
browser, not in SQL.

**They are not all independent, and getting this wrong looks like a test
failure.** `smoke_test2.sql` is literally part 2 of `smoke_test.sql` — it
opens by looking up the round part 1 created, so run on a fresh database
it dies immediately with `no rows returned for \gset`. The other three
seed their own fixtures and each need their own reset, since they'd
collide on duplicate keys otherwise:

```bash
npx supabase db reset
CID=$(docker ps --filter "name=supabase_db" --format "{{.Names}}")
docker exec -i "$CID" psql -U postgres -d postgres < supabase/smoke_test.sql
docker exec -i "$CID" psql -U postgres -d postgres < supabase/smoke_test2.sql
```

Then `db reset` again before each of `smoke_test3.sql` through
`smoke_test7.sql`.

**Prefer `npx supabase migration up --local` over `db reset` while anyone
is using the app.** It applies pending migrations against the existing
database; `db reset` rebuilds it from scratch and takes `auth.users` with
it, so anyone signed in loses their account mid-session. The app now
detects such a session and signs out cleanly rather than failing on a
foreign key, but they still have to sign up again.

One more thing that looks like a failure and isn't: `smoke_test3.sql` picks its `set_pairing`
target with `limit 1` and no `order by`, so which member it lands on
varies with the random assignment; if it ever fails, confirm the failure
reproduces before believing it.

---

## Status

For the detailed, dated history of how each piece below was built (RPC
names, migration numbers, bugs found and fixed) see
[`CHANGELOG.md`](./CHANGELOG.md). This section only says what exists today.

### Done — playable end to end
- **Sign-up & join**: account creation with a mandatory allergy/diet step;
  create a round or join one via code, with optional host approval before
  a joiner counts as a real seat.
- **Assignment**: the host runs a lottery that gives every player exactly
  one other player to secretly cook for — free-for-all or fixed course
  slots (starter/main/dessert/drink/other), with manual re-pairing and
  late-joiner handling if needed.
- **Recipe briefs**: each player writes a recipe for their assigned cook,
  quickly (a name, ingredients one per line, the method, and optionally a
  link) or in detail (itemised ingredients with quantities and units).
  Both store the same list, so the cook reads the same thing either way.
  Allergen tags are found in what was written rather than ticked from a
  list.
- **The roster is covered until sign-ups close** (`0032`). While a round is
  `DRAFT` or `OPEN` nobody sees anyone's secret name but their own — the
  server withholds it, rather than the interface hiding it — because names
  appearing as people arrive would make join order a way to work out who is
  who. Everyone is revealed at the same instant when the round locks. The
  host still reads pending members' real names at the door (`0015`).
- **Allergens inform rather than block.** A dish matching somebody's severe
  allergy or diet is still served; what changes is that everyone who needs
  to know is told. The sender is asked to put a card by the dish, the
  Executive Chef gets a note naming the dish and the allergen so they can
  say it when the food goes down, and any diner can look up which dishes
  carry what. A card is what a host would actually do, and an adult with an
  allergy is better served by knowing than by one dish silently never
  existing.
- **The board**: one channel the whole table reads and posts to, from a
  short list of ready-made cheerful phrases. Nothing is attributed —
  identical phrases collapse into one line with a count, so the board is
  unattributable by construction rather than by omission. The author is
  still stored and never sent, which is what lets a reported phrase be
  acted on.
- **Cooking**: each player sees the recipe written for them, with a
  canned-message chat to their pairing partner and a "can't cook this"
  quick action.
- **Voting**: drag-and-drop dish ranking (Borda count) plus separate
  originality/brief-respect scores, with awards computed from the results.
- **Results & reveal**: scores, awards, and — the actual twist — each
  player's two chats unmask automatically, revealing who cooked for whom.
- **Host tools**: round settings (venue/date/time), pause or cancel a
  round, a roster with approve/reject/remove, a spoiler-gated view of the
  whole assignment chain, and an inbox for player-reported issues.
  Approvals show the real name of whoever is asking to join — a decision
  about a pseudonym is a decision about nobody — and the name gives way to
  the pseudonym the moment they're in. That name is unique across the app
  since `0046`: it is checked while you type at sign-up (free, taken) and
  held by a case-insensitive index, so an approval is never a choice between
  two identical strangers.
- **When someone drops out**: removing a cook after the lottery has run is
  a choice, not an automatic repair. *Reconnect* closes the chain so
  everyone still has a dish to make, at the cost of handing one cook a
  different recipe than the one they already have; *leave as is* disturbs
  nobody and the buffet is simply one dish shorter. A dish whose cook has
  gone is excluded from voting rather than listed for a rank nobody can
  give it.
- **Setting a dinner up**: one click for a classic dinner, or open the
  custom panel to choose how people get in (a code, or in-app invitations
  by account address), who knows whom (undercover / spy / open), how you
  vote (during dinner, after dinner on a timer, or not at all), and
  whether the menu is free-for-all or composed course by course.
- **The round page**: a table seen from above, with each section drawn as
  a sealed envelope laid on the cloth. The Executive Chef's actions all go
  through one panel — the pass — which shows only what's up right now and
  opens itself when the round is blocked on them.
- **Platform**: French/English with a working switcher, installable as a
  PWA, deployed on Netlify (frontend) + Supabase (backend), with automated
  keep-alive pings and nightly database backups
  **Production now carries the whole migration set** — `0015` → `0045` were
  deployed on 2026-08-24, closing the schema/client mismatch that had every
  RPC added since `0015` failing against the live database.

### Not built yet

Ordered roughly by how much the product misses them.

- **Free-text chat** — the chat is still canned templates only. Agreed to
  open it up (with the anonymity trade-off accepted knowingly), then
  narrow back toward templates once there's real usage data.
  `PRESENTATION.md` drawer 4.
- **Telling people the round moved** — nothing notifies anyone when the
  Executive Chef advances the dinner. Decided: email, not push, and why —
  see `PRESENTATION.md`, "Telling people the round moved". Needs the mail
  provider below.
- **Outbound email** — invitations already work in-app without it, so this
  is now only for reaching people who aren't looking at the app. Blocked
  on a provider key.
- **Deleting your account** — there is no way to do it, from inside the app
  or outside it. Not a nicety: both stores require it (Google Play needs an
  in-app path *and* a public request URL; Apple guideline 5.1.1(v) needs the
  in-app one), and GDPR requires it regardless of where the app is
  distributed. It is also not a one-line delete — `profiles.id` cascades
  from `auth.users`, while `round_members.profile_id`, `rounds.host_id` and
  `invites.created_by` do not cascade at all, so deleting a user who ever
  joined a round fails on a foreign key today. The data map, the blocker and
  the three ways out are in [`DISTRIBUTION.md`](./DISTRIBUTION.md) §10.
- **Real table props** — the plate, glass, bowl, napkin, cutlery and bread
  board on the cloth are drawings, not renders. They move correctly between
  the three states; what's missing is the artwork. The three rules the real
  ones must follow (one camera angle, one light source, shadow baked in) are
  in `DESIGN.md` §4 and `TableProps.tsx`.
- **Two recipes per brief** and **themed pseudonyms** — both shown in the
  creation form, both disabled, both v2.
- **Dinner-day tools**: shopping list, printable buffet labels,
  offline-cache verification.
- **An in-app help layer** and a first-run tour. (Terms and Privacy now exist
  as drafts at `/legal/*`, accepted at sign-up — but they have not been read by
  a lawyer, and they must be before any money changes hands.)
- **Final allergen and app icons** — current ones are functional
  placeholders.
- **A manual pen-test** and an automated test suite — today's coverage is
  manual SQL smoke tests, re-run by hand. A checklist pass was done on
  2026-08-24: RLS is on every table, every `SECURITY DEFINER` function pins
  its `search_path`, no secret reaches the bundle, security headers are now
  served from `public/_headers`, and production dependencies audit clean. What
  it did *not* cover is anything adversarial — nobody has actually tried to
  break in.
### The paid tier, in one line

Nothing is built. The decision is: **free stays a whole product** — unlimited
dinners, any number of guests, every feature that changes how the game is
played. Pro sells flavour only (tables, themed evenings) as a per-dinner
unlock bought by the host, so a table is never split into paying and
non-paying players. Reasoning in [`ROADMAP.md`](./ROADMAP.md) §2.

The line in practice: the kitchen-brigade pseudonym set shipped **free**,
because a second word list changes nothing about how the game is played. Table
themes are the paid side, because they are purely how the evening looks.

### Known simplifications (deliberate, not oversights)
- Allergy/diet matching is exact-string, not semantic: a diet like
  "vegan" needs every conflicting ingredient added by hand as its own tag,
  until a proper label→tags mapping exists.
- Bot protection (Turnstile) has a dev-only bypass (both the frontend
  widget and the `verify-turnstile` edge function recognise a placeholder
  token) — inert the moment real site/secret keys are configured, but
  must be removed entirely before this is used by anyone outside local
  development.

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
| `VITE_APP_BASE_URL` | `https://covertcook.netlify.app` | The deployed origin, until a real domain is bought. **Not** `localhost` — that's the local-dev-only value in `.env.local` |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile dashboard | Until this is set, `Turnstile.tsx` falls back to a dev placeholder token that bypasses bot protection entirely (see "Known simplifications") — do not ship without a real key |
| `VITE_VAPID_PUBLIC_KEY` | `npx web-push generate-vapid-keys` | Public by design. Empty is a valid state: the notifications switch reports itself unavailable instead of failing when pressed |

`public/_redirects` (`/*  /index.html  200`) is what makes client-side
routing work on Netlify — without it, refreshing or deep-linking to
anything other than `/` 404s, since Netlify otherwise looks for a literal
file at that path.

---

## Mail, and why a confirmation link can point at localhost

Two settings decide this and neither is in the repo:

- **Site URL** (Authentication → URL Configuration) is the fallback Auth uses
  when it will not accept the redirect it was given.
- **Redirect URLs** is the allow-list it checks that redirect against.

The client asks for `VITE_APP_BASE_URL` as `emailRedirectTo`. If that origin
is not on the allow-list — or if Netlify never got `VITE_APP_BASE_URL` and the
build baked in `localhost` — Auth silently falls back to Site URL. A Site URL
still set to `http://localhost:5173` is therefore the whole explanation for a
confirmation link that opens nothing: the template is innocent, and pasting a
different one changes nothing.

Fix all three together, or the symptom moves rather than goes. Until a real
domain is bought, all three are the Netlify origin:

1. Netlify → `VITE_APP_BASE_URL` = `https://covertcook.netlify.app`
2. Supabase → **Site URL** = `https://covertcook.netlify.app`
3. Supabase → **Redirect URLs** = `https://covertcook.netlify.app/**`

When the domain does arrive, these three change together and in that order —
a mismatch between them is silent, and shows up only as a link that opens the
wrong place.

### Which mail is sent by whom

`RESEND` as custom SMTP changes **where** mail is posted, never **what** it
says: the body still comes from Auth's own dashboard templates. There are two
ways to replace those, and the repo supports both:

| | Paste | `send-email` hook |
|---|---|---|
| What | `supabase/email-templates/*.html`, generated by `npm run mail:templates` | `supabase/functions/send-email/`, rendering the same `templates.ts` per recipient |
| Languages | One per box — a French player gets whatever you pasted | Both, chosen from `user_metadata.locale` |
| Transport | Auth → SMTP → Resend | Auth → our function → Resend's API |
| Setup | Copy two fields per template | Deploy, three secrets, one switch |

**Decided: the hook.** The generated files stay in the repo as the bridge
until it is deployed, and as a way to open a mail in a browser and look at it —
they are not the route. Turning the hook on:

1. `npx supabase functions deploy send-email --no-verify-jwt` — Auth calls it
   with a webhook signature, not a user token, so a JWT gate rejects every call.
2. Dashboard → Authentication → Hooks → **Send Email Hook**, enabled, pointed
   at that function. It generates the signing secret.
3. `npx supabase secrets set SEND_EMAIL_HOOK_SECRET=… RESEND_API_KEY=… RESEND_FROM=…`
4. Custom SMTP can be switched off afterwards — it is no longer in the path.

While the hook is on, an action with **no** template gets **no** mail, which is
why `templates.ts` covers every action type Auth can emit rather than only the
two in daily use.

---

## Deleting an account

The rule, and the reason a plain DELETE cannot work: **a round is not one
person's data.** A brief is a recipe written *for somebody else*, a ballot is
part of how a dish was ranked, a pairing is a link in a chain other people are
standing in. So the account is **anonymised, not deleted** — and the health
data, which is theirs alone, really is deleted.

| | What happens |
|---|---|
| Email, password, sessions | The `auth.users` row is deleted outright |
| Allergies and diets | Hard-deleted. Article 9 data, no trace |
| Push subscriptions, unanswered invitations | Hard-deleted |
| Name, avatar | Replaced by "Former guest" / "Ancien convive" |
| Rounds still in progress | **Left, exactly as if they had walked out**: `leave_round`'s rule, so where an assignment exists the host gets a DROPOUT alert and decides what the departure costs (`remove_member`) rather than the chain quietly tearing |
| Rounds already finished | Untouched — dishes, votes and results belong to everyone who was there |

**Thirty days**, disclosed in the interface, cancellable to the last day. The
rounds are left at the moment of erasure and not at the moment of asking, so
cancelling restores an account that never lost anything.
`purge-deletions.yml` is what notices the wait is over.

`0049` also drops the `profiles → auth.users` foreign key, and that is the
change that unblocks everything else, including **Delete user in the Supabase
dashboard** — which failed with `audit_log_actor_id_fkey` because deleting the
auth row cascaded into `profiles` and then hit the six tables that reference it
without a cascade. A trigger on `auth.users` anonymises the profile whatever
path deletes the account, so the dashboard and the admin API cannot leave a
real name and an allergy list attached to nobody.

One honest gap: Supabase access tokens are stateless and live about an hour, so
a token already in a browser keeps working until it expires. It belongs to the
person who asked for the deletion, which is why it is recorded here rather than
defended against on every write path.

---

## Push notifications

Mail is now only what Auth owns — **password reset and address change**.
Everything else that used to want an email is a notification instead.

**Six moments, and nothing else** (`0048`, `0052`):

| Moment | Who gets it | Sent when |
|---|---|---|
| Somebody is at the door | the host alone | a request to join arrives, or a seat is taken in a round that needs no approval |
| You are at the table | the one person who asked | the host approves them |
| Your cook has been chosen | everyone in the round but the host | the round reaches `ASSIGNED` |
| Your recipe has arrived | the one cook it was written for | its author submits — `0035` lands it then, so waiting for a phase would rebuild the stall `0035` removed |
| Voting is open | everyone but the host | the round reaches `VOTING`, **and only for an online ballot** — a hand-counted one is announced out loud by somebody standing up |
| The results are in | everyone but the host | the round reaches `RESULTS` |

Dinner starting, a settings change, a phase nudged backwards: silent. A
notification nobody acts on is how an app teaches people to ignore the ones
that matter.

**No push carries a name.** "Your recipe has arrived" never says who wrote it,
and the two at the door say how many, not who — the host's approval screen
shows the real name of whoever is asking, but that is a screen they chose to
open, not a lock screen a stranger reads over their shoulder. The text is
composed in the Edge Function precisely so no caller can put a name on one. The
dinner's name is carried, because a host running two of them needs to know
which door this is.

The two door moments are addressed by **membership**, not by round, and
authorised in SQL: you may announce your own arrival and nobody else's, and
only the host of that seat's round may announce that it was approved.

The switch in the profile is **one switch, all dinners, all devices**. The
subscription rows are per browser because that is what the Push API gives us,
but the decision is an account-level column, so turning it off on the phone
silences the laptop too. Per-dinner preferences are v2.

Web push, in the app as installed from the browser — no store involved.
Android delivers it in a tab or installed; **iOS only in an app added to the
home screen** (16.4+), which is the platform rule the settings screen explains
rather than works around. A refused permission is permanent, so the prompt is
raised by a button and never on page load.

- `0047` holds the subscriptions, one row per browser rather than per person,
  written only through RPCs — an insert policy would let a client claim
  somebody else's endpoint.
- `src/sw.ts` is now a hand-written service worker (`injectManifest`), because
  a generated one has nowhere to put a `push` listener. It reproduces the
  precaching and the `/rest/v1/` GET cache the generated one did.
- `supabase/functions/send-push/` composes the text server-side and reads the
  audience with the service key. Endpoints and keys never reach a browser.

Setup: generate a VAPID pair (`npx web-push generate-vapid-keys`), put the
public half in Netlify as `VITE_VAPID_PUBLIC_KEY`, then
`npx supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:…`
and `npx supabase functions deploy send-push`. Rotating that pair silently
kills every existing subscription.

### When nothing arrives

There are seven links between a dinner and a lock screen and, until `0056`,
six of them failed the same way: the phone stayed quiet. **Profile →
Notifications → "Notifications are not arriving?"** asks each one separately
and then sends a real notification to your own devices — the only push in the
app that goes to the person who triggered it, and the only proof that the whole
chain works.

The three that are not bugs, and account for most reports:

- **You are the only one testing.** `push_audience_for_round` excludes whoever
  caused the notification, on purpose — being interrupted by your own button
  press is noise. A host stepping their own dinner through every phase is
  correctly excluded from all four of them and will never receive a thing. The
  self-test exists because of this one.
- **iOS in a Safari tab.** The Push API is simply absent until the app is added
  to the home screen and opened from that icon. Apple's rule, not ours.
- **Brave.** Web push there rides on Google's service, which Brave ships
  switched **off**: Settings → Privacy and security → "Use Google services for
  push messaging". Until that is on, registration succeeds, the subscription
  looks perfect, and nothing is ever delivered. Chrome on the same phone works,
  which is what makes it look like a site bug.

The three that are: no `VITE_VAPID_PUBLIC_KEY` on the deployment (the switch
reports itself unavailable); the Edge Function missing its secrets (`send-push
is not configured` — invisible in normal use, because every real notify() call
swallows its errors so a dinner never looks broken); and a subscription the
browser holds but the server never stored, which the test repairs before it
sends.

`no-worker` is the seventh: the service worker never registered, which private
windows enforce outright. It used to present as the settings screen saying
"Checking what this device can do…" for ever, because `navigator.serviceWorker
.ready` neither rejects nor times out — it is now raced against a six-second
timeout so the screen can say what happened.

---

## Time, and why the database says `+00`

Every `_at` column here is `timestamptz`, and the thing worth knowing is that
**`timestamptz` does not store a time zone**. It stores an instant. The `+00`
in the Supabase table editor is that session rendering the instant, and
Postgres sessions there default to UTC.

So a sign-up at 17:11 in Paris in summer, read back as `15:11+00`, is not two
hours wrong — it is the same instant spelled in another zone, the way 5 km and
3.1 miles are the same distance. Nothing was lost and nothing needs correcting.

**Why the server is not set to Paris.** It could be — `alter database … set
timezone = 'Europe/Paris'` changes what new sessions render, the dashboard
included — and it would still not be a fix:

- there is no "the" time zone for an app whose diners are not all in one place,
  and picking one only moves the confusion to whoever is not in it;
- it would move things that are not about display at all. `current_date` and
  the `::date` casts in `0001`, `0015`, `0019` and `0030` decide which *day* a
  fridge note or an invitation belongs to, and pinning the server to Paris
  redraws that boundary at 22:00 or 23:00 UTC depending on the season.

UTC on the server is not a default nobody got round to changing. It is the one
choice with no opinion about where anybody is standing.

**The conversion happens in the browser**, which is the only participant that
knows the answer: the phone knows its own zone and knows about summer time.
`new Date(iso).toLocaleString(locale)` renders the stored instant as 17:11 in
Paris and 11:11 in New York from one row, with no zone stored anywhere and
nothing to migrate when somebody travels. `src/lib/datetime.ts` holds the
formatters and the reasoning; the locale is passed explicitly (the account's
choice, not the phone's) and the zone deliberately is not.

The one value that travels the other way is the dinner's date and time, typed
into a `datetime-local` input: that one *is* in the typist's own zone, and
`new Date(value).toISOString()` is what turns it back into an instant.

---

## Branches, and why there isn't a `test` one

The obvious shape for this is a long-lived `test` branch: feature branches off
it, merge them in, try everything there, promote to `main` when it works. It is
what most people describe when asked, and for one person shipping this app it is
the wrong answer.

**A long-lived integration branch has to be merged twice.** Every change goes
into `test` and then into `main`, which means every conflict is resolved twice,
and the second resolution is the one nobody is paying attention to. The two
branches drift — a hotfix on `main`, a half-finished experiment on `test` — and
after a fortnight "promote to `main`" stops being a merge and becomes an audit.
That cost is real for a team of six. For one person it buys nothing at all,
because there is nobody to isolate from.

**What actually separates a test from production here is the database, not the
branch.** Nothing on `main` can break a dinner on its own; a migration can. So
the boundary that matters runs between the local Supabase stack and the
deployed project, and it is already there.

So: `main` is what is deployed. Work on a short-lived branch named for the thing
it does, keep it open for days rather than weeks, and delete it when it merges.
That is what `claude/feature-recipe-book-y2tqc0` is, and it is the whole
convention.

**Where to try things, in the order they cost anything:**

1. **The local stack.** `npx supabase start` + `npx supabase db reset` +
   `npm run dev`, with `.env.local` pointing at `http://127.0.0.1:54321`. Free,
   instant, and safe to destroy. Nearly every question is answered here.
2. **The SQL smoke tests**, for anything that is really a database question.
   Twelve files, no browser, and they run against a bare Postgres.
3. **A Netlify deploy preview**, which you get per pull request for nothing and
   which is the only way to test the things a local build cannot reach — the
   real service worker, an installed PWA, push on an actual phone.
4. **A second Supabase project as staging**, if and when a migration ever
   frightens you enough to want one. Free tier, one extra set of env vars in
   Netlify. Worth doing before the first migration that touches live dinners;
   not worth doing before that.

The one rule that is not optional: **a migration reaches the deployed database
before the frontend that needs it does.** Everything in the "database is
behind" banner above exists because that order got reversed once.

---

## CI/CD & required GitHub configuration

The three workflows in `.github/workflows/` (`keepalive.yml`, `backup.yml`,
`purge-deletions.yml`) read from GitHub repo **Settings → Secrets and variables →
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
| Secrets | `SUPABASE_SERVICE_ROLE_KEY` | `purge-deletions.yml` | Supabase → Project Settings → API (**service role** — full bypass of RLS, a Secret and never a Variable, and never in the frontend). Missing it fails the run as a 401 saying "No API key found in request", which reads like a broken endpoint: GitHub resolves an unset secret to an empty string and the header goes out blank. The workflow now checks first and says which name is missing |
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

The app now says this out loud rather than leaving it in the console: any
`PGRST202` raises a banner above every screen naming the cause and the two
commands that fix it (`src/components/SchemaMismatch.tsx`). **`PGRST202` never
means the function name is wrong** — PostgREST only reports functions the
calling role can see, so it means the database in front of you does not have
the migration that function arrives in. `display_name_available` is `0046`,
the recipe book is `0058`, the album is `0060`: an app pointed at a database
that stopped at `0045` fails on the first of those, at sign-up, and looks
like the login is broken.

**"Edge Function returned a non-2xx status code" is the same kind of lie.** That
sentence is the SDK's, and the function's own answer — which says what is
actually wrong — was on the error object where nothing read it;
`src/lib/functions.ts` now reads it, for every function call in the app.

**And when a function is reached but still answers non-2xx, read the runtime's
own log before anything else:**

```bash
docker logs supabase_edge_runtime_covertcook --tail 50
```

Three lines together mean one specific thing, and it is not what it looks like:

```
serving the request with supabase/functions/verify-turnstile
wall clock duration warning: isolate: …
early termination has been triggered: isolate: …
```

The function was found, started, and **killed for taking too long**. It is not
missing and it did not fail to deploy. The usual cause is a remote import: an
Edge Function fetches its imports on every cold start, so one
`import … from 'https://esm.sh/…'` makes that function depend on the container
being able to reach a package registry — and on a machine where it cannot
(restricted Docker networking, a proxy, a firewall, no internet) the isolate
hangs on the import until the runtime kills it. `verify-turnstile` therefore has
**no imports at all**: it makes one INSERT, and one INSERT does not need a
client library. `send-push` and `send-email` keep theirs, because they genuinely
need them and neither stands between somebody and a seat at a table.

To see what a database actually has, ask the CLI rather than guessing:

```bash
npx supabase migration list            # local stack
npx supabase migration list --linked   # the deployed project, side by side
```

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
setup and invitations, `smoke_test7.sql` the board plus allergens
informing rather than blocking, and `smoke_test8.sql` what a recipe must
contain (`0055`) plus the push self-test's audience (`0056`) — its first
section is the exact recipe that used to come back as
`violates check constraint "briefs_check1"` — `smoke_test9.sql` the
results menu (`0057`) and the recipe book (`0058`), including the two cases
that are invisible when they break — a dish nobody cooked still reaching the
menu, and a second save writing nothing — `smoke_test10.sql` moderation by seat
(`0059`), `smoke_test11.sql` the album (`0060`), whose bucket policies are
the one thing in the set that needs a running local stack rather than a bare
Postgres, `smoke_test12.sql` the twenty-one-day deletion (`0061`, `0062`) —
where the *survivors* are the point, not the deletion: it proves the book and
the album still hold everything after the dinner they came from is gone — plus
joining with and without a captcha (`0063`), and `smoke_test13.sql` the canned
phrases arriving in the reader's language (`0064`) and the cost settlement
summing to exactly zero (`0065`).

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
`smoke_test13.sql`.

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
- **Everybody reads in their own language** (`0064`). The canned phrases exist
  so that two people who share no language can still talk at a dinner — and
  until now a message stored the id of *one locale's* row, so a French cook's
  "goûte avant de servir" reached an English diner in French, which defeated the
  entire point. A message now references the thought and the reader's own locale
  chooses the sentence. Applies to the fridge, to the private threads, and to
  the reported phrases the host has to make a decision about.
- **Shared costs** (`0065`, labelled Pro). A budget each, agreed when the
  dinner is created — before the roulette, so it shapes the recipes people
  write rather than judging their receipts afterwards. Everybody records what
  they spent beside the shopping list they were given, and at the end the app
  says who should hand what to whom, split evenly to the cent. **While the
  dinner runs, nobody sees anybody else's number**: your own, the table's
  average and the budget. The average is the steering signal; a per-person
  leaderboard about money between friends is the argument the feature exists to
  prevent.
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
- **Results & reveal**: the evening printed as the menu it was — courses as
  sections, the score where a price would be, the dinner's first place sealed,
  and a dish that never arrived struck off rather than missing (`0057`). Plus
  the actual twist: each player's two chats unmask automatically, revealing who
  cooked for whom.
- **The recipe book** (`0058`): at the end of a dinner the menu arms, you tap
  the dishes worth keeping, and one confirm copies them into a book in your
  profile — searchable, filterable, exportable as text or JSON. The recipe is
  **copied** so it outlives the dinner; the author is a **reference**, so
  somebody who later erases their account becomes "Former guest" rather than
  staying named in ten other people's books. This is also the app's one
  deliberate exposure: `briefs` has no SELECT policy at all, and
  `list_round_recipes` is the only thing that has ever opened somebody else's
  recipe — gated on membership and on the results actually being published. It
  says who *wrote* each dish and never who *cooked* it, because those two facts
  side by side are the chain.
- **Moderation, by seat** (`0059`): a reported phrase reaches the Executive
  Chef with the seat it came from and the pseudonym that seat wore — never a
  name, because knowing the author first is how an opinion of somebody decides
  whether their message was out of line. They can warn the seat (read on the
  dinner's own page, dismissed deliberately) or remove it from the roster. The
  one act that hands over a name refuses without a written reason and writes
  itself to `audit_log`. Anybody can block anybody from the board without
  learning who they are: their phrases and photographs go, and neither of you
  can take a seat where the other already is. The host is told there is
  something waiting, by push and by a count in the header. Policy at
  `/legal/moderation`.
- **Finished dinners delete themselves** (`0062`): twenty-one days after a
  dinner is archived or cancelled, the whole round goes — the chain, the
  threads, the ballots, the roster. What survives is what somebody chose to
  keep: every recipe in their book and the photograph they added to the album,
  both of which are **copies** precisely so this can be true (`0058`, `0061`).
  The date is printed on the dinner and on its card in the list while it still
  exists, next to what you keep. Run by a scheduled workflow, like the account
  purge.
- **The album** (`0060`): one photograph of the table per person per dinner,
  gathered into an album of every evening. Location data is stripped **in the
  browser** before a byte is uploaded — a phone photograph carries the address
  it was taken at — by decoding and re-encoding rather than by editing tags, so
  what is left is pixels and nothing else. The bucket is private and reading
  goes through short-lived signed URLs, so no photograph outlives the app in a
  URL somebody pasted somewhere.
- **Host tools**: round settings (venue/date/time), pause or cancel a
  round, a roster with approve/reject/remove, a spoiler-gated view of the
  whole assignment chain, and an inbox for player-reported issues.
  Approvals show the real name of whoever is asking to join — a decision
  about a pseudonym is a decision about nobody — and the name gives way to
  the pseudonym the moment they're in. That name is unique across the app
  since `0046`: it is checked while you type at sign-up (free, taken) and
  held by a case-insensitive index, so an approval is never a choice between
  two identical strangers.
- **A finished dinner is a record**: once a round is `ARCHIVED` or
  `CANCELLED`, every table that belongs to it refuses writes — the name, the
  date, the roster, the courses, the recipes, the board, the ballots. Enforced
  by triggers rather than by a check in each RPC (`0054`): there are a dozen
  write paths and the one that gets forgotten is the hole. The move *into*
  archived is the last write a round accepts. The Executive Chef keeps the
  title and loses the powers, and the interface says so rather than offering
  controls that would only produce a refusal.
- **Leaving a dinner**: while the door is still open you simply go, and the
  round moves to your archive. Once the lottery has run, three other people's
  evening is built on your pairing, so leaving becomes a request the Executive
  Chef answers — marked in their own roster, withdrawable until they do, and
  answered with the same choice below. A round you left or were removed from
  stays visible among your past dinners rather than vanishing (`0050`).
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
- **Telling people the round moved** — half done. Push now exists (`0047`,
  `src/sw.ts`, `send-push`) and fires when the Executive Chef advances the
  dinner, for whoever has switched it on. What is still missing is the
  asynchronous half `ROADMAP.md` §1 argued for: email to the people who are
  not looking at the app, and to everyone who never turns notifications on.
- **Outbound email** — invitations already work in-app without it, so this
  is now only for reaching people who aren't looking at the app. Blocked
  on a provider key.
- **A public deletion request URL** — the in-app path exists (`0049`), but
  Google Play also wants a page a person can reach *without* installing the
  app. It is a form and an inbox, not a schema change.
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
- ~~Bot protection (Turnstile) has a dev-only bypass~~ — **removed in `0063`.**
  It was never really a dev-only bypass: with no `TURNSTILE_SECRET_KEY` set, the
  edge function accepted a placeholder token the frontend had invented, from
  anybody, in production as readily as on a laptop. What made it look necessary
  was that joining a dinner went through that function *even with no captcha to
  verify* — so a local stack whose edge runtime was not up answered `503` and
  nobody could take a seat.
  The question now lives in the database: `app_settings.captcha_required`,
  false by default. With it false the frontend never calls the function and
  `join_round` asks for no ticket; with it true a real token is verified
  against a real secret and a missing ticket is refused. **Turn it on in the
  same breath as setting the keys** — a site key with the flag off collects
  tokens nothing checks.

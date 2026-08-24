# Distribution — stores, APK, and what it actually costs

`ROADMAP.md` §4 sketched the Play Store in half a page and decided one
thing (purchases happen on the web). This file is the full version: the
four ways this app can reach a phone, what each one really demands, what
each one really costs, and in what order they're worth doing.

**Nothing here is decided** — same rule as `ROADMAP.md`. Every figure is
a real 2026 price or a defensible estimate, and estimates are labelled as
such. Where a rule changes often (store policy, tax thresholds), it says
so: check before spending.

---

## 0. What we are actually shipping

The app is a **PWA** — React + Vite, a service worker, a web manifest,
deployed on Netlify against Supabase. That single fact decides most of
this document:

| Route | What it is | Rewrite needed? |
|---|---|---|
| **A — PWA install** | "Add to home screen" from the browser. Works today. | None |
| **B — APK download** | The same PWA in an Android shell, hosted as a file on our own site | None (Bubblewrap generates it) |
| **C — Google Play** | The same Android shell, published | None |
| **D — Apple App Store** | A real native container (Capacitor), because Apple will not accept a thin wrapper | None of the app; a real container and some native surface |

A, B and C are the same artefact at three levels of ceremony. D is a
different kind of project, and the difference is not technical — it's
Apple's review guideline **4.2 Minimum Functionality**, which rejects
apps that are "a repackaged website". That's the single biggest risk in
this whole document, and it's a judgement call made by a human reviewer.

---

## 1. The blockers that come before any store

None of these are store-specific. They're the things that are currently
"not built yet" and that a store turns from *nice* into *mandatory*.
Nothing below can be skipped by choosing a different route.

| Blocker | Why a store forces it | Where it stands |
|---|---|---|
| ~~Production database is behind~~ | The app has to actually work when a reviewer opens it. | **Done — `0015`→`0045` deployed 2026-08-24** |
| **Turnstile dev bypass** | A placeholder token that disables bot protection cannot ship to a public listing. | Known, `README.md` "Known simplifications" |
| **Own domain** | Play's TWA verifies ownership via `/.well-known/assetlinks.json`; both stores want a support URL and a privacy URL that look like a product, not `*.netlify.app`. | Not bought |
| **Privacy policy + terms at public URLs** | Mandatory for both stores, and they must match what the app really collects. | Drafts exist at `/legal/*`, unreviewed |
| **Legal review** | The drafts have never been read by a lawyer, and the app collects **allergy and dietary data** — GDPR Article 9 special category. Both stores make you declare this. | Open |
| **In-app account deletion** | Google Play requires an in-app path *and* a web URL to request deletion. Apple guideline 5.1.1(v) requires deletion from inside the app. Not "email us". | Not built. Now on the list, with the data model reviewed and the blocker found — **§10** |
| **Outbound email** | A password reset or an invite that silently fails is a review rejection and a support burden. | Blocked on a provider key |
| **Real icons + store assets** | Icons at every size, a 512×512 store icon, a feature graphic, screenshots per device class. | Placeholders |
| **UGC obligations** | The moment free-text chat opens, both stores require: a way to **report** content, a way to **block** a user, published moderation terms, and a contact. Canned templates today = safe. Free-text = this is required *before* it ships. | Chat is templates-only today |

**Read that last row twice.** "Free-text chat" is high on the `README.md`
build list, and it is the item that turns this from a small app into a
platform with content-moderation duties. If a store listing is the goal,
those two pieces of work are now coupled: ship chat and you owe report,
block, and a moderation policy in the same release.

Rough effort for the whole column, part-time: **2–4 weeks**, of which the
migration deploy is an afternoon and the legal round-trip is calendar
time, not work.

---

## 2. Route A — stay a PWA

Cost: **€0.** Already works. Installable on Android and, since iOS 16.4,
installable on iOS with web push once it's on the home screen.

What it doesn't get: discoverability (nobody searches a browser for a
dinner app), the trust signal of a store listing, and on iOS the install
flow is a share-sheet item most people have never used.

Worth keeping as the baseline whatever else happens. Every other route
points at this same deployment.

---

## 3. Route B — an APK to download

Bubblewrap wraps the PWA in a Trusted Web Activity and emits a signed
APK. Host it on the site, people download it.

**Cost: €0** (plus the domain from §1).

What it costs in ways that aren't money:

- **Nobody auto-updates.** A TWA loads the live site, so *content* updates
  itself — but the shell doesn't. Any change to the shell means people
  re-download by hand, and most won't.
- **Play Protect warns on install.** "Unknown sources", an unfamiliar
  developer, a scary dialog. Expect to lose a real share of non-technical
  installers right there.
- **The signing key is now yours forever.** Lose the keystore and you can
  never update that APK, and you can never later publish the *same* app
  to Play under that key. Back it up somewhere that isn't the laptop.
- **Sideloading is getting harder, deliberately.** Google has been rolling
  out a requirement that apps installed on certified Android devices come
  from a **verified developer**, sideloaded or not, with a free tier for
  hobbyists. Timelines and terms have moved more than once — **check the
  current state before betting the distribution strategy on APKs.**

**Verdict: useful as a private beta channel** — send it to the eight
people at the first dinner — and a poor public strategy. If you're doing
the verification dance anyway, $25 buys the real listing.

---

## 4. Route C — Google Play

The wrapper is the easy half. The account is the slow half.

### One-time and recurring money

| Item | Cost |
|---|---|
| Play developer account | **$25 once** (~€23) |
| Domain (shared with everything else) | €12–20/yr |
| Everything else | €0 — the build is free, the listing is free |

### The part nobody budgets: the 12-tester rule

A **personal** (non-company) Play developer account created recently must
run a **closed test with at least 12 testers who stay opted in for 14
continuous days** before it can even apply for production access. Then
the application itself is reviewed.

That is not €0 of effort. It is twelve real humans with Google accounts,
recruited, opted in, and not dropping out — and if you fall below twelve
the clock restarts. For an app whose whole premise is "get eight friends
around a table", it's achievable, but plan it as **a 3–4 week calendar
item, started early**, not a formality at the end.

A company account (with a registered legal entity and D-U-N-S-style
verification) skips the 12-tester rule. That's a reason to open one *if*
a legal entity exists for §7 anyway — otherwise it's a heavier hammer
than the problem.

### The other recurring obligations

- **Identity verification** — a real name and address, verified.
- **EU trader status (DSA).** Distributing in the EU means declaring
  whether you're a trader, and a trader's **name, address, email and phone
  are published on the listing**. A private individual selling nothing can
  declare non-trader; the moment §7 turns on, you're a trader, and your
  contact details are public. If that address is your home, this is the
  point to get a legal entity or a registered business address.
- **Data safety declaration** — email, display name, **and dietary/allergy
  information**, declared honestly. This is the row that must not be
  fudged.
- **Target API level, every year.** Google raises the floor annually;
  the wrapper must be rebuilt and resubmitted or the listing stops being
  served to new devices. Budget **half a day a year, forever.**

### Effort

Wrapper + assetlinks + icons + listing + screenshots: **3–5 days** of
actual work, spread across the tester clock.

---

## 5. Route D — Apple App Store

This is where the plan stops being cheap, and it's the one to decide
consciously rather than by momentum.

### Money

| Item | Cost |
|---|---|
| Apple Developer Program | **€99/year, forever** — no free tier that publishes |
| A Mac to build on | €0 with cloud CI (see below), or €600–800 for a Mac mini |
| Cloud build minutes | €0–30/mo — free tiers exist (Codemagic, EAS, GitHub-hosted macOS runners); a private repo burns macOS minutes at 10× the Linux rate |

### The real cost is guideline 4.2

Apple rejects "a repackaged website with no native functionality". A
Capacitor build of this PWA, submitted as-is, is a plausible rejection.
Getting through means giving it reasons to be an app:

- native push notifications (which §1 of `ROADMAP.md` argued against on
  product grounds — here it comes back as a *store* requirement);
- offline behaviour that is genuinely useful (the recipe card and shopping
  list already want this);
- share sheet, home-screen widget, camera for dish photos, haptics,
  calendar integration for the dinner date.

Each of those is real work — call it **2–4 weeks** to build enough native
surface plus the container, and then **1–7 days per review round**, with
rejections likely on the first pass.

### The other Apple-specific items

- **Privacy nutrition labels**, including the health-adjacent allergy data.
- **In-app account deletion** — §1, and Apple is strict about it.
- **UGC rules** if free-text chat exists — filtering, reporting, blocking,
  and a published contact.
- **EU trader verification**, same as Play: verified details, publicly
  displayed on the product page.
- **Sign in with Apple** is required if you offer other third-party
  social logins. Email/password only — as today — avoids it.

### Verdict

**Not next.** The €99/yr is trivial; the 4.2 risk and the native surface
are not. iOS earns its place when there is evidence people want it —
i.e. after Play is live and hosts are asking. Until then the iPhone story
is "add to home screen", which already works.

---

## 6. What the whole thing costs, in three scenarios

Costs are per year unless marked once. Excludes your own time.

| | **Minimal** (PWA + private APK) | **Play** | **Play + iOS** |
|---|---|---|---|
| Domain | €15 | €15 | €15 |
| Play account | — | €23 once | €23 once |
| Apple program | — | — | **€99** |
| Hosting (Netlify + Supabase free) | €0 | €0 | €0 |
| Email (Resend free tier: 3k/mo) | €0 | €0 | €0 |
| Legal — template service | €30–100 | €30–100 | €30–100 |
| Legal — lawyer review (recommended once money moves) | — | €400–1,200 once | €400–1,200 once |
| Store assets (DIY) | €0 | €0 | €0 |
| Build infra | €0 | €0 | €0–360 |
| **Realistic first-year total** | **€15–115** | **€70–1,350** | **€170–1,800** |
| **Steady-state per year** | **€15–115** | **€45–115** | **€145–475** |

The spread is almost entirely **the lawyer** and **whether you buy a Mac**.
Everything the platforms charge — $25 once and $99/year — is the small
part. That's the headline answer: *the stores are cheap; the obligations
around them are what cost.*

Two things that can change the picture later, both usage-driven, not
launch-driven: Supabase Pro at **$25/mo** when the free tier's idle-pause
stops being tolerable (see `ROADMAP.md` §3), and Resend at **~$20/mo**
past 3,000 emails a month (~125 dinners).

---

## 7. Monetisation — and why it is a separate decision

`ROADMAP.md` §2 already settled the product side: **per-dinner unlock
bought by the host, flavour only, free stays a whole product**, ~€3 a
dinner or ~€12 for five. Nothing here changes that. What follows is only
what *charging money* costs on top.

### The store rules

The §4 decision holds and gets stricter on iOS:

- Selling a digital unlock **inside** an app means the store's billing and
  the store's cut — **15%** for both, under Apple's Small Business Program
  and Google's first-$1M rate.
- Selling **only on the web** avoids the cut, but both stores restrict
  *steering*: the app must not contain a purchase button, a price, or a
  link that reads as one. Apple is stricter than Google here, and EU
  DMA-era rules on external purchase links keep moving.
- **Consequence for the build**: the unlock has to be something the host
  buys on the site and that is simply *already there* when the app opens.
  Supabase auth spans both, so this part is free.

### The part that actually costs money: being a seller in Italy

This is the honest answer to "quanto costa davvero", and it dwarfs the
store fees.

- **Selling digital goods continuously is a business activity.** Not
  *prestazione occasionale* — that's for genuinely one-off work, and a
  storefront taking €3 payments all year isn't. It means a **partita IVA**.
- Opening one is free; **keeping** one is not: a commercialista for a small
  *regime forfettario* runs **€500–1,200/year**.
- **INPS gestione separata** contributions of roughly **26%** on the taxable
  base, plus **5% substitute tax** for the first five years of forfettario.
- **EU VAT on digital goods is owed in the buyer's country from the first
  euro** — there is no small-seller threshold for cross-border digital
  sales. Either register for **OSS** and file, or use a **Merchant of
  Record** (Paddle, Lemon Squeezy) that becomes the seller and handles VAT
  for **~5% + ~€0.50 per transaction**. For a solo developer the MoR is
  worth every cent of the difference against Stripe's ~1.5% + €0.25.
- Plus consumer-rights obligations: refunds, right of withdrawal, and the
  legal pages that §1 already listed as unreviewed drafts.

### The number that should decide it

A €3 unlock, sold through a Merchant of Record, nets about €2.35. After
forfettario tax and INPS, roughly **€1.85 reaches you**.

Against a monetised setup's fixed costs — call it €700–800/year with the
accountant and Apple in it — break-even is around **380–430 Pro dinners a
year**. At eight people a dinner, that's a few thousand people having
CovertCook evenings annually.

**Recommendation: do not monetise at launch.** Below a few hundred paid
dinners a year, charging money *costs* money, and it converts a project
with zero obligations into one with an accountant, a VAT position, a
published home address, and refund duties. Build the Pro features if
they're fun to build, keep them free while the audience is friends, and
turn the till on only when the traffic makes the arithmetic work. Nothing
in the §2 design has to change to wait — a per-dinner unlock can be
switched on at any time.

---

## 8. Hypothetical order of work

Each phase is only worth starting if the previous one landed. Durations
are part-time-evenings estimates, and the calendar is longer than the
effort wherever someone else is in the loop.

**Phase 0 — make it real (2–4 weeks).** ~~Deploy the migrations~~ (done,
2026-08-24). Buy the domain, point Netlify at it. Wire the email provider.
Remove the Turnstile bypass. Build **account deletion** (§10 — the largest
remaining item, and a schema change). Run the legal pages past somebody
qualified. Draw the real icons.
*Gate: a stranger can sign up, run a dinner, and delete their account.*

**Phase 1 — the private APK (3–5 days).** Bubblewrap, assetlinks,
signed build, keystore backed up in two places. Hand it to the friends
who'll be the first table.
*Gate: it installs and runs on somebody else's phone.*

**Phase 2 — Play (3–5 days of work, 4–6 weeks of calendar).** Open the
$25 account and **start the 12-tester clock immediately** — it's the
long pole. Meanwhile: store listing, screenshots, data safety, content
rating, non-trader declaration. Then production review.
*Gate: publicly installable from Play.*

**Phase 3 — decide about iOS (a conversation, not a task).** Only if
people are asking. Then: Capacitor container plus the native surface that
answers guideline 4.2, €99/yr, and expect rejections.
*Gate: evidence of demand, not enthusiasm.*

**Phase 4 — the till (only past the §7 arithmetic).** Partita IVA,
Merchant of Record, web-only checkout, unlock entitlement in Supabase,
refund flow. Weeks of work and a permanent administrative floor.

**The annual chore, from Phase 2 onwards:** rebuild for Google's new
target API level. Half a day. Forever.

---

---

## 10. Personal data: where it is, what it does, and what deletion touches

A store listing forces two things that need the same piece of homework: an
honest **data safety / privacy label**, and a working **delete my account**.
Both need to know exactly what the database holds about a person. This is
that map, read off the migrations, plus the design it implies.

### Where personal data actually lives

| Where | What it holds | Sensitivity |
|---|---|---|
| `auth.users` (Supabase-managed) | Email, password hash, sign-in timestamps | Identifying |
| `profiles` | `display_name`, `avatar_url`, `locale`, and an **`anonymised_at` column that nothing writes to yet** | Identifying |
| `dietary_entries` | Allergies, diets, dislikes, free-text `note` | **GDPR Art. 9 special category** |
| `round_members` | `secret_name`, join/leave/removal timestamps, `board_seen_at` | Pseudonymous |
| `rounds` | `host_id`, plus `location`, `city`, `notes`, `dinner_at` — where and when real people met | Identifying by inference |
| `briefs`, `brief_ingredients` | Free text one player wrote *for another* | Content, pseudonymous |
| `messages`, `round_messages` | Author links; canned templates only today | Pseudonymous — **changes the day free-text chat ships** |
| `ballots`, `ballot_items` | `voter_id` — who voted, and how they ranked | Pseudonymous |
| `results`, `awards`, `manual_tally` | Aggregates only; `manual_tally` deliberately counts hands, never who raised them | Not personal |
| `invites` | A nullable **`email` column**, legacy since in-app invitations (`0019`) replaced it | Identifying, probably dead |
| `round_invitations` | `profile_id`, `invited_by` — cascades on profile delete | Pseudonymous |
| `audit_log` | `actor_id` and a free-form `payload jsonb` | **Unknown until audited** — a jsonb blob cannot be declared honestly to a store without reading what goes into it |
| `turnstile_tickets` | `subject`, which can be an email. Rows expire after 10 minutes but **nothing deletes them** | Identifying, and accumulating |

Two of those rows are jobs in themselves: **audit what `audit_log.payload`
actually carries** before writing any privacy label, and **give
`turnstile_tickets` a cleanup** — an expiry that no job enforces is a
retention policy that doesn't exist.

### The blocker: deleting a user is currently impossible

`profiles.id references auth.users (id) on delete cascade`, and
`dietary_entries` cascades from `profiles`. So far so good. But
`round_members.profile_id`, `rounds.host_id`, `invites.created_by`,
`round_invitations.invited_by` and `audit_log.actor_id` reference profiles
with **no cascade at all**.

The consequence, concretely: calling Supabase's delete-user on anybody who
has ever joined a round fails on a foreign key. "Delete my account" is not
a button waiting to be wired — it needs a schema decision first.

### Why hard deletion is the wrong answer anyway

A round is not one person's data. Cascading a player away would take their
pairings, their brief, their ballot and their place in the chain with them
— and destroy the record of an evening that seven other people also lived.
Their brief is a thing they wrote *for someone else*, sitting in that
person's history.

The standard resolution applies: **anonymise irreversibly, and hard-delete
only what is genuinely theirs alone.** Once the link to a person is severed
beyond recovery, what remains is no longer personal data, and that
satisfies erasure. The unused `anonymised_at` column says this was the
original intention.

### The three ways out

| Option | What it means | Verdict |
|---|---|---|
| **A — scrub in place** | Keep both rows. Blank the auth user's email to an unroutable value and ban it; overwrite `display_name` with a neutral token; null the avatar; stamp `anonymised_at`. | **Recommended.** Smallest change, no FK surgery, nothing else in the app has to learn a new shape. |
| **B — split identity** | `profiles` stops being keyed by the auth id and gains a nullable `auth_user_id`, so the auth row can be deleted outright. | Cleanest model, worst refactor — every RLS policy compares `auth.uid()` to a profile id today. |
| **C — cascade everything** | Make the member and round FKs cascade or null. | **No.** This is the option that deletes other people's dinners. |

### What "delete my account" would have to do, under A

1. **Refuse or resolve first, don't silently break a live dinner.** Someone
   hosting a round that hasn't reached `RESULTS` has to hand it over or
   cancel it; a player in an in-flight round leaves it first. Both paths
   already exist — `leave_round` (`0004`) and `remove_member` with the
   host's choice of what a departure costs (`0016`). Deletion should reuse
   them, not invent a second way to tear a chain.
2. **Hard-delete `dietary_entries`.** Art. 9 data, useful to nobody else,
   no reason to keep a trace.
3. **Anonymise the profile**, stamp `anonymised_at`, neutralise the auth
   row so the address can never be used to sign in or be mailed again. The
   uniqueness index added in `0046` is partial (`where anonymised_at is
   null`) precisely so every retired profile can wear the same neutral
   token instead of the second one colliding with the first — and so the
   name they gave up returns to the pool for somebody else.
4. **Leave the round record standing** — members, briefs, ballots, results.
   Past rounds then show a neutral "former guest" where a name used to be,
   including in the final reveal. That is a product decision and it belongs
   in the privacy policy in plain words, not as a surprise.
5. **A disclosed grace period** (30 days is the norm, and both stores allow
   it) so a mis-tap is recoverable, then irreversible.
6. **A public web URL** that starts the same process, because Google
   requires one that works without installing the app.
7. **Backups.** Nightly dumps rotate; erasure propagates as they age out.
   Say the rotation window in the policy rather than implying the data
   vanishes everywhere the instant the button is pressed.

### Open questions, worth deciding once

- Does a deleted host's round keep its name and location, or does that get
  neutralised too? (It identifies a place and a date, but it is also seven
  other people's evening.)
- Is the neutral token per-round (so an anonymised person isn't trivially
  re-linkable across rounds by their `secret_name` history) or global?
- Does free-text chat, when it ships, become deletable content on request —
  and if so, does deleting it leave a tombstone in the thread?

Effort, estimated: **3–5 days** for the RPC, the schema touch-ups, the
settings screen and the web endpoint, plus the audit of `audit_log.payload`
and the turnstile cleanup. It is the largest single item left in §1.

## 9. The short version

- Getting on **Google Play costs $25 once, with no annual fee and no
  rewrite** — the PWA is already the app. The expensive parts are the
  12-tester clock, an honest data safety declaration about allergy data,
  and account deletion, which §10 shows is a schema change and not a
  button.
- **A downloadable APK is free and mostly a beta channel**, not a
  distribution strategy — no shell updates, Play Protect friction, and
  sideloading is being tightened.
- **iOS is €99/yr and a genuine project**, because Apple won't take a
  wrapped website. Defer it until someone asks.
- **First year, realistically €70–1,350 for Android**, and the spread is
  the lawyer, not the platform.
- **Monetising is the expensive decision, not the store listing.** Fixed
  costs of roughly €700–800/year mean break-even near 400 paid dinners.
  Below that, keep it free — and lose nothing, because §2's design can be
  switched on whenever the numbers arrive.

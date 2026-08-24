# Roadmap — beyond v2

Product and infrastructure decisions that aren't about the interface.
`PRESENTATION.md` owns the UI redesign, `README.md` owns how the thing
works today; this file is where the "and then what" lives.

**Nothing here is decided.** Each section states the question, the
constraints that are actually real, and a recommendation — so the
decision can be made once rather than re-argued.

---

## 1. Notifications: email or push?

Neither, first — **the question is the wrong shape**. There are three
moments worth telling people about, and they don't have the same
urgency or the same audience:

| Moment | Where the player is | Right channel |
|---|---|---|
| You've been invited | Not in the app at all | Email — it's the only channel that exists yet |
| Recipes are open / due | Anywhere, over several days | Email |
| Voting is open | **Sitting at the table, in the room** | Somebody says it out loud |
| Results are published | Anywhere, minutes to hours later | Email or in-app |

The one moment that genuinely needs *instant* delivery — voting opening
mid-dinner — is the one moment when everyone is **physically in the same
room**. The Executive Chef can announce it. Push notifications buy
almost nothing there, and everything else is comfortably email-shaped.

### The quota is not the constraint

At 3 notified transitions × 8 players, a dinner costs ~24 emails.
Against the free tier that's roughly **4 dinners a day, 125 a month** —
far past where this app is, and the daily cap bites before the monthly
one. Invitations add a handful more. If it ever gets tight, digesting
"results are in" or dropping the least useful transition recovers a
third of it before any paid plan is needed.

### Why not push, concretely

- **iOS only delivers web push to PWAs added to the home screen.** For a
  mobile-first app that's a prerequisite disguised as a feature, and
  roughly half the audience is affected.
- A declined permission prompt is **permanent** — that user is
  unreachable, and there's no fallback unless email exists anyway.
- It needs a subscription table, VAPID keys, service-worker handling and
  a sender. Email needs a sender, which is already on the build list for
  invitations.

**Recommendation: build email, skip push for v2.** Not because email is
better — because it's already required for invitations, works on every
device with no install and no permission dance, and the single moment
push would win is the moment people are sitting together anyway. Revisit
push only if async reminders measurably fail to land.

### Superseded, 2026-08-24: push shipped, and email shrank

What changed is not the argument but the platform. The app is installed on a
home screen, which is the prerequisite iOS imposes, so push works with no
store listing — and the table above was reasoning about a channel that then
cost a subscription table, a permission dance and a rewrite of the service
worker. It now costs none of those, because they exist.

The split as built (`0047`, `0048`):

- **Push** carries the four moments worth interrupting for: your cook is
  chosen, the recipe you must cook has arrived, online voting opens, results
  are published. One account-level switch, all dinners, all devices.
- **Email** is now only what Auth owns — password reset and address change.
- **Still unbuilt, and still email-shaped**: the invitation, and reaching
  people who never switch notifications on. The "somebody says it out loud"
  row survives intact: the dinner itself is not notified about.
- **Per-dinner notification preferences are v2**, and deliberately: they need
  a per-round row and somewhere in the round UI to set it, and neither is
  worth building before anyone has been annoyed by the global switch.

---

## 2. A paid tier

The stated principle is right and worth protecting: **free has to be a
complete experience, not a demo**. Everything below is judged against
that.

### Who pays matters more than what's sold

Two models, and the choice shapes everything:

- **Per-user subscription** — bad fit. People host a dinner like this a
  few times a year. A monthly charge for occasional use is a churn
  machine, and it splits a single table into paying and non-paying
  players, which is exactly what must not happen.
- **Per-dinner unlock, bought by the host** — much better fit. The host
  is already the one investing effort; everyone at that table gets the
  upgraded round, so the experience never splits mid-dinner. Priced
  against the evening itself (each guest is already spending €15–20 on
  ingredients), a few euro from the organiser is noise.

**Recommendation: per-dinner unlock, sold to the host.** A pack of
several dinners at a discount for people who do this often. Somewhere
around €3 a dinner, or €10–15 for a pack — cheap enough not to think
about, real enough to be worth building.

### Which features can be sold, and which shouldn't

| Idea | Verdict |
|---|---|
| **Table styles / personalisation** | **Best candidate.** The tablecloth is the identity — blue check, linen, butcher paper, seasonal. Pure flavour, zero mechanical effect, obviously desirable, and it scales forever without design debt. |
| **Pseudonym themes** | **Yes.** Same logic: flavour only. Already specced as v2 in `PRESENTATION.md`. |
| **Changing your public name** | **Yes, and it arrived on its own.** The name became a unique handle in `0046`, which is exactly what makes changing it worth something — and what makes it cost something, since the old one is released for somebody else to take. Flavour, not mechanics: nobody plays a worse game because their neighbour renamed themselves. |
| **Two recipes per brief** | **Acceptable, because it's round-level.** The host buys it and every player in that round gets it, so nobody at the table has a worse game than their neighbour. It would be a bad paid feature if it were per-player. |
| **Global leaderboard** | **Push back.** It needs a persistent cross-round identity, which fights the anonymity the whole product is built on, and it changes why people play — optimising a score rather than cooking something funny for a friend. If some form is wanted, keep it per-group and opt-in, not global. |
| **Help build v3** | **Keep, but as recognition, not a feature.** An early-supporter credit costs nothing and suits a product about a shared table. |

### Why the LOL/SMITE model doesn't transfer cleanly

Buying cosmetics forever is the right *instinct* — it's the model that
respects players — but it works in those games because of **frequency and
audience**: you see your skin every day, and nine other people see it
every match. Here a host runs maybe four dinners a year for eight people.
A tablecloth bought once and seen four times a year is poor value
however good it looks, and a small catalogue is exhausted in an evening
of browsing.

The fix is to **sell the evening, not the object**. A Pro dinner unlocks
*everything* for that round — every tablecloth, every pseudonym theme,
two-recipe mode — and the host picks the look to suit the occasion:
midsummer linen for August, butcher paper for a scruffy one, something
seasonal in December. Choosing per dinner is more fun than owning one
texture forever, the value is legible ("this evening, upgraded"), and the
catalogue can grow without anyone feeling they bought the wrong thing.

Packs make it painless: five Pro dinners for around €12, one for €3.

### Don't cap free dinners

The "free gets 3 or 5 dinners" idea contradicts the principle stated
alongside it — free stops being a complete experience and becomes a
trial. Worse, it misfires socially: when a host hits the cap, **the whole
table loses the app**, not just the host. The people most likely to
become future hosts are the guests who just had a good evening, and a
wall is exactly what stops that from happening.

Free should be **unlimited dinners** on the default red gingham, one
recipe per brief, food pseudonyms — a whole, unembarrassed product. Pro
sells delight, never access.

This also gives the growth loop for nothing: guests at a Pro dinner
experience the good tablecloth **for free**, as part of someone else's
evening. That is the demo, and it arrives at the exact moment they're
enjoying themselves.

### What paying actually obliges you to

Worth knowing before, not after: taking money means EU VAT handling for
digital goods, refund and consumer-rights obligations, and a payment
integration with its webhook. It also makes the privacy and terms work
**mandatory rather than pending** — which it already is on the "not built
yet" list. Budget it as a real slice of work, not a button.

---

## 3. Self-hosting instead of Supabase + Netlify

A friend's suggestion: buy hardware, run it at home, reach it remotely —
a mini datacentre. Honest answer: **not for this app, and probably not
for a while.**

### What it would actually cost

Today's hosting bill is **zero**. A home server is hardware (€200–500)
plus roughly €5–15 a month in electricity running 24/7, plus every hour
of your own time spent on TLS certificates, DNS, patching, backups and
the network. It doesn't become cheaper — it becomes differently
expensive, paid in attention.

### What it would actually risk

- **Uptime, at exactly the wrong moment.** This app is used in bursts:
  eight people voting at 22:40 on a Saturday. A home connection or power
  cut during that window isn't degraded service, it's the evening
  ruined, and there's no failover to fall back to.
- **Security, on data that isn't ordinary.** The database holds real
  names, emails and **allergy and dietary information** — health-adjacent
  data that in the EU is treated as a special category. Exposing
  Postgres and an auth service from a home network raises the stakes well
  above a hobby project's.
- **Backups become yours.** Today a scheduled job dumps the database
  nightly and rotates it. At home, that's a thing you now own and must
  remember to test.

### What the real pain point is

The pressure that makes self-hosting look attractive here isn't cost,
it's the free tier pausing an idle project — which is why a keep-alive
job exists at all. That's solved by a paid Supabase plan for about €25 a
month, not by a rack in a spare room.

**Recommendation: no.** If the free tier starts to bite, the next step is
the paid managed plan. If *that* ever exceeds roughly €100 a month, then
self-hosting deserves a real look — and even then the sane version is a
€5/month VPS running self-hosted Supabase, not hardware at home: same
control, real uptime, someone else's electricity and network.

---

## 4. Getting onto the Play Store

> Superseded in detail by [`DISTRIBUTION.md`](./DISTRIBUTION.md), which
> covers all four routes (PWA, APK, Play, App Store), the real costs, the
> obligations a store adds, and what monetising would cost in practice.
> This section stays as the summary and the record of the one decision
> already taken (purchases happen on the web).

Very doable, and cheaper than expected — the app is already a PWA, so it
doesn't need rewriting. Android wraps a PWA in a native shell via a
**Trusted Web Activity**, generated with Bubblewrap. The store listing
points at the same site that's already deployed.

What it needs, roughly in order:

- A **Google Play developer account** — $25, one time.
- A **verified domain link** (a Digital Asset Links file the app checks),
  so the wrapper opens without a browser bar.
- **A privacy policy at a public URL** — mandatory, and currently on the
  "not built yet" list.
- **A Data safety declaration** listing what's collected. Be careful and
  accurate here: this app collects email, a display name, and dietary and
  allergy information. That last one has to be declared honestly.
- **Real icons** at the required sizes (current ones are placeholders)
  and a store listing with screenshots.
- Passing the installability and PWA criteria the wrapper depends on.
- An annual chore: Google raises the required target API level every
  year, so the wrapper needs rebuilding periodically or the listing goes
  stale.

### The one thing that connects this to section 2

**Selling digital unlocks inside a Play Store app means Google's
billing and Google's cut** (15–30%). Selling them only on the web avoids
that, but Play has rules about steering users out of the app to pay, and
they change.

**Decided: purchases happen on the web, not in the app.** The listing
stays a way to be found and installed; buying a Pro dinner is something
you do on the site. Two consequences to build around from the start: the
app must never contain a purchase button or a link that reads as one
(that's the steering rule), and the account has to be the same on both
sides so an unlock bought on the web is simply *there* when the app
opens. The second part is free — Supabase auth already spans both.

iOS is a separate and stricter story, and worth treating as its own
decision rather than assuming it follows.

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

---

## 5. The recipe book

**Nothing is built.** The question asked is the right one and it has a
gate in front of it that decides the whole shape.

### The gate: nobody can read anybody else's recipe today

`briefs` has **no SELECT policy at all** — not a narrow one, none. The only
reader is `get_my_brief`, which returns the recipe written *for you*. The
ballot shows dish names, never bodies. So "collect the recipes of the other
chefs" is not a feature that reads existing data: it needs a **new, deliberate
exposure**, an RPC that opens every brief of a round to its members once that
round has reached `RESULTS`.

That is defensible — after the reveal, who wrote what is announced, everyone
has eaten every dish, and the secrecy has done its job — but it is a change to
what the app has promised so far, so it is a decision and not an implementation
detail. **Recommendation: yes, gated on `RESULTS` and on membership**, because
the alternative (each person can only keep the one recipe they cooked) makes a
book of four entries a year, which nobody opens twice.

### Copy the recipe, reference the person

**Revised.** Reference-only was the right answer while rounds were permanent.
Since old dinners may eventually be deleted, a book of references would empty
itself the day that happens — the one outcome a recipe book must never have.

So the entry splits in two, and the split is the whole design:

- **The recipe is copied.** Title, ingredients, method, link, allergen tags —
  frozen at the moment of saving. It is text, it is not personal data in any
  meaningful sense, and it must outlive the dinner it came from. A saved
  recipe is a copy in your kitchen, not a bookmark to somebody else's.
- **The author is a reference.** `profile_id`, never a snapshot of their name.
  Erasure anonymises a profile, and a frozen name would keep somebody in ten
  other people's books after they asked to be forgotten. Referenced, they
  become "Former guest" there — which is exactly what erasure is for.
- **The pseudonym is copied**, because it is not an identity: "Chef Basilic"
  was the name you knew them by *that evening*, and it means nothing outside
  that dinner. It is a label on the card, never a filter (see below).

Cost of copying: a recipe saved by six people is stored six times. At a few
kilobytes each, six copies of a recipe is smaller than one photograph.

### Deleting from the book, and taking it with you

Two more things the sketch asked for, and both are right:

- **Delete an entry**, with a warning that says the truth: if the dinner it
  came from is gone, nothing can bring it back. That is a real
  irreversibility and the confirmation should say so rather than saying "are
  you sure".
- **Download the book**, and — separately — **download everything** before
  erasing an account. The second is not a nicety: GDPR Article 20 gives a
  right to portability in a structured, machine-readable format, and the
  natural moment to offer it is beside the delete button, not buried. Both
  are the same mechanism: an RPC that assembles the JSON, a file the browser
  saves. Recipes should come out as **both** — JSON for completeness and
  plain text/Markdown for a human who just wants to cook from it.

### What the design as sketched is missing

Six things, in the order they will bite:

1. **The pseudonym is per-round and reused.** "Chef Basilic" is a different
   person in every dinner. Storing it is fine as a label on the card — it is
   the name you knew them by that evening — but **filtering by it across the
   book is wrong**: it would group strangers together. The filter has to be on
   the real name, which is why the author stays a reference even though the
   recipe is a copy.
2. **The recipe you wrote is not the recipe you cooked.** Two different things,
   both worth keeping, and they need different labels. "Received" alone loses
   half of what a person made that evening.
3. **Ingredients live in their own table.** `brief_ingredients` is the shopping
   list; a saved recipe without it is half a recipe.
4. **`contains_tags` travels with it.** Cooking it again, for different people,
   makes the allergens matter again — the one piece of data in this app that
   is not decoration.
5. **Only submitted briefs, only finished rounds.** A draft is not a recipe,
   and a round short of `RESULTS` would leak an author.
6. **One save per recipe per person.** Unique on (profile, brief), or the
   button becomes a counter.

### The recipe as one thing

Shown as it will be cooked from: **name, ingredients, method, link if there is
one, allergen tags** — one card, not four fields. That means the ingredients
must be copied with it (`brief_ingredients` is a separate table today), and it
settles what "one save per person per recipe" means: the same recipe cannot be
saved twice by the same person, so the button is a switch and never a counter.

### What still needs deciding

1. **Where the save button lives.** The end-of-dinner menu is the obvious
   place — the full list of dishes is already there — but the same button has
   to exist inside the book for a recipe saved and then deleted by mistake.
   Probably: save from the menu, and nothing else.
2. **Whether the note is per-entry or per-recipe.** Per-entry: it is *your*
   comment on *your* copy.
3. **What happens to a recipe whose author never submitted it.** Nothing to
   save; the button should not appear.
4. **Sorting the book by default** — most recent dinner first, almost
   certainly, since that is what somebody is looking for after an evening.

### Is it too much work?

No, and the reason is that the filtering does not need a server. Ten saves a
dinner, a few dinners a year: a few dozen rows. Sorting and searching them
happens in the browser on data already loaded, so "filterable by cook, date,
dish" costs a text input and an `Array.filter`, not an index.

The real work is one migration (a `recipe_book` table plus the RESULTS-gated
RPC), a button on the results screen, and the book page. **One to two days.**

### Shape it in this order

1. **Save what you cooked and what you wrote** — no new exposure, works
   immediately.
2. **Save anybody's, from the results screen** — the RPC above; this is the
   inclusive version and the one worth having.
3. **Your own recipes, typed in** — the table stops being a list of references
   and gains rows that carry their own text. The day it also fills a brief you
   are writing, the book stops being an archive and becomes a tool.

---

## 6. Advertising

Asked as a hypothetical, answered with the arithmetic, because the arithmetic
is what settles it.

### What it would pay

This app is used in bursts: a host runs perhaps four dinners a year, eight
people each, and a person opens it a handful of times per dinner. Call it
~150 page views per dinner across the whole table — generous. At EU display
rates for non-commercial content (**€0.50–3 CPM**, and the low end is likelier
for an audience nobody is trying to sell kitchens to), a dinner produces
**€0.10–0.45**.

Against the same evening, the per-dinner unlock in §2 was priced at €3, of
which about €1.85 survives fees and tax. **Ads pay roughly ten times less per
dinner than one €3 unlock**, and they need the same traffic to get there:
break-even on the fixed costs in §2 would take something like **4,000 dinners
a year**.

### What it would cost, beyond the money

- **A consent banner.** EEA traffic needs a certified CMP before a single ad
  loads. The product's whole manner is a clean table; the first thing every
  guest would meet is a cookie dialog.
- **Ad tech next to allergy data.** This app holds Article 9 health data. Ads
  mean third-party scripts and identifiers on the same pages, and the burden
  of proving none of it leaks. That is a real audit, not a checkbox.
- **A real domain.** AdSense wants a site you own; a `*.netlify.app`
  subdomain is not one.
- **The tone.** A tablecloth with a banner on it reads as cheap in a way a €3
  unlock does not, and this product is almost entirely tone.

**Recommendation: no, and not later either at this scale.** Ads are a
volume business — they start making sense in the hundreds of thousands of
views a month, which is a different application with a different audience. If
this ever wants money, §2's per-dinner unlock is better per person, cheaper to
build, and does not put a stranger's script next to somebody's allergies.

---

## 7. What comes next, in the order it should be built

Written as steps rather than as a list of wants, because three of the things
below depend on the one above them and doing them in the wrong order means
building something twice.

### Step 1 — the results screen becomes a menu

No schema, no new data: the results already know the dish, the course and the
score. What changes is that they stop being a leaderboard and become **a menu
card**, courses as sections — starters, mains, desserts, drinks — with the
score printed where a price would be. A round in FREE mode has no courses, so
it is one carte générale instead. Nothing else in the app is a better fit for
the tablecloth than a menu, and it is the screen the evening ends on.

Doing this first is not aesthetics: **step 2 hangs its save button off this
screen**, so its layout has to exist before the button has anywhere to live.

### Step 2 — the recipe book

§5 has the design. Sequence inside it:

1. The table and the RESULTS-gated RPC that opens a round's recipes to its
   members.
2. The save flow on the menu: a switch that arms saving, the dish names
   inviting a tap, a wine ring marking each chosen one, one confirm that saves
   the lot, and a line saying where they went.
3. The book itself in the profile: one card per recipe, filters in the
   browser, delete with a warning that says the truth.
4. Export — the book, and everything, the second being what Article 20 asks
   for anyway.

### Step 3 — the host's alert centre

`host_alerts` already exists with the right kinds (`CANNOT_COOK`, `NO_BRIEF`,
`DROPOUT`, `REPORTED_MESSAGE`) and a page to read them. What is missing is
that nothing tells the host they are there, and that a reported message has no
answer beyond reading it.

**The design decision inside this one**, and it is the interesting one:
**moderate by pseudonym, not by name.** The host should see the message before
they see who wrote it — knowing the author first is how a host's opinion of a
person decides whether a message was inappropriate. And they do not need the
name to act: a warning is delivered to a seat, a removal removes a seat.
Identity is only needed to reach somebody outside the game, which is a
different and much rarer act — a deliberate reveal, logged in `audit_log`,
never a side effect of opening an alert.

This is also the work that satisfies the store requirement in
`DISTRIBUTION.md` §1: report, block, and a published moderation policy are
mandatory the day free-text chat ships, and this is where they live.

### Step 4 — the album, and only then any deletion

A photo of the table at the end, one per dinner, becoming an album of every
evening. Attractive, and the one feature here that changes the arithmetic in
§2 of nothing and §3 of everything: **text is free, photographs are not.**

Three things it drags in, none of them optional:

- **Storage, not the database.** A Supabase bucket with its own policies. The
  free tier is 1 GB; at ~200 KB a photo that is a few thousand dinners, which
  is further away than it sounds but not infinite.
- **EXIF.** A phone photograph carries GPS coordinates. Uploading one
  unstripped publishes the address of somebody's flat to everybody at the
  table. Strip it in the browser, before upload, always.
- **It is user-generated content.** A photograph is the kind of UGC the stores
  write their rules for; report and remove have to exist for it too, which is
  another reason step 3 comes first.

**And only after the album is real can old dinners be deleted.** The argument
for deletion is that a recipe worth keeping is in somebody's book and a dinner
worth remembering is in the album — both have to exist and be *used* before
that is true. Deleting first would prove it false.

# Presentation redesign — round page

**Status as of 2026-08-22: phases 0–3 built, phase 4 (Messaggi) is what's
left.** The round page is the tablecloth-and-envelopes design, round setup
and entry are rebuilt, and voting has its LIVE/TIMED behaviour. What
remains from this document is the board, free-text chat, and the
notifications phase — see `CHANGELOG.md`, "Where to pick up".

Everything below is the spec as agreed; sections describing built work are
kept because they record *why*, which the code alone doesn't say.

---

**Original status line: fully specced, ready to build, nothing waiting on a decision.**
This is the working spec for reorganising the round page's UI.
`README.md` stays limited to game logic and architecture — this file is
where the presentation/UX layer is worked out, so README doesn't grow to
cover both. Once a piece here ships, record it in `CHANGELOG.md` as
usual; trim or retire the corresponding section here once it's no longer
a "not yet built" spec but working code.

**Start at "Build order"** — five phases, 0 to 4, each independently
shippable. Everything else in this file is the detail those phases need.
"Settled" near the end lists what has already been decided, so it doesn't
get reopened by accident.

## Why

The round page state machine has 9 phases in Postgres (`DRAFT → OPEN →
LOCKED → ASSIGNED → BRIEFS_CLOSED → DINNER → VOTING → RESULTS →
ARCHIVED` — see `ROUND_PHASE_ORDER` in `src/lib/rpc.ts`), and that's
correct: the backend needs that precision. The problem is that
`RoundHomePage.tsx` renders all of it — host controls, player controls,
roster, dietary panel, assignment tools, phase advance — as one flat
vertical page, all sections visible at once regardless of who's looking
or what they actually need right now. This spec replaces that flat page
with a small set of collapsible drawers ("cassetti"), grouped by user
intent instead of by backend table. **No backend/phase-machine changes
implied by this file alone** — call those out explicitly per section
below where they exist.

## Entry flow

The home screen gains a third choice and is no longer unchanged — see
"Entry flow, restructured" under Round setup below. Round creation itself
is reworked too: "Round setup", immediately below.

## Round setup (creation flow)

Applies to `CreateRoundPage`. Status: design decided, not yet
implemented.

### Classic vs custom

On creation, the host picks:
- **Classic** — today's default: sotto-copertura anonymity, free-for-all
  recipes, voting on. One click, no further choices — this *is* the
  "simple by default" Design principle from `README.md`.
- **Custom** — expands the option groups below: visibility, voting and
  menu are live; tema chef and recipes-per-brief are shown disabled,
  reserved for v2.

### Two separate axes, easy to confuse

The creation form has always mixed up two different questions, and this
is worth naming before specifying either:
- **Chi può entrare** (`visibility`) — how someone gets a seat.
- **Chi vede chi** (`anonymity`) — what members know about each other
  once seated.

They're independent: a code-based dinner can still be fully anonymous, an
invite-only one can be wide open. Below they're specced separately.

### Chi può entrare (`visibility`)

Today's `PUBLIC_LINK` / `PRIVATE_CODE` split is **weak, and the
observation that it's repetitive is correct**: both options amount to
"share a code", so the two names describe the same act. Replace them with
a distinction that's actually about *how a person arrives*:

- **Con codice** — the host generates a code/link and shares it however
  they like. Anyone holding it can request a seat; `requires_approval`
  decides whether the host still vets each arrival. This is today's
  behaviour, renamed to say what it does.
- **Su invito** — the host names an existing user by the email address
  they signed up with, and that person gets an **in-app invitation** they
  can accept or decline. No code to leak or mistype. Solves the two
  problems flagged at the very start of this redesign: a wrong code typed
  by accident, and a right code forwarded to someone unwanted.

The two can coexist on one round — a host could invite the core group and
still generate a code for the last two seats. Modelling it as **two ways
of issuing an invitation rather than two mutually-exclusive round types**
is simpler than it sounds and avoids a setting nobody can change later.

**In-app, not outbound email — and that changes the plan.** The email
address is just the handle used to find an existing account; the
invitation itself is a row the recipient sees when they open the app.
That means this feature has **no dependency on the mail provider** and
can ship in phase 1 alongside the code path, rather than waiting on a
Brevo key like `send-invite` does. Sending an actual email is a later
nicety on top ("someone invited you, come and look"), not a prerequisite.

The one real limit: **you can only invite someone who already has an
account.** Inviting an address nobody has registered has nowhere to land,
so the form needs to say so plainly ("nessun chef con questo indirizzo")
rather than silently accepting it. Reaching people who *aren't* signed up
is exactly what the code path is for — which is a clean division of
labour, not a gap.

Note this leaks nothing new: a host inviting five addresses knows *who's
coming*, but still not *which pseudonym is whom* — the same knowledge
they already have from approving members.

### Entry flow, restructured

The home screen becomes three plain choices instead of today's
create/join pair:
- **Crea una cena**
- **Aggiungiti con un codice**
- **Inviti ricevuti** — the pending in-app invitations, each accept or
  decline. Shown with a count when there are any, hidden when there are
  none, so it never adds noise to a first-time screen.

New work: an invitations table (or a `round_members` status ahead of
`ACTIVE`), the invite/accept/decline RPCs, and the inbox itself.

### Chi vede chi (`anonymity`)

Extends today's `anonymity` enum (`ANONYMOUS`/`OPEN`) with a third value,
`SPY` (agreed):
- **Pubblico** (`OPEN`, existing) — everyone can see who everyone else is.
- **Spia** (`SPY`, new) — the host always sees every player's real name
  next to their active pseudonym; every other player only sees pseudonyms.
  This is a *new* capability, distinct from the existing chain-reveal
  gate (`host_saw_chain_at`): that gate is about the sender→cook pairing
  chain; this is about the roster's identity mapping. The two stay
  independent — a "spia" host still has to explicitly reveal the chain to
  see who's cooking for whom.
- **Sotto copertura** (`ANONYMOUS`, existing) — nobody knows anyone,
  matches today's behaviour exactly.

Needs: one new enum value, plus a host-only RPC/RLS path that returns the
real `display_name` alongside `secret_name` for every active member when
a round is in "spia" mode — same shape as the Chefs-drawer approval fix
(see the main "Drawers" section above), but persistent for the whole
round instead of just the approval moment.

**Redacted until the round starts** (agreed — a thick black marker bar,
not a blur). While iscrizioni are open, other players see arrivals struck
out like a classified file; the roster resolves when the host advances.

Redaction beats blur on two counts. It reads as a *deliberate act* —
someone decided to cover that name — which suits the game, whereas a blur
reads like a rendering glitch. And a blur still shows **word length and
shape**, which in a group of eight is often enough to guess; an opaque
bar shows nothing. It also removes the join-order leak: watching who
appears first tells you who arrived first, a real hint in a small group.

**One rule that matters more than the styling: the bar is a drawing, not
a protection.** If the real name reaches the browser and is covered with
CSS, anyone who opens devtools reads it. The covered name must never be
sent at all — the bar sits over data the server withheld. This is already
the house principle (`README.md`: the browser is assumed hostile), and
it's exactly the kind of feature where it would be easy to forget.

Applies **to players only**: the host still needs readable identities to
approve arrivals — the phase 0 fix. So during iscrizioni the host sees
real names, everyone else sees bars, and after the advance everyone sees
pseudonyms.

### Voting

Today's `voting_enabled` boolean becomes a `voting_mode` enum with three
creation-time values (agreed): `LIVE` / `TIMED` / `DISABLED`.
- **Durante la cena** (`LIVE`) — host launches voting live; while it's open, the
  host sees only a submission percentage, never individual votes (extend
  the existing `getRoundProgress` pattern — built for briefs — to
  ballots); once voting closes, the host sees results first and
  explicitly decides whether/how to share them (in-app reveal vs. reading
  them aloud) — a host-gated "publish results" action, same shape as
  `host_saw_chain_at`, not an automatic reveal on entering `RESULTS`.
- **Post cena** (`TIMED`) — a deadline (5m/10m/1h/3h/24h, same mechanism
  as the Voto drawer above), results available to everyone the moment it
  expires.
- **No** (`DISABLED`) — no voting at all, matches today's
  `voting_enabled = false`.
  The creation form must show an inline notice next to this option
  ("il voto non sarà accessibile né modificabile per questa cena") so the
  host isn't surprised later by the missing buttons — this choice is
  final, same as it already is today.

**The complication**: this is meant to be changeable *during* the dinner,
not just at creation — a real deviation from how every other round
setting works today (`slot_mode`, `anonymity`, `requires_approval`,
`voting_enabled` are all set once, no update RPC; `advance_phase` bakes
the decision in at the `DINNER → VOTING`/`RESULTS` transition). Making
the *stored setting* live-editable would mean teaching `advance_phase` to
re-check it on every transition instead of deciding once — a change to
the core phase machine, not a form field.

**Recommendation**: don't make the stored setting itself editable.
Instead, treat the creation-time choice as the default plan, and give the
host manual override actions that never touch that stored value: "skip
voting for this round" (jumps straight to results, same effect as if it
had been configured `No`) and "open voting now" (the same live-launch
action `Durante la cena` already has, usable even on a
`Post cena`-configured round). This gets the flexibility asked for
("non obbligatoria") without rewriting how `advance_phase` decides
anything — new host buttons, not a new state to keep in sync.

**This only works one way.** Both override buttons only ever appear on a
round created as `Durante la cena` or `Post cena` — i.e. only *within*
"Sì". A round created as `No` shows neither button: `0013_optional_voting.sql`
doesn't just skip `VOTING`, it explicitly rejects any attempt to enter it
for a `voting_enabled = false` round, on purpose, already tested. Making
`No` reversible would mean disabling that guard — the exact core-phase-
machine change this recommendation exists to avoid. So `No` at creation
stays final, same as every other create-time-only setting; the live
flexibility is only ever "which flavour of yes, and when," never
"no → yes."

### Tema chef (secret-name theme)

Deferred to v2 — shown in the creation form but disabled/greyed out for
now (default stays "food", today's spice/herb list). Orthogonal to both
axes above — no logic conflict, just needs the themed word lists built.

Planned themes: **animali**, **cibo** (current default), **mestieri di
cucina** (the station list below — Saucier, Pâtissier, Écailler…).

**Agreed: the brigade theme uses station names only — no ranks.** The
Executive Chef is the organiser and stands apart; every pseudonym below
sits on the same level, exactly like no herb outranking another in the
current list. So no Chef de Cuisine, no Sous-chef, no Commis, no
Plongeur: those encode seniority, and being handed "dishwasher" while
someone else gets "head chef" reads as a ranking in a game where all
players are equal.

Station names solve it and there are more than enough — 24, matching the
current food list's size, so a dinner of any realistic size is covered:

| | | | |
|---|---|---|---|
| Saucier | Poissonnier | Rôtisseur | Grillardin |
| Friturier | Entremetier | Potager | Légumier |
| Pâtissier | Boulanger | Confiseur | Glacier |
| Chocolatier | Décorateur | Garde-manger | Boucher |
| Charcutier | Fromager | Écailler | Trancheur |
| Tournant | Aboyeur | Communard | Limonadier |

Four more real ones bring it to **28** if headroom is wanted: **Tourier**
(pastry doughs), **Hors-d'œuvrier**, **Volailler** (poultry), **Cafetier**.

All are genuine positions in the classical French brigade, all describe
*what you cook* rather than *who you outrank*, and the obscure ones are
the ones most likely to raise a smile — the Aboyeur calls the orders, the
Communard cooks the staff meal, the Écailler shucks the shellfish, the
Limonadier handles the drinks.

**What happens at player 29** — asked directly, and the answer is better
than expected: **nothing needs inventing, and nothing breaks.**
`assign_secret_name` already retries on collision and, after 50 attempts,
appends three random characters ("Chef Saucier a3f"). Ugly in the extreme
case, safe always.

Three things worth knowing before treating this as a problem:
- **The ceiling already exists.** The current food list is 24 words, so a
  25-seat dinner hits exactly the same path today. This is not something
  the brigade theme introduces, and whatever we decide should be one
  answer for every theme.
- **No invented titles.** `Sous-saucier`, `Saucier 2`, `Chef de partie` as
  a filler — all either fake or a rank, and both break the rule the theme
  was chosen for. Real roles only, as agreed.
- **28 is past any real dinner.** Every player cooks and brings a dish;
  a 29-dish buffet isn't a dinner party any more. The list only has to
  clear the largest plausible evening, and it does.

If more headroom is ever genuinely needed, the lever already exists and
isn't a fake title: `assign_secret_name` builds names as *prefix + word*,
and the prefix is currently hardcoded to "Chef" for every locale (the
`case` there has two identical branches — a dead conditional worth
tidying whenever that function is next touched). Varying the prefix
multiplies the list without inventing a single new role.

Note the **Executive Chef** label for the organiser is separate from all
this and applies under every theme — it's the role name, not a pseudonym.

### Menu (course slots)

Not new — this is exactly today's `slot_mode` (`FREE`/`CATEGORIES`),
already locked at creation with no update path. Keeping it immutable is
correct and already how the code works: `CATEGORIES` mode needs the
course assignment to exist before a brief can be written, so allowing it
to toggle on after creation would mean retrofitting slots onto briefs
that may already be free-form. No change needed beyond the classic/custom
UI wrapper.

### Recipes per brief (v2, shown but disabled)

Deferred to v2 — like tema chef, present in the custom form but not
clickable, defaulting to 1.

- **1 recipe (default)** — today's behaviour.
- **2 recipes** — each sender writes a main recipe plus a fallback; the
  cook prepares **one**, using option 2 only if option 1 turns out not to
  be feasible. Never two dishes cooked.

Making this a **round-level setting rather than a per-brief choice is the
right call** and better than where this spec had it before: it keeps the
round internally consistent (either everyone gets a fallback or nobody
does), which matters for fairness and keeps the ballot uniform — every
pairing still produces exactly one voted dish either way.

When it's built it still needs: an `option_index`/`chosen_option` shape
on `briefs` (today one row per pairing), `get_ballot_options` and
`compute_results` filtering to the chosen option, and one behavioural
decision — whether picking is mandatory before cooking, or option 1 is
the default if the cook never picks.

Note the **ack button stays in v1** (drawer 2): with a single recipe it
just means "seen, understood, no problem," which is useful on its own and
independent of this setting.

## One set of drawers, two audiences

Host and player see the **same drawers**. The host gets extra controls
embedded inside the relevant drawer rather than a separate admin area
(decided over the alternative of a standalone "Regia" section) — this
mirrors the `isHost` conditional blocks already used today in
`RoundHomePage.tsx`, just organised per drawer instead of dumped flat on
one page.

## Progress bar

Two simplified views of the same 9 DB phases — the phase machine itself
doesn't change, only what's shown at the top of the page:

- **Player** (3 steps): Iscrizione (`DRAFT`+`OPEN`) → Ricetta
  (`LOCKED`…`DINNER`) → Voto (`VOTING`).
- **Host** (4 steps): Iscrizioni → Attribuzione → Ricette → Voto —
  `LOCKED` gets its own step because it's a distinct explicit host action
  (roulette), invisible to players as anything but a wait.

The three end states the bar doesn't have a step for:
- **`RESULTS` / `ARCHIVED`** — every step shown complete, and the bar
  hands over to the Voto e risultati drawer, which becomes the round's
  centre of gravity. The evening is over; the bar's job is done.
- **`DISABLED` voting** — the last step is dropped rather than shown and
  skipped, matching how `visiblePhaseOrder` already filters `VOTING` out
  today. A player never sees a step that can't happen.
- **`CANCELLED`** — no bar at all, just the plain statement that the
  round was cancelled. This is what `RoundTimeline` already does today
  and it should survive the redesign rather than be rediscovered as a
  crash.

### Cancelling doesn't delete — and that's deliberate

A cancelled round is a **status, not a deletion**: the row stays, and so
do its members, briefs and messages. That's the right default — several
people's writing lives in a round, and one person cancelling shouldn't
erase what the others wrote. It also keeps "cancelled" reversible in a
way "deleted" never is.

But it has a consequence nobody has handled yet: **cancelled rounds never
leave "le mie cene".** `useMyRounds` filters on membership, not on round
status, so a cancelled dinner sits in the list with a badge forever, and
someone who tries a few dinners accumulates clutter that can't be
cleared.

Fix, small and worth doing in phase 1 while the entry screen is already
being rebuilt: **split the list into current and past**, with cancelled
and `ARCHIVED` rounds folded into a collapsed "cene passate" section
rather than shown inline. Nothing is destroyed, nothing is in the way.

## Drawers

### 1. Chefs

- Full roster of active/approved participants (secret names) — this
  already exists (`RoundHomePage.tsx` roster block), just moved into its
  own drawer.
- The current player's two relationships highlighted (circle/badge): who
  they write a brief for, who writes theirs. **Not** where recipes are
  read or written — that's drawers 2 and 3.
- Host-only, embedded here:
  - Pending-approval list, Approve/Reject (existing).
  - **Open bug to fix as part of this redesign**: the roster shows
    `secret_name` even for unapproved members (`RoundHomePage.tsx:191`),
    which defeats the point of a human approval step — the host is
    approving someone they can't identify. Fix: show the real
    `display_name` for members pending approval, switch to `secret_name`
    only once approved. No anonymity regression — pre-approval members
    aren't in the game yet.
  - "Attribuzione ruoli" tool: course-slot configuration + roulette
    launch (`generate_assignment`) — belongs here because it's
    fundamentally about the participant list, not a separate step.
  - **Departures are a choice, not an automatic repair** (built, `0016`).
    Once the chain exists, removing a cook always costs one dish; which
    one is the Executive Chef's call:
    - **Ricollega** (`COLLAPSE`) — close the chain around them, A now
      writes for B. Everyone keeps a dish to make, but B is handed a
      different recipe than the one they already have. Better early.
    - **Lascia com'è** (`LEAVE`) — change nothing but the roster. B keeps
      cooking exactly what they were given; the brief written *for* the
      departing member goes uncooked. Nobody is disturbed. Better late,
      once people have shopped.

    Arrivals are the mirror image and already worked this way:
    `splice_member` breaks the chain at one point and inserts the newcomer
    there, leaving every other pairing untouched. No change needed.

    Both only apply after assignment. Before it there is no chain to
    repair and the modes are indistinguishable, so the UI shows one
    button.

### 2. Mia Ricetta

- Existing brief editor fields, unchanged: theme/course, title,
  ingredients as bullets, procedure, external link.
- **Two recipe options per brief: deferred to v2.** Now specced as a
  round-level creation setting (see "Recipes per brief" under Round setup
  above), shown disabled in the custom form. When a round eventually
  turns it on, this drawer becomes a 2-card grid instead of one card, and
  the ack button doubles as the picker.
- **Ack button under the recipe** — kept, and worth having on its own:
  it means "seen, understood, no problem," giving the sender (and the
  host's pairing overview) a signal that's currently missing entirely.
  Cheap, no schema drama: one nullable `acknowledged_at` on the brief.
- `CANNOT_COOK` keeps today's meaning: this recipe doesn't work for me.
  (It would only have shifted to "neither option works" if the 2-option
  feature had shipped.)
- Reminder line of the group's allergy/diet tags (existing, cross-refs
  the dietary panel).
- Host-only, embedded here: pairing overview — who's written/submitted/
  missing a brief. Existing (`getRoundProgress`), just relocated from the
  flat page into this drawer.

### 3. Ricetta Ricevuta

- Same layout family as "Mia Ricetta" but read-only and visually
  distinct, so the two are never confused mid-glance.
- Chat thread embedded directly below (already the case today in
  `CookViewPage.tsx`).
- "Non posso cucinare" quick action (existing `CANNOT_COOK` template).

### 4. Messaggi

This drawer holds **two different things**, and they stack rather than
compete for the same space: the **bacheca** (round-wide, unattributed,
fixed phrases) sits at the top, and **your two conversations** — with the
chef you write for and the one who writes for you — below it. Board
first because it's public and always readable; conversations below
because they're personal and only two. No tabs: on a phone, tabs hide
half the drawer behind a control nobody notices.

For the host, the alerts inbox (`/alerts`) opens from the bottom of this
drawer.

- **v1: canned templates *and* free text, both available from the
  start.** This is a conscious, documented departure from the anonymity
  principle in `README.md` ("canned-template-only chat... so writing
  style can't out someone") — accepted knowingly, not an oversight.
  Needs: `messages.template_id` made nullable, a `body`/free-text column
  added, a check constraint requiring exactly one of the two, and
  `send_message` updated to accept either. The existing report/moderation
  flow (`reportMessage`) is unaffected — it works the same regardless of
  message shape.
- **v2 (later, after real usage data): narrow back toward canned-first.**
  The intent was always templates as the primary path; free text is the
  interim/parallel option while the template set gets tuned by observing
  which messages people actually send.
- The ingredient-substitution template's parametrised slot
  (`ChatThread.tsx`'s `slot_type` mechanism) could pull from the current
  brief's real ingredient list via a dropdown instead of free text, once
  it's worth the extra query — small upgrade, not a new mechanism.
- An "ask the host for help" template category that also raises a
  `host_alerts` entry — the alerts pipeline already exists
  (`0014_brief_pairing_and_alerts.sql`, `/alerts` inbox); this just needs
  a template hook wired to it.
- **Round-wide "pozzo comune" broadcast — now in scope** (moved in from
  out-of-scope). A group channel everyone in the round can read and post
  to, from a short list of ready-made upbeat phrases (deliberately
  cheerful and slightly absurd, to make people smile — the phrases
  themselves are drafted below).

  **Build it as its own table, not by loosening `messages`.** Today
  `messages.pairing_id` is `not null` and every row carries a `direction`
  (`SENDER_TO_COOK`/`COOK_TO_SENDER`) — neither concept applies to a
  broadcast. More importantly, `messages` is one of the tables with **no
  player-facing SELECT policy, ever**, enforced by `REVOKE` at the grant
  level (see `README.md` key characteristics), precisely because pairing
  messages would leak sender identity before the reveal. A broadcast is
  the exact opposite: meant to be visible to everyone immediately. Mixing
  the two in one table would mean adding an "unless it's a broadcast"
  branch to every one of those guards — the highest-risk possible place
  to add a special case. A separate `round_messages` table
  (`round_id`, `author_member_id`, `template_id`, `created_day`,
  `reported`) keeps the existing protections untouched and needs its own
  simple RLS policy: readable by any approved member of that round.
  - **No attribution shown — it's a board, not a conversation.** Posts
    appear as bare phrases ("forza a tutti!"), with no name attached.
    Showing the pseudonym would only tell you *"Chef Patata said X"* —
    which identifies nobody, adds nothing, and quietly works against the
    anonymity design: a pseudonym accumulating a voice across many posts
    is exactly the kind of pattern the canned-template rule exists to
    prevent. Unattributed also frames the feature correctly — a shared
    noticeboard of good vibes, not a group chat.
  - **The author is still stored, just never sent to clients**
    (`author_member_id`), so the host can still act on a reported post.
    This is the house pattern already used everywhere else: the data
    exists in Postgres, the RPC strips it on the way out (`README.md`,
    key characteristics). Player-facing reads return the phrase and the
    day, nothing more.
  - Optional nicety, decide at build time: collapse duplicates with a
    count ("3 chef hanno detto questo") instead of repeating the same
    phrase — reinforces the board feel and costs one `group by`.
  - The existing report/moderation flow applies here too — the same
    `reported` flag shape, surfacing in the host's `/alerts` inbox.

#### Broadcast phrases (drafting space)

Write the phrases here; they get turned into seed rows exactly like the
existing chat templates in `supabase/migrations/0010_seed.sql`
(one line each, per locale — that file's header notes new phrases only
ever need an insert, never a redeploy). FR + EN are the two locales the
app currently ships.

Starter set below — enough to build and seed phase 4 without waiting.
Add, cut or reword freely; more can be inserted later without a redeploy.

| # | IT (draft) | FR (ship) | EN (ship) |
|---|---|---|---|
| 1 | Che bella giornata! | Quelle belle journée ! | What a lovely day! |
| 2 | Non bruciatevi un dito ai fornelli! | Ne vous brûlez pas les doigts aux fourneaux ! | Try not to burn a finger at the stove! |
| 3 | Ricordati di salare. Poi riassaggia. Poi risala. | N'oublie pas de saler. Regoûte. Resale. | Remember to salt. Taste again. Salt again. |
| 4 | Se cade per terra hai cinque secondi. Nessuno ha visto. | Tombé par terre ? Tu as cinq secondes. Personne n'a rien vu. | Dropped it? Five-second rule. Nobody saw anything. |
| 5 | Il fumo che esce dal forno fa parte della ricetta. | La fumée qui sort du four fait partie de la recette. | The smoke coming out of the oven is part of the recipe. |
| 6 | Assaggia prima di servire. Ti prego. | Goûte avant de servir. S'il te plaît. | Taste it before serving. Please. |
| 7 | Se non sai cosa manca, è il burro. | Si tu ne sais pas ce qui manque, c'est le beurre. | If you can't tell what's missing, it's butter. |
| 8 | Mi piacciono le persone che dicono buongiorno. | J'aime les gens qui disent bonjour. | I like people who say good morning. |
| 9 | Che bel vestito, davvero. | Quelle belle tenue, sincèrement. | Great outfit, honestly. |
| 10 | Ho tutto pronto. Forza a voi! | J'ai tout de prêt. Courage à vous ! | Everything's ready on my end. Good luck to you! |

House rule for future phrases: **no jokes about health conditions**. This
app carries severe allergies to the table by name, so that the person they
belong to can decide for themselves — a punchline about diets or illness
reads badly right next to that, however affectionately meant. Everything
else is fair game.

### 5. Voto

- Drag-and-drop ranking — already built (`BallotPage.tsx`, `@dnd-kit`),
  unchanged.
- Which of the three voting modes (durante la cena / post cena / no) a
  round runs is decided at creation — see "Round setup" above — with
  host override buttons ("skip voting" / "open now") covering the
  mid-dinner flexibility, instead of the stored setting itself being
  edited. Resolves the open question this section used to flag.
- Live mode: submission-percentage progress for the host while voting is
  open (extends `getRoundProgress`, see "Round setup" above), then a
  host-gated "publish results" action before anyone else sees them.
- Timed mode: results available to everyone automatically once the
  deadline passes — no host action needed.
- Reveal semantics: whenever results open (live-published or
  timer-expired), the mapping piatto = cuoco = voto is revealed all at
  once, for everyone, at the same time. Distinct from the dish list shown
  *during* voting (dish names only, no cook identity — that's
  `get_ballot_options` today).
- Vote editable until the deadline — **new**; `submitBallot` today is a
  one-shot submit that rejects a second call. Needs the "already
  submitted" guard relaxed into an "update while before deadline, else
  reject" check.
- Host-only, embedded here: the deadline picker (5m/10m/1h/3h/24h) reuses
  the generic phase-deadline mechanism already in `0006_phases.sql`
  (on-read check + cron-driven advance) rather than building a new timer
  system.

### 6. Allergie

- Global to the user's profile, not per round (decided). This drawer
  just displays the account's dietary entries (linking to the profile
  page to edit them) plus the round's shared panel — existing
  `DietaryPanelGrid`, read-only, unchanged.

### 7. Informazioni

- Read-only mirror, for every player, of the round settings the host
  already edits on `RoundSettingsPage` (location / date-time / timezone).
  New display only — no new data or RPC.

## Telling people the round moved

Genuinely not considered until now, and it matters: a round advances when
the Executive Chef says so, and right now **nothing tells anyone**. The
phase changes, the page looks different next time you happen to open it,
and that's the whole notification system. "Recipes are open", "voting has
started", "voting is over" are exactly the moments where a player who
isn't looking needs to be told.

**Not the bacheca.** It's tempting — there's already a board — but the
board is unattributed and player-authored: a system announcement dropped
into it reads as though one of the chefs said it, and it would dilute
the one thing the board is for. Two different registers, one surface.

The useful split is by **reach**, not by display:

- **In-app, for someone who has the round open.** The progress bar
  already *is* the phase, so a banner repeating it is noise. What's
  actually missing is *"this changed since you last looked"* — a single
  dismissible line at the top of the round page, shown only when the
  phase moved since that player's last visit. Cheap, but it needs one new
  thing: a per-member last-seen timestamp, since nothing records when
  someone last opened a round.
- **Out-of-app, for someone who hasn't opened it in two days.** This is
  the real problem, and no banner solves it. It needs web push: the app
  is already an installable PWA with a service worker
  (`vite-plugin-pwa`), so the missing pieces are a subscription table,
  VAPID keys, and something server-side to send on phase change —
  plausibly the same Edge Function work that `send-email` is waiting on.

One constraint worth knowing before promising push to anyone: **iOS
delivers web push only to PWAs added to the home screen.** For a
mobile-first app whose users are as likely to be on iPhone as Android,
that makes "install the app" a prerequisite for notifications rather than
a nice-to-have, and the first-run flow should say so plainly rather than
letting people wonder why they hear nothing.

**Build order: this is phase 5**, after Messaggi. It depends on nothing
earlier, but the in-app half wants the drawer shell to exist first, and
the push half is the largest single piece of new infrastructure in this
document.

## Badges (per-drawer attention indicators)

Not a placeholder any more — the drawer shell is phase 2, and a
collapsible UI without attention markers hides urgency as effectively as
it hides clutter. That's the one way this redesign could end up worse
than the flat page it replaces.

**One badge type, not two.** A drawer either needs you or it doesn't; a
count and a dot competing for the same corner is noise. A small filled
marker with a number when a number is meaningful, nothing otherwise.

What earns one:

| Drawer | Badge when |
|---|---|
| Chefs | members are waiting for host approval (host only) |
| Mia Ricetta | your brief isn't submitted yet and the phase still allows it |
| Ricetta Ricevuta | your recipe arrived and you haven't opened it since |
| Messaggi | unread messages — `messages.read_at` already exists and is unused |
| Voto e risultati | voting is open and you haven't voted, or results just published |
| Allergie | never — reference material, never urgent |
| Informazioni | never, except when the host changes venue or time after players have seen it |

Two rules that keep it honest: **a dimmed drawer never carries a badge**
(it can't be acted on), and **a badge clears on open, not on a timer** —
if it disappears on its own, it stops meaning anything.

`messages.read_at` exists in the schema today and nothing writes it —
that's the hook the Messaggi badge needs, and the reason it's cheap.

## Drawer behaviour (decided)

1. **Hybrid content model.** Light, glanceable drawers render inline
   (Chefs, Allergie, Informazioni, Messaggi/bacheca). Heavy full-screen
   tasks keep their own route and the drawer becomes their entry point
   with a summary line (Mia Ricetta → `/brief`, Ricetta Ricevuta →
   `/recipe`, Voto → `/ballot`). Deep links keep working, each form's
   state stays isolated, and the round page still reads as one overview.
   - **This *is* the takeover from the visual direction, not a second
     model.** Navigating to `/brief` and "the envelope opens into a
     letter filling the screen" are the same event described from two
     sides: the route change is the mechanism, the takeover is what it
     looks like. Worth stating because the two descriptions live in
     different documents and read like alternatives.
   - **Every route opened this way needs a visible back control** to the
     round page — drawn as "rimetti nella busta" rather than a generic
     back arrow. Today `/brief`, `/recipe`, `/ballot`, `/results`,
     `/chain`, `/alerts` and `/settings` render no back link at all
     (`src/App.tsx` + each page component) — a player who deep-links or
     taps through has only the browser's back gesture, which a
     home-screen PWA doesn't always show. Add it as part of phase 2, not
     as a later polish pass.
2. **Accordion — one drawer open at a time.** Mobile-first: several open
   panels means scrolling and losing your place. This governs the
   *inline* drawers only; the route-backed ones don't "open" in place at
   all, they take over, so they can't conflict with an open accordion.
3. **On arrival, the drawer matching the current phase opens**, reusing
   the phase→entry-point mapping `RoundHomePage` already computes
   (`ENTRY_POINT` in `RoundHomePage.tsx`). Iscrizione → Chefs, ricette →
   Mia Ricetta, voto → Voto. Most players never click to find their task.
4. **Not-yet-active drawers stay visible but dimmed** — a different,
   muted tone, not clickable, each showing one line saying what it's
   waiting on ("in attesa che l'Executive Chef lanci la roulette"). The
   shape of the evening is legible from the first minute, but only the
   live ones invite a tap.
   - **Dimmed means "not yet", never "not at all".** A drawer that will
     never open in this round is *hidden*, not greyed: on a
     `voting_mode = DISABLED` round the Voto drawer doesn't exist at all,
     rather than sitting there dimmed forever promising something that
     isn't coming. Same rule anywhere else a round's configuration rules
     a feature out.
5. **`/settings` stays the host's edit route** (it also holds
   cancel-round, step-back, exclusion pairs and course slots — heavier
   than a drawer should carry). The Informazioni drawer shows the
   read-only details for everyone and links there for the host.
6. **Every existing route belongs to exactly one drawer.** Otherwise the
   host tools stay orphaned on a page nothing links to:

   | Route | Drawer | Who |
   |---|---|---|
   | `/brief` | Mia Ricetta | everyone |
   | `/recipe` | Ricetta Ricevuta | everyone |
   | `/ballot` | Voto e risultati | everyone |
   | `/results` | Voto e risultati | everyone |
   | `/chain` | Chefs | host |
   | `/alerts` | Messaggi | host |
   | `/settings` | Informazioni | host |

   `/chain` sits under Chefs because it's about who cooks for whom — the
   participant list, spoiler-gated. `/alerts` sits under Messaggi because
   every alert originates as a message or a report.
7. **The Voto drawer is "Voto e risultati"**, one drawer across both
   phases: it holds the ballot while voting is open and the results once
   they're published. Results were previously specced as living "past the
   bar" with no drawer of their own, which left `/results` unreachable
   from the redesigned page.

**Terminology (agreed): the organiser is the "Executive Chef" in the UI** —
thematic, and it makes the role feel like part of the game rather than an
admin function. This is a **label change only**, living in the locale
files; the code, schema and this document keep `host`/`Host` throughout.
It has to land everywhere at once, so it's part of phase 2's string pass
rather than a scattered rename.

## Internationalisation

FR + EN to start (decided), with **English as the default** — a change
from today, where `i18n.ts` sets `fallbackLng: 'fr'` and French is the
documented default locale. Drafting happens in Italian purely for
convenience; IT is not a shipped locale unless added deliberately later.

**A visible FR/EN switcher is needed, and none exists today.** Language
is currently chosen by browser detection alone (`LanguageDetector`), with
no way for a user to override it — so a French-speaking user on an
English phone has no recourse. `profiles.locale` already exists in the
schema and is already read (`ChatThread` uses it to fetch templates in
the right language), but nothing in the UI ever writes it. The switcher
should set that column, not just the client-side language, so the
database-backed strings (chat templates, secret names) follow the same
choice. Natural home: the app header, next to the round switcher.

Concretely: flip `fallbackLng` to `'en'`, add the switcher, have it write
`profiles.locale`, and make sure every new string in this redesign lands
in both files at once rather than in English with a French to-do.

**Adding a language is already easy and doesn't need restructuring.**
Every user-facing string lives in one JSON file per locale
(`src/locales/<lang>/common.json`), loaded in `src/lib/i18n.ts`. A new
language is: copy the JSON, translate the values, add two lines to
`i18n.ts`. There's no per-page translation file to create and no route
duplication — this is *not* the "one page per language" model, and
shouldn't become it: separate localised pages would mean the same layout
maintained N times, which is exactly the trap this structure avoids.

Two things do live outside those files, by design, and need translating
in their own place — worth knowing before assuming a new language is a
one-file job:
- **Canned chat templates and broadcast phrases** — stored per locale in
  Postgres (`message_templates.locale`), seeded via SQL. See
  `0010_seed.sql`.
- **Secret-name word lists** — same pattern (`secret_name_words.locale`).

The one real discipline to keep: never inline a user-facing string in a
component. The existing code already holds this line — every label goes
through `t(...)`, and this redesign must not break the habit.

### Do this before a third language is added

There's one gap that only bites once a locale exists without full seed
data, so it's cheap to fix now and painful to discover later.

**Secret names are already safe.** `assign_secret_name`
(`0004_signup_and_membership.sql`) tries the requested locale, falls back
to *any* locale's word list, and falls back again to a random string —
three layers, already written. Nothing to do here.

**Chat templates are not.** `getMessageTemplates` (`src/lib/rpc.ts:299`)
is a plain table query with `.eq('locale', locale)` and no fallback, so a
user whose locale has no seeded templates gets an **empty list** — an
empty category dropdown and no way to send a message at all. The UI
strings don't have this problem (`fallbackLng` covers them); only this
query does.

Fix: fall back to the default locale when the requested one returns
nothing, mirroring what `assign_secret_name` already does. Small change,
and it makes "add a language" a genuinely safe operation — worth doing in
phase 4, which is already touching the message tables.

## Styling

`src/index.css` is 291 hand-written lines and already has the right
bones: design tokens as CSS variables (`--text`, `--bg`, `--bg-elevated`,
`--border`, `--accent`, `--radius`), a full dark-mode override via
`prefers-color-scheme`, a 480px centred mobile column, and a small class
vocabulary (`stack`, `card`, `row`, `badge`).

Drawers, progress bars and badges will roughly double that, so organise
it deliberately now rather than by accretion (decided). Plan: keep it
hand-rolled — no framework, consistent with the "simple" principle — but
split the single file into a small set of clearly-scoped ones (tokens /
base elements / layout / components) and add the new pieces as named
components rather than one-off inline styles. Several screens currently
use inline `style={{...}}` for layout (`RoundHomePage`, `BriefEditorPage`,
`BallotPage`); those should fold into the class vocabulary as each screen
moves into a drawer.

## Agreed naming (signed off)

- `anonymity` gains a third value: **`SPY`** (alongside existing
  `ANONYMOUS`/`OPEN`).
- `voting_enabled` (boolean) is replaced by a **`voting_mode`** enum:
  **`LIVE`** (durante la cena) / **`TIMED`** (post cena) /
  **`DISABLED`** (no). Every place reading `voting_enabled` today —
  `advance_phase`, `nextPhaseFor`/`visiblePhaseOrder` in
  `src/lib/rpc.ts`, `CreateRoundPage` — moves to the enum.
- `visibility`'s values become **`CODE`** (was `PUBLIC_LINK`/
  `PRIVATE_CODE`, which described the same act twice) and **`INVITE`**
  (agreed). Both old values collapse into `CODE` — which is what they all
  effectively were.
- Brief gains **`acknowledged_at`** (nullable timestamp) for the ack
  button — the cook's "seen, understood, no problem" signal.
- `messages.read_at` exists already and stays as is; it just needs
  something to finally write it (the unread badge).

**Existing data is test data only** (confirmed), so none of these
migrations need a defensive backfill path. They can assume a clean slate
and be written the simple way rather than the careful way — and a
`db reset` is on the table if a structural change makes that cleaner.

One caveat that matters and should not be assumed away: **local and
production are different targets.** `npx supabase db reset` locally is
free and reversible. Resetting the deployed Supabase project also
destroys `auth.users`, i.e. every test login. Worth being explicit about
which one is meant each time. Separately, `CHANGELOG.md` records that
migration `0014` was never pushed to production — so production is
already behind local, and a reset there is arguably the tidier way to
resync than stacking new migrations on a stale base.

## Build order

Each phase independently shippable, ordered by dependency and risk,
lowest first. Supersedes any earlier ordering discussed in this file's
history.

0. ~~**Chefs-drawer approval fix**~~ — **done** (`0015`,
   `smoke_test4.sql`). Turned out not to be a frontend fix at all: the
   pending member's real name is unreadable to every client, host
   included, because `profiles_select_co_members` needs both sides
   approved. Solved with a narrow host-only RPC rather than by widening
   that policy. Two things came out of validating it and are also done:
   a reachable duplicate-key crash in `remove_member`, and the removal
   modes below (`0016`, `smoke_test5.sql`). See `CHANGELOG.md`
   2026-08-22.
1. ~~**Round setup and entry**~~ — **done** (`0017`–`0019`,
   `smoke_test6.sql`). Classic/custom creation, `SPY` + its host-only
   identity read, `voting_mode` replacing `voting_enabled` (kept as a
   generated column so `advance_phase` never had to be rewritten),
   `access` as `CODE`/`INVITE`, in-app invitations with an inbox on the
   home screen, past dinners folded away, English default plus a working
   FR/EN switcher that writes `profiles.locale`. See `CHANGELOG.md`
   2026-08-22 (2).

   **Outstanding from this phase:** the authenticated screens have not
   been driven in a browser — types, build and SQL all pass, but nobody
   has clicked through creating a custom round or accepting an invitation
   in the real UI. Worth doing before phase 2 builds on top of them.
2. **Drawer shell** — **mostly done**. Built: the cloth-and-envelopes
   round page, both progress bars, dimmed-with-a-reason envelopes,
   hidden-when-impossible ones, the back control on all seven routes, the
   three table states with accumulating marks, and the CSS split. See
   `CHANGELOG.md` 2026-08-22 (4).

   **Closed since:** the page has been driven in a browser; `read_at` is
   written and feeds the Messaggi badge; `acknowledged_at` exists with an
   "I can cook this" button; the Executive Chef rename is done everywhere
   a person can read it (`0022`, `CHANGELOG.md` 2026-08-22 (7)).

   **Still open:** Messaggi points at `/recipe`, where the chat already
   lives, rather than having a screen of its own. Correct until the board
   exists in phase 4 — but it means one envelope and one route don't yet
   correspond one-to-one.
3. **Voto** — the `LIVE`/`TIMED` behaviour: skip/open-now host overrides,
   live submission-percentage progress, host-gated results-publish,
   vote-editable-before-deadline, the deadline picker. Depends on phases
   1 and 2 both existing.
4. **Messaggi** — free text + templates in parallel, the `round_messages`
   broadcast channel, and the "ask the host for help" template hook into
   `host_alerts`.
5. **Comunicazioni** — telling players the round moved: the in-app
   "changed since you last looked" line (needs a per-member last-seen
   timestamp) and web push for people who aren't in the app. See "Telling
   people the round moved" above. Largest new infrastructure here, and
   the only phase that overlaps the email work `send-email` is blocked
   on.

Badges are part of phase 2, not a later polish pass — see "Badges" above
for why.

Every phase above is fully specced. Nothing in this document is waiting
on a decision.

## Message length limits (settled)

These are three different things and shouldn't share a number:

| Where | Limit | Status |
|---|---|---|
| Recipe: dish name | 80 | already enforced (`BriefEditorPage.tsx`) |
| Recipe: procedure | 5000 | already enforced — generous, leave as is |
| Recipe: note to cook | none today | fine, it's a short field in practice |
| **Chat: free-text message** | **280** | to build (phase 4) |
| Broadcast board | n/a | fixed phrases only, no typing |

The 280 figure only ever applied to the **chat message box**, not to the
recipe — the recipe's own fields already have their limits and they're
already roomy (5000 characters of procedure is several pages).

## Rate limits (existing, for reference)

`send_message` in `0008_chat.sql` already enforces, hardcoded in the SQL
function itself (changing them means a migration, there's no config
table):
- **10 messages per hour**, per person, per thread.
- **NUDGE** ("friendly reminder") specifically: max **5 per thread** and
  max **1 per hour** — a stricter cap so nagging can't be spammed.

Free text will reuse the 10/hour cap rather than introducing a second
system. The broadcast board needs its own cap since it's a different
table — proposal: same 10/hour, per person, per round.

## Settled

Everything below was open at some point in this document's history and no
longer is. Kept as a list so nothing gets relitigated by accident:

- **Free text is always available** — a permanent text box in the pairing
  chat alongside the templates; v2 narrows back toward templates-first
  once there's usage data.
- **Broadcast phrases** — starter set written (drawer 4).
- **Naming** — `SPY`, `voting_mode` (`LIVE`/`TIMED`/`DISABLED`),
  `visibility` (`CODE`/`INVITE`), `acknowledged_at`.
- **Drawer behaviour** — hybrid content model, accordion, phase-matched
  drawer open on arrival, dimmed vs hidden, route-to-drawer mapping.
- **Badges** — one type, the table of what earns one, cleared on open.
- **Visual direction** — E · Tavola, envelopes throughout, takeover on
  open, redaction bars, three table states, props as renders.
- **i18n** — FR + EN, English default, visible switcher writing
  `profiles.locale`.
- **Styling** — hand-rolled, split into scoped files, no framework.
- **Existing data** — test only; migrations can assume a clean slate.

Still genuinely open, and none of it blocks any phase:
- Which prop objects earn three variants versus just moving.
- Whether props change further within a phase.
- Who produces the final renders.

"Executive Chef" as the organiser's name: agreed.

Visual direction: **E · Tavola**, envelopes throughout, opening as a
takeover — decided (see "Visual direction" above).

Long form screens (writing a brief): **the letter takes the full screen**
on a phone, centred at sheet width on desktop — settled, see "The
takeover on a wide screen" above.

Props change by phase — decided, see "The table wears through the
evening" above.

Remaining, none of it blocking phases 0–1:

- **Which objects earn three variants** (clean / used / cleared) and
  which just move between states?
- **Cut-out objects or one pre-laid table image?** Note the three-state
  design pushes toward cut-outs: a single fixed table image can't wear.
- **Who produces the final renders** — a parallel workstream worth
  starting early; placeholders carry development but not release.

## Visual direction (chosen: E · Tavola)

**What exists today** is a set of sensible defaults, never art-directed:
a burnt-orange accent (`--accent: #e4572e`) on warm off-white, the system
font stack (no typeface ever chosen), 10px radii, borders rather than
shadows, a 480px centred phone column. Clean and food-adjacent, but with
no point of view — which is fine for a prototype and not fine for the
screen people stare at all evening.

**The brief**, in the user's words: the red-and-white checked tablecloth
of a Paris traiteur; envelopes, for the spy/detective register; the
Ratatouille palette — warm wood, chef-whites, and specifically the
end-credit sequence, with its flat saturated colour fields.

**Three directions were pitched** as a published artifact, each leading
with one of those three references and each rendered on the *same*
round-page mockup so the comparison is like-for-like:

- **A · Nappe** — the tablecloth commands. Red header band (gingham
  confined to the band, never behind body copy), cream and white below.
  Warmest and most immediately legible; loses the secret entirely.
- **B · Dossier** — the envelope commands. Kraft paper, wax-seal red,
  typewriter titles, every closed drawer a sealed envelope with a flap.
  The metaphor genuinely matches what the game does; almost no food in it.
- **C · Générique** — the end credits command. Flat saturated fields
  (terracotta, saffron, verdigris, aubergine) on a dark kitchen-at-night
  ground, italic serif titles. The most distinctive and the most
  demanding to execute.

**Settled from that round: light ground, not dark** — C is out as a whole
direction, though its palette may still be borrowed. A's tablecloth and
B's envelopes both stay.

**Second round** pitched two ways of combining them, both light:

- **D · Nappe & Dossier** — gingham confined to a header band, every
  drawer an ivory envelope with flap and wax seal below it. The two
  materials stay out of each other's way and the reading surface stays
  calm.
- **E · Tavola** — the gingham takes the whole screen; the app becomes a
  table seen from above, envelopes resting on the cloth with real
  shadows, and props (a plate, a glass, cutlery) cropped by the screen
  edge as if it were a detail of a larger scene.

Two treatments carry across both:
- **Opening gesture** — sealed envelope → flap lifts, seal breaks → what
  stays open is not an envelope but the *letter*, with the fold crease
  still visible. Half a second, played once, not on every open.
- **Redaction** — the black marker bar replaces the blur (see "Chi vede
  chi" above for why, and for the rule that it must cover data the server
  never sent).

**The load-bearing rule for E**, without which it collapses: *nothing
readable ever sits on the gingham.* Every legible block — header,
progress, envelopes — is an opaque light surface laid on top with its own
shadow. The cloth shows in the margins, the gaps and around the props: it
is the room, not the background of the text.

### Chosen: E · Tavola

**Decided: E, the full tablecloth — and every drawer becomes an
envelope**, not just the sealed ones. The reasoning accepted over the
"envelopes only where there's a secret" recommendation: the whole product
*is* the secret cook, so the envelope is the right container throughout,
and it makes the round page read as a game rather than a form.

Terminology note: this document keeps saying **drawer** for the
structural thing (a collapsible section of the round page). In the UI it
is drawn as an **envelope**. Same object, two vocabularies — code and
spec say drawer, the screen says envelope.

**The opening gesture is a takeover, not an expansion.** A drawer doesn't
unfold into a list in place: the envelope lifts off the cloth, the seal
breaks, and the letter inside fills the screen — with a margin of
tablecloth still visible at the edges so you know you never left the
table. Closing puts it back down. This is the "gioco di ruolo" reading:
you pick an object up rather than expanding a panel.

**Ambition kept in view, not built yet:** envelopes genuinely *scattered*
across the cloth and picked up one at a time. Deferred deliberately —
free positioning has to be redone for every screen size, stops working
with a keyboard, and gets hard to reach on a small phone. The shipped
version is a column with slight per-envelope rotation, which carries most
of the feeling at a fraction of the cost and remains the foundation the
scattered version could later be built on.

### Rules that hold the direction up

1. **Nothing readable ever sits on the gingham.** Every legible block is
   an opaque light surface laid over it, with its own shadow. The cloth
   shows in margins, gaps and around props — it's the room, not the
   background of the text.
2. **One light source, shared by everything.** Top-left, so every shadow
   falls bottom-right. A single object lit the other way breaks the
   table.
3. **One camera angle, shared by every object.** Not necessarily
   perpendicular — the reference photo supplied is shot from above but
   slightly tilted, showing a little of each glass's stem, and it reads
   as completely natural because *every* object shares that tilt. (An
   earlier version of this note said strictly orthographic and "the stem
   is never visible" — the reference disproves it. The rule is
   consistency of angle, not verticality.) What breaks the table is
   mixing two angles: a plate straight from above beside a glass in
   three-quarter view.

### The takeover on a wide screen

On a phone the letter fills the screen. On desktop it must **not** widen
to match — a recipe stretched across 1400px has unreadably long lines.
The sheet keeps a sheet's width and centres, which means a wide screen
simply **shows more table**: the cloth and props finally get room, and
the scene only implied on a phone is visible whole. One rule solving two
opposite problems, with no second layout.

### The table wears through the evening

**Decided: the props move and get dirty as the round advances**, so the
scene itself says where you are and the progress bar becomes a
confirmation rather than the only source.

- **Iscrizione** — laid and clean. Everything squared, glass full, cloth
  unmarked. Nobody has sat down yet.
- **Ricetta / cena** — the plate is askew with the remains of a salad,
  the glass has moved and left its ring on the cloth, bread on a board
  has shed crumbs.
- **Voto / fine** — plates stacked with the cutlery resting on top, dregs
  in the glass, napkin crumpled, several rings and a wider scatter of
  crumbs.

Two things make this affordable rather than three hand-drawn scenes:
- It's **one table in three states** — the same objects shift by a few
  dozen pixels and swap variant (clean plate / plate with remains /
  stacked plates).
- **Marks accumulate, they never reset.** The wine ring from dinner is
  still there at the end with others beside it. One extra layer per
  phase, and it gives the right feeling: the evening left a trace rather
  than the table being re-laid between phases.

Consequence for asset production: some objects need **three variants**,
not one. Worth deciding early which earn three renders and which just
move.

### Props

Placeholder drawings exist to fix position and scale; the real ones are
3D renders (agreed — to be sourced), and they must be:
- **One consistent camera angle**, per rule 3 above.
- **From one session, one light** — the reference photo's light falls
  from the pendants above the table and every shadow agrees. Objects
  sourced separately never agree, however good each is alone.
- **Transparent PNG/WebP with the shadow baked in** — a CSS shadow
  doesn't follow the object's silhouette and reads as fake immediately.

Renders beat photographs here: light, angle and scale are decided once
and every new object aligns itself, whereas photographs need a fresh
coherent shoot each time something is added. Watch the weight — this is
an offline PWA, and four full-resolution images would outweigh the entire
rest of the app. WebP, sized to actual display size, lazy-loaded below
the fold.

Candidate objects, from the reference: plate, wine glass, small bowl,
serving dish, cutlery on a folded napkin, bottle, carafe. Four or five
is plenty — more objects buys weight, not atmosphere.

Open: which objects; whether they stay fixed all evening or change by
phase (cutlery while writing, glasses while voting, empty plates after);
whether to commission individual cut-out objects (composable per screen,
heavier) or a single pre-laid table image (lighter and prettier, but
fixed); and who produces them — a parallel workstream to start early,
since placeholders carry development but not release.

## Out of scope for this pass

- **Personal cookbook (v2)** — let a player keep the recipe they were
  given, and their final score, in their own profile after the round
  ends. Optional, opt-in.

  One design point decides how hard this is. `briefs` has **no
  player-facing SELECT policy at all** — a recipe is only ever reachable
  through `get_my_brief`, scoped to a live round. So a cookbook can't
  just be "a query over old briefs". The clean shape is to **copy the
  recipe into a user-owned table at the moment the player saves it**,
  after the reveal. The copy then survives the round being archived,
  cancelled or cleaned up, and it doesn't require poking a hole in the
  brief protections — which is exactly the kind of hole that would be
  easy to widen by accident later.

  No anonymity concern: by `RESULTS` the identities are already revealed,
  so a saved recipe carries nothing the player wasn't shown anyway.
- **Two recipe options per brief** — moved into Round setup as a v2
  round-level setting (shown disabled). See "Recipes per brief" above.
- A second dish actually *cooked* per pairing — stays deferred, same as
  the existing `lap` column note in `README.md`.
- **Tema chef** (themed secret-name word lists) — shown in the creation
  form but disabled; v2.

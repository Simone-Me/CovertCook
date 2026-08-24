# Changelog

Dated entries, newest first. `README.md` stays the living status doc (what
exists / what's missing right now); this file is the history of how it got
there.

---

## Where to pick up

Production is **up to date**: `0015` → `0045` were deployed on 2026-08-24
and the client and the database agree again. The schema/client mismatch
that made every RPC added since `0015` fail is closed.

Phases 0–4 of `PRESENTATION.md` are done, including the board.

**Next, in order:**

1. **Free-text chat** alongside the templates — the length cap (280) and
   the rate limit (the existing 10/hour) are already decided.
2. **Notifications** (`PRESENTATION.md` phase 5) — email, not push, and
   the reasoning is written down. Needs the Resend key below.
3. **Real table props** — drawings today, not renders. `DESIGN.md` §4 has
   the three constraints any render has to meet, and the three questions
   still open (which objects, how many variants, single objects or one
   laid table).
4. **The invitation, and reaching people who never switch push on** — the four
   moments are covered (`0048`), but only for people who opted in. An invited
   player who has never opened the app cannot be pushed to at all. That is the
   mail that still has to be written, and `send-email` is the natural home.
5. **Deleting an account** — missing entirely, and now on the critical path
   for a store listing (both stores mandate it) as well as for GDPR. The
   personal-data map, the foreign-key blocker that stops it being a plain
   delete, and the three ways out are in `DISTRIBUTION.md` §10; the shape
   recommended there is anonymise-in-place, hard-delete the dietary rows.
6. **Distribution** — `DISTRIBUTION.md` covers the four routes (PWA, APK,
   Play, App Store), the real costs, and why monetising is a later and
   much more expensive decision than a store listing. Pro is deferred.

**What the email work needs from you** (see also `.env.example`): a Resend
API key, a verified sender domain, and a decision on the from-address.
`supabase/functions/send-email/` and `send-invite/` are empty folders
waiting for exactly that. Set the key as a Supabase Edge Function secret,
not a frontend env var — it must never reach the bundle.

**Settled since:** allergens inform instead of blocking (`0029`); the
roster is revealed all at once when sign-ups close, never as people
arrive (`0032`); the board reads as a chat and its food icons are per
message, never per person (`0033`); "Executive Chef" stays identical in both languages, as a
role name rather than a translation.

**The design direction now has a file.** `DESIGN.md` is the transcription
of the "Buste sulla Tavola" artifact — palette, the three rules that hold
the table together, the envelope-to-document gesture, the three states of
wear, and the constraints on the object renders. Read it before touching
the interface, and add to its change log when a decision moves.

---

## 2026-08-24 (9)

**Decided: the hook, four moments, and the Netlify origin.**

*Mail is the hook, not the paste* (`send-email`). `supabase/email-templates/`
stays as the bridge until it is deployed and as a way to open a mail in a
browser and look at it, and the generated README now says so rather than
leaving the choice open. The consequence that decided it: a dashboard box
holds one language, and this app has two.

*Mail shrank to what Auth owns.* Password reset and address change. Everything
else that used to want an email is a notification now, which is the reason
`ROADMAP.md` §1 has a "superseded" section rather than a quiet edit — the
argument it made was right, and what changed underneath it was the platform,
not the reasoning.

*Four moments, and nothing else* (`0048`):

| Moment | Who | When |
|---|---|---|
| Your cook has been chosen | the round, minus the host | `ASSIGNED` |
| Your recipe has arrived | one cook | its author submits |
| Voting is open | the round, minus the host | `VOTING`, **online ballots only** |
| The results are in | the round, minus the host | `RESULTS` |

Three of those are the Executive Chef announcing the round. The second is not,
and that is the interesting one: since `0035` a recipe lands the moment its
author submits, so hanging its notification on a phase change would rebuild
exactly the stall `0035` removed. It is sent by the sender, at submit — and
resolved through the chain, so the sender never names their cook and never
learns who they reached. The text says nothing about who wrote it, and cannot:
it is composed in the Edge Function, because a caller that supplies the words
is a caller that can put a name on somebody's lock screen.

A hand-counted round gets no voting push at all. Everyone is in the room and
somebody is standing up to say it.

Dinner starting, a settings change, a phase nudged backwards: silent. An
unknown moment reaching `send-push` is answered with `skipped`, not with a
generic notification — the app has decided what it interrupts people about,
and "something happened" is not on the list.

*One switch, all dinners, all devices.* The subscription rows are per browser
because that is what the Push API gives us; the decision is now a column on
`profiles`, so turning it off on the phone silences the laptop. Stated in the
migration rather than discovered later: turning it back on anywhere revives
both. Per-dinner preferences are v2, and the profile screen says so.

*The origin is `https://covertcook.netlify.app`*, until a domain is bought. All
three settings that have to agree — `VITE_APP_BASE_URL`, Site URL, Redirect
URLs — are named with that value in README, because a mismatch between them is
silent and surfaces only as a link that opens the wrong place.

**Verified:** `0001` → `0048` replayed into a throwaway Postgres 16. A DRAFT
brief notifies nobody (no doorbell before you have written anything); once
submitted it reaches exactly the cook, in the cook's own language; the cook
cannot reach themselves from their own seat; the account switch empties both
audiences at once and refills them; and a MANUAL round reports its vote as not
online while a LIVE one reports it as online. Grants re-checked with
`has_function_privilege`: both audience functions and the vote-mode check are
`service_role` only. Build and lint clean.

---

## 2026-08-24 (8)

**Added: the auth mail is ours now, and push exists.**

### The mail was never a template problem

Custom SMTP decides *where* mail is posted, not *what* it says — the body kept
coming from Auth's dashboard templates, which is why `templates.ts` could be
perfect and change nothing. Two routes now exist to replace them, and the repo
supports both:

*`npm run mail:templates`* renders every auth mail into
`supabase/email-templates/*.html` with `{{ .ConfirmationURL }}` in place of the
link, ready to paste into the dashboard. Ten files, five templates, two
languages, generated from the same source as everything else.

*`supabase/functions/send-email/`* is the better one: the **Send Email Hook**.
Auth stops sending and hands us the mail; we render `templates.ts` in the
recipient's own language and post it to Resend's API. It is the difference
between a dashboard box that holds one language and a function that picks per
person. `templates.ts` grew from one template to all seven action types Auth
can emit, because with the hook on, an action with no template gets no mail at
all.

The function is deployed `--no-verify-jwt` — Auth calls it with a webhook
signature, not a token — which makes that signature the only thing standing
between the endpoint and an open relay sending CovertCook-branded mail to any
address a stranger names. It is verified before the body is parsed, never
after.

*And the localhost link is a third thing again, in the dashboard.* Auth builds
`{{ .ConfirmationURL }}` from the redirect the client asked for, checks it
against the Redirect URLs allow-list, and **falls back to Site URL** when it
does not match. A Site URL still pointing at `localhost` is the entire
explanation, and no template can fix it. README now says which three settings
have to agree.

### Push, for the app as installed

`ROADMAP.md` §1 chose email over push and the argument still holds for the
asynchronous moments. What changed is the platform: the app is on a home
screen, which is the prerequisite **iOS** imposes, so push works without a
store listing. That is the part worth saying plainly — web push in an installed
PWA is the same API a native app gets; Android delivers it in a tab or
installed, iOS only from the home screen, and no store is involved either way.

- `0047` — subscriptions, **one row per browser**, not per person: the phone
  and the laptop are two, and revoking one must not silence the other. Writes
  go through RPCs; an insert policy would let a client claim an endpoint
  belonging to somebody else's browser.
- `src/sw.ts` — the service worker is hand-written now. `generateSW` had
  nowhere to put a `push` listener, so `injectManifest` took over and the
  worker reproduces what the config used to declare: precaching, skipWaiting,
  and the `/rest/v1/` GET cache for bad wifi at the flat.
- `send-push` — composes the text server-side (a client that supplies the
  words is a client that can put any words on somebody else's lock screen),
  checks the caller is the host with the caller's own token, and only then
  reads the audience with the service key. Endpoints and encryption keys never
  reach a browser. 404/410 prunes the row; anything else is left alone,
  because a timeout must not cost somebody their notifications.
- The settings screen asks what the device can do rather than assuming, and
  the permission prompt is raised by a button — a refusal is permanent, and
  raising it on page load is how an app loses a person forever.

### Found while testing: two functions anyone could call

`revoke all on function … from anon, authenticated` does **not** do what it
reads like. Postgres grants EXECUTE on every new function to PUBLIC, and both
roles inherit it — so the revoke removes a grant they did not need while
leaving the one they were using. Caught by asking `has_function_privilege`
instead of trusting the REVOKE.

`push_audience_for_round` was written that way and is now revoked from PUBLIC
and granted back to `service_role` alone — which is itself a trap worth
recording, since revoking from PUBLIC takes it from `service_role` too and
would have silently broken the only caller. The same latent hole has been
open since `0003` on `consume_turnstile_ticket`: the table was locked, the
function was not. Closed in the same migration. Nothing calls it from outside
the database.

**Verified:** `0001` → `0047` replayed into a throwaway Postgres 16 — the
chain applies, the subscription upsert is idempotent, a shared device changes
hands instead of failing, `forget` only silences your own endpoint, and the
audience function is now unreachable for `anon` and `authenticated` and
reachable for `service_role`. All fourteen auth mails (seven actions × two
languages) render with a subject, the link in both the HTML and the text part,
and no `undefined` anywhere. `npm run build` produces a service worker that
really does contain the `push` and `notificationclick` listeners.

---

## 2026-08-24 (7)

**Added: the public name is an identity, not a label** (`0046`).

`display_name` had been free text since `0001` — two people could both be
"Simone" and nothing anywhere noticed. That is fine for a label and wrong
for a handle, and a handle is what it had become: it is the name the reveal
prints, the name a host reads when approving a request to join, and the
name an invitation is addressed to. Each of those is ambiguous with a
duplicate in the room.

*Unique, case-insensitively, on live accounts only.* `lower(display_name)`
under a unique index, so "Simone" and "simone" are the same person to the
database while the name is **stored exactly as typed** — how you capitalise
your own name is yours. The index is partial, `where anonymised_at is
null`, and that is not an optimisation: erasure (`DISTRIBUTION.md` §10)
anonymises rather than deletes, every retired profile is meant to end up
wearing the same neutral token, and a total index would make the second
person to leave impossible to anonymise.

*The form asks before the submit does.* A 400 ms debounce behind
`display_name_available`, and the field answers while you type — green
border and "free", red border and "already taken". Never colour alone: the
same answer is in words underneath, because a border colour is not readable
to everyone. The check is authenticated-only on purpose; an open
availability endpoint is an account-enumeration oracle.

*Advisory, and treated as such.* Three layers, because a check is stale the
moment it returns: the debounce answers the typist, `complete_signup`
re-checks and raises `display_name_taken` in words rather than forwarding a
constraint name, and the unique index catches the two people who pick the
same name in the same second. A failed check reads as "don't know", never
as "taken" — refusing a free name over a dropped connection is the one
failure that would be the app's fault.

*Existing duplicates are settled before the index is built.* The oldest
account keeps the name — its friends already know them by it — and the rest
gain a short suffix, each rename logged as a notice so the deploy output is
the record of who moved and to what.

*A small note under the field says what happens next:* changing the name
later is planned as part of Pro. That is now a row in `ROADMAP.md` §2 and
it earned its place by accident — a name only becomes worth changing once
it is unique, and it only costs something once giving it up releases it to
somebody else.

**Verified, not assumed.** Migrations `0001` → `0046` were replayed into a
throwaway Postgres 16 with a stubbed `auth` schema: the whole chain applies,
duplicates are renamed as described, the index refuses a case-different
duplicate, availability is right for a taken name, a trimmed/case-different
one, a free one and your own, and `complete_signup` raises
`display_name_taken` rather than a constraint name. The `secret_name` side
was checked at the same time and needed nothing: it is already unique per
round by constraint (`unique (round_id, secret_name)`), assigned rather than
chosen, and deliberately not unique *across* rounds — a pseudonym that
followed you between dinners would be the cross-round identity the
anonymity design exists to prevent.

---

## 2026-08-24 (6)

**Audited: the confirmation mail, because resending one did nothing.**
Reported symptom: the sign-up mail arrives, the "send it again" button
does nothing visible, and Resend has no record of a second send at all.

*What the mail system actually is.* Worth stating, because it decides
where to look: the confirmation and the password reset are sent by
**Supabase Auth**, rendered from the dashboard's templates and handed to
Resend over SMTP. `supabase/functions/send-email/` holds `templates.ts`
and no `index.ts` — it has never been deployed and sends nothing. So a
mail that never reaches Resend was never handed to SMTP: it died inside
GoTrue, before any provider was involved. That rules out Resend, the
sending domain, DNS and spam filtering in one step.

*Fixed: `/resend` was the only auth call in the app with no captcha
token.* Sign-up, sign-in and password reset all pass one;
`ConfirmEmailNotice` passed none. GoTrue gates `/resend` with the same
project-level captcha setting as the rest, so with protection on, every
resend is refused before a mail is attempted — first mail out, second
never, nothing in Resend, which is exactly the reported shape. The
sign-up token could not have been forwarded either: Turnstile tokens are
single-use and that one was spent by sign-up, so the screen now solves
its own, like every other form.

*Fixed: the screen claimed a send it cannot know happened.* Supabase's
email-enumeration protection makes `/resend` answer **200 with no mail**
for an address that is already confirmed or unknown — deliberately, so
the endpoint cannot be used to test whether an account exists. "Sent.
Check the same mailbox" was therefore a statement the client had no
grounds for. It now reads as a conditional in both languages: on its way,
*if that address is still waiting to be confirmed*.

*Not fixed, because they are settings, not code.* Two remaining causes
produce identical symptoms and can only be checked in the Supabase
dashboard: **captcha protection** (whether it is on at all — the fix
above only matters if it is), and **the email rate limit**, which
`config.toml` carries at the stock `email_sent = 2` per hour. Two mails
an hour is a whole afternoon of testing spent in one signup and one
resend, and GoTrue answers 429 without touching SMTP.

*Found, not fixed — the resend button is unreachable exactly when it is
needed.* `ConfirmEmailNotice` renders only as a step inside `SignUpPage`,
holding the address in component state. Close the tab and there is no way
back to it: the person who did not get the mail is the person most likely
to have given up on the tab. Signing up again returns the same
enumeration-protected success without sending anything. The recovery path
this button exists to provide needs its own entry point — a "resend the
confirmation" route reachable from sign-in — and that is a design
decision, not a patch.

---

## 2026-08-24 (5)

**Added: the app has a mark.** The wok goes in the browser tab, on the
home screen, and beside the name in the header.

Three things were decided rather than just placed:

*It is red, not black.* The artwork arrived as pure black on transparent,
and black appears nowhere in this palette except `--marker`, which means
"redacted" — a different thing entirely. Repainted in the accent so it
reads as the app's mark instead of a stray glyph. The alpha channel is the
shape, so recolouring is a matter of keeping the alpha and replacing the
colour; no halo, no compositing tricks.

*The favicon has its own ground.* A black glyph on transparent vanishes
into a dark browser tab. The tab and home-screen versions are a cream wok
on a red rounded tile, which reads on any tab bar.

*The placeholder PWA icons are gone.* `pwa-192` and `pwa-512` were
functional placeholders (README said so); they are the real mark now, plus
a `maskable` entry so Android does not letterbox it inside its own shape.

**Fixed: two bits of chrome that had drifted.** The document title was
lowercase `covertcook`, and the manifest's `theme_color` was `#E4572E` — an
orange that appears nowhere in the product. Both now match: `CovertCook`
and `#C6202C`, with the background colour moved from `#111111` to the
app's lino.

---

## 2026-08-24 (4)

**Security pass.** Checked rather than assumed, and it found one real gap.

*Clean already:* RLS is enabled on every table with no exceptions; every
`SECURITY DEFINER` function pins its `search_path` (the thing that stops a
hijacked schema turning a privileged function into somebody else's code);
no secret appears anywhere in `src/`; `manual_tally` has RLS on, no
policies and no grants, so it is reachable only through the functions that
own it.

*The gap:* **there were no security headers at all** — no CSP, no
clickjacking defence, no MIME-sniffing defence, no referrer policy.
`public/_headers` now serves them. The CSP allows no `unsafe-inline` or
`unsafe-eval` for scripts (Vite emits real files, so it does not need
them), permits Supabase over https and wss and Cloudflare Turnstile, and
sets `frame-ancestors 'none'`. `Referrer-Policy` matters more here than
usual: join codes travel in query strings, and a full referrer would hand
them to every third-party host a page touched.

*Also fixed:* a high-severity React Router advisory (RSC-mode CSRF bypass —
not a mode this app uses, but the fix was a version bump). Production
dependencies now audit clean.

*Not covered, and worth saying:* this was a checklist, not a pen-test.
Nobody has adversarially tried to break in.

**Added: consent is asked for, twice, and separately.** Sign-up now
requires accepting the terms and privacy policy, and — as its own box —
an undertaking about allergies. They are separate on purpose: bundling
consent to health data into a general "I agree" is exactly what GDPR
Article 9 does not allow. The second box does two jobs that are the same
sentence: it is the explicit consent required to hold the data, and the
promise to read the dietary panel that makes collecting it worth anything.

**Added: Terms and Privacy, written.** Both languages, kept in the locale
files so they cannot drift apart. Written from what the app actually does
— the processors are named, the retention is stated (fridge messages, 24
hours), and the health-data section says plainly that a severe allergy is
Article 9 special-category data and that consent is the basis for holding
it. Marked a draft: they need a lawyer before any money changes hands.

**Added: language can be changed before there is an account.** The only
switch lived in the profile — behind a sign-in form somebody might not be
able to read. It is now on sign-in, sign-up and password reset, and on the
dietary step, so the choice is made before the profile row that stores it
is written.

**Fixed: icons exploded to full width.** `.icon` was `width: 100%`, which
is right inside a fixed chip and catastrophic anywhere else — the pass and
the chain both filled their containers. The size is set inline by the
component now and nothing overrides it.

**Changed: the pass is an envelope.** It was a paper fold that did not
match anything else on the cloth. It is one of the drawers now, in wax red
— the only envelope addressed to one person, so colour sets it apart
rather than shape. Its subtitle changes with the phase ("Compose the menu,
then spin the roulette"), and a mark appears on the right only when the
evening is genuinely stuck on the host.

**Changed: the chain is a clickable card**, icon and all, instead of a
line of text with a link in it.

**Fixed: hand-counted votes could exceed the room** (`0045`). Nothing
bounded the counts: a dish could be given more votes than there were
people, and a place could be handed out more times than there were hands.
Both are typos rather than opinions. The host is now asked how many are
voting — asked, not derived from the roster, because somebody who turned
up without cooking still ate and still gets a say — and both bounds are
enforced in the database, not only in the interface. Verified: 6 hands
among 5 voters and 3+3 first places among 5 both refused.

The instructions now also say the part that makes the count mean anything:
decide your own top three before the hands go up, one hand per round,
never the same dish twice, and not your own.

**Fixed: "Vote the menu" opened the wrong screen.** A hand-counted round
has no online ballot, but the envelope sent everyone to one — the drawer
contradicting the choice the host had just made. It now leads to the tally
for the host, and tells members plainly that this one is counted at the
table.

**Changed: the voting method can be changed back** (`0045`). It froze at
`VOTING`, so picking "by hand" once and then finding half the table had
gone home left no way back. The real constraint was never the phase: it is
whether anything has been counted. Change it freely until somebody votes,
refuse after, and say which.

---

## 2026-08-24 (3)

**Fixed: LIVE voting was offering a countdown.** Choosing "during dinner"
still showed the deadline picker, which made LIVE and TIMED the same thing
and the choice between them pointless. LIVE now says plainly that there is
no countdown — the Executive Chef reads the room and closes it, and sees
the results first. The picker belongs to TIMED alone.

**Changed: "I have a problem" asks for help instead of resigning**
(`0044`). The message sent was "I won't be able to cook this dish after
all", which ends the conversation at the moment it should start one: most
of the time a cook cannot find an ingredient or has never made the thing,
and whoever wrote it can solve that in one reply. The wording is now "I
have a problem with this recipe — can you help me?" The category stays
`CANNOT_COOK`, because what it *does* is still right — it raises a host
alert (`0008`), so the Executive Chef learns a dish is at risk while there
is still time.

**Added: real icons.** Ten of them, replacing the emoji placeholders —
chef, recipe, cooking, chat, fridge, message alert, allergy, map, raised
hand, winner. One `Icon` component so a drawer and the mark on its
envelope can never drift apart, and all of them decorative (`alt=""`,
`aria-hidden`) because each sits beside a label that already says the same
thing.

Resized on the way in: 512 px masters to 96 px WebP, **273 KB → 37 KB**.
Masters moved to `assets-src/icons/`, out of the build, for the same
reason as the fridge — everything in `public/` is precached onto every
phone that installs the PWA.

**Added: a footer, and the attribution it owes.** © line, Terms, Privacy,
Contact — and credit to Flaticon, whose licence requires it visibly
wherever the icons appear. That is stated in plain words on every screen
rather than hidden behind an About page nobody opens.

Terms and Privacy link to honest stubs rather than nothing: a footer
without them looks finished when it is not, and they stop being optional
the moment the app takes money (`ROADMAP.md` §2).

**Still without an icon** — flagged rather than invented: the online
**ballot** (the trophy currently doubles for both the vote and the
results), the **chain** view, and the **pass** itself.

---

## 2026-08-24 (2)

**Corrected: the confirmation email is not sent by this codebase.** The
`templates.ts` written yesterday is for mail *we* send through Resend —
invitations, "the round moved on". Sign-up confirmation and password reset
belong to **Supabase Auth**, which renders them from the dashboard's own
templates and never calls our function. Editing that file changes nothing
about what a new account receives. The header now says so, and
`confirmEmail()` is labelled as the design to paste into Auth's template
box rather than something already wired up.

**Fixed: confirmation links pointed at localhost.** `signUp` passed no
`emailRedirectTo`, so Auth fell back to the project's Site URL. It now
sends `VITE_APP_BASE_URL`, as does the resend. The other half is not in
code: the dashboard's redirect allow-list has to contain that origin, or
Auth rejects it and silently falls back again.

**Changed: the vote's style is chosen when it is opened** (`0043`).
`voting_mode` could only be set at creation, which made MANUAL
unreachable — a round made with "Classic", or made before it existed, had
no route to it. Now it is a picker in the pass at `DINNER`, frozen from
`VOTING` on: once a ballot exists, changing the counting method would be
changing the rules mid-count. DISABLED stays one-way.

**Changed: a deadline is set once** (`0043`). It could be replaced
repeatedly, which turned a stated closing time into something that moved
while people were deciding whether they had time to think. The first one
sticks; clearing it is still allowed, because that removes a promise
rather than changes one. Verified: second call raises
`DEADLINE_ALREADY_SET`.

**Added: turnout as a share, and an automatic close** (`0043`). The pass
shows a bar and "5 of 8 have voted (62%)". And when everyone has voted the
round closes itself — `close_voting_if_complete` is callable by anyone in
the round and does nothing unless the condition is genuinely met, so the
last person to vote does not have to find the host to end a vote that is
already over.

**Changed: the hand count is three folds, not a wizard.** The suggested
order is still last-place-first — and the reasoning holds: asking for
favourites first makes the next two questions feel like consolation and
people re-vote for the answer they already gave — but a host who has
already asked out of order should not have to fight the screen. Each fold
shows its running total on the closed row; the standings sit below all
three and update as the counts change.

**Changed: two answers to a received recipe, not three.** A row of
variations made the choice look like a personality quiz when it is one
bit: can you cook this or not. "Yes, chef!" and "I have a problem" — and
what the problem actually is gets said in the conversation underneath,
where the sender can answer it.

---

## 2026-08-24

**Added: voting by show of hands** (`0040`–`0042`). A fourth voting mode
for a dinner that would rather not have eight phones out at the table. The
Executive Chef reads the dishes, counts the hands and enters the totals in
three passes — **thirds first, then seconds, then firsts**. That order is
deliberate: asking for favourites first makes the next two questions feel
like consolation and people re-vote for the answer they already gave.
Working up keeps each pass a real question, and the winner is the last
thing said out loud.

Points follow the places (3rd = 1, 2nd = 2, 1st = 3) and the totals are
written into the same `results` table the online vote fills, so every
screen after the count — results, publishing, the reveal — is untouched
and does not need to know how the numbers were reached. Verified end to
end: 4 firsts + 2 seconds = 16 points, first_places 4, rank 1, round moved
to RESULTS.

`manual_tally` holds counts per dish per place and nothing else. No voter
column, deliberately — nobody is writing down who raised a hand, and a
table that *could* hold it would invite somebody to.

`get_manual_menu` shows who cooked what, which `get_ballot_options`
withholds. The online ballot is blind on purpose; a show of hands is not —
everybody watched that person carry the dish in.

**Added: the last door out of a frozen menu** (`0041`). `clear_assignment`
takes `p_discard_briefs`. The refusal is still the default, but it is no
longer the only answer: a host who has to change the courses after the
roulette has run, with recipes already written, previously had no route at
all. Opt-in, one boolean, and the warning names the cost in full — the
pairings cascade to briefs *and* to every private message on them. It is
the most destructive action in the app and now the only one.

**Changed: three answers to a received recipe.** Two cheerful buttons made
saying no feel like breaking something. The refusal is now written to be
as easy to press and as formal as a kitchen would be: "Owing to an
unforeseen impediment, I am unable to carry this out."

**Changed: the ballot row stacks.** Rank, dish, and two dropdowns on one
line squeezed the dish name — the only part actually being judged — to
nothing on a phone. Dish above, scores below, and the scores drop to one
column under 400px.

**Added: the confirmation-email screen says what is happening.** It was
one borrowed sentence at the worst possible moment: a half-made account
waiting on mail that, from a new sending domain, very often lands in spam.
It now says so, tells you to search rather than scroll, and offers a
resend behind a two-minute floor — which protects the person, not the
provider: hammering resend is what gets a sender marked as spam, and every
extra copy makes the inbox harder to search.

**Added: the confirmation email itself**, in
`supabase/functions/send-email/templates.ts` — written in code rather than
pasted into a dashboard box so it is reviewable and translatable. Tables
not flex, every style inline, no web fonts, no background images, a seal
drawn as text because blocked images leave a hole, and a plain-text part,
which is not optional: HTML-only is one of the strongest spam signals
there is, and a new domain has no reputation to spend.

---

## 2026-08-23 (23)

**Changed: two ways to say yes to a recipe.** Accepting was one flat
button on the one happy screen in the app. There are now two, and they do
exactly the same thing to the sender — "Yes, chef!" and one of six
protests ("Oof. That is not a tomato-mozzarella", "I accept, under
physical protest"). The joke is picked once per visit, not per render, so
it does not shuffle under the cursor.

**Changed: the chain is a line, not a button.** It was a full-width
control for something you look at rather than do. It is now the second
item in the pass, one line, with the link on the right.

**Changed: the roller swaps its contents on the day, it does not grow.**
Day-of phrases now *replace* the everyday ones rather than being added to
them: "What a lovely day!" is not what anybody needs at 19:40 with a dish
in the oven, and "I'm running 30 minutes late" means nothing the week
before.

**Changed: the menu alert offers a way through.** "Somebody is already
cooking that course" now carries two answers instead of one dismissal —
**OK** clears the roulette and applies the change, **No, leave it** backs
out. Safe by construction: `clear_assignment` refuses once anyone has
written, so the OK can only ever throw away a shuffle.

**Changed: voting deadlines are hours.** 5 and 10 minutes are gone; the
options are 1h, 3h, 12h, 24h, 48h. A vote that closes in five minutes is
a vote nobody who stepped out to the kitchen gets to cast.

**Not done, needs a decision: the manual vote.** The idea of asking the
host whether an after-dinner vote is *counted by hand at the table* or
*cast online and anonymous* is a second scoring path, not a setting — it
needs somewhere to record a show of hands, a rule for who may enter it,
and an answer for what "anonymous ballots" means when one person types
them all in. Worth doing, not worth guessing at.

**Design study: three ways to pin the comande** — the spike, the rail
clip, the push-pin — drawn on the same screen so the fixing is the only
variable, each with the paper reacting to it (a punched hole, compression
under the jaws, a dome around the shank). Recommendation is the rail clip,
because a clipped ticket is the only one of the three that reads as *still
open*, which is what an uncooked recipe is.

---

## 2026-08-23 (22)

**Diagnosed: production is broken because 22 migrations were never
deployed.** `Could not find the function public.create_round(p_access, …)`
is PostgREST failing to match by argument name: production is on `0014`,
where `create_round` still takes `p_visibility` and `p_voting_enabled`;
the client has been sending `p_access` and `p_voting_mode` since `0018`.
Nothing to fix in code — `0015` through `0039` need to go up. Not done
here: that is a production change and it is the owner's to make.

**Fixed: the received recipe was still gated on `BRIEFS_CLOSED`.** `0035`
moved the server gate to "has its author submitted", but `waitRecipe` in
the round page still held the drawer shut for a whole phase. The last
place recipes were being delayed.

**Changed: `LOCKED` → "Assignment", `ASSIGNED` → "Preparation".** Named
after what happens in them rather than after what the state machine calls
them.

**Changed: the chain moved to the pass.** Seeing who cooks for whom is a
power, not a roster detail, and it was buried in the list of names. It is
a button in the pass from the moment there is a chain to look at.

**Added: `clear_assignment`** (`0037`). There was only re-roll, and re-roll
refuses once anyone has written — correct, but it left no way back at all.
The specific trap: the menu is frozen while any pairing uses a course, so
a host who spun the roulette and then wanted different courses had a
button saying no and none saying undo. Same guard as re-roll: a shuffle
can be redone, somebody's work cannot be thrown away by a button.

**Fixed: the menu error was a dead end.** "Someone is already cooking this
dish" left the arrow armed and the message on screen with no way out but
leaving the page. A small OK clears both.

**Changed: the fridge is signed** (`0037`). Board lines now carry the
author's secret name and a food icon that stays with that person all
evening — asked for knowingly, and it is a real reversal: the board was
unattributable first by collapsing phrases (`0031`), then by withholding
the author (`0033`). A pseudonym can now be followed across an evening's
messages. Real identities are still the game's secret, and the clock is
still withheld.

**Added: phrases for the day itself** (`0037`). "Running 30 minutes late",
"stopping at the shop", "does anybody have a corkscrew". Marked with a
`day_of` column rather than a new category value — `ALTER TYPE … ADD
VALUE` cannot be used in the transaction that adds it, which is why `0030`
and `0031` had to be split in the first place. Offered only while the
round is in `DINNER`; before then they are noise on the roller.

**Added: the kitchen brigade as a second pseudonym set** (`0038`, `0039`).
The theme picker was a disabled control with one option. It works now, and
it is free: a second word list changes nothing about how the game is
played. What stays paid is the *look* of an evening.

The 24 names were checked against the brigade de cuisine rather than
recalled — saucier, poissonnier, rôtisseur, grillardin, friturier,
entremetier, potager, légumier, garde-manger, tournant, pâtissier,
confiseur, glacier, décorateur, boulanger, boucher, aboyeur, communard,
commis, plongeur, marmiton, écailler, chef de partie, sous-chef. Two were
dropped: **limonadier** (a beverage role, not a kitchen station — despite
appearing in the design mockups) and **chef de garde** (a shift, not a
station).

**Added: table themes named in settings** as Pro, coming soon, next to
everything that isn't for sale — so the difference is visible rather than
asserted.

---

## 2026-08-23 (21)

**Retraction: the re-roll data-loss finding in entry 20 was wrong.** The
delete and the cascades are real, but `generate_assignment` refuses
outright if any brief exists in the round (`0005` line 46) — five lines
above the delete, with a comment saying exactly that. The delete is
unreachable once anyone has written. The guard was read past and the
finding should never have been filed; it is struck from the README's
not-built list and corrected in entry 20.

What actually happens when a member leaves is what `remove_member` already
does carefully: **only the departing chef's recipe can be lost**, and only
when their dish and the incoming one are both already submitted. Where one
is unsubmitted the finished brief is kept and re-attributed, with
`original_sender_id` recording who really wrote it so the reveal does not
lie about authorship.

**Fixed: the menu could not be composed where it had just been moved to.**
Entry 20 moved course selection to `LOCKED`; `add_course`, `remove_course`
and `set_slot_mode` all gated on `DRAFT`/`OPEN` and would have raised
`MENU_LOCKED` every time. `0036` opens all three to `LOCKED`, which is the
right window anyway — it is the first moment the number of chefs is
settled and the last before the roulette. `COURSE_IN_USE` still does the
real protecting: once pairings exist, a course nobody may move.

**Added: `change_course`** (`0036`). Swapping a course was delete + add,
which left the menu one course short of the table in between — the exact
condition `generate_assignment` refuses on, so a host interrupted halfway
was left with a dinner that would not start and no clue why. One
statement, one lock, no window. In the panel it is the same turning arrow
as the status control: it arms the picker below, and "Add" becomes
"Change".

**Changed: the pass stops repeating itself.** "Sign-ups are closed" was
being said at every phase after `OPEN` — telling the host something they
knew, about a door they had shut themselves. That guidance now lives only
in settings, where someone goes looking for it, and the pass instead
explains *what the pass is* while the round is still in `DRAFT`, which is
the one screen where there is nothing else to do.

**Changed: the how-to is a numbered list.** Adding somebody after the door
closed was one dense paragraph describing a sequence of actions. It is now
four numbered steps, then three separate notes — what is kept, what pauses,
what genuinely changes — each marked down the left.

**Changed: the dinner's details read like a menu.** Two columns meant the
widest label set the gutter and every value was squeezed into what was
left, worst on a phone where "Timezone" alone ate a third of the line.
Label above, value under it, both full width, with the rule between
entries rather than inside them.

---

## 2026-08-23 (20)

**Retracted (same day, see entry 21): the re-roll data-loss claim was
wrong.** `generate_assignment` does delete every pairing and briefs do
cascade off pairings — but five lines above the delete it refuses outright
if any brief exists in the round. The delete is unreachable once anyone
has written. The guard was read past; the finding should never have been
filed.

**Changed: a recipe reaches its cook the moment it is submitted**
(`0035`). `get_my_brief` gated on the round having reached
`BRIEFS_CLOSED`, so the whole table waited for the slowest writer and then
waited again for the Executive Chef to notice and push the phase. The gate
moved from "which phase is the round in" to "has its author finished" —
drafts stay invisible, because a cook seeing half a recipe would start
shopping from it.

**Changed: `BRIEFS_CLOSED` left the journey** (`0035`). With recipes
landing on submit it had no job. `advance_phase` now steps `ASSIGNED ↔
DINNER` directly, treating the phase as transparent in both directions;
the enum value stays so rounds already parked there keep working, and
`nextPhaseFor`/`previousPhaseFor` fall back to the full order for exactly
that case. Verified all four paths, including that `ASSIGNED → VOTING` is
still refused.

**Changed: the pass shows the right things at the right time.** The join
code and the invite box moved from `DRAFT || OPEN` to `OPEN` alone — a
code handed out before the door opens gets refused by `join_round`, which
requires `OPEN`. Course selection moved from `OPEN` to `LOCKED`: the
number of slots must equal the number of chefs, and that number is only
settled once the table is locked; in `OPEN` it was a sum that changed
under the host every time somebody joined.

**Added: how far the recipes have got.** A bar plus "5 of 8" in the pass
during `ASSIGNED`. The tally had been removed from the *My recipe*
envelope, where it was the wrong thing on a personal drawer; on the pass
it is exactly right.

**Added: the vote's clock, for everybody.** A deadline could be set and
nothing anywhere said so — not even to the host who set it. `VoteCountdown`
ticks in the round page for every participant, and `voting_closes_at`
joined the columns the client actually selects, which is why nobody could
see it.

**Added: how to add somebody after the door closed.** In the pass and in
settings, where the code used to sit at every phase. It says the route
(step back to sign-ups, let them in, move forward), what survives
(everything), what pauses while the door is open (writing and reading
recipes), and the two things that genuinely change — course counts, and
one chef ending up with a different recipe when the newcomer is spliced in.

**Changed: the two conversations are two cases.** *My recipe* is headed
with the pseudonym of the chef you write for; *Recipe received* is headed
with a redaction, because `get_my_brief` never sends who wrote for you —
the bar covers a placeholder, which is the only use `.redact` allows.
Dates dropped to `mm-dd`, small, under the message.

**Added: "This dinner at a glance"** in settings — setup kind, access,
anonymity, voting, courses, approval, seat cap, each marked with whether
it is still changeable. The choices were made once in the creation form
and never shown again.

**Fixed: the step-back confirmation closes when you accept it.** The
component is not unmounted by the phase change, so it stayed open showing
a fresh offer to step back *again*, which read as though the first one had
not worked.

**Added: Pro, said honestly.** The two switched-off v2 options are marked
Pro, and the note beside them leads with the part that matters: the whole
app stays free, every dinner and every feature that changes how the game
is played. Pro sells flavour only — better tables, themed evenings, and a
still-unsettled idea about a host sharing what they bought with their
table.

---

## 2026-08-23 (19)

**Corrected: stepping a dinner back destroys nothing.** The assumption
being designed around was that going back from `ASSIGNED` would force the
pairings to be redone from scratch. It doesn't. `advance_phase` (`0006`)
on a backward step runs exactly one statement — `update rounds set
status` — and touches no other table. Pairings, briefs and ballots all
survive. What changes is only what people are *allowed to do* at that
moment, because every action RPC gates on the phase: `join_round` needs
`OPEN`, `save_brief_draft` needs `ASSIGNED`, `submit_ballot` needs
`VOTING`, and the cook can only read the recipe they received from
`BRIEFS_CLOSED` on.

So the warnings say that instead. One per destination, written from those
gates rather than from intuition, plus a standing line that nothing is
deleted. Re-rolling the assignment *is* destructive — but that is
`generate_assignment`, a separate button with its own question.

**Changed: no browser dialogs anywhere.** All four remaining
`window.confirm` calls are gone — step back, re-roll the assignment,
remove a chef whose dish is already submitted, cancel the dinner. Each is
now an `InlineConfirm` on the page, beside the control that raised it.

A `confirm()` tears the reader out of what they were looking at, strips
the message of formatting, cannot say what will happen in more than one
flat sentence, and gives the destructive option a button identical in
weight to the safe one. The step-back warning in particular now opens **in
the gap it describes** — under the course you would go back to, above the
one you would leave — which is the one place it reads without explanation.
The buttons are small: the weight of a decision belongs in the words, not
in the size of the target.

**Fixed: the rolling pin's right-hand end.** Both handles were tucked
under the barrel by the same negative margin, but paint order follows the
DOM, so the left one was drawn under the barrel and the right one over it
— same markup, opposite result. The barrel now sits on its own stacking
level above both.

Handles went from 46×22 to 64×28, the barrel from 84 px tall to 58, and a
chevron sits at its right-hand end and bobs until the pin is first turned.
A cylinder drawn flat gives no hint that there is anything above or below
the phrase in the light, and the hint retires once it has taught the
gesture rather than decorating the control forever.

---

## 2026-08-23 (18)

**Changed: Status is a menu card.** A dropdown reading "Current phase:
ASSIGNED" told the host one fact and hid the shape of the evening. The
phases are now written as a menu: courses already served struck through,
the one being plated marked, the rest still to come. Where the dinner is
became something you see rather than something you read.

Going back is deliberately two gestures. A turn-back arrow sits beside the
last course actually served — the one a step back un-serves — and it only
*offers*; the button it reveals is what acts. Stepping a dinner backwards
can strand work people have already done, and it should never be one
mis-tap away.

**Changed: Vote is "Vote the menu", and the menu comes first.** The ballot
opened straight onto the thing you drag rows around in, so the only way to
see what the meal *was* was to read the control. The dishes are now a menu
card above it — read top to bottom, touch nothing — which separates "what
was served" from "what I thought of it".

**Changed: the rolling pin turns the right way.** Side to side was the pin
sliding along the counter. It rolls top to bottom now: a phrase rises into
the bright band across the middle and leaves under it, which is the
direction the surface of a pin actually travels. Handles went from 26 px
square caps to 46×22 — long enough to read as handles.

**Changed: the Messages envelope carries a mark that ranks.** A chef
writing to you personally always outranks the table being cheerful, so the
chef stays even when new fridge lines land on top of it; the fridge only
gets the envelope when nobody has written to you. The count was replaced
by the mark itself — the number was never the useful part.

**Changed: the fridge forgets after a day** (`0034`). Board lines are
"what a lovely day!" and "don't burn a finger" — worth reading for an
evening, worth nothing after it, and left alone they accumulate forever.
Two halves: `get_board` serves nothing older than 24 hours, and
`post_to_board` sweeps the round it is posting to. Posting is the only
moment the board is written to anyway, so it is the cheapest place to
sweep and it needs no scheduler.

The date left the bubble with it: at a day's retention it always said
today, so it was a line of text that never varied.

**Changed: the dinner's details are actually details** (`0034`). One
free-text `location` box was doing the work of a city and a street, so the
envelope could only ever show one line and it was usually the wrong one.
`city` is a new column, `notes` was already there and unused. The envelope
shows the city closed; open, it lists dinner, city, address, date, time,
timezone and what else guests should know — each on its own line, blank
fields omitted rather than printed empty.

Times are read in the dinner's timezone, not the reader's, and in `hh:mm`.
A guest flying in wants the time they have to be at the door.

**Changed: the chain is a ring.** A list of "A → B" rows could only assert
that the chain closes — the host had to read to the bottom and trust
"loops back to A". A circle shows it, puts every arrow between neighbours
because members sit in cycle order, and makes the two failure modes
visible instead of deduced: a member who has fallen out is not on the
ring, and a chain a manual swap has split into two is two rings. The
written pairs stay underneath, because a name is easier to copy from a
line than from a diagram and a screen reader gets a list rather than a
picture.

**Removed: `cutlery_anim.gif`.** Same animation as the MP4 already beside
it, five times the weight, and impossible to pause. Nothing referenced it.

---

## 2026-08-23 (17)

**Added: the first real images, and they were put on a diet first.**
`inside_fridge.png` (1122×1402, 1.2 MB) and `cutlery_anim.gif` (888 KB)
arrived in `public/`, which is the one folder where a full-size master is
expensive: everything there is copied into `dist/` and then precached by
the service worker, so it ships to every phone that installs the PWA
whether or not anyone looks at it. `DESIGN.md` §4 already said as much.

Both masters moved to `assets-src/` — kept in the repo, out of the build —
and what ships is a resized WebP (820 px, **42 KB**, 28× smaller) and the
MP4 already sitting beside the GIF (165 KB, same animation, 5× lighter).
`assets-src/README.md` has the regeneration command.

**Changed: settings is the crossing cutlery, not the word.** Beside the
dinner's name, a second piece of text competed with the title for the same
line. It is a `<video>` with the still as its poster and `preload="none"`,
so the file is not fetched until somebody points at it — still by default,
moving on hover, because the movement *is* the affordance and a header
that animates unprompted is a distraction the whole page pays for.

**Changed: the Fridge is the picture, and it holds still.** The hand-drawn
shelves are gone. The illustration is painted on the container at a fixed
420 px and the conversation scrolls over it inside that window — growing
the fridge to fit the messages would turn a room into a background. A 34%
white veil sits between, so an opaque bubble doesn't have to fight a
fridge full of groceries for contrast.

Bubbles are pared back to the text: no border, 4 px / 8 px of padding, and
the date is a 9 px footnote rather than a second line of content.

**Fixed: the roller was unrecognisable, so it was rebuilt as a rolling
pin.** It was vertical, showed one phrase at a time, and had nothing at
either end — which reads as a cropped list, not an object. A rolling pin
is horizontal and it is mostly handles; that is what makes it a rolling
pin. The barrel now lies across with a turned handle sticking out of each
end, and each phrase takes 66% of the barrel so the previous and next ones
show at the edges. Seeing that there is more either side is the entire
reason it reads as something that turns.

Underneath it is still an ordinary scroll container with snap points —
horizontal now — so wheel, swipe, Tab and arrows all work. Measured after
the change: three phrases partly visible at any scroll position, handles
26 px against a 61 px barrel.

---

## 2026-08-23 (16)

**Changed: the board became a conversation, and moved into a fridge**
(`0033`). Messages was one long scroll: a public board that grows all
evening, with the two private threads permanently below it. It is now two
folds.

*The Fridge* is the public half, drawn as the inside of an open fridge —
cold light off the back wall, glass shelves, bubbles standing on them.
Classic chat layout: yours right, everyone else's left, each bubble
carrying a food icon.

**The icon is per message, never per person.** It is derived from the
message id, which is random per row, so the same person gets a different
one every time they speak. An icon that stayed with someone would be a
pseudonym you could follow all evening — which is exactly what the board
has always refused to hand out.

What `0033` does give up, and it should be said plainly: `0031` collapsed
identical phrases into one line with a count, which made the board
unattributable *by construction*. A chat needs its rows one per message,
so that is gone. What is not given up, and must not be later: the author
never leaves Postgres, and the only clock exposed is the day. A reader
gains the count and the order of messages, not who wrote any of them.

Reporting now takes down one bubble instead of every copy of its wording,
and a flagged message stays visible to its own author only — a phrase
vanishing for everyone would itself be a signal that somebody flagged it.

*Your Chef* is the other fold: the two private threads, which are where a
question actually gets answered.

**Added: the roller and the egg.** The phrases sit on a drum you turn
rather than a list you read — two or three in the light, the rest curving
away. Underneath it is a scroll container with snap points, so the wheel,
a swipe, Tab and the arrow keys all still work; the cylinder is shading,
not a widget. Beside it is an egg-shaped die that picks a phrase at random
and sends it, then spins the drum to what it chose so you can see what you
said.

**Changed: the table props move.** They were drawn for three states but
stood in the same place in all three, so the wear was a texture change
rather than an evening passing. Plate, glass, bowl, napkin, fork, knife
and a new bread board now each have their own position per phase: the
plate is shoved in and turned −7° with leftovers on it, the glass wanders
down the screen and leaves its ring where it *was*, the cutlery stops
being parallel and ends up thrown on the stack. Crumbs are in two tones,
because crumb and crust are not the same colour and one tone reads as
noise.

Verified by mounting the three states side by side and measuring: every
object's box moves between phases, and none of them is in the same place
twice.

---

## 2026-08-23 (15)

**Added: the design direction is written down.** `DESIGN.md` transcribes
the "Buste sulla Tavola" artifact, which until now existed only as a link.
It carries the palette, the three rules (nothing readable touches the
gingham; one light; one camera), the envelope→document gesture, the three
states of table wear, and the render constraints. Two sections are new
rather than transcribed — "La lista dei chef" and "Quando si scoprono i
chef" — because the redaction in the mockup was a picture, and it needed
to be a rule.

**Changed: the roster stays covered until sign-ups close** (`0032`). Names
appearing one at a time as people joined turned arrival order into an
identity leak — whoever showed up right after you passed the code to Marco
*is* Marco. No bug needed; the timing alone gave it away.

`list_round_members` now withholds `secret_name` while the round is
`DRAFT` or `OPEN`, and column-level `SELECT` on that column is revoked
from `authenticated`, so the client has to come through the function. This
had to be a server change: `.redact` is a drawing, and the browser is
assumed hostile — a covered name still on the wire is readable in the
network tab.

Ordering moved from `joined_at` to `secret_name` for the same reason. A
list revealed in arrival order hands the leak straight back the moment the
bars come off.

Two exceptions kept, both already decided: you always see yourself
(`.chef-you`), and the host reads pending members' real names at the door
(`0015`), because approving a pseudonym is approving nobody.

**Changed: settings and round creation fold.** New `Fold` component, built
on `<details>`/`<summary>` so the keyboard, screen readers and
find-in-page work without being reimplemented. The settings page's six
headings and the seven custom-round options are shut by default and open
one at a time; a closed row keeps its current answer visible on the right,
so folding hides the choices without hiding the choice you made. This was
item 2 of the pick-up list.

**Changed: "1 / 3" on *My recipe* became three glyphs.** The envelope
showed the table's tally of submitted briefs on the one drawer that is
entirely about you, which read as a score you were losing. It now shows
your own state: `○` not written, `◐` draft saved, `●` sent to your cook.

**Fixed: the wide ingredients field came back to quick mode.** Quick mode
had a name, one prose block and a link — the ingredients field had gone
missing entirely. It's a textarea, one ingredient per line, saved as the
same rows careful mode produces so the cook gets a list either way.
Switching modes translates between the two shapes instead of discarding
what's typed, and a draft whose ingredients carry no quantity or unit
reopens in quick mode rather than exploding into rows.

**Changed: three small orientation fixes.** The header name is now visibly
the way home (an arrow unfolds out of it on hover, and it lifts); dinners
you host carry a toque next to the name in the list, since hosting and
attending looked identical; and *Join with a code* has a back link, which
it needed most of all because it is usually reached cold from a link.

---

## 2026-08-22 (14)

**Changed: allergens inform instead of blocking** (`0029`). A dish whose
tags matched somebody's severe allergy or diet could not be submitted at
all. The intent was safety; the effect was a refusal at the last possible
moment, delivered to the one person who could do nothing with it — the
sender had already written the recipe, and the allergic guest never
learned a thing.

Now the dish is served and everyone who needs to know is told: the sender
is asked to put a card by it, the Executive Chef gets a note naming the
dish and the allergen so they can say it when the food goes down, and any
diner can look up which dishes carry what — `get_allergen_dishes` is open
to the whole table, not just the host, because the point of informing is
that the person with the allergy decides for themselves.

The detection is unchanged and still runs against everyone's restrictions
rather than one cook's. What changed is the consequence, deliberately: a
card is what a host would actually do, and an adult with an allergy at a
shared buffet is better served by knowing than by one dish silently never
existing.

**Added: the board** (`0030`, `0031`) — one channel the whole table reads
and posts to, from ten ready-made cheerful phrases in both languages.

Its own table rather than a loosened `messages`, because that one has no
player-facing SELECT policy *ever* (enforced by REVOKE, not just RLS)
precisely so a pairing message can't give away who wrote to whom before
the reveal, and every row carries a `pairing_id` and a `direction` that
mean nothing for a message addressed to everybody. Sharing it would have
meant an "unless it's a broadcast" branch inside each of those guards.

**Nothing is attributed, and not merely by omission.** Identical phrases
collapse into one line with a count, so three people saying "everything's
ready" is one cheerful fact — which leaves nothing to attribute even
before the RPC decides what to send. The author is still on the row and
never leaves Postgres, which is what lets a reported phrase be acted on.

**Changed: the props are drawn rather than sketched.** Soft radial shading
instead of flat fills, a rim highlight on each glazed surface cut to an arc
(a rim only shines where it faces the window), and every shadow falling
from the same upper-left light. Getting that consistent is most of what
makes a set of objects look like they share a table — and it's the same
rule the real renders will have to follow.

**Two smoke tests updated, again because a rule changed rather than
broke.** `smoke_test.sql` ended on the dietary refusal as its final
assertion; it now asserts the opposite — submission succeeds and the host
alert exists. `smoke_test2.sql` opened by "fixing" that brief and
resubmitting, which is now impossible because it was accepted the first
time. New `smoke_test7.sql` covers the board end to end and the allergen
notice. All seven pass.

## 2026-08-22 (13)

**Two smoke tests updated to match behaviour they were written before.**
Both failures were the new guards working, not regressions — worth
recording because a red suite after a deliberate change is exactly when
it's tempting to weaken the change instead of the test.

- `smoke_test3.sql` inserted courses straight into `slots`, which `0027`
  revoked. Now uses `add_course`, so it exercises the phase precondition
  the direct write never had.
- `smoke_test2.sql` read the results as a player the moment the round
  reached `RESULTS`, which `0025` no longer allows on a LIVE round. It now
  asserts the whole sequence instead: a player is refused with
  `RESULTS_NOT_PUBLISHED`, the host can see them all along — that being
  the point — and after `publish_results` everyone can.

All six pass.

## 2026-08-22 (12)

**Fixed: deleting a course after the roulette had run gave a raw
constraint error.** `pairings.slot_id` is NOT NULL and points at the
course, so removing one — or switching the menu back to free, which
removes them all — aborted with `violates foreign key constraint
pairings_slot_id_fkey`. Nothing had stopped the attempt, because the RLS
policy asks "are you the host", not "is this still a menu anyone can
change".

The fix isn't a friendlier message on the same path: changing the menu is
a decision with preconditions, and preconditions don't belong in a policy
that only knows who you are. `add_course` and `remove_course` (`0027`)
carry the phase check, direct writes to `slots` are revoked, and the two
failures have names — "the menu is set, the chefs already have their
courses" and "somebody is already cooking that course".

**Changed: one pass instead of a column of panels.** Named after the pass
in a real kitchen — the counter orders are called across, where everything
goes through one person. It shows only what's up right now, and opens by
itself only when the round is genuinely blocked on the Executive Chef.
Long notices became one line with the detail folded behind it: the
late-joiner warning was three sentences sitting permanently above the
dinner.

**Changed: writing a recipe has two modes** (`0028`). Quick is a name plus
either a link or one block of text; detailed is the itemised version for
whoever enjoys it. `submit_brief` used to demand a name, 50 characters of
procedure, an ingredient row *and* an "I confirm the allergen tags" tick —
reasonable one at a time, and together a form nobody fills honestly.

Removed from the form: difficulty, prep time, cost, note to cook, and the
course dropdown. The course was never the sender's to choose — the
roulette decides it, or the round is free-for-all — so offering it invited
people to contradict their own assignment. It's now stated, not asked.

**Changed: allergen tags are found, not ticked.** They were a row of
checkboxes plus a confirmation, which is a chore that means nothing: a tick
nobody understands is an obstacle people learn to click through, not
consent. The labels are already known — they come from the table's own
restrictions — so the editor scans what was written for them, whole words
only so "nuts" doesn't fire on "doughnuts".

When something matches, the sender gets the one instruction that actually
helps at a shared table: *"Put a card next to this dish — it contains
nuts, and somebody at this table has said that matters to them."*

**Unchanged, deliberately:** severe allergies and diets still hard-block
submission. The dish goes on a shared table, so it is still checked
against everyone's restrictions rather than just its cook's. What changed
is who does the tagging, not whether the check happens.

**Changed: the dietary panel got shorter.** Every card carried the full
kind label — "Diet (vegetarian, vegan, halal, kosher, no pork…)" above the
word "nuts" — which made four restrictions taller than the dinner. The
icon already says which kind it is; the words moved to its tooltip.

## 2026-08-22 (11)

The menu, and why it looked broken.

**Fixed: the menu could only be decided in the seconds before a round
existed.** `slot_mode` was create-time-only, and the courses UI only
renders for a `CATEGORIES` round — so a host who took the default and
later wanted a proper menu had no route to one. The report was "I can't
remove menu elements"; the truth was there were none, and no way to ask
for any.

`0018` had said keeping it immutable was correct, and it was — but for a
narrower reason than "settings don't change". `CATEGORIES` needs each
brief to know its course *before* it is written, which is only true once
the assignment exists. Before `LOCKED` there is no chain and no brief, so
switching is free. `set_slot_mode` (`0026`) refuses at exactly that line
instead of at creation.

Switching back to free deletes the courses. They describe a menu nobody is
cooking, and keeping them would let a later switch silently resurrect a
menu the host thought they had thrown away.

**Fixed: a rule that was enforced and never stated.** `generate_assignment`
has always refused unless the courses equal the seated chefs — one dish
each — so a host one course short met a refusal rather than a count, which
reads as a broken button. `get_menu_status` returns both numbers and the
panel shows the arithmetic as it happens: *"0 courses for 2 chefs. Every
chef cooks exactly one dish, so these two have to match before the
roulette can run."*

**Changed: composing the menu sits with the other host actions**, above
the envelopes, not on a settings page someone would have to know to visit
— and it knocks for attention while the courses don't add up. Terminology
follows: *compose the menu*, *free-for-all* or *a composed menu*.

**Verified in a browser:** switching free → composed, adding a course
(count goes to 1 of 2), and removing it again (back to 0) all work from
the round page. Migrations applied with `migration up`; TypeScript, oxlint
and build clean; 307 locale keys in both languages.

## 2026-08-22 (10)

Phase 3 (voting), plus four corrections to how the round page behaves.

**Fixed: back only worked on round pages.** `BackToTable` needed a
`roundId`, so the profile — reachable from a dinner — had no way back at
all: you could only leave via the home screen and in again. It now asks
history, with a fallback for the cases where there isn't any (a deep link,
a reload, a PWA opened cold), so it is never a dead control.

**Changed: the tablecloth is the app, not one page of it.** Writing a
recipe used to drop you onto plain white. The cloth now sits under every
screen and each page is written on a `.sheet` — the rule that nothing
readable touches the checks holds everywhere rather than only where it was
first written.

**Changed: host actions fold.** Three panels stacked open above the
envelopes pushed the dinner itself off the screen. Each is a `<details>`
with a triangle now, and the one the round is actually blocked on takes
the accent colour and knocks a few times before stopping — something that
never stops asking is something people learn to ignore.

**Fixed: a stray rule between names.** The fold crease drawn on every
opened envelope reads as folded paper on a short letter and as a
horizontal rule cutting through the content on a list of names. Now opt-in
(`.letter--creased`), kept for the takeover screens where the page really
is one sheet.

**Added: removing a chef shows the chain.** "Collapse" and "leave" are
words that mean nothing until you can see what each does to the people
either side, so the choice is now drawn: `A → B → D → E` against
`A → B → ✕   D → E`.

### Voting (0024, 0025)

`0018` recorded LIVE/TIMED/DISABLED and deliberately left `advance_phase`
alone, because the phase machine only ever needed to know *whether* voting
happens. This is the other half — who triggers it, when results become
visible, whether a vote can be changed — and it also leaves the phase
machine alone: everything is a new column defaulting to today's behaviour,
or a new host-only RPC.

- **A deadline that can actually be set.** `voting_closes_at` has existed
  since `0001` and `submit_ballot` has always respected it, but nothing
  could write it — the column was a promise the app never kept. Fixed
  minutes rather than a free datetime: this is decided at a table with a
  glass in hand, not in a calendar.
- **A vote can be changed until it can't.** "Ballots are final" is right at
  the moment the count is taken and wrong for the twenty minutes before it.
  The ballot is withdrawn and recast rather than edited, because
  `ballot_items` cascade — one delete leaves nothing half-rewritten.
- **Results are published, not merely computed.** Reaching `RESULTS` used
  to make them readable by everyone at once, which is the whole of the
  TIMED story and none of the LIVE one. The phase stays one thing;
  visibility became a second question. A TIMED round publishes itself —
  waiting on a host who has gone to bed would miss the point of choosing
  TIMED.
- **Progress without contents.** The Executive Chef gets one number —
  how many have finished — and never a ballot. Counts, from a function, so
  the client has nothing to widen.
- **Skipping without rewriting the round.** The dinner ran long and nobody
  can rank six dishes; `skip_voting` goes to the results and deliberately
  does not touch `voting_mode`. The round was a voting round; this evening
  just didn't get there.

**Verified:** migrations applied with `migration up` (no reset, no accounts
destroyed), round page renders with the folding actions, TypeScript,
oxlint and build clean, 299 locale keys in both languages.

## 2026-08-22 (9)

Four roster and round-page corrections, all from watching someone use it.

**Changed: "spin the roulette" moved out of the Chefs envelope.** At
`LOCKED` the round is waiting on exactly one person to do exactly one
thing, and that thing was hidden two taps inside a drawer — so the page
looked like it was waiting for nothing. It now sits in the open with a
line saying what it does, and players see the matching "waiting for the
Executive Chef" instead of a page with no visible state.

**Changed: removing a chef is a mark, not a button.** A full-width Remove
beside every name gave the rarest action in the roster the same weight as
the person it sat next to, and then put a `confirm()` on top. Now it's a
small banana peel you have to aim at, and the named choice it opens *is*
the confirmation — two deliberate taps either way, one fewer modal. The
one interruption that stays is the case where both dishes are written and
one is about to be discarded; that genuinely deserves stopping for.

**Fixed: the invitation banner outlived its invitation.** It kept saying
"your invitation is being held" after the code had been used, until a
reload. `sessionStorage` fires no event in the tab that wrote it — the
`storage` event is for *other* tabs — so nothing told the banner to
re-render. Now published through a small event and read with
`useSyncExternalStore`, so it disappears the moment the code is consumed.

**Added: you can find yourself in the roster.** Every name in the list is
a pseudonym, including your own, so there was no way to tell which
stranger was you. Marked with a wine ring — the same trace the cloth picks
up as the evening goes on, so the answer belongs to the table rather than
to a generic "(you)" label.

**Verified in a browser:** the wine ring lands on the signed-in member and
nobody else, the banana peel appears only beside removable chefs and opens
into a named choice, and the banner is absent once the code is spent.

## 2026-08-22 (8)

Three problems in the join flow, one of them introduced earlier the same
day.

**Fixed: a redirect loop that hid rounds you had joined.** `JoinRoundPage`
read its code as `searchParams.get('code') ?? takeJoinCode()`, and
`takeJoinCode()` is what *clears* the stash — so whenever the URL carried
a code, the short-circuit meant the stash was never cleared. `MyRoundsPage`
then saw a pending code on every visit and redirected back to `/join`,
forever. The symptom was the one reported: a dinner you had definitely
joined never appeared. `takeJoinCode()` now runs first and
unconditionally; the URL still wins as the value.

Introduced in 2026-08-22 (5) along with the stash itself, which is a
reminder about `??`: it is a control-flow operator, so a call on its right
side is a call that might not happen.

**Fixed: "already a member of this round" shown to people who weren't.**
`join_round` used one existence check on `round_members`, but that row
covers four situations and only one of them is "you're in". Someone who
asked to join a round that requires approval gets a row immediately,
unapproved — and was then told they were already a member, which is
exactly the opposite of what they needed to know. `0023` splits it into
named outcomes: `ALREADY_MEMBER`, `AWAITING_APPROVAL`, `PREVIOUSLY_LEFT`,
`WAS_REMOVED`. Named constants rather than prose, for the same reason
`REMOVE_REQUIRES_CONFIRMATION` was: the client must not match on English,
and these have to be sayable in both languages.

`PREVIOUSLY_LEFT` and `WAS_REMOVED` stay refusals rather than silent
re-joins — rejoining after removal would undo the Executive Chef's
decision, and rejoining after leaving would mint a second secret name for
one person in one round. Both want a human, not a retry.

**Added: the invitation is visible while you sign up.** Following a dinner
link without an account dropped you into a sign-up form with nothing to
suggest the invitation had survived, or that finishing would take you
anywhere near the dinner. A sticky banner now names the code on every
screen of the detour, until it's used. It shows the code and not the
dinner's name deliberately: the name would have to be readable by someone
not signed in, which turns a code into something you could probe for.

**Verified end to end in a browser**, with two accounts: a stashed code
survives the redirect and is cleared exactly once, the confirmation
appears with the code shown, a second attempt says "waiting for the
Executive Chef" instead of rejecting, and after approval the round appears
on the guest's home screen. TypeScript, oxlint clean; 283 locale keys in
both languages.

## 2026-08-22 (7)

The three loose ends from phase 2, plus two fixes found by using the app.

**Fixed: the language picker only worked once.** Changing language then
changing back needed a page reload. The `<select>` is controlled by
`profile.locale`, which lives in `AuthProvider`'s state — and the handler
invalidated a react-query key that nothing uses, so the stored value never
caught up. The dropdown kept displaying the *old* language while the
interface spoke the new one, and choosing the language it was already
showing fires no change event at all. Now calls `refreshProfile()`, which
re-reads the row the dropdown actually reads from. Also stops changing the
UI language when the write fails: chat templates and secret names are
chosen server-side from that column, so the two drifting apart is worse
than not switching.

**Changed: the code and invite field moved above the envelopes**, and are
mirrored on the settings page. Filling the table is the host's whole job
while sign-up is open, and burying it two taps inside a drawer made the
one thing they need to do the hardest thing to find. Past assignment, a
line explains what adding someone now costs — the chain is opened at one
point to fit them in, so the chefs around that point change partner.

**Added: unread message counts** (`0022`). `messages.read_at` has existed
since `0001` and nothing ever wrote to it, so there was no way to tell a
thread with a new question from one finished yesterday — worse under a
collapsible UI, where what you don't open you don't see. Opening a thread
stamps the *other* party's messages (never your own — that would make
every thread look permanently caught up), and the Messaggi envelope counts
what's addressed to you across both conversations.

**Added: "I can cook this"** (`0022`, `briefs.acknowledged_at`). A cook had
two possible answers — raise `CANNOT_COOK`, or say nothing — with nothing
in between, so a sender who wrote a recipe never learned it landed. Only
the cook can acknowledge, and only a brief actually handed to them.

**Changed: the organiser is the Executive Chef** everywhere a person can
read it. Code, schema and docs keep `host` — this is a label, not a
rename.

**Note on migrating without destroying accounts:** `npx supabase
migration up --local` applies pending migrations against the existing
database, where `db reset` rebuilds it from scratch and takes `auth.users`
with it. The second is what wiped a signed-in account mid-session earlier
today. Two things learned the hard way while applying `0022`: a partly
applied migration leaves its earlier statements in place, so a re-run must
be made safe first; and `create or replace function` cannot change a
`RETURNS TABLE` signature — adding a column needs an explicit
`drop function` first.

**Verified in a browser:** language switches EN→FR→EN with no reload, the
code and invite panel renders above the envelopes on a real round, and the
profile page shows real data. TypeScript, oxlint, build clean; 275 locale
keys in both languages.

## 2026-08-22 (6)

**Fixed: a session can outlive its account, and said so in Postgres.**
Signing up produced `insert or update on table "profiles" violates
foreign key constraint "profiles_id_fkey"` — accurate, and useless to the
person reading it.

`profiles.id` references `auth.users(id)`, so that violation means one
specific thing: the browser holds a signed, unexpired token for an account
that no longer exists. Nothing noticed, because the JWT is still perfectly
valid on its own terms — the mismatch only surfaced when
`complete_signup` tried to write a row pointing at the missing user.

The immediate cause was a development one: `npx supabase db reset` rebuilds
`auth.users` along with everything else, so resetting while someone is
signed in deletes their account out from under an open tab. But the same
state is reachable any time an account is removed, so the fix isn't
dev-only: `AuthProvider` now asks the server who the token belongs to on
load, and if the answer is "nobody" it clears the session and lets the
person sign in again — a clean sign-out instead of an error. `SignUpPage`
recognises the constraint by name for a tab that was already open when the
account vanished, and says what happened in plain words.

Verified in a browser: a token for a deleted user now lands on the sign-in
screen with the stale token removed from storage, no error shown.

## 2026-08-22 (5)

Four fixes and two additions, all from actually using the app.

**Fixed: joining a round by code has never worked.** `0003` created
`turnstile_tickets` with this note beside it:

> "No policies: only the edge function (service_role, bypasses RLS)
> inserts"

The premise is wrong in a way that's easy to miss: **service_role bypasses
RLS, not table GRANTs.** Those are two gates and the table only ever
cleared one. The live grants show service_role holding TRUNCATE,
REFERENCES and TRIGGER — and none of INSERT, SELECT, UPDATE, DELETE. So
`verify-turnstile`'s insert failed with "permission denied", surfacing as
the opaque "Edge Function returned a non-2xx status code", and
`join_round` was never reached. `0021` grants what the function needs.

**Why six green smoke tests never caught it:** every one of them seeds its
ticket by hand as the postgres superuser before calling `join_round`. The
suite has always tested the second half of a path whose first half was
broken. Worth remembering when reading a green run — it proves the code
the test exercises, not the journey a person takes.

**Fixed: a shared round link lost its code at sign-up.** Follow a link
without an account, and `RequireAuth` redirected with `replace` — erasing
the `?code=` from history. You'd finish signing up on an empty "my
rounds" with no idea what became of the invitation. The code is now
stashed in `sessionStorage` at the moment of redirect and picked up on
the way back. sessionStorage rather than localStorage deliberately: this
is one journey, not a preference, and a stale code from last week must
never silently pull someone into the wrong dinner.

**Changed: joining now asks.** A link with `?code=` used to enrol the
visitor the instant the captcha resolved — you could be in a dinner
without ever agreeing to it, and after a sign-up detour you wouldn't know
which one. It now shows the code and asks, with a way to correct it.

**Removed: dark mode.** Tried as a dimmed version of the same table and
dropped: it read as a washed-out copy rather than the same room later in
the evening. The design now commits to one visual world, the way a
photograph does — no `prefers-color-scheme` block and no `[data-theme]`
block anywhere in the stylesheets, every colour defined once. Bringing it
back is a design question (what does this table look like at night?), not
a token-inversion exercise.

**Added: a profile page.** The address you signed up with was invisible,
and dietary restrictions could only be set once during sign-up with no way
back — the wrong shape for the one thing in this app that has to be right,
since every brief in every round is validated against that list. Now:
name, email, language, and add/remove restrictions.

**Removed: the round switcher in the header.** It solved a problem this
product doesn't have — people run one dinner at a time, and every round
they're in is already on the home screen. A dropdown duplicating that list
was occupying the one row visible on every screen. That row now leads to
the profile instead.

**Verified:** driven in a real browser this time. A test fixture user was
seeded in the local database (the same way the smoke tests seed theirs)
and a session minted through the local dev auth API, which is what finally
made the authenticated screens observable. Confirmed rendering: the round
page's envelopes, the four-step host progress bar, the waiting messages,
and the profile page with its real data. `verify-turnstile` now returns a
ticket instead of a 500. Smoke tests 3–6 pass, TypeScript/oxlint/build
clean, 269 locale keys in both languages.

## 2026-08-22 (4)

Phase 2: the round page stops being a flat list and becomes a table.

**Changed: the round page is now a tablecloth with envelopes on it.** The
red-and-white gingham fills the screen; every drawer is an ivory envelope
with a folded flap and a wax seal, laid at a slight angle so a stack reads
as objects someone put down rather than rows in a menu. The direction and
its reasoning are in `PRESENTATION.md`.

One rule holds it up, and everything in `src/styles/table.css` follows
from it: **nothing readable ever sits on the checks.** Every block of text
lives on a `.paper` or `.env` surface laid over the cloth with its own
shadow. The cloth shows in margins, gaps and around the props — it is the
room, not the background of the text.

**Dark mode is not an inversion.** The reference for this whole direction
is a candlelit dinner shot from overhead; light mode is that table at
noon, dark mode is the same table at ten. The checks stay red, the cloth
stays cloth, the luminance drops. A table is a place, and places don't
invert.

**Changed: nine phases became three steps, or four.** The database keeps
its nine because the state machine needs that precision; a diner does not.
Players see Sign-up → Recipe → Vote, the Executive Chef also sees Roles,
because for a player that phase is indistinguishable from waiting.
`RESULTS`/`ARCHIVED` sit past the last step rather than being one, a
`DISABLED` round drops the vote step rather than showing one it will skip,
and a cancelled round gets no bar at all — a fact, not a progress
indicator.

**Added: envelopes that can't open yet say why.** "Opens once the
Executive Chef spins the roulette" rather than a control that simply
doesn't respond. Two rules keep this honest: a drawer that will *never*
open in this round is not rendered at all (a `DISABLED` round has no vote
envelope, rather than one dimmed forever promising something that isn't
coming), and **a dimmed envelope never carries a badge** — it can't be
acted on, so flagging it for attention would be a lie.

**Added: a way back.** `/brief`, `/recipe`, `/ballot`, `/results`,
`/chain`, `/alerts` and `/settings` rendered no back control at all —
a player arriving by deep link, or an installed PWA with no browser
chrome, had only a gesture that may not exist. Worded as putting the
letter back in the envelope rather than as a generic arrow, because the
screen you're on *is* the letter.

**Added: the table wears through the evening.** Laid and clean during
sign-up; by recipe time the plate is askew, the glass has moved and left
its ring, and there are crumbs; by voting the plates are stacked and the
cloth carries the marks. Marks **accumulate rather than reset**, so the
evening leaves a trace instead of looking re-laid between phases. One
table in three states, not three drawings.

The props are placeholders. The three rules the real renders must follow —
one shared camera angle, one shared light source, shadow baked into the
file — are in `TableProps.tsx` and `PRESENTATION.md`.

**Changed: `index.css` split** into `styles/tokens.css`, `styles/base.css`
and `styles/table.css`, deliberately rather than by accretion. Still
hand-rolled, still no framework.

**Verified:** TypeScript, oxlint and `vite build` clean; 259 locale keys
in both languages. **The round page itself has not been seen rendered** —
it needs a signed-in session, and signing in isn't something this pass
did. That is the one outstanding check on this phase.

## 2026-08-22 (3)

Two things found by actually clicking through the app, neither of which
the type checker, the build or six passing SQL smoke tests could have
caught.

**Not a bug in the code: `.env.local` pointed at production.** Creating a
round failed with `Could not find the function public.create_round(...)`
because the deployed project is still on `0014` — migrations `0015`–`0020`
exist only locally. An earlier check in this session claimed the file
pointed at local Supabase; it matched on `VITE_APP_BASE_URL=http://localhost:5173`
and never looked at `VITE_SUPABASE_URL`. `.env.local` now points at the
local stack, with the production values kept beside it in
`.env.production-backup.local` (gitignored) to swap back. Nothing was
pushed to production.

The second report, `round is not open for joining`, is `join_round`
behaving correctly: it distinguishes an unmatched code (`invalid code`)
from a round that exists but hasn't opened yet. A freshly created round
sits in `DRAFT` until the host advances it — worth remembering when
phase 2 designs the progress bar, since "your dinner exists but nobody
can join yet" is a state the current page states only implicitly.

**Added: a ceiling on the seat limit** (`0020`). 30, chosen rather than
rounded to: `secret_name_words` holds 24 entries per locale, and
`assign_secret_name` starts appending random characters once it runs out
("Chef Basilic a3f"). Past two dozen the game stops naming people and
starts numbering them, which spoils the dinner well before it becomes a
technical problem. The floor of 3 was already implicit — a Sattolo cycle
needs three to be a chain rather than a swap — and is now explicit too.

A check constraint rather than a guard inside `create_round`, so it holds
on every path into the column rather than the one that happens to exist
today. The form mirrors it and says so in plain words instead of letting
a raw constraint violation surface after the click.

**Verified:** the constraint rejects 50 on a direct insert, accepts 30,
rejects 2. The language switcher and the local-Supabase connection were
confirmed in a real browser.

## 2026-08-22 (2)

Phase 1 of the redesign: how a dinner is configured, and how people get
into one. Backend and the screens that touch it; the round page itself is
still the old flat layout, which is phase 2.

**Changed: `visibility` described the same act twice.** `PUBLIC_LINK` and
`PRIVATE_CODE` both meant "share a code" — the distinction named nothing
a person would recognise. Replaced by `round_access`: **`CODE`** (share a
code, anyone holding it can ask for a seat) and **`INVITE`** (the host
names existing accounts). A new type rather than renaming values in
place, because Postgres can't remove enum values and `PUBLIC_LINK` would
have sat in the schema forever meaning nothing (`0018`).

**Added: in-app invitations** (`0019`). The host gives the address an
account signed up with, and that person finds an invitation waiting —
accept or decline, no code to mistype or forward. Deliberately **not**
email: the address is only a handle for finding an account, the
invitation is a row. That's what lets this ship now instead of waiting on
the mail provider `send-invite` is still blocked on.

Its own table rather than a new `member_status`, because `round_members`
needs a `secret_name` (not null, unique per round) — minting one for
someone who may decline would burn a name from a finite per-round list
for nothing. Accepting creates the member row properly, secret name and
all, exactly as `join_round` does. An invited member skips approval: the
host already chose them by name.

One deliberate trade-off, worth stating plainly: telling the host "no
chef with that address" confirms whether an address is registered, a mild
account-enumeration surface. The alternative — always saying "sent" —
silently swallows exactly the typo this feature exists to prevent. A cap
of 30 invitations an hour is what stops it being usable as a bulk probe.

**Changed: `voting_enabled` became `voting_mode`** (`LIVE` / `TIMED` /
`DISABLED`) — not *whether* voting happens but *how*. `advance_phase` is
deliberately **not** rewritten: the phase machine only ever needed to
know whether voting happens at all, and LIVE vs TIMED differ in who
triggers the transition and when results publish, which is phase 3's
problem. So `voting_enabled` survives as a **generated column** derived
from the new one, and every existing branch — including 0013's guard
stopping a DISABLED round re-entering `VOTING` — keeps working untouched.
`smoke_test6.sql` asserts the column can't be written directly, so the
two can't drift.

**Added: `SPY` anonymity** (`0017`, `0018`). The host keeps every member's
real name beside their pseudonym; nobody else does. Distinct from the
chain-reveal gate, which is about who cooks for whom — a SPY host still
has to ask before seeing the chain. `get_member_identities` is host-only
*and* refuses outright on a round that isn't SPY, so it can't be reached
by accident on an anonymous one. Its own migration for the enum value,
because Postgres won't let a value added by `ALTER TYPE` be used in the
same transaction, and Supabase runs each migration file as one.

**Frontend:** a classic/custom split on round creation (classic decides
nothing — covered dinner, one recipe, voting on), the invitations inbox
on the home screen, an invite field for the host, and past dinners folded
into a collapsed section instead of accumulating in the main list
forever. Tema chef and recipes-per-brief appear disabled, so the shape of
the product is legible before either is built.

**Changed: English is now the default language**, and there is finally a
way to change it. Language was chosen by browser detection alone, with no
override — a French speaker on an English phone had no recourse. The
picker writes `profiles.locale`, not just the client language, because
chat templates and secret-name word lists are stored per locale in
Postgres and read with that column; switching only the browser side would
have left a French player with English canned messages.

**Verified:** new `smoke_test6.sql` (voting_mode driving the generated
column and refusing direct writes, SPY identity reads rejected for
non-hosts and on non-SPY rounds, invitations end to end including typos,
double answers, and inviting an existing member). All six smoke tests
pass. TypeScript, oxlint and `vite build` clean; both locale files carry
all 237 keys. The language switcher was driven in a real browser — the UI
flips FR/EN with no console errors. **Authenticated screens were not
driven end to end**: that needs a login, and signing in isn't something
this pass did. Not pushed to production.

## 2026-08-22

First code from the presentation redesign specced in
[`PRESENTATION.md`](./PRESENTATION.md) — its phase 0, plus a real bug and
a design gap found while validating it. Frontend still on the old flat
round page; the drawer shell is phase 2.

**Fixed: the host was approving people they couldn't identify.** The
roster addressed every member by `secret_name`, including the ones still
waiting to be let in, which makes a human approval step meaningless. This
was assumed to be a frontend that had simply forgotten to ask for the
name; it wasn't. `profiles_select_co_members` (`0002_rls.sql`) requires
**both** sides of the join to be approved, so a pending member's
`display_name` is unreadable to every client, the host's included —
`smoke_test4.sql` asserts exactly that, and gets 0 rows.

Widening that policy would have exposed pending profiles to the whole
round rather than to the one person doing the vetting, so
`0015_pending_member_identity.sql` adds a narrow host-only
`get_pending_members` instead. It covers the moment of the decision and
stops returning a member the instant they're approved — from then on they
are their secret name to everyone, host included.

**Fixed: `remove_member` crashed with a raw duplicate-key error**, on the
branch that exists to preserve a departing member's finished brief. It
did:

```sql
update pairings set sender_id = v_edge_in.sender_id where id = v_edge_out.id;
delete from pairings where id = v_edge_in.id;
```

which briefly puts two rows on the same `sender_id` — and
`unique (round_id, assignment_version, lap, sender_id)` (`0001`) is not
deferrable, so the UPDATE aborts before the DELETE can clear the
conflict. It fires whenever the departing member had submitted and their
own sender hadn't: precisely the case that branch handles. Fixed by
deleting first (both rows are already held in record variables, so the
reorder costs nothing).

This is what made `smoke_test3.sql` fail roughly one run in three —
blamed on flakiness, actually a reachable product bug whose trigger
depended on which random Sattolo assignment came out. Five consecutive
runs pass now; before the fix, two of three did. `smoke_test5.sql` reads
the chain back after assignment and picks the submitting member from it,
so the branch is exercised deterministically instead of by luck.

**Added: the host chooses what a departure costs**
(`0016_removal_mode.sql`, new `removal_mode` enum). Removing a link from
the chain always loses one dish; which one, and who gets disturbed, is a
judgement call:
- `COLLAPSE` (default, previous behaviour) reconnects the neighbours, so
  everyone still has something to make — but the next cook is handed a
  different recipe than the one they already have.
- `LEAVE` changes nothing but the roster. Nobody is disturbed and the
  buffet is one dish shorter. Better late in the round, once people have
  shopped.

`LEAVE` is the first thing in this schema that can leave a pairing
pointing at a cook who is no longer active, and a dish nobody will cook
must not reach the ballot — `submit_ballot` demands *every* eligible dish
be ranked, so a phantom entry would be both unrankable and unskippable.
Rather than add a "cook still active" test to the three places that
filter briefs, this reuses `briefs.delivered`, which exists for exactly
this purpose ("mark a dish not delivered to exclude it from voting",
`0009`). One flag, all three queries, no change to the voting code.

The old 3-argument `remove_member` is dropped rather than left beside the
4-argument one, which would have made a three-argument call ambiguous.

**Both modes are reachable from the UI**, deliberately: the previous
round of work in this repo produced an RPC the frontend had no way to
call (`generate_assignment`, see 2026-08-01), and that's not worth
repeating. Post-assignment the roster shows both actions with plain-words
explanations of the consequence; before an assignment exists there's no
chain to repair, the two modes are indistinguishable, and one button is
the honest answer.

**Verified:** new `smoke_test4.sql` (pending-member identity: unreadable
by plain read, readable via the host RPC, rejected for a non-host,
cleared by approve and by reject) and `smoke_test5.sql` (both removal
modes, including the previously-crashing branch and the orphaned-dish
exclusion) both pass against a real local Postgres.
`smoke_test.sql`/`smoke_test2.sql`/`smoke_test3.sql` re-run clean against
migration `0016`. TypeScript and oxlint clean; both locale files carry
every new string. Not pushed to production.

## 2026-08-01 (4)

**Changed: frontend deploy now goes through Netlify's own Git integration**
instead of GitHub Actions. While setting up the Netlify site, connecting
it via Netlify's "Import from Git" would have run a second, independent
build on every push — on top of the one `deploy.yml` already did in
Actions — racing it and, since Netlify's own build had no env vars
configured yet, deploying a broken build (undefined `VITE_SUPABASE_URL`)
half the time. Resolved by picking Netlify-builds-it-directly as the one
pipeline: removed `.github/workflows/deploy.yml` entirely, and the four
`VITE_*` frontend env vars now live in Netlify's dashboard (Site
configuration → Environment variables) instead of GitHub repo Variables.
`keepalive.yml`/`backup.yml` are unaffected — they still read
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`/`SUPABASE_DB_URL` from GitHub
repo Variables/Secrets, same as before, just now the only workflows that
do.

**Added:** `public/_redirects` (`/*  /index.html  200`) — without it,
Netlify 404s on any client-side route it doesn't have a literal file for
(anything other than `/`), since nothing previously told it this is an
SPA. Would have broken every deep link and every page refresh.

**Flagged, not fixed:** `VITE_TURNSTILE_SITE_KEY` still isn't set anywhere
real. Until it is, `Turnstile.tsx`'s dev-only bypass is live in
production too, meaning bot protection on signup/join is currently
inert past local dev. Called out explicitly in the new "Deploying the
frontend" README section so it isn't missed.

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

## 2026-07-30

**Fixed: joining and re-visiting a round had two visibility gaps**, found
while testing the initial build's signup/join flow end to end.
- `JoinRoundPage` required retyping and resubmitting the code even when
  arriving via a shared round link that already carried `?code=` — it now
  auto-submits once Turnstile resolves, falling back to the manual form on
  failure.
- `MyRoundsPage` queried `rounds` directly, which only ever returns rows
  the profile can already `SELECT` — a player who'd joined but wasn't
  approved yet had no visibility into that round at all, so a successful
  join looked identical to a failed one. New migration
  `0011_pending_round_visibility.sql` adds `is_round_participant()` (true
  for any `ACTIVE` member, approved or not) and updates
  `rounds_select_member` to use it; `useMyRounds` now queries through
  `round_members` instead of `rounds`, and the page shows a "pending
  approval" badge rather than silently omitting the round. Everything
  else (roster, dietary panel, briefs, chat) stays gated behind the
  existing approved check, unchanged.

## 2026-07-25

**Initial build.** Backend: schema, RLS, and RPCs for signup, round
lifecycle, Sattolo-cycle assignment (splice/remove/manual-edit), brief
writing with round-wide dietary enforcement, canned chat, and Borda
voting/results/awards (`0001`–`0010`) — validated end to end against a
real local Postgres instance via `supabase/smoke_test.sql`/
`smoke_test2.sql`. Frontend: Vite/React/TS scaffold, auth screens (sign up
with a mandatory dietary step, sign in, password reset), round create/
join/roster/approval, round-switcher header, i18n (FR/EN), PWA config, and
the `verify-turnstile` Edge Function. GitHub Actions: deploy (later
replaced by Netlify's own Git integration — see 2026-08-01 (4)),
keep-alive ping, nightly backup.

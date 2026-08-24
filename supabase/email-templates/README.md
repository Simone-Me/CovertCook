# Pasteable auth templates

**Generated — do not edit by hand.** The source is
`supabase/functions/send-email/templates.ts`; run `npm run mail:templates`
to rebuild this folder after changing it.

## Which route you are on

There are two ways to stop Supabase sending its own default-themed mail, and
only one of them belongs to this folder.

| | Paste (this folder) | `send-email` hook |
|---|---|---|
| Setup | Copy two boxes per template in the dashboard | Deploy a function, set three secrets, flip one switch |
| Languages | **One.** A dashboard box holds a single body | Both — the recipient's own |
| Source of truth | The dashboard, until somebody edits it there | The repo, diffed and reviewed like everything else |
| Path to Resend | Auth → SMTP → Resend | Auth → our function → Resend API |
| Editing a word | Paste again, ten times | Change the file, redeploy |

**Decided: the hook.** Pasting is the fast route and it works, but the moment a
French player gets English mail, the reason these files were generated from
code rather than written in a textarea has been thrown away. This folder is the
bridge until `send-email` is deployed — and a convenient way to open a mail in
a browser and look at it. It is not the route.

## What to paste where

Dashboard → Authentication → Email Templates. Each row is one box: put the
subject in **Subject heading** and the file's whole contents in **Message
body**.

| Template | Locale | Body file | Subject |
|---|---|---|---|
| Confirm signup | en | `signup.en.html` | Confirm your email — CovertCook |
| Confirm signup | fr | `signup.fr.html` | Confirmez votre e-mail — CovertCook |
| Invite user | en | `invite.en.html` | You are invited — CovertCook |
| Invite user | fr | `invite.fr.html` | Vous êtes invité — CovertCook |
| Magic Link | en | `magiclink.en.html` | Your sign-in link — CovertCook |
| Magic Link | fr | `magiclink.fr.html` | Votre lien de connexion — CovertCook |
| Change Email Address | en | `email_change.en.html` | Confirm your new address — CovertCook |
| Change Email Address | fr | `email_change.fr.html` | Confirmez votre nouvelle adresse — CovertCook |
| Reset Password | en | `recovery.en.html` | Reset your password — CovertCook |
| Reset Password | fr | `recovery.fr.html` | Réinitialisez votre mot de passe — CovertCook |

The link is `{{ .ConfirmationURL }}` in every one of them — Auth substitutes
it, and it already carries the redirect the client asked for, so nothing here
needs the site URL hard-coded.

// Renders the auth mail in `supabase/functions/send-email/templates.ts` into
// standalone HTML files, ready to paste into Supabase's Authentication →
// Email Templates boxes.
//
// This exists for the route that needs no deployment: paste the body, paste
// the subject, done. It is the lesser of the two routes and the folder's
// README says why — a dashboard box holds ONE language, so pasting means
// choosing whether your French players get English mail or the reverse. The
// send-email hook renders the same file per recipient and keeps both.
//
// Run: npm run mail:templates

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { authEmail } from '../supabase/functions/send-email/templates.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(root, 'supabase/email-templates')

// Auth substitutes this itself; every template it sends has one.
const PLACEHOLDER = '{{ .ConfirmationURL }}'

// Which dashboard box each action belongs in. The names are the dashboard's,
// not ours, so the README can be followed without translation.
const BOXES = [
  ['signup', 'Confirm signup'],
  ['invite', 'Invite user'],
  ['magiclink', 'Magic Link'],
  ['email_change', 'Change Email Address'],
  ['recovery', 'Reset Password'],
]

const LOCALES = ['en', 'fr']

await mkdir(outDir, { recursive: true })

const rows = []
for (const [action, box] of BOXES) {
  for (const locale of LOCALES) {
    const { subject, html } = authEmail(action, { url: PLACEHOLDER, locale })
    const file = `${action}.${locale}.html`
    await writeFile(resolve(outDir, file), html + '\n', 'utf8')
    rows.push({ box, locale, file, subject })
  }
}

const readme = `# Pasteable auth templates

**Generated — do not edit by hand.** The source is
\`supabase/functions/send-email/templates.ts\`; run \`npm run mail:templates\`
to rebuild this folder after changing it.

## Which route you are on

There are two ways to stop Supabase sending its own default-themed mail, and
only one of them belongs to this folder.

| | Paste (this folder) | \`send-email\` hook |
|---|---|---|
| Setup | Copy two boxes per template in the dashboard | Deploy a function, set three secrets, flip one switch |
| Languages | **One.** A dashboard box holds a single body | Both — the recipient's own |
| Source of truth | The dashboard, until somebody edits it there | The repo, diffed and reviewed like everything else |
| Path to Resend | Auth → SMTP → Resend | Auth → our function → Resend API |
| Editing a word | Paste again, ten times | Change the file, redeploy |

Pasting is the fast route and it works. It is not the good one: the moment a
French player gets English mail, the reason this file was generated from code
rather than written in a textarea has been thrown away. Treat it as the bridge
until the hook is deployed.

## What to paste where

Dashboard → Authentication → Email Templates. Each row is one box: put the
subject in **Subject heading** and the file's whole contents in **Message
body**.

| Template | Locale | Body file | Subject |
|---|---|---|---|
${rows.map((r) => `| ${r.box} | ${r.locale} | \`${r.file}\` | ${r.subject} |`).join('\n')}

The link is \`{{ .ConfirmationURL }}\` in every one of them — Auth substitutes
it, and it already carries the redirect the client asked for, so nothing here
needs the site URL hard-coded.
`

await writeFile(resolve(outDir, 'README.md'), readme, 'utf8')
console.log(`Rendered ${rows.length} templates into supabase/email-templates/`)

// Creates a bench of test accounts, confirmed and ready to play a whole dinner.
//
// WHY A SCRIPT AND NOT SEED SQL. Passwords are hashed by Supabase's auth
// service, not by the database, so a row inserted straight into `auth.users`
// gives an account nobody can sign in to. The Admin API is the only honest way
// to make a usable account, and it needs the service-role key — which must
// never be in the app bundle, so it must never be in anything the app imports.
// A script you run by hand, with the key in the environment, is exactly the
// right shape for that.
//
// WHY NOT SHIP TEST ACCOUNTS IN A MIGRATION. Because a migration runs in
// production. Eight accounts with the password `covertcook-test` are a way in,
// and a way in that arrives automatically is a way in nobody remembers to shut.
//
// Run:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-testers.mjs
//   ... --count 8 --password covertcook-test --domain test.covertcook.local
//
// Every account gets a completed profile (display name, locale, no dietary
// restrictions), so they can create and join dinners immediately rather than
// each needing the sign-up flow walked through by hand.
//
// PRO: while `app_settings.pro_open_until` is in the future every account is
// PRO anyway, so the script does not hand any of them a subscription. To see
// both sides during the test period, use the switch on the PRO page (it flips
// one account to the free view) rather than keeping "odd testers are free"
// accounts — a rule about account numbers is a rule you have to remember, and
// the switch is in front of you while you are looking at the thing you want to
// check. Once the window shuts, `redeem_code` is how a tester gets PRO.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// .env.local, read here because nothing else will.
//
// Vite loads that file; Node does not, and this script is Node. So the two
// values sat in the file the whole time and `npm run seed:testers` said "set
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY" at somebody who just had.
//
// The environment still wins, because a value passed on the command line is
// somebody being deliberate about which project they are about to write eight
// accounts into — and that should never be quietly overruled by a file.
//
// Deliberately not `--env-file`: that flag would need every reader of this
// script to remember it, and forgetting it reproduces the exact confusion this
// is here to end.
function fromEnvFile(name) {
  for (const file of ['.env.local', '.env']) {
    let text
    try {
      text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    } catch {
      continue
    }
    for (const line of text.split('\n')) {
      const at = line.indexOf('=')
      if (at === -1 || line.trimStart().startsWith('#')) continue
      if (line.slice(0, at).trim() !== name) continue
      // Quotes are the shell's, not the value's.
      return line.slice(at + 1).trim().replace(/^["']|["']$/g, '')
    }
  }
  return undefined
}

const url = process.env.SUPABASE_URL || fromEnvFile('SUPABASE_URL')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || fromEnvFile('SUPABASE_SERVICE_ROLE_KEY')

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY — in the environment, or in .env.local.')
  console.error('Both are in the Supabase dashboard under Project Settings → API.')
  console.error('For the local stack, `npx supabase status` prints them (API URL and service_role key).')
  process.exit(1)
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]
}

// WHICH DATABASE, SAID OUT LOUD, AND A DOOR IN FRONT OF THE WRONG ONE.
//
// .env.local holds two URLs on purpose: VITE_SUPABASE_URL is where the app
// points, SUPABASE_URL is where the admin scripts point, and there is no rule
// saying they agree. They very easily do not — the app on the local stack, the
// service-role key from the dashboard beside it — and this script would then
// have put eight accounts with a published password into the real project
// without ever saying which one it was writing to.
//
// That is the exact thing the header of this file refuses to do in a
// migration. It should not happen by accident either. So: the target is
// printed before anything is created, and anything that is not localhost has
// to be asked for by name.
// The other half of the same confusion. `npx supabase status` prints both a
// DB_URL and an API_URL, and the one that looks like a database is the one a
// person reaches for when a variable is called SUPABASE_URL. supabase-js
// speaks HTTP, so pasting it produces a failure several layers down that names
// neither the variable nor the mistake.
if (/^postgres(ql)?:\/\//.test(url)) {
  console.error('SUPABASE_URL is a database connection string. This script speaks HTTP.')
  console.error('It wants the API URL — http://127.0.0.1:54321 for the local stack.')
  console.error('`npx supabase status` prints both: API_URL is the one, DB_URL is not.')
  process.exit(1)
}

const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(url)

console.log(`Seeding into ${url}${isLocal ? ' (local stack)' : ''}`)

if (!isLocal && process.argv.indexOf('--production') === -1) {
  console.error('')
  console.error('That is not the local stack. Eight accounts with a known password would be')
  console.error('created there, and a way in that arrives automatically is a way in nobody')
  console.error('remembers to shut.')
  console.error('')
  console.error('If the local stack is what you meant, SUPABASE_URL in .env.local is pointing')
  console.error('somewhere else — `npx supabase status` prints the right API URL and')
  console.error('service_role key.')
  console.error('')
  console.error('If you really do mean that project, say so: --production')
  process.exit(1)
}

const count = Number(arg('count', 8))
const password = arg('password', 'covertcook-test')
// .local is reserved for exactly this (RFC 6762): it can never be a real
// domain, so a stray invitation or a copied address cannot reach a stranger.
const domain = arg('domain', 'test.covertcook.local')
const locale = arg('locale', 'en')

if (!Number.isInteger(count) || count < 1 || count > 30) {
  console.error('--count must be between 1 and 30 (a dinner tops out at 30 seats).')
  process.exit(1)
}
if (password.length < 8) {
  console.error('--password must be at least 8 characters, same as the app asks of everybody.')
  process.exit(1)
}

const admin = createClient(url, key, { auth: { persistSession: false } })

for (let i = 1; i <= count; i++) {
  const email = `test${i}@${domain}`
  const displayName = `Test ${i}`

  // Idempotent by hand rather than by upsert: createUser has no "or do
  // nothing", and re-running this script after adding two more testers should
  // not be an error.
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  let userId = created?.user?.id
  if (error) {
    if (!/already/i.test(error.message)) {
      console.error(`✗ ${email}: ${error.message}`)
      continue
    }
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
    userId = list?.users.find((u) => u.email === email)?.id
    if (!userId) {
      console.error(`✗ ${email}: already exists but could not be found`)
      continue
    }
  }

  // The profile, written directly rather than through complete_signup: that
  // function reads auth.uid(), and the service role is nobody.
  const { error: profileError } = await admin
    .from('profiles')
    .upsert(
      { id: userId, display_name: displayName, locale, has_no_restrictions: true },
      { onConflict: 'id' },
    )

  if (profileError) {
    console.error(`✗ ${email}: profile — ${profileError.message}`)
    continue
  }

  console.log(`✓ ${email.padEnd(32)}“${displayName}”`)
}

// The password once, on a line of its own, because it is the same for all of
// them. In a column beside eight addresses it read as a third name, and the
// first person handed this list had to ask which field was which.
console.log(`\n${count} testers ready. Sign in with any address above.`)
console.log(`Password, the same for every one of them: ${password}`)

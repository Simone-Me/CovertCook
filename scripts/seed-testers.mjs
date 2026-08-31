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

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Both are in the Supabase dashboard under Project Settings → API.')
  process.exit(1)
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]
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

  console.log(`✓ ${email}  ${password}  “${displayName}”`)
}

console.log(`\n${count} testers ready. They sign in with the address and password above.`)

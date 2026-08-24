// The Send Email Hook: Supabase Auth hands us its mail instead of sending it.
//
// WHY THIS EXISTS. Auth's own templates live in a dashboard textarea. They
// cannot be reviewed, diffed, translated from the same source as the app, or
// rolled back with a revert — and until this function was deployed, every
// confirmation and every resend went out wearing Supabase's default theme,
// because `templates.ts` had no way to reach them. With the hook enabled, Auth
// stops sending, POSTs the mail here, and this renders it from `templates.ts`
// and posts it to Resend's API.
//
// WHAT HAS TO BE TRUE FOR THIS TO WORK — all four, or no mail goes out at all:
//
//   1. Dashboard → Authentication → Hooks → **Send Email Hook**, enabled and
//      pointed at this function's URL. The dashboard generates the secret.
//   2. Secrets set with `npx supabase secrets set`:
//        SEND_EMAIL_HOOK_SECRET   the `v1,whsec_...` string from step 1
//        RESEND_API_KEY           a Resend API key
//        RESEND_FROM              e.g. "CovertCook <dinner@yourdomain>", on a
//                                 domain already verified with Resend
//   3. Deployed **without** JWT verification — Auth calls this with the
//      webhook signature, not a user token, so a JWT gate rejects every call:
//        npx supabase functions deploy send-email --no-verify-jwt
//   4. Custom SMTP can then be turned OFF. It is no longer in the path: mail
//      goes app -> Resend API, not app -> SMTP -> Resend. Leaving SMTP
//      configured is harmless but misleading.
//
// FAILURE POSTURE. A non-2xx from here makes the Auth call that triggered it
// fail, which the user sees as "sign-up failed" rather than as a silent
// missing mail. That is the right trade: a signup that reports success while
// its confirmation never left is the exact failure this app already spent a
// day diagnosing.

import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0'
import { authEmail, type AuthEmailAction, type EmailLocale } from './templates.ts'

interface HookPayload {
  user: { email: string; user_metadata?: Record<string, unknown> }
  email_data: {
    token_hash: string
    token_hash_new?: string
    redirect_to: string
    email_action_type: string
  }
}

const KNOWN_ACTIONS: AuthEmailAction[] = [
  'signup',
  'recovery',
  'invite',
  'magiclink',
  'email_change',
  'email_change_current',
  'email_change_new',
]

function fail(status: number, message: string) {
  // The shape Auth expects: it surfaces `error.message` rather than a body it
  // has to guess at.
  return new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail(405, 'method not allowed')

  const hookSecret = Deno.env.get('SEND_EMAIL_HOOK_SECRET')
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('RESEND_FROM')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')

  if (!hookSecret || !resendKey || !from || !supabaseUrl) {
    return fail(500, 'send-email is not configured')
  }

  const raw = await req.text()

  // The signature is the only thing standing between this endpoint and anyone
  // who can guess its URL: it is deployed without JWT verification, so an
  // unverified body is an open relay that sends CovertCook-branded mail to
  // any address a stranger names. Verify before parsing, never after.
  let payload: HookPayload
  try {
    const headers = Object.fromEntries(req.headers)
    payload = new Webhook(hookSecret.replace('v1,whsec_', '')).verify(raw, headers) as HookPayload
  } catch {
    return fail(401, 'invalid signature')
  }

  const action = payload.email_data.email_action_type as AuthEmailAction
  if (!KNOWN_ACTIONS.includes(action)) {
    return fail(400, `unsupported email action: ${payload.email_data.email_action_type}`)
  }

  // The mail to the *new* address in an email change carries its own token;
  // using the old one would confirm the wrong end of the swap.
  const tokenHash =
    action === 'email_change_new' && payload.email_data.token_hash_new
      ? payload.email_data.token_hash_new
      : payload.email_data.token_hash

  // Auth validates the token at its own /verify endpoint and only then
  // redirects to redirect_to, which it has already checked against the
  // dashboard's allow-list. We never mint the destination ourselves.
  const url =
    `${supabaseUrl}/auth/v1/verify?token=${encodeURIComponent(tokenHash)}` +
    `&type=${encodeURIComponent(action)}` +
    `&redirect_to=${encodeURIComponent(payload.email_data.redirect_to)}`

  // Set by the client at sign-up (options.data.locale). Absent for anything
  // created before that shipped, and for accounts made from the dashboard.
  const metaLocale = payload.user.user_metadata?.locale
  const locale: EmailLocale = metaLocale === 'fr' ? 'fr' : 'en'

  const { subject, html, text } = authEmail(action, { url, locale })

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [payload.user.email], subject, html, text }),
  })

  if (!res.ok) {
    // Resend's own message, forwarded rather than flattened — "domain not
    // verified" and "invalid api key" need different fixes and a generic
    // failure hides which one happened.
    return fail(502, `resend rejected the message: ${res.status} ${await res.text()}`)
  }

  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
})

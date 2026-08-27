// Verifies a Cloudflare Turnstile token server-side and, on success, stamps
// a one-time ticket in turnstile_tickets that a SECURITY DEFINER RPC
// (join_round) can consume atomically. This function is the only place
// TURNSTILE_SECRET_KEY and SUPABASE_SERVICE_ROLE_KEY are read — both stay out
// of the frontend bundle entirely (§2 architectural rule 3).
//
// NO IMPORTS, AND THAT IS THE POINT.
//
// This function used to open with `import { createClient } from ...` — first
// `jsr:`, then `esm.sh` — to do exactly one INSERT. An Edge Function fetches
// its remote imports on every cold start, so that one line made the door to
// every dinner depend on the runtime being able to reach a package registry.
// On a machine where it cannot — Docker Desktop with restricted networking, a
// corporate proxy, a firewall, a train — the isolate hangs on the import and
// the runtime kills it:
//
//     serving the request with supabase/functions/verify-turnstile
//     wall clock duration warning: isolate: …
//     early termination has been triggered: isolate: …
//
// which reaches the browser as a non-2xx with no body worth reading. The
// function was never broken and never failed to deploy; it just could not
// finish starting.
//
// A single INSERT does not need a client library. PostgREST is one HTTP call
// away and the service role key is right here, so this now boots instantly and
// depends on nothing but the stack it is part of.
//
// The other two functions keep their imports on purpose: send-push genuinely
// needs `web-push` to sign a VAPID payload, and send-email needs
// `standardwebhooks` to verify a signature. Neither stands between somebody
// and a seat at a table.

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

interface VerifyRequest {
  token: string
  purpose: 'JOIN_ROUND' | 'SIGN_UP' | 'SIGN_IN' | 'RESET_PASSWORD'
  subject?: string
}

// The browser calls this function from a different origin (the app's own
// domain vs *.functions.supabase.co), so it always preflights with OPTIONS
// first. Without these headers the browser blocks the real request before
// it's ever sent, and supabase-js surfaces that as an opaque "Failed to
// send a request to the Edge Function" — not a 4xx/5xx from this code.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405)
  }

  let body: VerifyRequest
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }

  if (!body.token || !body.purpose) {
    return json({ error: 'token and purpose are required' }, 400)
  }

  const secret = Deno.env.get('TURNSTILE_SECRET_KEY')

  // No bypass, and this is the point of 0063.
  //
  // There used to be one: with no secret configured, a placeholder token the
  // frontend invented was accepted without being checked. It was documented as
  // a development convenience and it was not — it accepted that token from
  // anybody, anywhere, including a real deployment that had simply never had
  // its keys set. What made it seem necessary was that joining a dinner went
  // through here even when there was no captcha to verify.
  //
  // That is fixed where it belonged: `app_settings.captcha_required` decides,
  // in the database, and with it false the frontend never calls this function
  // at all. So this function now has exactly one job and does it properly.
  if (!secret) {
    return json({ error: 'TURNSTILE_SECRET_KEY is not configured' }, 500)
  }

  // Given a timeout, because a captcha service that hangs must not become a
  // door that hangs. Ten seconds is far longer than Cloudflare ever takes and
  // short enough to answer before the runtime's own wall clock does — an
  // explicit refusal the interface can read beats an isolate killed mid-flight.
  let verifyJson: { success?: boolean; 'error-codes'?: unknown }
  try {
    const verifyRes = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: body.token }),
      signal: AbortSignal.timeout(10_000),
    })
    verifyJson = await verifyRes.json()
  } catch (err) {
    return json({ error: 'could not reach the captcha service', detail: String(err) }, 502)
  }

  if (!verifyJson.success) {
    return json({ error: 'turnstile verification failed', detail: verifyJson['error-codes'] }, 403)
  }

  // One INSERT, over PostgREST, with the service role key. `Prefer: return=
  // representation` is what makes it come back with the id rather than empty.
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) {
    return json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured' }, 500)
  }

  const insert = await fetch(`${url}/rest/v1/turnstile_tickets`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ purpose: body.purpose, subject: body.subject ?? null }),
  })

  if (!insert.ok) {
    return json({ error: `could not mint a ticket: ${await insert.text()}` }, 500)
  }

  const rows = (await insert.json()) as { id?: string }[]
  const id = rows?.[0]?.id
  if (!id) {
    return json({ error: 'the ticket came back without an id' }, 500)
  }

  return json({ ticket_id: id })
})

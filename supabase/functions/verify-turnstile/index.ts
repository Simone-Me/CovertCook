// Verifies a Cloudflare Turnstile token server-side and, on success, stamps
// a one-time ticket in turnstile_tickets that a SECURITY DEFINER RPC
// (join_round, ...) can consume atomically. This function is the only
// place TURNSTILE_SECRET_KEY and SUPABASE_SERVICE_ROLE_KEY are read — both
// stay out of the frontend bundle entirely (§2 architectural rule 3).
// esm.sh, like send-push and send-email. This function was the only one on
// `jsr:` and the only one that answered 503 on a local stack — a specifier the
// runtime cannot fetch is a worker that never boots, and a worker that never
// boots is indistinguishable from a function that was never deployed.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: corsHeaders })
  }

  let body: VerifyRequest
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON body' }), { status: 400, headers: corsHeaders })
  }

  if (!body.token || !body.purpose) {
    return new Response(JSON.stringify({ error: 'token and purpose are required' }), { status: 400, headers: corsHeaders })
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
    return new Response(JSON.stringify({ error: 'TURNSTILE_SECRET_KEY is not configured' }), {
      status: 500,
      headers: corsHeaders,
    })
  }

  const verifyRes = await fetch(TURNSTILE_VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, response: body.token }),
  })
  const verifyJson = await verifyRes.json()
  if (!verifyJson.success) {
    return new Response(JSON.stringify({ error: 'turnstile verification failed', detail: verifyJson['error-codes'] }), {
      status: 403,
      headers: corsHeaders,
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data, error } = await supabase
    .from('turnstile_tickets')
    .insert({ purpose: body.purpose, subject: body.subject ?? null })
    .select('id')
    .single()

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders })
  }

  return new Response(JSON.stringify({ ticket_id: data.id }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})

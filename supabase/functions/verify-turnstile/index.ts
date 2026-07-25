// Verifies a Cloudflare Turnstile token server-side and, on success, stamps
// a one-time ticket in turnstile_tickets that a SECURITY DEFINER RPC
// (join_round, ...) can consume atomically. This function is the only
// place TURNSTILE_SECRET_KEY and SUPABASE_SERVICE_ROLE_KEY are read — both
// stay out of the frontend bundle entirely (§2 architectural rule 3).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const DEV_PLACEHOLDER_TOKEN = 'dev-placeholder-token'

interface VerifyRequest {
  token: string
  purpose: 'JOIN_ROUND' | 'SIGN_UP' | 'SIGN_IN' | 'RESET_PASSWORD'
  subject?: string
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  let body: VerifyRequest
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON body' }), { status: 400 })
  }

  if (!body.token || !body.purpose) {
    return new Response(JSON.stringify({ error: 'token and purpose are required' }), { status: 400 })
  }

  const secret = Deno.env.get('TURNSTILE_SECRET_KEY')

  // Local/dev fallback: no secret configured yet, and the frontend's
  // Turnstile component (see src/components/Turnstile.tsx) only ever sends
  // this exact placeholder when it has no real site key either — so this
  // path can't be hit by a real deployment with real keys configured.
  const devBypass = !secret && body.token === DEV_PLACEHOLDER_TOKEN

  if (!devBypass) {
    if (!secret) {
      return new Response(JSON.stringify({ error: 'TURNSTILE_SECRET_KEY is not configured' }), { status: 500 })
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
      })
    }
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
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  return new Response(JSON.stringify({ ticket_id: data.id }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

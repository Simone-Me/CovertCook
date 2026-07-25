import { supabase } from './supabase'

/**
 * Exchanges a raw Cloudflare Turnstile widget token for a one-time
 * turnstile_tickets id via the verify-turnstile Edge Function — the client
 * has no direct access to that table (see 0003_turnstile.sql), so this is
 * the only way to obtain a ticket that join_round will accept.
 */
export async function getTurnstileTicket(
  token: string,
  purpose: 'JOIN_ROUND',
  subject: string,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ ticket_id: string; error?: string }>(
    'verify-turnstile',
    { body: { token, purpose, subject } },
  )
  if (error) throw new Error(error.message)
  if (!data?.ticket_id) throw new Error(data?.error ?? 'turnstile verification failed')
  return data.ticket_id
}

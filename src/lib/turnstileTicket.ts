import { invokeFunction } from './functions'

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
  // invokeFunction reads the body the SDK discards, so a refusal from this
  // function arrives as the sentence it wrote rather than as "non-2xx status
  // code" — which was the whole of what somebody trying to join a dinner used
  // to be told.
  const data = await invokeFunction<{ ticket_id?: string; error?: string }>('verify-turnstile', {
    token,
    purpose,
    subject,
  })
  if (!data?.ticket_id) throw new Error(data?.error ?? 'TURNSTILE_NO_TICKET')
  return data.ticket_id
}

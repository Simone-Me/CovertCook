import { supabase } from './supabase'

/**
 * Calling an Edge Function without throwing away what it said.
 *
 * `supabase.functions.invoke` reports every non-2xx as one sentence — "Edge
 * Function returned a non-2xx status code" — and hands the actual response
 * back on the error object as `context`, where nothing looks at it. So a
 * function that answered `{"error":"TURNSTILE_SECRET_KEY is not configured"}`
 * with a perfectly clear 500 arrives at the screen as a shrug, and the search
 * for the cause starts in the client, which is the one place it is not.
 *
 * Every function in this app answers with `{ error }` on failure. This is the
 * one place that reads it.
 *
 * The second half matters as much: a function that fails to *boot* — a bad
 * import, a missing dependency, a runtime that is not running — answers with
 * something that is not JSON at all. That comes back as the status code and
 * the first line of whatever it was, which is still worth ten times the
 * generic sentence.
 */
export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body })
  if (!error) return data as T

  const context = (error as { context?: Response }).context
  if (!context || typeof context.text !== 'function') {
    // No response at all: CORS, DNS, or the function not being served. The
    // SDK's own description is the best there is for that one.
    throw new Error(error.message)
  }

  let raw = ''
  try {
    raw = await context.text()
  } catch {
    // Already consumed, or the connection died mid-read. The status line below
    // is then all there is, and it is still an answer.
  }

  if (!raw) throw new Error(`${name} returned ${context.status}`)

  const said = readError(raw)
  if (said) throw new Error(said)

  // Not JSON: a gateway page, a Deno stack trace, a boot failure. First line
  // only — the rest is noise on a phone screen and is in the logs anyway.
  throw new Error(`${name} (${context.status}): ${raw.split('\n')[0].slice(0, 200)}`)
}

/** The `{ error, detail }` shape every function in this app answers with. */
function readError(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as { error?: string; detail?: unknown }
    if (!parsed?.error) return null
    return parsed.detail ? `${parsed.error} (${JSON.stringify(parsed.detail)})` : parsed.error
  } catch {
    return null
  }
}

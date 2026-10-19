// A bug report, mailed to the person who runs the app.
//
// Called by the bug button in the header (ReportBugPage). It needs a signed-in
// caller — the JWT gate in config.toml is what keeps it from being an open
// relay into the contact inbox — and it sends one mail through Resend: what
// the person wrote, where they were, their browser, and the screenshot if they
// attached one. Reply-To is their own address, so answering the mail answers
// them.
//
// SECRETS: the same RESEND_API_KEY and RESEND_FROM as send-email, plus
// REPORT_TO if the reports should go somewhere other than contact@covertcook.fr.
//   npx supabase functions deploy report-bug

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MAX_MESSAGE = 4000
const MAX_TITLE = 120
// The client sends a JPEG it has already shrunk to 1600px (src/lib/photo.ts);
// base64 of that is well under this. Anything larger did not come from the app.
const MAX_IMAGE_BASE64 = 4 * 1024 * 1024

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply(405, { error: 'method not allowed' })

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('RESEND_FROM')
  const to = Deno.env.get('REPORT_TO') ?? 'contact@covertcook.fr'
  if (!url || !anonKey || !resendKey || !from) return reply(500, { error: 'report-bug is not configured' })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return reply(401, { error: 'not authenticated' })
  const supabase = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: auth } = await supabase.auth.getUser()
  const user = auth?.user
  if (!user) return reply(401, { error: 'not authenticated' })

  let body: {
    title?: string
    message?: string
    contact?: { name?: string; email?: string } | null
    page?: string
    userAgent?: string
    version?: string
    image?: string
  }
  try {
    body = await req.json()
  } catch {
    return reply(400, { error: 'expected a JSON body' })
  }

  // One line: it becomes the subject, and a newline in a subject is a header.
  const title = (body.title ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, MAX_TITLE)
  const message = (body.message ?? '').trim().slice(0, MAX_MESSAGE)
  if (!title || !message) return reply(400, { error: 'EMPTY_REPORT' })

  // Only an address that looks like one becomes Reply-To; anything else is
  // still printed in the mail, so nothing they typed is lost.
  const contactName = (body.contact?.name ?? '').trim().slice(0, 80)
  const contactEmail = (body.contact?.email ?? '').trim().slice(0, 200)
  const wantsReply = !!body.contact
  const replyTo = wantsReply && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(contactEmail) ? contactEmail : null
  const image = body.image ?? ''
  if (image.length > MAX_IMAGE_BASE64) return reply(413, { error: 'IMAGE_TOO_LARGE' })

  const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
  const who = profile?.display_name ?? '—'

  const details: [string, string][] = [
    ['Account', `${who} <${user.email ?? '?'}>`],
    ['Contact back', wantsReply ? `yes — ${contactName || '?'} <${contactEmail || '?'}>` : 'no'],
    ['Page', body.page ?? '?'],
    ['Version', body.version ?? '?'],
    ['Browser', body.userAgent ?? '?'],
  ]
  const html =
    `<p style="white-space:pre-wrap">${escape(message)}</p><hr>` +
    details.map(([k, v]) => `<p><b>${k}:</b> ${escape(v.slice(0, 500))}</p>`).join('')
  const text = `${message}\n\n---\n` + details.map(([k, v]) => `${k}: ${v}`).join('\n')

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: replyTo ? [replyTo] : undefined,
      subject: `[Bug] ${title}`,
      html,
      text,
      attachments: image ? [{ filename: 'screenshot.jpg', content: image }] : undefined,
    }),
  })
  if (!res.ok) return reply(502, { error: 'SEND_FAILED', detail: await res.text() })
  return reply(200, { sent: true })
})

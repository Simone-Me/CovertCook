// Sends one round's worth of push notifications.
//
// WHO MAY CALL IT. The host of the round, and nobody else. The caller's own
// JWT is used to answer that question — `is_round_host` under the user's
// token, so RLS and the function's own rules apply exactly as they would to
// any other call that person makes. Only once that comes back true does this
// switch to the service key, and only to read the audience.
//
// WHY THE AUDIENCE NEVER REACHES A BROWSER. Endpoints and encryption keys are
// enough to push to somebody's phone, or to unsubscribe it. Handing them to
// the host's client — even to save a round trip — would make one player able
// to spoof or silence another's device, so `push_audience_for_round` is
// revoked from both client roles and read here with the service key alone.
//
// WHAT IT SAYS. Composed here rather than passed in by the caller: a client
// that supplies the notification text is a client that can put any words on
// somebody else's lock screen.
//
// Secrets:
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY  generated once (npx web-push
//                                         generate-vapid-keys); the public
//                                         half also goes in the frontend as
//                                         VITE_VAPID_PUBLIC_KEY, and the pair
//                                         must never be rotated casually —
//                                         every existing subscription dies
//                                         with it.
//   VAPID_SUBJECT                         mailto: or https: contact, required
//                                         by the push services.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

type Kind = 'ASSIGNED' | 'BRIEFS_CLOSED' | 'DINNER' | 'VOTING' | 'RESULTS' | 'MOVED'

const COPY: Record<Kind, Record<'en' | 'fr', { title: string; body: string }>> = {
  ASSIGNED: {
    en: { title: 'Your cook has been chosen', body: 'Open the envelope and write their recipe.' },
    fr: { title: 'Votre cuisinier est tiré', body: 'Ouvrez l’enveloppe et écrivez sa recette.' },
  },
  BRIEFS_CLOSED: {
    en: { title: 'The briefs are in', body: 'Yours is waiting. Time to shop.' },
    fr: { title: 'Les consignes sont écrites', body: 'La vôtre vous attend. Aux courses.' },
  },
  DINNER: {
    en: { title: 'It is dinner', body: 'The table is open.' },
    fr: { title: 'C’est le dîner', body: 'La table est ouverte.' },
  },
  VOTING: {
    en: { title: 'Voting is open', body: 'Rank the dishes before the plates are cleared.' },
    fr: { title: 'Le vote est ouvert', body: 'Classez les plats avant qu’on débarrasse.' },
  },
  RESULTS: {
    en: { title: 'The results are in', body: 'And so is the name of whoever wrote your brief.' },
    fr: { title: 'Les résultats sont là', body: 'Et le nom de qui a écrit votre consigne aussi.' },
  },
  MOVED: {
    en: { title: 'Your dinner moved on', body: 'Something changed at the table.' },
    fr: { title: 'Votre dîner a avancé', body: 'Quelque chose a changé à table.' },
  },
}

function fail(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail(405, 'method not allowed')

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const subject = Deno.env.get('VAPID_SUBJECT')

  if (!url || !anonKey || !serviceKey || !publicKey || !privateKey || !subject) {
    return fail(500, 'send-push is not configured')
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return fail(401, 'not authenticated')

  let body: { round_id?: string; kind?: string }
  try {
    body = await req.json()
  } catch {
    return fail(400, 'expected a JSON body')
  }
  if (!body.round_id) return fail(400, 'round_id is required')

  const kind: Kind = (['ASSIGNED', 'BRIEFS_CLOSED', 'DINNER', 'VOTING', 'RESULTS'] as const).includes(
    body.kind as never,
  )
    ? (body.kind as Kind)
    : 'MOVED'

  // As the caller, with the caller's own permissions.
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData } = await asCaller.auth.getUser()
  const uid = userData.user?.id
  if (!uid) return fail(401, 'not authenticated')

  const { data: isHost, error: hostError } = await asCaller.rpc('is_round_host', {
    p_round_id: body.round_id,
    p_uid: uid,
  })
  if (hostError) return fail(500, hostError.message)
  if (!isHost) return fail(403, 'only the host of this round can send this')

  // From here on, with the service key and only for the audience.
  const asService = createClient(url, serviceKey)
  const { data: audience, error: audienceError } = await asService.rpc('push_audience_for_round', {
    p_round_id: body.round_id,
    p_actor: uid,
  })
  if (audienceError) return fail(500, audienceError.message)

  webpush.setVapidDetails(subject, publicKey, privateKey)

  const rows = (audience ?? []) as { endpoint: string; p256dh: string; auth: string; locale: string }[]
  const gone: string[] = []
  let sent = 0

  await Promise.all(
    rows.map(async (row) => {
      const copy = COPY[kind][row.locale === 'fr' ? 'fr' : 'en']
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          JSON.stringify({
            title: copy.title,
            body: copy.body,
            url: `/rounds/${body.round_id}`,
            // One notification per round per moment: a second push about the
            // same transition replaces the first rather than stacking.
            tag: `round-${body.round_id}-${kind}`,
          }),
        )
        sent++
      } catch (err) {
        // 404/410 is the push service saying this browser is gone for good —
        // the subscription was revoked or the app uninstalled. Anything else
        // (a timeout, a 500 at the push service) might work next time and
        // must not cost somebody their notifications.
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) gone.push(row.endpoint)
      }
    }),
  )

  if (gone.length) {
    await asService.from('push_subscriptions').delete().in('endpoint', gone)
  }

  return new Response(JSON.stringify({ sent, pruned: gone.length, audience: rows.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

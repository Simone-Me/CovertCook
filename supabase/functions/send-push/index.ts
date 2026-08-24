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

// The four moments, and nothing else (0048). A notification nobody acts on is
// how an app teaches people to ignore it.
type Kind =
  | 'ASSIGNED'
  | 'BRIEF_RECEIVED'
  | 'VOTING'
  | 'RESULTS'
  // The two at the door (0052). They are addressed by MEMBERSHIP, not by
  // round: join_round hands the client a membership id and nothing else, and
  // approving is about one person.
  | 'JOIN_REQUESTED'
  | 'JOIN_ARRIVED'
  | 'JOIN_APPROVED'

const KINDS: Kind[] = [
  'ASSIGNED',
  'BRIEF_RECEIVED',
  'VOTING',
  'RESULTS',
  'JOIN_REQUESTED',
  'JOIN_ARRIVED',
  'JOIN_APPROVED',
]

// Which moments are announced from a membership rather than a round. For these
// the caller says "this seat", and the database works out whose phone that
// means and whether the caller is entitled to say it.
const DOOR_KINDS = ['JOIN_REQUESTED', 'JOIN_ARRIVED', 'JOIN_APPROVED']

const COPY: Record<Kind, Record<'en' | 'fr', { title: string; body: string }>> = {
  ASSIGNED: {
    en: { title: 'Your cook has been chosen', body: 'Open the envelope and write their recipe.' },
    fr: { title: 'Votre cuisinier est tiré', body: 'Ouvrez l’enveloppe et écrivez sa recette.' },
  },
  // Says nothing about who wrote it, and cannot: the text is composed here,
  // never passed in, and the whole game depends on that name staying unknown
  // until the reveal.
  BRIEF_RECEIVED: {
    en: { title: 'Your recipe has arrived', body: 'Somebody has decided what you are cooking.' },
    fr: { title: 'Votre recette est arrivée', body: 'Quelqu’un a décidé ce que vous cuisinez.' },
  },
  VOTING: {
    en: { title: 'Voting is open', body: 'Rank the dishes before the plates are cleared.' },
    fr: { title: 'Le vote est ouvert', body: 'Classez les plats avant qu’on débarrasse.' },
  },
  RESULTS: {
    en: { title: 'The results are in', body: 'And so is the name of whoever wrote your brief.' },
    fr: { title: 'Les résultats sont là', body: 'Et le nom de qui a écrit votre consigne aussi.' },
  },
  // No names on a lock screen. The host's approval screen shows who is asking,
  // because approving a pseudonym is approving nobody — but that is a screen
  // they chose to open, not something a stranger reads over their shoulder on
  // a train. The dinner's name is carried instead: a host running two of them
  // needs to know which door this is, and neither side learns anything from it
  // they did not already know. {round} is filled in below.
  JOIN_REQUESTED: {
    en: { title: 'Somebody is at the door', body: '{round} — a request is waiting for your answer.' },
    fr: { title: 'Quelqu’un est à la porte', body: '{round} — une demande attend votre réponse.' },
  },
  JOIN_ARRIVED: {
    en: { title: 'A seat has been taken', body: '{round} — the table is filling up.' },
    fr: { title: 'Une place vient d’être prise', body: '{round} — la table se remplit.' },
  },
  JOIN_APPROVED: {
    en: { title: 'You are at the table', body: '{round} — your request was accepted.' },
    fr: { title: 'Vous êtes à table', body: '{round} — votre demande a été acceptée.' },
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

  let body: { round_id?: string; member_id?: string; kind?: string }
  try {
    body = await req.json()
  } catch {
    return fail(400, 'expected a JSON body')
  }
  if (!body.round_id && !body.member_id) return fail(400, 'round_id or member_id is required')

  // An unknown moment is not a generic notification, it is nothing: the caller
  // asked for something this app has decided not to interrupt people about.
  if (!KINDS.includes(body.kind as Kind)) {
    return new Response(JSON.stringify({ sent: 0, skipped: 'not a notified moment' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const kind = body.kind as Kind

  // As the caller, with the caller's own permissions.
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData } = await asCaller.auth.getUser()
  const uid = userData.user?.id
  if (!uid) return fail(401, 'not authenticated')

  const asService = createClient(url, serviceKey)

  // ---- The door: addressed by membership, authorised inside the database ----
  if (DOOR_KINDS.includes(kind)) {
    if (!body.member_id) return fail(400, 'member_id is required for this kind')

    const fn = kind === 'JOIN_APPROVED' ? 'push_audience_for_approved' : 'push_audience_for_host'
    const { data, error } = await asService.rpc(fn, {
      p_member_id: body.member_id,
      p_actor: uid,
    })
    if (error) return fail(500, error.message)

    const rows = (data ?? []) as {
      endpoint: string
      p256dh: string
      auth: string
      locale: string
      round_id: string
      round_name: string
      approved?: boolean
    }[]

    // Nobody to tell is a normal outcome here, not a failure: the host may
    // have notifications off, or the caller may not be entitled to send this
    // — and the function answers both the same way, on purpose.
    if (!rows.length) {
      return new Response(JSON.stringify({ sent: 0, audience: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Request or arrival is the database's call, not the caller's: a round
    // that needs approval produces one, a round that does not produces the
    // other, and the seat already knows which.
    const doorKind: Kind =
      kind === 'JOIN_APPROVED' ? 'JOIN_APPROVED' : rows[0].approved ? 'JOIN_ARRIVED' : 'JOIN_REQUESTED'

    return await deliver(rows, doorKind, rows[0].round_id, rows[0].round_name)
  }

  // Two audiences, two different questions about who may speak.
  //
  //   BRIEF_RECEIVED is one person's message to the cook they wrote for. The
  //   sender may send it, and never learns who they reached: the chain
  //   resolves the recipient, the caller does not name them.
  //
  //   The other three are the Executive Chef announcing the round to everyone
  //   in it, so the caller has to actually be the host.
  let audience: unknown
  if (kind === 'BRIEF_RECEIVED') {
    const { data, error } = await asService.rpc('push_audience_for_my_cook', {
      p_round_id: body.round_id,
      p_sender: uid,
    })
    if (error) return fail(500, error.message)
    audience = data
  } else {
    const { data: isHost, error: hostError } = await asCaller.rpc('is_round_host', {
      p_round_id: body.round_id,
      p_uid: uid,
    })
    if (hostError) return fail(500, hostError.message)
    if (!isHost) return fail(403, 'only the host of this round can send this')

    // A hand-counted vote is announced out loud by somebody standing up. A
    // push there advertises something already happening in the room.
    if (kind === 'VOTING') {
      const { data: online, error: modeError } = await asService.rpc('round_vote_is_online', {
        p_round_id: body.round_id,
      })
      if (modeError) return fail(500, modeError.message)
      if (!online) {
        return new Response(JSON.stringify({ sent: 0, skipped: 'this round votes by hand' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    const { data, error } = await asService.rpc('push_audience_for_round', {
      p_round_id: body.round_id,
      p_actor: uid,
    })
    if (error) return fail(500, error.message)
    audience = data
  }

  return await deliver(
    (audience ?? []) as { endpoint: string; p256dh: string; auth: string; locale: string }[],
    kind,
    body.round_id as string,
  )

  // One sender for both routes: whatever decided the audience, what happens to
  // it afterwards is identical, and two copies of a retry-and-prune loop would
  // drift.
  async function deliver(
    rows: { endpoint: string; p256dh: string; auth: string; locale: string }[],
    copyKind: Kind,
    roundId: string,
    // Only the door copy names the dinner; the four in-play moments are read
    // by somebody already inside one.
    roundName?: string,
  ) {
    webpush.setVapidDetails(subject!, publicKey!, privateKey!)

    const gone: string[] = []
    let sent = 0

    await Promise.all(
      rows.map(async (row) => {
        const copy = COPY[copyKind][row.locale === 'fr' ? 'fr' : 'en']
        try {
          await webpush.sendNotification(
            { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            JSON.stringify({
              title: copy.title,
              body: copy.body.replace('{round}', roundName ?? ''),
              url: `/rounds/${roundId}`,
              // One notification per round per moment: a second push about the
              // same transition replaces the first rather than stacking.
              tag: `round-${roundId}-${copyKind}`,
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
  }
})

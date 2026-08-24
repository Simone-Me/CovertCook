import { savePushSubscription, forgetPushSubscription } from './rpc'

/**
 * Web push, for the app as it is actually installed.
 *
 * The thing worth being clear about, because it is the source of most of the
 * confusion around push on the web: **this is not a store feature.** A page
 * added to the home screen is a real installed app to the browser, and it gets
 * the same Push API a native app would. What differs is only where the
 * platform draws the line:
 *
 *   * Android — works from the browser tab and from the installed app alike.
 *   * iOS/iPadOS 16.4+ — works **only** once the app has been added to the
 *     home screen and opened from there. In a Safari tab the API is simply
 *     absent, which is why `pushSupported()` and `isStandalone()` are separate
 *     questions and the settings screen asks them in that order.
 *   * Desktop — works in Chrome, Edge and Firefox; Safari needs the app added
 *     to the Dock.
 *
 * And the rule that shapes the interface: **a refusal is permanent.** A person
 * who taps "Block" cannot be asked again by the site — only by digging through
 * browser settings — so the permission prompt is never raised on page load. It
 * is raised when somebody presses a button that says what they are agreeing to.
 */

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export type PushState =
  | 'unsupported' // this browser has no Push API
  | 'needs-install' // iOS in a tab: add to home screen first
  | 'unconfigured' // no VAPID key in this deployment
  | 'denied' // refused, and refused is forever
  | 'off'
  | 'on'

// The key travels as URL-safe base64 and the API wants bytes — backed by a
// plain ArrayBuffer, which is what `applicationServerKey` is typed to accept.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS predates the media query and still reports it its own way.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function currentPushState(): Promise<PushState> {
  if (!pushSupported()) {
    // On iOS the API appears only in the installed app, so "no API here" plus
    // "not installed here" is an instruction, not a dead end.
    return isStandalone() ? 'unsupported' : 'needs-install'
  }
  if (!VAPID_PUBLIC_KEY) return 'unconfigured'
  if (Notification.permission === 'denied') return 'denied'

  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  return existing ? 'on' : 'off'
}

/**
 * Asks for permission and registers the subscription. Returns the state the
 * interface should now show, so a refusal renders as "denied" rather than as
 * an error nobody can act on.
 */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return isStandalone() ? 'unsupported' : 'needs-install'
  if (!VAPID_PUBLIC_KEY) return 'unconfigured'

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'

  const registration = await navigator.serviceWorker.ready
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      // Required by every browser: a push that shows nothing is what gets a
      // site's permission revoked wholesale.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }))

  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('incomplete subscription')
  }

  await savePushSubscription({
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    userAgent: navigator.userAgent,
  })

  return 'on'
}

/**
 * Order matters: forget the row first, then drop the browser's subscription.
 * The reverse leaves a row nobody can reach — the endpoint is gone from the
 * client, so nothing can name it again — and the server keeps pushing into a
 * dead endpoint until the push service says gone.
 */
export async function disablePush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return 'off'

  await forgetPushSubscription(subscription.endpoint)
  await subscription.unsubscribe()
  return 'off'
}

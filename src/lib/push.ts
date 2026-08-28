import {
  savePushSubscription,
  forgetPushSubscription,
  setNotificationsEnabled,
  myPushDevices,
} from './rpc'

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
  | 'no-worker' // the API is here, but nothing registered a service worker
  | 'denied' // refused, and refused is forever
  | 'off'
  | 'on'

/**
 * `navigator.serviceWorker.ready` with a way out.
 *
 * That promise resolves when a worker takes control and otherwise waits
 * forever: it does not reject, it does not time out, and there is no state in
 * which it admits that nothing was ever registered. So on a browser where
 * registration was refused — a private window, Brave with shields at their
 * strictest, a locked-down corporate profile — awaiting it hangs, and the
 * settings screen sat on "Checking what this device can do…" for the rest of
 * the session with no button and no explanation. The one thing the person
 * needed to know was the one thing the interface could not say.
 *
 * Six seconds is long enough for a first install on a slow phone and short
 * enough that nobody thinks the screen is broken.
 */
async function workerWithin(ms = 6000): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  // Already there is the common case, and it costs nothing to ask first.
  const existing = await navigator.serviceWorker.getRegistration()
  if (existing?.active) return existing

  return await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ])
}

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

  const registration = await workerWithin()
  if (!registration) return 'no-worker'
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

  const registration = await workerWithin()
  // Permission granted and nowhere to deliver it. Said out loud rather than
  // hung on, because this is the state a person can actually do something
  // about — reload, or stop using a window that forbids workers.
  if (!registration) return 'no-worker'
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

  // The device now has an address; the account says whether to use it. Turning
  // it on here turns it on for every dinner and every device you own (0048) —
  // which is what the switch promises, so it has to actually do it.
  await setNotificationsEnabled(true)

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

  // The account switch goes first and unconditionally: somebody pressing "off"
  // means it everywhere, including on the devices they are not holding, and
  // including when this browser turns out to have no subscription to drop.
  await setNotificationsEnabled(false)

  const registration = await workerWithin()
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return 'off'

  await forgetPushSubscription(subscription.endpoint)
  await subscription.unsubscribe()
  return 'off'
}


/**
 * Every link in the chain, asked one at a time.
 *
 * "I installed the shortcut and no notification ever arrives" is not one
 * fault, it is seven, and from the outside they are indistinguishable — the
 * phone stays quiet either way. This asks each one separately so the answer is
 * a place rather than a mood:
 *
 *   1. does this browser have the API at all (iOS in a tab: no),
 *   2. is the app running from the home screen (iOS: required),
 *   3. did the page ever register a service worker,
 *   4. what did the person answer when asked for permission,
 *   5. does the browser hold a subscription right now,
 *   6. did that subscription ever reach our server,
 *   7. and does this deployment even have a VAPID key to sign with.
 *
 * Six and seven are the two that fail silently in production. A subscription
 * the server never stored looks perfect on the phone; a rotated VAPID key
 * leaves every stored row pointing at a signature nobody accepts any more.
 *
 * `serviceWorker` deliberately does not wait for `navigator.serviceWorker.ready`
 * — that promise never rejects and never times out, so on a page where
 * registration failed it hangs forever, and a diagnosis that hangs is the
 * problem it is supposed to be diagnosing.
 */
export interface PushDiagnosis {
  state: PushState
  standalone: boolean
  supported: boolean
  vapidConfigured: boolean
  permission: NotificationPermission | 'unavailable'
  serviceWorker: 'unsupported' | 'none' | 'installing' | 'waiting' | 'active'
  scope: string | null
  subscribed: boolean
  // The host only. The endpoint's path is the address of somebody's phone and
  // has no business being on a screen or in a screenshot; the host is what
  // says which push service is involved (fcm = Chrome/Android, web.push.apple
  // = Safari/iOS), which is the part worth reading.
  pushService: string | null
  knownToServer: boolean | null
  otherDevices: number
}

export async function diagnosePush(): Promise<PushDiagnosis> {
  const supported = pushSupported()
  const diagnosis: PushDiagnosis = {
    state: await currentPushState(),
    standalone: isStandalone(),
    supported,
    vapidConfigured: !!VAPID_PUBLIC_KEY,
    permission: 'Notification' in window ? Notification.permission : 'unavailable',
    serviceWorker: 'serviceWorker' in navigator ? 'none' : 'unsupported',
    scope: null,
    subscribed: false,
    pushService: null,
    knownToServer: null,
    otherDevices: 0,
  }

  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration()
    if (registration) {
      diagnosis.scope = registration.scope
      diagnosis.serviceWorker = registration.active
        ? 'active'
        : registration.waiting
          ? 'waiting'
          : registration.installing
            ? 'installing'
            : 'none'

      if (supported) {
        const subscription = await registration.pushManager.getSubscription()
        diagnosis.subscribed = !!subscription
        if (subscription) {
          try {
            diagnosis.pushService = new URL(subscription.endpoint).host
          } catch {
            diagnosis.pushService = null
          }
        }
        // Asked of the server, not of the browser: the whole point is to find
        // out whether the two agree.
        try {
          const devices = await myPushDevices(subscription?.endpoint ?? null)
          diagnosis.knownToServer = subscription ? devices.this_device : null
          diagnosis.otherDevices = Math.max(0, devices.devices - (devices.this_device ? 1 : 0))
        } catch {
          // Signed out, or offline. Unknown is its own answer and is shown as
          // one — claiming the row is missing would send somebody chasing a
          // fault that is not there.
          diagnosis.knownToServer = null
        }
      }
    }
  }

  return diagnosis
}

/**
 * Re-hand this browser's subscription to the server.
 *
 * The repair for the one fault that is invisible from both ends: the browser
 * is subscribed, the server has no row, and nothing either side does will ever
 * discover that on its own. It happens — the save can fail while the
 * subscribe succeeds, and a 410 from the push service prunes the row on a
 * phone that goes on holding the subscription quite happily.
 *
 * Subscribing again is not the fix and would not help: the browser returns the
 * same endpoint it already has. Sending it again is.
 */
export async function resendSubscription(): Promise<boolean> {
  if (!pushSupported()) return false
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return false

  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false

  await savePushSubscription({
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    userAgent: navigator.userAgent,
  })
  return true
}

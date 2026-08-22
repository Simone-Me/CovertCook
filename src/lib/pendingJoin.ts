// Someone taps a shared round link, has no account yet, and gets sent off
// to sign up. RequireAuth redirects with `replace`, so the ?code= that
// brought them there is gone by the time they come back — they land on an
// empty "my rounds" with no idea what happened to the invitation they
// followed.
//
// sessionStorage rather than localStorage on purpose: this is a single
// journey, not a preference. It should survive the sign-up round-trip and
// die with the tab, so a stale code from last week can never silently pull
// someone into the wrong dinner.

const KEY = 'covertcook.pendingJoinCode'
const EVENT = 'covertcook:pendingJoinChanged'

// sessionStorage fires no event in the tab that wrote it (the `storage`
// event is for *other* tabs), so a component reading it during render never
// learns it changed. The banner announcing "your invitation is being held"
// therefore stayed on screen after the invitation had been used, until a
// manual reload. One event, and it can subscribe.
function announce() {
  window.dispatchEvent(new Event(EVENT))
}

export function rememberJoinCode(code: string) {
  const normalised = code.trim().toUpperCase()
  if (normalised) {
    sessionStorage.setItem(KEY, normalised)
    announce()
  }
}

export function takeJoinCode(): string | null {
  const code = sessionStorage.getItem(KEY)
  sessionStorage.removeItem(KEY)
  if (code) announce()
  return code
}

export function peekJoinCode(): string | null {
  return sessionStorage.getItem(KEY)
}

export function subscribeToPendingJoin(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange)
  return () => window.removeEventListener(EVENT, onChange)
}

// Whether the session on this device came from a password-reset link and the
// new password has not been saved yet.
//
// The link in the reset mail signs the person in: Supabase hands back a real
// session, the same kind a password sign-in produces. Nothing told the rest of
// the app the difference, so the header showed the name, the name opened the
// profile, and every guarded route let them straight in — the link was a way
// into the account that never asked for a new password. While this flag is up,
// the only place that session may go is /reset.
//
// localStorage and not memory: the session itself survives a reload and a
// closed tab, so the restriction has to survive them too. Otherwise reloading
// the page, or opening the app again tomorrow, would undo it.

const KEY = 'covertcook.recoveryPending'

export function recoveryPending(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function markRecoveryPending() {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // Storage refused: the in-memory state in AuthProvider still holds for
    // this visit.
  }
}

export function clearRecoveryPending() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}

// Read before the Supabase client is created: it parses the hash on creation
// and wipes it from the address bar, and it may announce PASSWORD_RECOVERY
// before any React listener exists. Looking at the URL first is the one check
// that cannot miss.
export function captureRecoveryFromUrl() {
  if (typeof window === 'undefined') return
  if (window.location.hash.includes('type=recovery')) markRecoveryPending()
}

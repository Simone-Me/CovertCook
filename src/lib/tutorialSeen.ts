// Whether this device has already been walked through the guided dinner.
//
// localStorage and not a column: it decides one thing — whether the tour opens
// by itself — and a second device showing it once more costs a tap on "leave".
// Written when the tour STARTS, not when it ends, so somebody who walks out of
// it is not walked back in on every visit. It never hides the way in: the tour
// stays one press away from "How CovertCook works" and the profile.

const KEY = 'covertcook.tutorialSeen'

export function tutorialSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    // Storage refused (private mode, blocked site data): do not insist.
    return true
  }
}

export function markTutorialSeen() {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // Nothing to do: the tour simply may open again next time.
  }
}

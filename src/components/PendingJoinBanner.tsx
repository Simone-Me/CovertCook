import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { peekJoinCode, subscribeToPendingJoin } from '../lib/pendingJoin'

// Follow a dinner link without an account and you get sent off to sign up,
// which looks exactly like arriving at a stranger's sign-up form: no sign
// the invitation survived, and no reason to believe finishing will take you
// anywhere near the dinner you were trying to reach.
//
// This says so, on every screen of the detour, until the code is actually
// used. It shows the code rather than the dinner's name on purpose — the
// name would have to be readable by someone not signed in, which turns a
// code into something you could probe for.
//
// useSyncExternalStore rather than a plain read: sessionStorage doesn't
// notify the tab that wrote it, so the banner used to survive its own
// invitation being consumed until someone reloaded the page.
export function PendingJoinBanner() {
  const { t } = useTranslation()
  const code = useSyncExternalStore(subscribeToPendingJoin, peekJoinCode, () => null)
  if (!code) return null

  return (
    <div className="pending-join">
      {t('rounds.pendingJoinBanner')} <strong>{code}</strong>
    </div>
  )
}

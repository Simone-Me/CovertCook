import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { myOpenAlerts } from '../lib/rpc'

// The round switcher that used to live here is gone. It solved a problem
// this product doesn't have: people run one dinner at a time, and every
// round they're in is already listed on the home screen — so a dropdown
// duplicating that list earned its place in the one row visible on every
// single screen without giving anything back.
//
// What belongs in that row instead is the way back to yourself: the
// account, the language, and the allergy list every brief in every round
// gets validated against.
export function AppHeader() {
  const { t } = useTranslation()
  const { session, profile } = useAuth()

  // The in-app half of telling the host (0059). A push is for the phone in a
  // pocket; this is for the app already open, where an alert should not have to
  // wait for somebody to think of visiting a page. It is only ever here for a
  // host with something unresolved — everybody else has news to read, and news
  // is what the six push moments and the envelopes are for.
  //
  // Polled rather than subscribed: a realtime channel held open on every screen
  // costs a connection for a badge that changes a handful of times an evening.
  const { data: alerts } = useQuery({
    queryKey: ['my-open-alerts'],
    enabled: !!session,
    queryFn: myOpenAlerts,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })

  const waiting = (alerts ?? []).reduce((total, round) => total + round.open_alerts, 0)
  const first = alerts?.[0]

  return (
    <header className="app-header">
      {/* The name was already a link home, but nothing said so — it read as
          a title. The arrow slides out of the word on hover and the whole
          thing lifts a little, the same gesture as picking an envelope off
          the cloth, so the way back announces itself before it's clicked. */}
      <Link to="/" className="app-logo" aria-label={t('rounds.myRounds')}>
        <span className="app-logo__back" aria-hidden="true">←</span>
        {/* Decorative: the name is right beside it and says the same thing. */}
        <img className="app-logo__mark" src="/logo.webp" alt="" aria-hidden="true" width={26} height={26} />
        <span className="app-logo__name">{t('app.name')}</span>
      </Link>
      {/* Between the way home and the way to yourself, because it is neither:
          it is the one thing in this row that is asking for something.
          
          IT DOES NOT LEAVE. It used to be absent whenever the count was zero,
          on the reasoning that a badge permanently showing nothing teaches
          people to stop reading it. What that actually taught was worse: a
          host who resolved the last alert watched the bell disappear and had
          no way of telling that from the app losing it. A thing that vanishes
          cannot be checked. So it stays, and says zero, and goes quiet —
          unlit, unclickable, no colour — until there is something in it. */}
      {session &&
        (waiting > 0 && first ? (
          <Link
            to={`/rounds/${first.round_id}/alerts`}
            className="alert-pip"
            aria-label={t('alerts.waiting', { count: waiting })}
            title={t('alerts.waiting', { count: waiting })}
          >
            <span aria-hidden="true">🔔</span>
            <span className="alert-pip__count">{waiting}</span>
          </Link>
        ) : (
          <span className="alert-pip is-quiet" aria-label={t('alerts.nothingWaiting')} title={t('alerts.nothingWaiting')}>
            <span aria-hidden="true">🔔</span>
            <span className="alert-pip__count">0</span>
          </span>
        ))}
      {session && (
        <Link to="/profile" className="badge" style={{ textDecoration: 'none' }}>
          {profile?.display_name ?? t('profile.title')}
        </Link>
      )}
    </header>
  )
}
